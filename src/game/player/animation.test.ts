import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIP_FOR_STATE, REQUIRED_CLIPS, RESERVED_CLIPS } from "./animation.ts";

/**
 * Checks the game's animation contract against the real asset on disk.
 *
 * Lux3D returns retargeted clips named `animation_1…N`; the pipeline renames them to the
 * requested IDs. If that rename regresses, the contestant would silently stand still in
 * game — a bug that is invisible in a type system and easy to mistake for broken physics.
 * This makes it a test failure instead.
 */

const here = dirname(fileURLToPath(import.meta.url));
const GENERATED = resolve(here, "../../../public/assets/generated");

/** Every character the game can put on screen must satisfy the same contract. */
const CHARACTERS = ["contestant-01-anim", "rival-01-anim"];

function readClipNames(path: string): string[] {
  const buffer = readFileSync(path);
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");

  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      const json = JSON.parse(buffer.subarray(start, start + length).toString("utf8")) as {
        animations?: { name?: string }[];
      };
      return (json.animations ?? []).map((a) => a.name ?? "");
    }
    offset = start + length + ((4 - (length % 4)) % 4);
  }
  throw new Error("GLB has no JSON chunk");
}

describe.each(CHARACTERS)("%s animation contract", (name) => {
  const path = resolve(GENERATED, `${name}.glb`);
  const names = existsSync(path) ? readClipNames(path) : null;

  it("exists on disk", () => {
    // A missing rival is survivable — the game falls back to the player's model — but it
    // should be a visible gap, not a silently skipped test.
    expect(names, `${name}.glb has not been generated`).not.toBeNull();
  });

  it("contains every clip the game asks for by name", () => {
    expect(names ?? []).toEqual(expect.arrayContaining([...REQUIRED_CLIPS]));
  });

  it("still carries the clips reserved for later rounds", () => {
    expect(names ?? []).toEqual(expect.arrayContaining([...RESERVED_CLIPS]));
  });

  it("has no leftover positional aliases from Lux3D", () => {
    const aliases = (names ?? []).filter((clip) => /^animation_\d+$/.test(clip));
    expect(aliases).toEqual([]);
  });

  it("maps every locomotion state to a clip that exists", () => {
    for (const [state, clip] of Object.entries(CLIP_FOR_STATE)) {
      expect(names ?? [], `locomotion state "${state}" wants clip "${clip}"`).toContain(clip);
    }
  });
});
