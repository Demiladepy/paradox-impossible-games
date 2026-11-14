import { vec3 } from "../core/math.ts";
import type { ArenaDefinition, PlatformDef } from "./types.ts";
import type { GameRule } from "../rules/types.ts";

/**
 * ARENA 01 — "The Gauntlet"
 *
 * A traversal course for Milestone 1: start pad, a run of gaps that need real jumps, a
 * wide plaza to breathe, then a staircase of smaller platforms up to the exit.
 *
 * The middle run is authored as `conditional` because it is where THE FALSE FLOOR will
 * be applied in Milestone 2. Until a rule targets them they behave as ordinary solid
 * platforms, so this arena is fully playable now.
 *
 * Layout runs along -Z, which is the direction the player faces on spawn.
 */

const platform = (
  id: string,
  position: [number, number, number],
  size: [number, number, number],
  surface: PlatformDef["surface"] = "solid",
  visual?: string,
): PlatformDef => ({
  id,
  position: vec3(...position),
  size: vec3(...size),
  surface,
  ...(visual ? { visual } : {}),
});

/**
 * THE FALSE FLOOR, applied to the gap run.
 *
 * Look at a platform and it stops being there; look away and it returns. The platform
 * under your feet is exempt, so you can always stand still and think — you can unmake the
 * floor ahead of you, never the floor beneath you.
 */
export const FALSE_FLOOR_RULE: GameRule = {
  id: "rule-false-floor-01",
  type: "CONDITIONAL_PLATFORM",
  targetIds: ["step-01", "step-02", "step-03", "step-04"],
  parameters: {
    solidWhenObserved: false,
    coneDegrees: 58,
    hysteresisDegrees: 10,
    exemptSupporting: true,
  },
  trigger: { type: "PLAYER_CAMERA_DIRECTION" },
};

export const ARENA_01: ArenaDefinition = {
  id: "arena-01",
  name: "The Gauntlet",
  // Capsule centre must clear the pad surface (y=0.5) by half-height + radius = 0.88,
  // plus a little margin. Spawning inside the collider leaves the character controller
  // resolving a penetration instead of moving. See spawnClearance() and its test.
  spawn: vec3(0, 1.55, 4),
  spawnYaw: 0,
  killPlaneY: -14,
  gravity: vec3(0, -22, 0),

  // Sits just above the exit pad surface (5.7).
  exit: { id: "exit-01", position: vec3(0, 6.1, -37), radius: 1.6 },

  defaultRules: [FALSE_FLOOR_RULE],

  route: [
    "start-pad",
    "step-01",
    "step-02",
    "step-03",
    "step-04",
    "plaza",
    "rise-01",
    "rise-02",
    "rise-03",
    "exit-pad",
  ],

  platforms: [
    // Start pad — generous, so nobody falls off before they have found the keys.
    platform("start-pad", [0, 0, 4], [9, 1, 9], "solid", "platform-slab"),

    // The gap run. Jumps get longer; the third is offset sideways so you must aim.
    // Flush with the start pad on purpose: the first move is a walk, not a jump.
    // A 0.5 m gap here wedged the capsule - too narrow to fall through, too wide to
    // step over - which reads as broken controls on the very first input.
    platform("step-01", [0, 0.2, -2.5], [4, 1, 4], "conditional", "platform-slab"),
    platform("step-02", [0, 0.4, -9], [3.4, 1, 3.4], "conditional", "platform-slab"),
    platform("step-03", [2.8, 0.6, -14.4], [3, 1, 3], "conditional", "platform-slab"),
    platform("step-04", [-2.4, 0.9, -19.6], [3, 1, 3], "conditional", "platform-slab"),

    // Plaza — a safe place to stand and read the arena.
    // Nudged back so the step-04 gap is comfortably wider than the player, not the
    // 0.90 m that sat right on the wedge threshold.
    platform("plaza", [0, 1.2, -26.1], [11, 1, 7], "solid", "platform-slab"),

    // Ledges flanking the plaza; they make the space feel built rather than laid out.
    platform("ledge-west", [-6.6, 2.6, -26.1], [2.2, 1, 4.4], "solid"),
    platform("ledge-east", [6.6, 2.6, -26.1], [2.2, 1, 4.4], "solid"),

    // The ascent to the exit.
    //
    // Deliberately a staircase with overlapping footprints, not a series of leaps. The
    // gap run above is where the platforming challenge lives; PARADOX is meant to be hard
    // because the rules are strange, not because the geometry demands precision. Even
    // rises of 1.0 m with zero gap, so each step is one unambiguous hop.
    platform("rise-01", [-1.8, 2.2, -30.0], [3.6, 1, 3.6], "solid", "platform-slab"),
    platform("rise-02", [1.4, 3.2, -32.4], [3.4, 1, 3.4], "solid", "platform-slab"),
    platform("rise-03", [-1.0, 4.2, -34.6], [3.4, 1, 3.4], "solid", "platform-slab"),

    // Exit platform.
    platform("exit-pad", [0, 5.2, -37], [5, 1, 5], "solid", "platform-slab"),
  ],
};
