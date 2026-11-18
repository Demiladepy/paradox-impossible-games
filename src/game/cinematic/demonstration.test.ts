import { describe, expect, it } from "vitest";
import {
  DEMONSTRATION_PHASES,
  DEMONSTRATION_SECONDS,
  GazeDemonstration,
  averseTargets,
  phaseAt,
  pickDemonstrationTarget,
  surfacePoint,
} from "./demonstration.ts";
import { forwardFromAngles, dot, normalize, sub } from "../core/math.ts";
import { ARENA_01 } from "../arena/arena-01.ts";
import type { GameRule } from "../rules/types.ts";

const gazeRule = (targetIds: string[], solidWhenObserved = false): GameRule => ({
  id: "r1",
  type: "CONDITIONAL_PLATFORM",
  targetIds,
  parameters: { solidWhenObserved },
  trigger: { type: "PLAYER_CAMERA_DIRECTION" },
});

describe("averseTargets", () => {
  it("collects platforms that vanish when looked at", () => {
    expect(averseTargets([gazeRule(["step-01", "step-02"])])).toEqual(
      new Set(["step-01", "step-02"]),
    );
  });

  it("ignores the mirror case, which only exists while watched", () => {
    expect(averseTargets([gazeRule(["step-01"], true)]).size).toBe(0);
  });

  it("ignores rules of other types", () => {
    const rule: GameRule = {
      id: "g",
      type: "GRAVITY_DIRECTION",
      targetIds: [],
      parameters: {},
      trigger: { type: "ALWAYS" },
    };
    expect(averseTargets([rule]).size).toBe(0);
  });
});

describe("pickDemonstrationTarget", () => {
  const rules = [gazeRule(["step-01", "step-02", "step-03", "step-04"])];

  it("never picks the platform underfoot, which the rule exempts", () => {
    // Standing on step-01: choosing it would film a platform that cannot dissolve.
    const step01 = ARENA_01.platforms.find((p) => p.id === "step-01");
    expect(step01).toBeDefined();
    const chosen = pickDemonstrationTarget(ARENA_01, rules, step01!.position, "step-01");
    expect(chosen?.id).not.toBe("step-01");
  });

  it("returns null when no rule unmakes anything", () => {
    expect(
      pickDemonstrationTarget(ARENA_01, [gazeRule(["step-01"], true)], ARENA_01.spawn, null),
    ).toBeNull();
  });

  it("returns null when every candidate is out of range", () => {
    const faraway = { x: 9000, y: 0, z: 9000 };
    expect(pickDemonstrationTarget(ARENA_01, rules, faraway, null)).toBeNull();
  });

  it("picks a real platform of the arena when one is in range", () => {
    const chosen = pickDemonstrationTarget(ARENA_01, rules, ARENA_01.spawn, null);
    if (chosen) {
      expect(ARENA_01.platforms.some((p) => p.id === chosen.id)).toBe(true);
    }
  });
});

describe("the schedule", () => {
  it("alternates between staring and looking away", () => {
    const staring = DEMONSTRATION_PHASES.map((p) => p.staring);
    for (let i = 1; i < staring.length; i++) {
      expect(staring[i]).not.toBe(staring[i - 1]);
    }
  });

  it("shows the platform dissolving at least twice", () => {
    expect(DEMONSTRATION_PHASES.filter((p) => p.staring).length).toBeGreaterThanOrEqual(2);
  });

  it("holds each state long enough to read", () => {
    // Anything under ~2s and the viewer sees a flicker rather than a cause.
    for (const phase of DEMONSTRATION_PHASES) {
      expect(phase.seconds).toBeGreaterThanOrEqual(2);
    }
  });

  it("finds the right phase for a time", () => {
    expect(phaseAt(0).index).toBe(0);
    expect(phaseAt(DEMONSTRATION_SECONDS * 2).index).toBe(DEMONSTRATION_PHASES.length - 1);
    const second = DEMONSTRATION_PHASES[0]!.seconds + 0.1;
    expect(phaseAt(second).index).toBe(1);
  });
});

describe("GazeDemonstration", () => {
  const target = ARENA_01.platforms.find((p) => p.id === "step-02")!;
  // A head's height above the spawn, roughly where gaze originates.
  const origin = { x: ARENA_01.spawn.x, y: ARENA_01.spawn.y + 0.55, z: ARENA_01.spawn.z };

  /** Run the schedule and return the gaze at a given moment. */
  function gazeAt(seconds: number) {
    const demo = new GazeDemonstration();
    const dt = 1 / 60;
    let frame = demo.update(origin, target, 0);
    for (let t = 0; t < seconds; t += dt) frame = demo.update(origin, target, dt);
    return frame;
  }

  /** How closely the gaze points at the platform: 1 is dead on. */
  function aimQuality(yaw: number, pitch: number): number {
    const forward = forwardFromAngles(yaw, pitch);
    return dot(forward, normalize(sub(surfacePoint(target), origin)));
  }

  it("ends up aimed at the platform while staring", () => {
    // Late in the first staring phase, after the ease has settled.
    const t = DEMONSTRATION_PHASES[0]!.seconds + DEMONSTRATION_PHASES[1]!.seconds - 0.2;
    const frame = gazeAt(t);
    expect(frame.staring).toBe(true);
    expect(aimQuality(frame.yaw, frame.pitch)).toBeGreaterThan(0.97);
  });

  it("points well away from the platform while averted", () => {
    const phases = DEMONSTRATION_PHASES;
    const t = phases[0]!.seconds + phases[1]!.seconds + phases[2]!.seconds - 0.2;
    const frame = gazeAt(t);
    expect(frame.staring).toBe(false);
    // Outside any plausible view cone: the widest the rule allows is 170 degrees, and a
    // demonstration that stays inside the cone would never let the platform come back.
    expect(aimQuality(frame.yaw, frame.pitch)).toBeLessThan(Math.cos((85 * Math.PI) / 180));
  });

  it("reports finished only once the whole schedule has run", () => {
    const demo = new GazeDemonstration();
    demo.update(origin, target, DEMONSTRATION_SECONDS - 0.5);
    expect(demo.finished).toBe(false);
    demo.update(origin, target, 1);
    expect(demo.finished).toBe(true);
  });

  it("turns the head smoothly rather than snapping", () => {
    const demo = new GazeDemonstration();
    const dt = 1 / 60;
    let previous = demo.update(origin, target, 0).yaw;
    let biggestStep = 0;
    for (let t = 0; t < DEMONSTRATION_SECONDS; t += dt) {
      const yaw = demo.update(origin, target, dt).yaw;
      let delta = Math.abs(yaw - previous);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      biggestStep = Math.max(biggestStep, delta);
      previous = yaw;
    }
    // A snap would be the full avert angle in one frame; a turn is a few degrees.
    expect(biggestStep).toBeLessThan(0.12);
  });

  it("resets back to the beginning", () => {
    const demo = new GazeDemonstration();
    demo.update(origin, target, DEMONSTRATION_SECONDS);
    expect(demo.finished).toBe(true);
    demo.reset();
    expect(demo.finished).toBe(false);
  });
});
