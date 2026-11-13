import { vec3 } from "../core/math.ts";
import type { ArenaDefinition, PlatformDef } from "./types.ts";

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

export const ARENA_01: ArenaDefinition = {
  id: "arena-01",
  name: "The Gauntlet",
  spawn: vec3(0, 1.2, 4),
  spawnYaw: 0,
  killPlaneY: -14,
  gravity: vec3(0, -22, 0),

  exit: { id: "exit-01", position: vec3(0, 7.5, -37), radius: 1.6 },

  platforms: [
    // Start pad — generous, so nobody falls off before they have found the keys.
    platform("start-pad", [0, 0, 4], [9, 1, 9], "solid", "platform-slab"),

    // The gap run. Jumps get longer; the third is offset sideways so you must aim.
    platform("step-01", [0, 0.2, -3], [4, 1, 4], "conditional", "platform-slab"),
    platform("step-02", [0, 0.4, -9], [3.4, 1, 3.4], "conditional", "platform-slab"),
    platform("step-03", [2.8, 0.6, -14.4], [3, 1, 3], "conditional", "platform-slab"),
    platform("step-04", [-2.4, 0.9, -19.6], [3, 1, 3], "conditional", "platform-slab"),

    // Plaza — a safe place to stand and read the arena.
    platform("plaza", [0, 1.2, -25.5], [11, 1, 7], "solid", "platform-slab"),

    // Ledges flanking the plaza; they make the space feel built rather than laid out.
    platform("ledge-west", [-6.6, 2.6, -25.5], [2.2, 1, 4.4], "solid"),
    platform("ledge-east", [6.6, 2.6, -25.5], [2.2, 1, 4.4], "solid"),

    // The ascent to the exit.
    platform("rise-01", [-2.6, 3.0, -30], [3, 1, 3], "solid", "platform-slab"),
    platform("rise-02", [2.4, 4.4, -32.5], [2.8, 1, 2.8], "solid", "platform-slab"),
    platform("rise-03", [-1.6, 5.8, -34.8], [2.6, 1, 2.6], "solid", "platform-slab"),

    // Exit platform.
    platform("exit-pad", [0, 6.6, -37], [5, 1, 5], "solid", "platform-slab"),
  ],
};
