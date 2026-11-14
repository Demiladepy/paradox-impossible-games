import type { Vec3 } from "../core/math.ts";
import type { ArenaDefinition } from "../arena/types.ts";

/**
 * The Reality Rule Engine's contracts.
 *
 * The rules are what make PARADOX itself: an AI proposes which of them apply and with
 * what parameters, and they change how the world behaves. Everything here is ordinary
 * deterministic code. The model supplies *data* that selects and configures these modules
 * — it never supplies behaviour (CLAUDE.md rule 1).
 */

export type RuleType =
  | "CONDITIONAL_PLATFORM"
  | "GRAVITY_DIRECTION"
  | "SPATIAL_PORTAL"
  | "OBJECT_STATE";

export const RULE_TYPES: readonly RuleType[] = [
  "CONDITIONAL_PLATFORM",
  "GRAVITY_DIRECTION",
  "SPATIAL_PORTAL",
  "OBJECT_STATE",
];

export type RuleParameterValue = number | string | boolean;

export interface RuleTrigger {
  type: string;
  parameters?: Record<string, RuleParameterValue>;
}

/** The wire format. This is exactly what a generated challenge contains. */
export interface GameRule {
  id: string;
  type: RuleType;
  targetIds: string[];
  parameters: Record<string, RuleParameterValue>;
  trigger: RuleTrigger;
}

/* ------------------------------------------------------------------ */
/* What a rule is allowed to see and do                                */
/* ------------------------------------------------------------------ */

export interface PlayerView {
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
  /** Platform the player is currently standing on, if any. */
  supportingPlatformId: string | null;
}

export interface GazeView {
  /** Eye position — where the player is looking *from*. */
  origin: Vec3;
  /** Unit direction the player is looking. */
  forward: Vec3;
}

/**
 * The only surface a rule may touch.
 *
 * Deliberately narrow: a rule cannot spawn geometry, read React state, call a network, or
 * reach the renderer. Anything it wants to show the player goes through `effects`, which
 * the view reads once per frame.
 */
export interface RuleContext {
  readonly arena: ArenaDefinition;
  /** Simulated seconds since the round began. Never wall-clock. */
  readonly time: number;
  readonly dt: number;
  readonly player: PlayerView;
  readonly gaze: GazeView;
  readonly effects: RuleEffects;

  setSolid(id: string, solid: boolean): void;
  setGravity(gravity: Vec3): void;
}

/** Everything the rules want the player to be able to see. */
export interface RuleEffects {
  /** Platforms that are currently not solid. */
  phantom: Set<string>;
  /** Platforms the player is currently looking at. */
  observed: Set<string>;
  /** +1 when "up" is +Y, -1 when gravity has been inverted. */
  upSign: number;
  /** A countdown the HUD should show, e.g. an imminent gravity flip. */
  warning: { message: string; secondsRemaining: number } | null;
}

export function emptyEffects(): RuleEffects {
  return { phantom: new Set(), observed: new Set(), upSign: 1, warning: null };
}

/* ------------------------------------------------------------------ */
/* Rule modules                                                        */
/* ------------------------------------------------------------------ */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const ok = <T>(value: T): ParseResult<T> => ({ ok: true, value });
export const fail = <T>(error: string): ParseResult<T> => ({ ok: false, error });

/**
 * A rule module turns validated parameters into behaviour.
 *
 * `parse` is the important half: it is where a generated rule is checked against the
 * arena it will run in — do the target ids exist, are the numbers in range, is the
 * trigger one this module understands. Milestone 3's challenge validation is built on it,
 * which is why it returns a message rather than throwing.
 */
export interface RuleModule<P> {
  readonly type: RuleType;
  parse(rule: GameRule, arena: ArenaDefinition): ParseResult<P>;
  /** Called once when the rule is loaded. Use it to capture initial world state. */
  init?(ctx: RuleContext, params: P): void;
  /** Called every fixed timestep, before the player moves. */
  update(ctx: RuleContext, params: P): void;
  /** Called when the rule is unloaded. Must restore anything it changed. */
  dispose?(ctx: RuleContext, params: P): void;
}

/* ------------------------------------------------------------------ */
/* Shared parameter helpers                                           */
/* ------------------------------------------------------------------ */

export function numberParam(
  rule: GameRule,
  key: string,
  fallback: number,
  min: number,
  max: number,
): ParseResult<number> {
  const raw = rule.parameters[key];
  if (raw === undefined) return ok(fallback);
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return fail(`${rule.id}: "${key}" must be a finite number, got ${JSON.stringify(raw)}`);
  }
  if (raw < min || raw > max) {
    return fail(`${rule.id}: "${key}" must be within [${min}, ${max}], got ${raw}`);
  }
  return ok(raw);
}

export function booleanParam(rule: GameRule, key: string, fallback: boolean): ParseResult<boolean> {
  const raw = rule.parameters[key];
  if (raw === undefined) return ok(fallback);
  if (typeof raw !== "boolean") {
    return fail(`${rule.id}: "${key}" must be a boolean, got ${JSON.stringify(raw)}`);
  }
  return ok(raw);
}

/** Every target must name something the arena actually contains. */
export function requireTargets(rule: GameRule, known: ReadonlySet<string>): ParseResult<string[]> {
  if (rule.targetIds.length === 0) {
    return fail(`${rule.id}: needs at least one targetId`);
  }
  const missing = rule.targetIds.filter((id) => !known.has(id));
  if (missing.length > 0) {
    return fail(`${rule.id}: unknown target id(s) ${missing.map((m) => `"${m}"`).join(", ")}`);
  }
  return ok([...rule.targetIds]);
}
