import { arenaObjectIds, findPlatform, type ArenaDefinition } from "../arena/types.ts";
import {
  booleanParam,
  fail,
  numberParam,
  ok,
  requireTargets,
  type GameRule,
  type ParseResult,
  type RuleModule,
} from "./types.ts";

/**
 * OBJECT_STATE — switch platforms on and off on a timer.
 *
 * The plain one. It exists so a challenge can say "this platform blinks" without needing
 * a bespoke module, and so there is a simple rule to compose with the strange ones when
 * testing that two mechanics coexist.
 *
 * Phase is derived from the simulated clock rather than accumulated per step, so it
 * cannot drift and a replay lands on exactly the same pattern.
 */

export interface ObjectStateParams {
  targetIds: string[];
  periodSeconds: number;
  /** Fraction of each period the object is solid. */
  dutyCycle: number;
  /** Seconds of offset between consecutive targets, so they do not blink in unison. */
  stagger: number;
  startSolid: boolean;
}

const SUPPORTED_TRIGGERS = new Set(["TIMER", "INTERVAL", "ALWAYS"]);

export const objectState: RuleModule<ObjectStateParams> = {
  type: "OBJECT_STATE",

  parse(rule: GameRule, arena: ArenaDefinition): ParseResult<ObjectStateParams> {
    if (!SUPPORTED_TRIGGERS.has(rule.trigger.type)) {
      return fail(
        `${rule.id}: trigger "${rule.trigger.type}" is not supported by OBJECT_STATE ` +
          `(expected one of ${[...SUPPORTED_TRIGGERS].join(", ")})`,
      );
    }

    const targets = requireTargets(rule, new Set(arenaObjectIds(arena)));
    if (!targets.ok) return targets;

    const notPlatforms = targets.value.filter((id) => !findPlatform(arena, id));
    if (notPlatforms.length > 0) {
      return fail(
        `${rule.id}: OBJECT_STATE can only target platforms, not ` +
          notPlatforms.map((id) => `"${id}"`).join(", "),
      );
    }

    const periodSeconds = numberParam(rule, "periodSeconds", 4, 0.5, 60);
    if (!periodSeconds.ok) return periodSeconds;

    const dutyCycle = numberParam(rule, "dutyCycle", 0.6, 0.05, 0.95);
    if (!dutyCycle.ok) return dutyCycle;

    const stagger = numberParam(rule, "stagger", 0, 0, 30);
    if (!stagger.ok) return stagger;

    const startSolid = booleanParam(rule, "startSolid", true);
    if (!startSolid.ok) return startSolid;

    return ok({
      targetIds: targets.value,
      periodSeconds: periodSeconds.value,
      dutyCycle: dutyCycle.value,
      stagger: stagger.value,
      startSolid: startSolid.value,
    });
  },

  update(ctx, params) {
    params.targetIds.forEach((id, index) => {
      const offset = params.startSolid ? 0 : params.periodSeconds * params.dutyCycle;
      const phase = (ctx.time + offset + index * params.stagger) % params.periodSeconds;
      let solid = phase < params.periodSeconds * params.dutyCycle;

      if (ctx.player.supportingPlatformId === id) solid = true;

      ctx.setSolid(id, solid);
      if (!solid) ctx.effects.phantom.add(id);
    });
  },

  dispose(ctx, params) {
    for (const id of params.targetIds) ctx.setSolid(id, true);
  },
};
