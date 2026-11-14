import { describe, expect, it } from "vitest";
import { ARENA_01, FALSE_FLOOR_RULE } from "../arena/arena-01.ts";
import { ARENA_02, GRAVITY_FLIP_RULE } from "../arena/arena-02.ts";
import { FIXED_TIMESTEP } from "../core/clock.ts";
import { GameWorld, NO_LOOK } from "../GameWorld.ts";
import { NO_INPUT, type PlayerInput } from "../player/controller.ts";
import type { GameRule } from "./types.ts";

/**
 * The Reality Rule Engine.
 *
 * Two things are being checked, and they matter for different reasons. That the mechanics
 * *work* is the Milestone 2 exit condition. That invalid rules are *refused with a reason*
 * is the foundation of Milestone 3 — when an AI proposes a challenge, this is the layer
 * that decides whether a player is allowed into it.
 */

const step = (world: GameWorld, input: PlayerInput, steps: number): void => {
  for (let i = 0; i < steps; i++) world.update(input, NO_LOOK, FIXED_TIMESTEP);
};

/** Aim the camera at a world point, as a player lining something up would. */
function lookAt(world: GameWorld, target: { x: number; z: number }): void {
  const eye = world.camera.eye;
  world.camera.yaw = Math.atan2(-(target.x - eye.x), -(target.z - eye.z));
  world.camera.pitch = 0;
}

describe("THE FALSE FLOOR (CONDITIONAL_PLATFORM)", () => {
  it("unmakes a platform when the player looks at it", async () => {
    const world = await GameWorld.create(ARENA_01);
    step(world, NO_INPUT, 30);

    lookAt(world, { x: 0, z: -9 }); // step-02, down the course
    step(world, NO_INPUT, 10);

    const snapshot = world.snapshot();
    expect(snapshot.rules.observed).toContain("step-02");
    expect(snapshot.rules.phantom).toContain("step-02");
    expect(world.physics.isSolid("step-02")).toBe(false);
    world.dispose();
  });

  it("restores the platform when the player looks away", async () => {
    const world = await GameWorld.create(ARENA_01);
    step(world, NO_INPUT, 30);

    lookAt(world, { x: 0, z: -9 });
    step(world, NO_INPUT, 10);
    expect(world.physics.isSolid("step-02")).toBe(false);

    // Turn through 180 degrees, back towards the start.
    world.camera.yaw = Math.PI;
    step(world, NO_INPUT, 10);

    expect(world.physics.isSolid("step-02")).toBe(true);
    expect(world.snapshot().rules.phantom).not.toContain("step-02");
    world.dispose();
  });

  it("never unmakes the platform the player is standing on", async () => {
    const world = await GameWorld.create(ARENA_01, {
      rules: [{ ...FALSE_FLOOR_RULE, targetIds: ["step-01", "step-02", "step-03", "step-04"] }],
    });
    // Walk onto step-01, then stare straight down at it.
    world.player.teleport(world.physics, { x: 0, y: 1.8, z: -2.5 }, 0);
    step(world, NO_INPUT, 40);

    const supporting = world.snapshot().player.supportingPlatformId;
    expect(supporting).toBe("step-01");

    world.camera.pitch = -1.4; // look at own feet
    step(world, NO_INPUT, 20);

    expect(world.physics.isSolid("step-01")).toBe(true);
    expect(world.snapshot().status).toBe("running");
    expect(world.snapshot().player.grounded).toBe(true);
    world.dispose();
  });

  it("drops the player through a platform that is observed from off it", async () => {
    const world = await GameWorld.create(ARENA_01);
    // Stand on step-02, but make step-03 the thing being looked at.
    world.player.teleport(world.physics, { x: 0, y: 2.0, z: -9 }, 0);
    step(world, NO_INPUT, 40);
    expect(world.snapshot().player.grounded).toBe(true);

    lookAt(world, { x: 2.8, z: -14.4 }); // step-03
    step(world, NO_INPUT, 10);
    expect(world.physics.isSolid("step-03")).toBe(false);
    world.dispose();
  });

  it("does not chatter when a platform sits on the edge of the view cone", async () => {
    const world = await GameWorld.create(ARENA_01);
    step(world, NO_INPUT, 30);

    // Park the camera so step-02 is right at the cone boundary, then jitter slightly —
    // exactly the condition a single threshold would flicker on.
    lookAt(world, { x: 0, z: -9 });
    const base = world.camera.yaw;
    world.camera.yaw = base + (58 / 2) * (Math.PI / 180);

    let transitions = 0;
    let previous = world.physics.isSolid("step-02");
    for (let i = 0; i < 180; i++) {
      world.camera.yaw = base + ((58 / 2) * Math.PI) / 180 + Math.sin(i * 0.7) * 0.012;
      world.update(NO_INPUT, NO_LOOK, FIXED_TIMESTEP);
      const now = world.physics.isSolid("step-02");
      if (now !== previous) transitions++;
      previous = now;
    }

    expect(transitions, `platform toggled ${transitions} times under a tiny camera wobble`)
      .toBeLessThanOrEqual(2);
    world.dispose();
  });
});

