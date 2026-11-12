import { describe, expect, it } from "vitest";
import {
  assertSucceeded,
  isUsableUrl,
  LuxTaskError,
  parseRetargetActions,
  pickGlbUrl,
  pickSingleUrl,
  successfulActions,
  type TaskResult,
} from "./outputs.ts";

const task = (status: number, outputs?: { content?: string }[]): TaskResult => ({
  taskId: 1,
  status,
  outputs,
});

describe("isUsableUrl", () => {
  it("accepts https URLs", () => {
    expect(isUsableUrl("https://cdn.example.com/a.glb")).toBe(true);
  });

  it("rejects the NOT_REQUESTED placeholder", () => {
    expect(isUsableUrl("NOT_REQUESTED")).toBe(false);
  });

  it("rejects the empty third slot used by mesh retopology", () => {
    expect(isUsableUrl("")).toBe(false);
    expect(isUsableUrl("   ")).toBe(false);
  });

  it("rejects undefined and error JSON", () => {
    expect(isUsableUrl(undefined)).toBe(false);
    expect(isUsableUrl('{"error":{"code":"RIG_FAILED"}}')).toBe(false);
  });
});

describe("assertSucceeded", () => {
  it("passes on status 3", () => {
    expect(() => assertSucceeded(task(3, []))).not.toThrow();
  });

  it("throws on running tasks so partial artifacts are never read as results", () => {
    expect(() => assertSucceeded(task(1, [{ content: "https://x/partial.glb" }]))).toThrow(
      LuxTaskError,
    );
  });

  it("throws on failed and cancelled", () => {
    expect(() => assertSucceeded(task(4))).toThrow(/failed/i);
    expect(() => assertSucceeded(task(6))).toThrow(/cancelled/i);
  });
});

describe("pickGlbUrl", () => {
  it("picks the GLB from a G1 result (zip, glb)", () => {
    const t = task(3, [
      { content: "https://cdn/results.zip" },
      { content: "https://cdn/pbr_mesh.glb" },
    ]);
    expect(pickGlbUrl(t, "G1")).toBe("https://cdn/pbr_mesh.glb");
  });

  it("picks the GLB from a G1 result that also returned PLY", () => {
    const t = task(3, [
      { content: "https://cdn/results.zip" },
      { content: "https://cdn/pbr_mesh.glb" },
      { content: "https://cdn/gaussian.ply" },
    ]);
    expect(pickGlbUrl(t, "G1")).toBe("https://cdn/pbr_mesh.glb");
  });

  it("picks the only output for a G1-Turbo glb-only request", () => {
    const t = task(3, [{ content: "https://cdn/mesh.glb" }]);
    expect(pickGlbUrl(t, "G1-Turbo", ["glb"])).toBe("https://cdn/mesh.glb");
  });

  it("falls back to the positional rule when URLs carry no extension", () => {
    const t = task(3, [{ content: "https://cdn/a?id=1" }, { content: "https://cdn/b?id=2" }]);
    expect(pickGlbUrl(t, "G1-Turbo", ["zip", "glb"])).toBe("https://cdn/b?id=2");
  });

  it("matches .glb even with a query string", () => {
    const t = task(3, [{ content: "https://cdn/mesh.glb?sig=abc" }]);
    expect(pickGlbUrl(t, "G1-Turbo", ["glb"])).toBe("https://cdn/mesh.glb?sig=abc");
  });

  it("refuses an unfinished task", () => {
    expect(() => pickGlbUrl(task(1, [{ content: "https://cdn/x.glb" }]), "G1")).toThrow(
      LuxTaskError,
    );
  });

  it("refuses a success with no usable outputs", () => {
    expect(() => pickGlbUrl(task(3, [{ content: "NOT_REQUESTED" }]), "G1")).toThrow(
      /no usable outputs/i,
    );
  });
});

describe("pickSingleUrl", () => {
  it("returns the rigged GLB", () => {
    expect(pickSingleUrl(task(3, [{ content: "https://cdn/rigged.glb" }]))).toBe(
      "https://cdn/rigged.glb",
    );
  });

  it("refuses error JSON in the content slot", () => {
    expect(() =>
      pickSingleUrl(task(3, [{ content: '{"error":{"code":"RIG_INELIGIBLE"}}' }])),
    ).toThrow(/not a download URL/i);
  });
});

describe("parseRetargetActions", () => {
  const payload = JSON.stringify({
    actions: [
      { animation_id: "Idle_Loop", status: "success", animationGlbUrl: "https://cdn/idle.glb" },
      {
        animation_id: "Swim_Fwd_Loop",
        status: "failed",
        error: { code: "ANIMATION_RETARGET_FAILED", message: "nope" },
      },
    ],
  });

  it("parses the stringified actions payload", () => {
    const actions = parseRetargetActions(task(3, [{ content: payload }]));
    expect(actions).toHaveLength(2);
    expect(actions[0]?.animation_id).toBe("Idle_Loop");
  });

  it("filters to actions that actually delivered a file", () => {
    const ok = successfulActions(parseRetargetActions(task(3, [{ content: payload }])));
    expect(ok).toHaveLength(1);
    expect(ok[0]?.animation_id).toBe("Idle_Loop");
  });

  it("throws on malformed payloads", () => {
    expect(() => parseRetargetActions(task(3, [{ content: "not json" }]))).toThrow(/valid JSON/i);
    expect(() => parseRetargetActions(task(3, [{ content: "{}" }]))).toThrow(/actions array/i);
  });
});
