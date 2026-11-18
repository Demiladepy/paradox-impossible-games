import { angleDelta, clamp, distanceXZ, type Vec3 } from "../core/math.ts";
import { findPlatform, type ArenaDefinition, type PlatformDef } from "../arena/types.ts";
import type { GameRule } from "../rules/types.ts";

/**
 * THE TEACHING BEAT.
 *
 * A trailer that only shows atmosphere teaches nothing. Someone watching the montage sees
 * a good-looking arena and never learns the single idea the game is built on: that a
 * platform stops existing while you look at it.
 *
 * Showing that needs cause and effect in one unbroken shot — stare, it goes; look away, it
 * returns — and the natural way to get it is for a human to play the game and deliberately
 * turn their head. That makes the most important shot in the submission depend on someone
 * performing well on camera.
 *
 * So the game performs it. This drives the *agent's* gaze on a fixed schedule while it
 * stands still: look at the platform, hold long enough for the dissolve to register, look
 * away, hold while it comes back. Twice, because the repetition is the proof.
 *
 * Everything here is pure. It takes positions and returns angles, so the schedule can be
 * unit-tested without a renderer, and the timings can be argued about from the test file.
 */

/** How far the gaze swings off the target to let the platform return. */
const AVERT_RADIANS = 1.9;

/** A platform closer than this is probably the one underfoot; further is unreadable. */
const MIN_TARGET_DISTANCE = 2.5;
const MAX_TARGET_DISTANCE = 26;

export interface DemonstrationPhase {
  /** Seconds this phase lasts. */
  seconds: number;
  /** Is the agent looking at the target during this phase? */
  staring: boolean;
  caption: string;
}

/**
 * The schedule.
 *
 * The holds are deliberately long. The dissolve takes a beat to read, and a viewer needs
 * to see the platform in its new state for about a second before the change means
 * anything — cutting this tighter is the single easiest way to make the shot illegible.
 */
export const DEMONSTRATION_PHASES: readonly DemonstrationPhase[] = [
  { seconds: 2.0, staring: false, caption: "THE GROUND AHEAD IS SOLID" },
  { seconds: 3.0, staring: true, caption: "LOOK AT IT, AND IT STOPS EXISTING" },
  { seconds: 3.0, staring: false, caption: "LOOK AWAY, AND IT COMES BACK" },
  { seconds: 2.4, staring: true, caption: "GONE AGAIN" },
  { seconds: 2.6, staring: false, caption: "SO YOU CROSS WHAT YOU CANNOT WATCH" },
];

export const DEMONSTRATION_SECONDS = DEMONSTRATION_PHASES.reduce(
  (sum, phase) => sum + phase.seconds,
  0,
);

/**
 * Which platforms vanish when looked at?
 *
 * Read straight off the rules rather than from the autopilot's policy, so the trailer does
 * not depend on the agent's internals — and so a *generated* round with a gaze rule under
 * a different id still demonstrates correctly.
 */
export function averseTargets(rules: readonly GameRule[]): Set<string> {
  const averse = new Set<string>();
  for (const rule of rules) {
    if (rule.type !== "CONDITIONAL_PLATFORM") continue;
    // Default is false: looking at it unmakes it. Only the mirror case is excluded.
    if (rule.parameters["solidWhenObserved"] === true) continue;
    for (const id of rule.targetIds) averse.add(id);
  }
  return averse;
}

/**
 * Pick something worth staring at.
 *
 * The platform under the agent's feet is exempt from the rule and would never dissolve, so
 * choosing it would film a demonstration of nothing. Anything too far away is a few pixels
 * on screen. What is left is the nearest reasonable candidate ahead.
 */
