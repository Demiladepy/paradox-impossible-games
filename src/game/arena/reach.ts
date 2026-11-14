import type { PlayerTuning } from "../player/controller.ts";
import type { ArenaDefinition, PlatformDef } from "./types.ts";

/**
 * Can the player actually get from one platform to the next?
 *
 * Authoring gaps by eye is how a level ends up demanding frame-perfect sprint jumps that
 * the designer never noticed because they already knew the route. These are closed-form
 * ballistics against the real tuning values, so a gap that is too wide fails a test
 * instead of quietly ruining the first thirty seconds of the demo.
 *
 * This is also the seed of Milestone 3's reachability validation: when the AI proposes an
 * arena layout, this is what decides whether the layout is fair before anyone plays it.
 */

export interface JumpEnvelope {
  /** Upward speed at take-off, m/s. */
  takeoffSpeed: number;
  /** Highest the player can rise above the take-off surface, metres. */
  apex: number;
  /** Airtime for a jump that lands at the same height, seconds. */
  flightTime: number;
}

export function jumpEnvelope(tuning: PlayerTuning, gravityY: number): JumpEnvelope {
  const g = Math.abs(gravityY);
  const takeoffSpeed = Math.sqrt(2 * g * tuning.jumpHeight);
  return {
    takeoffSpeed,
    apex: tuning.jumpHeight,
    flightTime: (2 * takeoffSpeed) / g,
  };
}

/**
 * Horizontal distance coverable in one jump that lands `heightDelta` metres above
 * (positive) or below (negative) the take-off point. Returns 0 when the landing surface
 * is above the apex and therefore unreachable.
 */
export function horizontalReach(
  tuning: PlayerTuning,
  gravityY: number,
  horizontalSpeed: number,
  heightDelta: number,
): number {
  const g = Math.abs(gravityY);
  const v0 = jumpEnvelope(tuning, gravityY).takeoffSpeed;
  const discriminant = v0 * v0 - 2 * g * heightDelta;
  if (discriminant <= 0) return 0; // cannot rise that far
  // Descending branch: the later of the two times at which the arc crosses heightDelta.
  const flightTime = (v0 + Math.sqrt(discriminant)) / g;
  return horizontalSpeed * flightTime;
}

/** Top surface of a platform. */
export function surfaceY(platform: PlatformDef): number {
  return platform.position.y + platform.size.y / 2;
}

/** Shortest horizontal gap between two platform footprints (0 if they overlap). */
export function horizontalGap(a: PlatformDef, b: PlatformDef): number {
  const dx = Math.max(0, Math.abs(a.position.x - b.position.x) - (a.size.x + b.size.x) / 2);
  const dz = Math.max(0, Math.abs(a.position.z - b.position.z) - (a.size.z + b.size.z) / 2);
  return Math.hypot(dx, dz);
}

export interface GapAnalysis {
  from: string;
  to: string;
  /** Edge-to-edge horizontal gap, metres. */
  gap: number;
  /** Rise (positive) or drop (negative) between the two surfaces, metres. */
  rise: number;
  reachAtWalk: number;
  reachAtSprint: number;
  clearableAtWalk: boolean;
  clearableAtSprint: boolean;
}

/**
 * Margin demanded beyond the bare gap, so the player lands *on* the next platform rather
 * than clipping its lip. Covers imperfect timing and the fact that nobody is at full
 * speed the instant they leave the ground.
 */
export const LANDING_MARGIN = 0.9;

export function analyseRoute(
  arena: ArenaDefinition,
  tuning: PlayerTuning,
  route: readonly string[] = arena.route,
): GapAnalysis[] {
  const byId = new Map(arena.platforms.map((p) => [p.id, p]));
  const results: GapAnalysis[] = [];

  for (let i = 0; i < route.length - 1; i++) {
    const fromId = route[i];
    const toId = route[i + 1];
    const from = fromId ? byId.get(fromId) : undefined;
    const to = toId ? byId.get(toId) : undefined;
    if (!from || !to) {
      throw new Error(`Route references unknown platform "${!from ? fromId : toId}"`);
    }

    const gap = horizontalGap(from, to);
    const rise = surfaceY(to) - surfaceY(from);
    const required = gap + LANDING_MARGIN;
    const reachAtWalk = horizontalReach(tuning, arena.gravity.y, tuning.walkSpeed, rise);
    const reachAtSprint = horizontalReach(tuning, arena.gravity.y, tuning.sprintSpeed, rise);

    results.push({
      from: from.id,
      to: to.id,
      gap,
      rise,
      reachAtWalk,
      reachAtSprint,
      // A rise taller than the apex is impossible however fast you run at it.
      clearableAtWalk: rise < tuning.jumpHeight && reachAtWalk >= required,
      clearableAtSprint: rise < tuning.jumpHeight && reachAtSprint >= required,
    });
  }

  return results;
}