describe("GRAVITY ZERO (GRAVITY_DIRECTION)", () => {
  it("inverts gravity on schedule and warns first", async () => {
    const world = await GameWorld.create(ARENA_02);
    expect(world.physics.gravity.y).toBeLessThan(0);
    expect(world.snapshot().rules.upSign).toBe(1);

    // Interval is 7s with a 2.5s warning.
    step(world, NO_INPUT, Math.round(60 * 5));
    const warning = world.snapshot().rules.warning;
    expect(warning?.message).toBe("GRAVITY INVERTING");
    expect(warning?.secondsRemaining).toBeLessThanOrEqual(2.5);

    step(world, NO_INPUT, Math.round(60 * 2.5));
    expect(world.physics.gravity.y).toBeGreaterThan(0);
    expect(world.snapshot().rules.upSign).toBe(-1);
    world.dispose();
  });

  it("sends the player upwards once gravity inverts", async () => {
    const world = await GameWorld.create(ARENA_02);
    step(world, NO_INPUT, 60);
    const grounded = world.snapshot().player.position.y;

    step(world, NO_INPUT, Math.round(60 * 7.5));
    expect(world.physics.gravity.y).toBeGreaterThan(0);

    step(world, NO_INPUT, 90);
    expect(world.snapshot().player.position.y).toBeGreaterThan(grounded + 1);
    world.dispose();
  });

  it("lands the player on the underside of the ceiling rather than losing them", async () => {
    const world = await GameWorld.create(ARENA_02);
    step(world, NO_INPUT, 60);
    expect(world.snapshot().player.grounded).toBe(true);

    // Ride the first inversion up from the start pad.
    step(world, NO_INPUT, Math.round(60 * 7.2));
    expect(world.physics.gravity.y).toBeGreaterThan(0);

    step(world, NO_INPUT, Math.round(60 * 3));
    const snapshot = world.snapshot();

    expect(snapshot.status).toBe("running");
    expect(snapshot.player.grounded, "player should be standing on the ceiling").toBe(true);
    // Ceiling underside sits at 8.5; the capsule centre rests 0.88 below it.
    expect(snapshot.player.position.y).toBeGreaterThan(7.2);
    expect(snapshot.player.supportingPlatformId).toBe("ceil-main");
    world.dispose();
  });

  it("kills the player who is over a gap when gravity restores", async () => {
    const world = await GameWorld.create(ARENA_02);
    // Ride up, walk out over the first gap on the ceiling, then wait for the return.
    step(world, NO_INPUT, Math.round(60 * 9));
    expect(world.physics.gravity.y).toBeGreaterThan(0);

    world.player.teleport(world.physics, { x: 0, y: 7.5, z: -4 }, 0);
    step(world, NO_INPUT, 30);
    expect(world.snapshot().player.grounded).toBe(true);

    // Gravity restores at 14s; below z=-4 there is no floor.
    step(world, NO_INPUT, Math.round(60 * 8));
    expect(world.snapshot().status).toBe("lost");
    world.dispose();
  });

  it("flips back and forth on a stable schedule", async () => {
    const world = await GameWorld.create(ARENA_02);
    const signs: number[] = [];
    for (let i = 0; i < Math.round(60 * 30); i++) {
      world.update(NO_INPUT, NO_LOOK, FIXED_TIMESTEP);
      if (i % 30 === 0) signs.push(Math.sign(world.physics.gravity.y));
    }
    // 30 seconds at a 7 second interval: at least four changes of direction.
    const changes = signs.filter((s, i) => i > 0 && s !== signs[i - 1]).length;
    expect(changes).toBeGreaterThanOrEqual(4);
    world.dispose();
  });
});

