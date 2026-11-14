import type { Vec3 } from "../core/math.ts";
import { surfaceY } from "./reach.ts";
import type { ArenaDefinition, PlatformDef } from "./types.ts";

/**
 * Which platform is the player standing on?
 *
 * THE FALSE FLOOR needs this: a rule that can delete the ground under your own feet the
 * instant you glance down is not a puzzle, it is a punishment, and in third person the
 * camera looks over the player at exactly the platform they are standing on. Exempting
 * the supporting platform keeps the mechanic legible — you can unmake the floor ahead of
 * you, never the floor beneath you.
 *
 * Geometric rather than a physics query, so it stays deterministic and cheap, and so a
 * headless probe gets the same answer as the renderer.
 */

/** How far below the feet a surface may be and still count as support. */
const SUPPORT_TOLERANCE = 0.35;

export function platformUnderFeet(
  arena: ArenaDefinition,
  position: Vec3,
  capsuleHalfHeight: number,
  upSign = 1,
): PlatformDef | null {
  const feet = position.y - capsuleHalfHeight * upSign;
  let best: PlatformDef | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const platform of arena.platforms) {
    const withinX = Math.abs(position.x - platform.position.x) <= platform.size.x / 2 + 0.05;
    const withinZ = Math.abs(position.z - platform.position.z) <= platform.size.z / 2 + 0.05;
    if (!withinX || !withinZ) continue;

    // Standing on top under normal gravity; on the underside when inverted.
    const contact =
      upSign >= 0 ? surfaceY(platform) : platform.position.y - platform.size.y / 2;
    const distance = (feet - contact) * upSign;

    if (distance >= -0.12 && distance <= SUPPORT_TOLERANCE && distance < bestDistance) {
      best = platform;
      bestDistance = distance;
    }
  }

  return best;
}

/** The four top corners plus the centre — enough to tell if a slab is being looked at. */
export function platformSamplePoints(platform: PlatformDef, upSign = 1): Vec3[] {
  const halfX = platform.size.x / 2;
  const halfZ = platform.size.z / 2;
  const y = upSign >= 0 ? surfaceY(platform) : platform.position.y - platform.size.y / 2;
  const { x, z } = platform.position;

  return [
    { x, y, z },
    { x: x - halfX, y, z: z - halfZ },
    { x: x + halfX, y, z: z - halfZ },
    { x: x - halfX, y, z: z + halfZ },
    { x: x + halfX, y, z: z + halfZ },
  ];
}
