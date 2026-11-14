import { vec3 } from "../core/math.ts";
import type { GameRule } from "../rules/types.ts";
import type { ArenaDefinition, PlatformDef } from "./types.ts";

/**
 * ARENA 02 — "Inversion"
 *
 * Built for GRAVITY ZERO. The floor has holes; the ceiling has floor over exactly those
 * holes. You cross the gaps upside down, then fall back when gravity restores — so the
 * challenge is not aim, it is timing against a countdown you can see.
 *
 * Both surfaces are the same slabs. The ceiling pieces are not decoration: when gravity
 * inverts, their undersides are what you stand on.
 */

const platform = (
  id: string,
  position: [number, number, number],
  size: [number, number, number],
  visual?: string,
): PlatformDef => ({
  id,
  position: vec3(...position),
  size: vec3(...size),
  surface: "solid",
  ...(visual ? { visual } : {}),
});

/** Ceiling height. Standing on the underside puts the player's feet at 8.5. */
const CEILING_Y = 9;

export const GRAVITY_FLIP_RULE: GameRule = {
  id: "rule-gravity-01",
  type: "GRAVITY_DIRECTION",
  targetIds: [],
  parameters: {
    intervalSeconds: 7,
    warnSeconds: 2.5,
    magnitude: 22,
    startInverted: false,
  },
  trigger: { type: "TIMER" },
};

export const ARENA_02: ArenaDefinition = {
  id: "arena-02",
  name: "Inversion",
  spawn: vec3(0, 1.55, 6),
  spawnYaw: 0,
  killPlaneY: -14,
  // Falling upward past the ceiling is just as fatal as falling off the world.
  killCeilingY: 24,
  gravity: vec3(0, -22, 0),

  exit: { id: "exit-02", position: vec3(0, 1.4, -30), radius: 1.8 },

  defaultRules: [GRAVITY_FLIP_RULE],

  // Not a jump route: these islands are deliberately too far apart to leap between.
  // You cross on the ceiling. Reachability analysis does not apply to this arena.
  route: ["floor-start", "floor-mid", "floor-exit"],

  platforms: [
    // Ground level: three islands separated by gaps far wider than a jump.
    platform("floor-start", [0, 0, 6], [9, 1, 9], "platform-slab"),
    platform("floor-mid", [0, 0, -14], [9, 1, 8], "platform-slab"),
    platform("floor-exit", [0, 0, -30], [9, 1, 9], "platform-slab"),

    // One continuous ceiling over the whole traversable corridor.
    //
    // Continuous on purpose: inverting gravity must always be survivable, or the mechanic
    // becomes a coin flip. The danger is in the *return* - gravity restores on a schedule,
    // and if you are over a gap when it does, nothing catches you. An earlier version had
    // ceiling only above the gaps, which meant inverting while on a floor island threw the
    // player into the sky with no recourse.
    platform("ceil-main", [0, CEILING_Y, -8], [9, 1, 38], "platform-slab"),

    // Walls to stop the player wandering out of the corridor sideways.
    platform("wall-west", [-6.5, 4.5, -12], [1, 10, 48]),
    platform("wall-east", [6.5, 4.5, -12], [1, 10, 48]),
  ],
};