describe("both mechanics in the same scene", () => {
  it("runs a conditional platform and gravity inversion together", async () => {
    const combined: GameRule[] = [
      { ...FALSE_FLOOR_RULE, targetIds: ["step-02", "step-03"] },
      { ...GRAVITY_FLIP_RULE, parameters: { ...GRAVITY_FLIP_RULE.parameters, intervalSeconds: 4 } },
    ];
    const world = await GameWorld.create(ARENA_01, { rules: combined });
    expect(world.rules.rejected).toEqual([]);
    expect(world.rules.accepted).toHaveLength(2);

    step(world, NO_INPUT, 30);
    lookAt(world, { x: 0, z: -9 });
    step(world, NO_INPUT, 10);
    expect(world.physics.isSolid("step-02")).toBe(false);

    step(world, NO_INPUT, Math.round(60 * 4.2));
    expect(world.physics.gravity.y).toBeGreaterThan(0);
    // The gaze rule is still running after the gravity rule changed the world.
    expect(world.snapshot().rules.observed.length).toBeGreaterThan(0);
    world.dispose();
  });
});

describe("rule validation refuses bad configurations", () => {
  const load = async (rule: GameRule) => {
    const world = await GameWorld.create(ARENA_01, { rules: [rule] });
    const report = world.rules;
    world.dispose();
    return report;
  };

  const base: GameRule = {
    id: "r1",
    type: "CONDITIONAL_PLATFORM",
    targetIds: ["step-01"],
    parameters: {},
    trigger: { type: "PLAYER_CAMERA_DIRECTION" },
  };

  it("rejects a target that does not exist", async () => {
    const report = await load({ ...base, targetIds: ["no-such-platform"] });
    expect(report.accepted).toEqual([]);
    expect(report.rejected[0]?.reason).toMatch(/unknown target id/i);
  });

  it("rejects an unimplemented rule type instead of ignoring it", async () => {
    const report = await load({ ...base, type: "SPATIAL_PORTAL" });
    expect(report.rejected[0]?.reason).toMatch(/unsupported rule type/i);
  });

  it("rejects a trigger the module does not understand", async () => {
    const report = await load({ ...base, trigger: { type: "ON_VIBES" } });
    expect(report.rejected[0]?.reason).toMatch(/trigger/i);
  });

  it("rejects out-of-range parameters", async () => {
    const report = await load({ ...base, parameters: { coneDegrees: 900 } });
    expect(report.rejected[0]?.reason).toMatch(/within \[10, 170\]/);
  });

  it("rejects a parameter of the wrong type", async () => {
    const report = await load({ ...base, parameters: { solidWhenObserved: "yes" } });
    expect(report.rejected[0]?.reason).toMatch(/must be a boolean/i);
  });

  it("rejects targeting the exit, which has no collider to switch off", async () => {
    const report = await load({ ...base, targetIds: ["exit-01"] });
    expect(report.rejected[0]?.reason).toMatch(/only target platforms/i);
  });

  it("rejects a gravity rule whose warning never clears", async () => {
    const report = await load({
      id: "g1",
      type: "GRAVITY_DIRECTION",
      targetIds: [],
      parameters: { intervalSeconds: 3, warnSeconds: 5 },
      trigger: { type: "TIMER" },
    });
    expect(report.rejected[0]?.reason).toMatch(/must be shorter than/i);
  });

  it("rejects duplicate rule ids", async () => {
    const world = await GameWorld.create(ARENA_01, { rules: [base, { ...base }] });
    expect(world.rules.accepted).toHaveLength(1);
    expect(world.rules.rejected[0]?.reason).toMatch(/duplicate/i);
    world.dispose();
  });

  it("leaves the world untouched by a rejected rule", async () => {
    const world = await GameWorld.create(ARENA_01, {
      rules: [{ ...base, targetIds: ["nope"] }],
    });
    expect(world.ruleEngine.ruleCount).toBe(0);
    for (const platform of ARENA_01.platforms) {
      expect(world.physics.isSolid(platform.id)).toBe(true);
    }
    world.dispose();
  });
});
