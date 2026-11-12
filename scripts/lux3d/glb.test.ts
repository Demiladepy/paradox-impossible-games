import { describe, expect, it } from "vitest";
import {
  CHUNK_BIN,
  CHUNK_JSON,
  GLB_MAGIC,
  parseGlb,
  renameAnimations,
  serializeGlb,
} from "./glb.ts";

/** Build a GLB whose JSON length is deliberately not 4-byte aligned. */
function makeGlb(json: Record<string, unknown>, bin: Buffer | null): Buffer {
  return serializeGlb({ json, bin });
}

const threeClips = {
  asset: { version: "2.0" },
  animations: [{ name: "animation_1" }, { name: "animation_2" }, { name: "animation_3" }],
};

describe("GLB container round-trip", () => {
  it("writes a valid header", () => {
    const buffer = makeGlb(threeClips, null);
    expect(buffer.readUInt32LE(0)).toBe(GLB_MAGIC);
    expect(buffer.readUInt32LE(4)).toBe(2);
    expect(buffer.readUInt32LE(8)).toBe(buffer.byteLength);
    expect(buffer.readUInt32LE(16)).toBe(CHUNK_JSON);
  });

  it("pads every chunk to a 4-byte boundary", () => {
    // "x" of varying length forces each possible misalignment.
    for (let pad = 0; pad < 4; pad++) {
      const buffer = makeGlb({ ...threeClips, pad: "x".repeat(pad) }, Buffer.from([1, 2, 3]));
      expect(buffer.byteLength % 4).toBe(0);
      const jsonLength = buffer.readUInt32LE(12);
      expect(jsonLength % 4).toBe(0);
      // 12 header + 8 JSON chunk header + jsonLength -> BIN length, then its type.
      expect(buffer.readUInt32LE(24 + jsonLength)).toBe(CHUNK_BIN);
    }
  });

  it("preserves the BIN chunk through a round-trip", () => {
    const bin = Buffer.from([9, 8, 7, 6, 5]);
    const parsed = parseGlb(makeGlb(threeClips, bin));
    expect(parsed.bin?.subarray(0, 5)).toEqual(bin);
  });

  it("rejects a buffer that is not a GLB", () => {
    expect(() => parseGlb(Buffer.alloc(32))).toThrow(/bad magic/i);
  });
});

describe("renameAnimations", () => {
  it("renames clips positionally and reports the mapping", () => {
    const { renamed, buffer } = renameAnimations(makeGlb(threeClips, null), [
      "Idle_Loop",
      "Walk_Loop",
      "Death01",
    ]);

    expect(renamed).toEqual([
      { from: "animation_1", to: "Idle_Loop" },
      { from: "animation_2", to: "Walk_Loop" },
      { from: "animation_3", to: "Death01" },
    ]);

    const reparsed = parseGlb(buffer);
    const names = (reparsed.json["animations"] as { name: string }[]).map((a) => a.name);
    expect(names).toEqual(["Idle_Loop", "Walk_Loop", "Death01"]);
  });

  it("refuses to rename when the counts disagree, rather than mislabelling", () => {
    expect(() => renameAnimations(makeGlb(threeClips, null), ["Idle_Loop"])).toThrow(
      /does not match/i,
    );
  });

  it("throws when the file has no animations", () => {
    expect(() => renameAnimations(makeGlb({ asset: { version: "2.0" } }, null), ["x"])).toThrow(
      /no animations/i,
    );
  });

  it("keeps mesh and skin data untouched", () => {
    const json = { ...threeClips, meshes: [{ primitives: [{}] }], skins: [{ joints: [1, 2] }] };
    const { buffer } = renameAnimations(makeGlb(json, Buffer.from([4, 4])), ["a", "b", "c"]);
    const reparsed = parseGlb(buffer);
    expect(reparsed.json["meshes"]).toEqual([{ primitives: [{}] }]);
    expect(reparsed.json["skins"]).toEqual([{ joints: [1, 2] }]);
  });
});
