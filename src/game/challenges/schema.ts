import { z } from "zod";
import type { RuleType } from "../rules/types.ts";

/**
 * The contract between the AI and the game.
 *
 * A model returns JSON matching this and nothing else. It never returns code, expressions,
 * or anything that gets executed (CLAUDE.md rule 1) — it picks an arena, selects rule types
 * from a fixed list, and sets their parameters within declared ranges.
 *
 * `.strict()` everywhere is deliberate: an unexpected key means the model is trying to do
 * something we have not agreed to, and the right response is to reject the challenge, not
 * to quietly drop the field and play something subtly different from the briefing.
 */

export const ruleTypeSchema = z.enum([
  "CONDITIONAL_PLATFORM",
  "GRAVITY_DIRECTION",
  "SPATIAL_PORTAL",
  "OBJECT_STATE",
]);

/**
 * Compile-time guarantee that the wire schema and the engine's rule union stay in step.
 * Add a rule type to one and forget the other, and this stops being `true`.
 */
type _RuleTypesMatch = [RuleType] extends [z.infer<typeof ruleTypeSchema>]
  ? [z.infer<typeof ruleTypeSchema>] extends [RuleType]
    ? true
    : never
  : never;
const _ruleTypesMatch: _RuleTypesMatch = true;
void _ruleTypesMatch;

export const ruleParameterSchema = z.union([z.number(), z.string(), z.boolean()]);

export const gameRuleSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: ruleTypeSchema,
    targetIds: z.array(z.string().min(1).max(64)).max(32),
    parameters: z.record(z.string(), ruleParameterSchema),
    trigger: z
      .object({
        type: z.string().min(1).max(64),
        parameters: z.record(z.string(), ruleParameterSchema).optional(),
      })
      .strict(),
  })
  .strict();

export const objectiveSchema = z
  .object({
    type: z.enum(["REACH_EXIT", "SURVIVE_TIMER"]),
    targetId: z.string().min(1).max(64),
  })
  .strict();

export const opponentsSchema = z
  .object({
    count: z.number().int().min(0).max(4),
    difficulty: z.enum(["EASY", "NORMAL"]),
  })
  .strict();

/**
 * Timer bounds.
 *
 * The lower bound is not arbitrary: the autopilot clears Arena 01 in about 9 seconds with
 * no rules in the way, so anything under ~20 leaves no room to think, and thinking is the
 * entire point of the game.
 */
export const MIN_DURATION = 20;
export const MAX_DURATION = 240;

export const challengeConfigSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().min(1).max(60),
    description: z.string().min(1).max(220),
    arenaId: z.string().min(1).max(64),
    objective: objectiveSchema,
    durationSeconds: z.number().int().min(MIN_DURATION).max(MAX_DURATION),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    rules: z.array(gameRuleSchema).min(1).max(4),
    opponents: opponentsSchema,
  })
  .strict();

export type ChallengeConfig = z.infer<typeof challengeConfigSchema>;
export type ChallengeObjective = z.infer<typeof objectiveSchema>;

/** Human-readable zod failures, for the retry prompt and for the rejection UI. */
export function formatSchemaError(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}