export function pickDemonstrationTarget(
  arena: ArenaDefinition,
  rules: readonly GameRule[],
  from: Vec3,
  supportingPlatformId: string | null,
): PlatformDef | null {
  const averse = averseTargets(rules);
  if (averse.size === 0) return null;

  let best: PlatformDef | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const id of averse) {
    if (id === supportingPlatformId) continue;
    const platform = findPlatform(arena, id);
    if (!platform) continue;

    const d = distanceXZ(from, platform.position);
    if (d < MIN_TARGET_DISTANCE || d > MAX_TARGET_DISTANCE) continue;
    if (d < bestDistance) {
      bestDistance = d;
      best = platform;
    }
  }

  return best;
}

export interface DemonstrationFrame {
  yaw: number;
  pitch: number;
  /** True while the gaze is on the target — i.e. while the platform should be unmade. */
  staring: boolean;
  caption: string;
  /** 0 to 1 through the whole demonstration. */
  progress: number;
  finished: boolean;
}

/**
 * Runs the schedule.
 *
 * The gaze eases between the two angles rather than snapping, because a hard cut in head
 * direction reads as a glitch and hides the causal link — the viewer needs to see the look
 * travel onto the platform and the platform answer it.
 */
export class GazeDemonstration {
  private elapsed = 0;

  reset(): void {
    this.elapsed = 0;
  }

  get finished(): boolean {
    return this.elapsed >= DEMONSTRATION_SECONDS;
  }

  update(gazeOrigin: Vec3, target: PlatformDef, dt: number): DemonstrationFrame {
    this.elapsed += Math.max(0, dt);

    const aim = lookAt(gazeOrigin, surfacePoint(target));
    // Swing aside, not down: averting by pitch alone would still catch a wide slab in the
    // cone, and on camera it reads as the character studying their own feet.
    const away = { yaw: aim.yaw + AVERT_RADIANS, pitch: -0.05 };

    const { phase, t, index } = phaseAt(this.elapsed);
    const previous = DEMONSTRATION_PHASES[index - 1];

    // Ease over the opening fraction of each phase, then hold. The hold is the part that
    // does the teaching; the ease is only there so the movement looks like a head turn.
    const blendFraction = Math.min(0.75, phase.seconds * 0.4) / phase.seconds;
    const blend = clamp(t / blendFraction, 0, 1);
    const eased = blend * blend * (3 - 2 * blend);

    const to = phase.staring ? aim : away;
    const from = previous === undefined ? away : previous.staring ? aim : away;

    return {
      // Interpolate the short way round, or a turn past PI spins the head the long way.
      yaw: from.yaw + angleDelta(from.yaw, to.yaw) * eased,
      pitch: from.pitch + (to.pitch - from.pitch) * eased,
      staring: phase.staring,
      caption: phase.caption,
      progress: clamp(this.elapsed / DEMONSTRATION_SECONDS, 0, 1),
      finished: this.elapsed >= DEMONSTRATION_SECONDS,
    };
  }
}

/** Which phase is active, and how far through it we are. */
export function phaseAt(elapsed: number): {
  phase: DemonstrationPhase;
  t: number;
  index: number;
} {
  let remaining = Math.max(0, elapsed);
  for (let index = 0; index < DEMONSTRATION_PHASES.length; index++) {
    const phase = DEMONSTRATION_PHASES[index];
    if (!phase) break;
    if (remaining < phase.seconds) {
      return { phase, t: remaining / phase.seconds, index };
    }
    remaining -= phase.seconds;
  }
  const index = DEMONSTRATION_PHASES.length - 1;
  const phase = DEMONSTRATION_PHASES[index];
  if (!phase) throw new Error("DEMONSTRATION_PHASES must not be empty");
  return { phase, t: 1, index };
}

/** The point on the platform worth aiming at: the middle of its top face. */
export function surfacePoint(platform: PlatformDef): Vec3 {
  return {
    x: platform.position.x,
    y: platform.position.y + platform.size.y / 2,
    z: platform.position.z,
  };
}

function lookAt(origin: Vec3, point: Vec3): { yaw: number; pitch: number } {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dz = point.z - origin.z;
  const flat = Math.hypot(dx, dz);
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, Math.max(flat, 1e-4)),
  };
}
