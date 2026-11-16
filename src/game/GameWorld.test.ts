import { describe, expect, it } from "vitest";
import { GameWorld, NO_LOOK } from "./GameWorld.ts";
import { ARENA_01 } from "./arena/arena-01.ts";
import { arenaObjectIds } from "./arena/types.ts";
import { FIXED_TIMESTEP } from "./core/clock.ts";
import { NO_INPUT, type PlayerInput } from "./player/controller.ts";

/**
 * These run in plain Node with no DOM and no renderer. That is the point: the Milestone 3
 * solvability probe needs to drive this simulation headless, so if these tests cannot run,
 * the verification story does not work.
 */

const forward: PlayerInput = { forward: 1, right: 0, jump: false, sprint: false };

/** Drive the world for a number of fixed steps. */
function run(world: GameWorld, input: PlayerInput, steps: number): void {
  for (let i = 0; i < steps; i++) world.update(input, NO_LOOK, FIXED_TIMESTEP);
}

describe("GameWorld", () => {
  it("builds the arena and spawns the player without a renderer", async () => {
    const world = await GameWorld.create(ARENA_01, { rules: [] });
    expect(world.runStatus).toBe("running");
    for (const platform of ARENA_01.platforms) {
      expect(world.physics.hasBody(platform.id)).toBe(true);
    }
    world.dispose();
  });

  it("settles the player onto the start pad instead of falling through it", async () => {
    const world = await GameWorld.create(ARENA_01, { rules: [] });
    run(world, NO_INPUT, 60);

    const { player } = world.snapshot();
    expect(player.grounded).toBe(true);
    // Start pad surface sits at y = 0.5; feet rest a capsule half-height above it.
    expect(player.position.y).toBeGreaterThan(0.5);
    expect(player.position.y).toBeLessThan(2.5);
    expect(world.runStatus).toBe("running");
    world.dispose();
  });

  it("moves the player forward, towards -Z", async () => {
    const world = await GameWorld.create(ARENA_01, { rules: [] });
    run(world, NO_INPUT, 30);
    const before = world.snapshot().player.position.z;

    run(world, forward, 30);
    const after = world.snapshot().player.position.z;

    expect(after).toBeLessThan(before - 0.5);
    world.dispose();
  });

  it("is deterministic: identical inputs give bit-identical results", async () => {
    const script: PlayerInput[] = Array.from({ length: 180 }, (_, i) => ({
      forward: i < 120 ? 1 : 0,
      right: i > 40 && i < 80 ? 1 : 0,
      jump: i % 37 === 0,
      sprint: i > 90,
    }));

    const positions: string[] = [];
    for (let pass = 0; pass < 2; pass++) {
      const world = await GameWorld.create(ARENA_01, { seed: "determinism", rules: [] });
      for (const input of script) world.update(input, NO_LOOK, FIXED_TIMESTEP);
      const p = world.snapshot().player.position;
      positions.push(`${p.x.toFixed(12)},${p.y.toFixed(12)},${p.z.toFixed(12)}`);
      world.dispose();
    }

    expect(positions[0]).toBe(positions[1]);
  });

  it("loses the run when the player falls past the kill plane", async () => {
    const world = await GameWorld.create(ARENA_01, { rules: [] });
    // Drop the player into the void beside the course.
    world.player.teleport(world.physics, { x: 40, y: 3, z: 0 }, 0);
    run(world, NO_INPUT, 240);

    expect(world.runStatus).toBe("lost");
    world.dispose();
  });

  it("wins the run when the player reaches the exit", async () => {
    const world = await GameWorld.create(ARENA_01, { rules: [] });
    const exit = ARENA_01.exit.position;
    world.player.teleport(world.physics, { x: exit.x, y: exit.y + 0.4, z: exit.z }, 0);
    run(world, NO_INPUT, 10);

    expect(world.runStatus).toBe("won");
    world.dispose();
  });

  it("ignores input once the run is over", async () => {
    const world = await GameWorld.create(ARENA_01, { rules: [] });
    const exit = ARENA_01.exit.position;
    world.player.teleport(world.physics, { x: exit.x, y: exit.y + 0.4, z: exit.z }, 0);
    run(world, NO_INPUT, 10);
    expect(world.runStatus).toBe("won");

    const settled = world.snapshot().player.position;
    run(world, { forward: 1, right: 1, jump: true, sprint: true }, 60);
    const after = world.snapshot().player.position;

    expect(Math.hypot(after.x - settled.x, after.z - settled.z)).toBeLessThan(0.1);
    world.dispose();
  });

  it("restarts back to the spawn point", async () => {
    const world = await GameWorld.create(ARENA_01, { rules: [] });
    run(world, forward, 120);
    world.restart();

    const { player, status, elapsed } = world.snapshot();
    expect(status).toBe("running");
    expect(elapsed).toBe(0);
    expect(player.position.z).toBeCloseTo(ARENA_01.spawn.z, 5);
    world.dispose();
  });

  it("can toggle collision off, which is what THE FALSE FLOOR will need", async () => {
    const world = await GameWorld.create(ARENA_01, { rules: [] });
    run(world, NO_INPUT, 60);
    expect(world.snapshot().player.grounded).toBe(true);

    world.physics.setSolid("start-pad", false);
    expect(world.physics.isSolid("start-pad")).toBe(false);
    run(world, NO_INPUT, 30);

    expect(world.snapshot().player.grounded).toBe(false);
    world.dispose();
  });
});

describe("camera stays out of the scenery", () => {
  it("pulls the boom in when geometry is behind the player", async () => {
    const world = await GameWorld.create(ARENA_01, { rules: [] });
    run(world, NO_INPUT, 60);
    expect(world.camera.obstruction).toBeNull();

    // Look steeply upward: in third person that swings the boom downward, straight into
    // the platform the player is standing on.
    world.camera.pitch = 1.2;
    run(world, NO_INPUT, 2);

    expect(world.camera.obstruction).not.toBeNull();
    expect(world.camera.effectiveDistance).toBeLessThan(world.camera.distance);
    world.dispose();
  });

  it("never pulls the camera closer than arm's length", async () => {
    const world = await GameWorld.create(ARENA_01, { rules: [] });
    run(world, NO_INPUT, 60);
    world.camera.pitch = 1.5;
    run(world, NO_INPUT, 2);

    expect(world.camera.effectiveDistance).toBeGreaterThanOrEqual(1.5);
    world.dispose();
  });

  it("does not clamp in first person, where there is no boom", async () => {
    const world = await GameWorld.create(ARENA_01, { rules: [], cameraMode: "first" });
    run(world, NO_INPUT, 60);
    world.camera.pitch = 1.2;
    run(world, NO_INPUT, 2);

    expect(world.camera.obstruction).toBeNull();
    world.dispose();
  });
});

describe("arena definition", () => {
  it("exposes unique, stable ids for every targetable object", () => {
    const ids = arenaObjectIds(ARENA_01);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("exit-01");
    expect(ids).toContain("start-pad");
  });

  it("keeps the exit above the kill plane and reachable from spawn height", () => {
    expect(ARENA_01.exit.position.y).toBeGreaterThan(ARENA_01.killPlaneY);
    expect(ARENA_01.spawn.y).toBeGreaterThan(ARENA_01.killPlaneY);
  });
});
