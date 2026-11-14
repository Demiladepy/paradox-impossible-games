import { describe, expect, it } from "vitest";
import { Autopilot } from "./autopilot.ts";
import { ARENA_01 } from "../arena/arena-01.ts";
import { analyseRoute, formatRoute, spawnClearance, wedgeGaps } from "../arena/reach.ts";
import { FIXED_TIMESTEP } from "../core/clock.ts";
import { GameWorld, NO_LOOK } from "../GameWorld.ts";
import { DEFAULT_TUNING } from "../player/controller.ts";

/**
 * The end-to-end test: can the arena be completed, start to finish, without a human?
 *
 * This exercises every layer at once — arena data, Rapier collision, the character
 * controller, jump ballistics, the camera basis that movement is expressed in, the
 * objective check — and it is the honest answer to "does it work end to end", because
 * nothing here knows the route except the data the game itself ships.
 */

const MAX_STEPS = 60 * 90; // 90 simulated seconds

interface RunResult {
  status: string;
  steps: number;
  seconds: number;
  reachedWaypoint: string;
  position: { x: number; y: number; z: number };
}

async function playArena(seed: string): Promise<RunResult> {
  const world = await GameWorld.create(ARENA_01, { seed });
  const pilot = new Autopilot(ARENA_01, DEFAULT_TUNING);

  let steps = 0;
  for (; steps < MAX_STEPS; steps++) {
    const snapshot = world.snapshot();
    if (snapshot.status !== "running") break;

    const input = pilot.decide(snapshot, (yaw) => {
      world.camera.yaw = yaw;
    });
    world.update(input, NO_LOOK, FIXED_TIMESTEP);
  }

  const final = world.snapshot();
  const result: RunResult = {
    status: final.status,
    steps,
    seconds: final.elapsed,
    reachedWaypoint: pilot.debug.target,
    position: { ...final.player.position },
  };
  world.dispose();
  return result;
}

describe("end-to-end: autopilot completes Arena 01", () => {
  it("reaches the exit from spawn with no human input", async () => {
    const result = await playArena("e2e");

    expect(
      result.status,
      `Run ended as "${result.status}" after ${result.seconds.toFixed(1)}s, ` +
        `stuck heading for "${result.reachedWaypoint}" at ` +
        `(${result.position.x.toFixed(1)}, ${result.position.y.toFixed(1)}, ${result.position.z.toFixed(1)}).\n` +
        `Route analysis:\n${formatRoute(analyseRoute(ARENA_01, DEFAULT_TUNING))}`,
    ).toBe("won");
  });

  it("completes in a sensible time, so the round timer can be set from evidence", async () => {
    const result = await playArena("e2e");
    expect(result.seconds).toBeGreaterThan(3);
    expect(result.seconds).toBeLessThan(60);
  });

  it("produces the same run twice — the probe must be reproducible", async () => {
    const a = await playArena("repeat");
    const b = await playArena("repeat");
    expect(a.steps).toBe(b.steps);
    expect(a.position.x.toFixed(10)).toBe(b.position.x.toFixed(10));
    expect(a.position.z.toFixed(10)).toBe(b.position.z.toFixed(10));
  });
});

describe("Arena 01 is fair", () => {
  const analysis = analyseRoute(ARENA_01, DEFAULT_TUNING);

  it("can be completed at walking speed — sprint is a choice, not a requirement", () => {
    const sprintOnly = analysis.filter((a) => !a.clearableAtWalk);
    expect(sprintOnly, `Jumps that demand sprinting:\n${formatRoute(sprintOnly)}`).toEqual([]);
  });

  it("never asks the player to rise higher than they can jump", () => {
    for (const gap of analysis) {
      expect(gap.rise, `${gap.from} -> ${gap.to} rises ${gap.rise.toFixed(2)}m`).toBeLessThan(
        DEFAULT_TUNING.jumpHeight,
      );
    }
  });

  it("routes only through platforms that exist", () => {
    const ids = new Set(ARENA_01.platforms.map((p) => p.id));
    for (const id of ARENA_01.route) expect(ids).toContain(id);
  });

  it("starts the route at the spawn platform and ends at the exit pad", () => {
    expect(ARENA_01.route[0]).toBe("start-pad");
    expect(ARENA_01.route.at(-1)).toBe("exit-pad");
  });

  it("has no gap that wedges the player instead of dropping or carrying them", () => {
    const wedges = wedgeGaps(ARENA_01, DEFAULT_TUNING);
    expect(
      wedges,
      `Gaps narrower than the player's body - they will stand across these and stop:
` +
        formatRoute(wedges),
    ).toEqual([]);
  });

  it("spawns the player standing on the pad, not inside it", () => {
    const check = spawnClearance(ARENA_01, DEFAULT_TUNING);

    expect(check.platform, "spawn is not over any platform").not.toBeNull();
    // Negative clearance means the capsule starts intersecting the floor. Rapier then
    // spends its steps resolving the penetration instead of moving, which looks like
    // broken controls rather than a bad spawn point.
    expect(
      check.clearance,
      `spawn capsule overlaps "${check.platform}" by ${Math.abs(check.clearance).toFixed(2)}m`,
    ).toBeGreaterThan(0);
    // And not so high that the round opens with a long fall.
    expect(check.clearance).toBeLessThan(1);
  });
});
