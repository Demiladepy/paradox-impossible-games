import { dot, lengthOf, normalize, sub } from "../core/math.ts";
import { platformSamplePoints } from "../arena/support.ts";
import { findPlatform, type ArenaDefinition, type PlatformDef } from "../arena/types.ts";
import {
  booleanParam,
  numberParam,
  ok,
  fail,
  requireTargets,
  type GameRule,
  type ParseResult,
  type RuleContext,
  type RuleModule,
} from "./types.ts";
import { arenaObjectIds } from "../arena/types.ts";

/**
 * THE FALSE FLOOR — platforms whose solidity depends on whether you are looking at them.
 *
 * The defining trick of Round 1: look away to make the floor real, then cross something
 * you cannot see. Two details make it a mechanic rather than a source of frustration:
 *
 * - **Hysteresis.** A single dot-product threshold makes a platform at the edge of the
 *   view cone flicker solid/not-solid many times a second as the camera breathes. The
 *   angle at which a platform becomes observed is narrower than the angle at which it
 *   stops being observed, so it latches instead of chattering.
 * - **The supporting platform is exempt.** You can unmake the floor ahead of you, never
 *   the floor under your feet. See arena/support.ts for why.
 */

export interface ConditionalPlatformParams {
  targetIds: string[];
  /** true: looking at it makes it solid. false (the default): looking at it unmakes it. */
  solidWhenObserved: boolean;
  /** Full width of the view cone, degrees. */
  coneDegrees: number;
  /** Latching band, degrees. */
  hysteresisDegrees: number;
  /** Beyond this distance a platform is not considered observed at all. */
  maxDistance: number;
  exemptSupporting: boolean;
}

const SUPPORTED_TRIGGERS = new Set(["PLAYER_CAMERA_DIRECTION", "ALWAYS"]);

export const conditionalPlatform: RuleModule<ConditionalPlatformParams> = {
  type: "CONDITIONAL_PLATFORM",

  parse(rule: GameRule, arena: ArenaDefinition): ParseResult<ConditionalPlatformParams> {
    if (!SUPPORTED_TRIGGERS.has(rule.trigger.type)) {
      return fail(
        `${rule.id}: trigger "${rule.trigger.type}" is not supported by CONDITIONAL_PLATFORM ` +
          `(expected ${[...SUPPORTED_TRIGGERS].join(" or ")})`,
      );
    }

    const targets = requireTargets(rule, new Set(arenaObjectIds(arena)));
    if (!targets.ok) return targets;

    // The exit is a trigger volume, not geometry — it has no collider to switch off.
    const notPlatforms = targets.value.filter((id) => !findPlatform(arena, id));
    if (notPlatforms.length > 0) {
      return fail(
        `${rule.id}: CONDITIONAL_PLATFORM can only target platforms, not ` +
          notPlatforms.map((id) => `"${id}"`).join(", "),
      );
    }

    const solidWhenObserved = booleanParam(rule, "solidWhenObserved", false);
    if (!solidWhenObserved.ok) return solidWhenObserved;

    const coneDegrees = numberParam(rule, "coneDegrees", 62, 10, 170);
    if (!coneDegrees.ok) return coneDegrees;

    const hysteresisDegrees = numberParam(rule, "hysteresisDegrees", 9, 0, 45);
    if (!hysteresisDegrees.ok) return hysteresisDegrees;

    const maxDistance = numberParam(rule, "maxDistance", 60, 2, 400);
    if (!maxDistance.ok) return maxDistance;

    const exemptSupporting = booleanParam(rule, "exemptSupporting", true);
    if (!exemptSupporting.ok) return exemptSupporting;

    return ok({
      targetIds: targets.value,
      solidWhenObserved: solidWhenObserved.value,
      coneDegrees: coneDegrees.value,
      hysteresisDegrees: hysteresisDegrees.value,
      maxDistance: maxDistance.value,
      exemptSupporting: exemptSupporting.value,
    });
  },

  init(ctx, params) {
    observedLatch.set(params, new Set());
    // Start from the rule's resting state rather than whatever the arena was built with.
    for (const id of params.targetIds) {
      ctx.setSolid(id, !params.solidWhenObserved);
    }
  },

  update(ctx, params) {
    const latch = observedLatch.get(params) ?? new Set<string>();
    const enterCos = Math.cos(degToRad((params.coneDegrees - params.hysteresisDegrees) / 2));
    const exitCos = Math.cos(degToRad((params.coneDegrees + params.hysteresisDegrees) / 2));

    for (const id of params.targetIds) {
      const platform = findPlatform(ctx.arena, id);
      if (!platform) continue;

      const wasObserved = latch.has(id);
      const threshold = wasObserved ? exitCos : enterCos;
      const observed = isObserved(ctx, platform, threshold, params.maxDistance);

      if (observed) latch.add(id);
      else latch.delete(id);

      let solid = params.solidWhenObserved ? observed : !observed;

      // Never pull the floor out from under the player.
      if (params.exemptSupporting && ctx.player.supportingPlatformId === id) solid = true;

      ctx.setSolid(id, solid);
      if (observed) ctx.effects.observed.add(id);
      if (!solid) ctx.effects.phantom.add(id);
    }

    observedLatch.set(params, latch);
  },

  dispose(ctx, params) {
    observedLatch.delete(params);
    // Leave the arena as we found it, so a later challenge starts from solid ground.
    for (const id of params.targetIds) ctx.setSolid(id, true);
  },
};

/**
 * Per-rule latch state.
 *
 * Kept outside the params object so the parsed parameters stay plain data — they are what
 * a generated challenge contains, and they should serialise cleanly.
 */
const observedLatch = new WeakMap<ConditionalPlatformParams, Set<string>>();

/**
 * Is any part of the platform inside the view cone?
 *
 * Testing only the centre would call a wide slab unobserved while the player stares at
 * its near edge, so the corners count too.
 */
function isObserved(
  ctx: RuleContext,
  platform: PlatformDef,
  cosThreshold: number,
  maxDistance: number,
): boolean {
  const { origin, forward } = ctx.gaze;

  for (const point of platformSamplePoints(platform, ctx.effects.upSign)) {
    const offset = sub(point, origin);
    const distance = lengthOf(offset);
    if (distance > maxDistance) continue;
    // Standing essentially on the point: treat as observed, there is no meaningful angle.
    if (distance < 1e-3) return true;
    if (dot(normalize(offset), forward) >= cosThreshold) return true;
  }
  return false;
}

const degToRad = (degrees: number): number => (degrees * Math.PI) / 180;
