import type { Vec3 } from "../core/math.ts";

/**
 * An arena is data, not code.
 *
 * Milestone 3's challenge generator will choose which arena to use and which rules to
 * apply to the ids declared here — so every object a rule might target must carry a
 * stable id, and validation can check a generated rule only references ids that exist.
 */

export type PlatformSurface = "solid" | "conditional";

export interface PlatformDef {
  id: string;
  /** Centre of the box, world space. */
  position: Vec3;
  /** Full extents (not half-extents). */
  size: Vec3;
  /**
   * `conditional` platforms are ordinary solid geometry until a rule says otherwise.
   * Declaring the intent here lets an arena be authored for a mechanic without the
   * mechanic existing yet.
   */
  surface: PlatformSurface;
  /** Manifest entry name of a generated asset to dress this platform with. */
  visual?: string;
}

export interface ExitDef {
  id: string;
  position: Vec3;
  /** Horizontal radius the player must get within, in metres. */
  radius: number;
}

export interface ArenaDefinition {
  id: string;
  name: string;
  spawn: Vec3;
  /** Which way the player faces on spawn, radians. */
  spawnYaw: number;
  exit: ExitDef;
  platforms: PlatformDef[];
  /** Fall below this and the run is lost. */
  killPlaneY: number;
  gravity: Vec3;
}

export function findPlatform(arena: ArenaDefinition, id: string): PlatformDef | undefined {
  return arena.platforms.find((platform) => platform.id === id);
}

/** Every id a rule could legally target. Used by Milestone 3 reference validation. */
export function arenaObjectIds(arena: ArenaDefinition): string[] {
  return [...arena.platforms.map((p) => p.id), arena.exit.id];
}