/** Human-readable report, used by the analysis CLI and test failure messages. */
export function formatRoute(analysis: readonly GapAnalysis[]): string {
  const rows = analysis.map((a) => {
    const verdict = a.clearableAtWalk ? "walk" : a.clearableAtSprint ? "SPRINT ONLY" : "UNREACHABLE";
    return (
      `${a.from.padEnd(12)} -> ${a.to.padEnd(12)} ` +
      `gap ${a.gap.toFixed(2).padStart(5)}m  rise ${a.rise >= 0 ? "+" : ""}${a.rise.toFixed(2)}m  ` +
      `reach ${a.reachAtWalk.toFixed(2)}/${a.reachAtSprint.toFixed(2)}m  ${verdict}`
    );
  });
  return rows.join("\n");
}

export interface SpawnCheck {
  /** Platform the spawn point sits over, if any. */
  platform: string | null;
  /**
   * Gap between the bottom of the player capsule and the surface below it, metres.
   * Negative means the player spawns *inside* the collider.
   */
  clearance: number;
}

/**
 * Where does the player actually start?
 *
 * Spawning a capsule intersecting the floor does not fail loudly — Rapier's character
 * controller just spends its time resolving the penetration instead of moving, which
 * reads as "the controls barely work" rather than "the spawn point is wrong". It cost
 * half an hour to find once; this makes it a test.
 */
export function spawnClearance(arena: ArenaDefinition, tuning: PlayerTuning): SpawnCheck {
  const capsuleBottom = arena.spawn.y - (tuning.halfHeight + tuning.radius);

  let best: { id: string; surface: number } | null = null;
  for (const platform of arena.platforms) {
    const withinX = Math.abs(arena.spawn.x - platform.position.x) <= platform.size.x / 2;
    const withinZ = Math.abs(arena.spawn.z - platform.position.z) <= platform.size.z / 2;
    if (!withinX || !withinZ) continue;

    const surface = surfaceY(platform);
    if (surface <= capsuleBottom + 1e-6 && (!best || surface > best.surface)) {
      best = { id: platform.id, surface };
    }
  }

  // Nothing below the capsule: either the spawn is over the void, or it is buried in the
  // platform it is meant to stand on. Report the deepest overlap so the message is useful.
  if (!best) {
    const overlapping = arena.platforms
      .filter(
        (p) =>
          Math.abs(arena.spawn.x - p.position.x) <= p.size.x / 2 &&
          Math.abs(arena.spawn.z - p.position.z) <= p.size.z / 2,
      )
      .sort((a, b) => surfaceY(b) - surfaceY(a))[0];

    return overlapping
      ? { platform: overlapping.id, clearance: capsuleBottom - surfaceY(overlapping) }
      : { platform: null, clearance: Number.POSITIVE_INFINITY };
  }

  return { platform: best.id, clearance: capsuleBottom - best.surface };
}

/**
 * Gaps the player can neither walk over nor fall through.
 *
 * A gap narrower than the capsule leaves it resting on both lips: the player holds a
 * direction and simply stops, which reads as broken controls rather than "jump here".
 * Gaps should be flush (0) or clearly wider than the body.
 */
export function wedgeGaps(
  arena: ArenaDefinition,
  tuning: PlayerTuning,
  route: readonly string[] = arena.route,
): GapAnalysis[] {
  const bodyWidth = tuning.radius * 2;
  return analyseRoute(arena, tuning, route).filter(
    (gap) => gap.gap > 1e-6 && gap.gap < bodyWidth * 1.25,
  );
}
