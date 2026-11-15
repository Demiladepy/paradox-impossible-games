import { ARENA_IDS, findArena } from "../arena/registry.ts";
import { arenaObjectIds } from "../arena/types.ts";
import { IMPLEMENTED_RULE_TYPES } from "../rules/index.ts";
import { probeChallenge, type ProbeResult } from "./probe.ts";
import {
  challengeConfigSchema,
  formatSchemaError,
  MAX_DURATION,
  MIN_DURATION,
  type ChallengeConfig,
} from "./schema.ts";

/**
 * Four gates, cheapest first.
 *
 *   shape  -> does it parse as a ChallengeConfig at all?
 *   refs   -> does everything it names actually exist?
 *   sanity -> is it internally coherent and within the bounds we support?
 *   probe  -> can an agent actually complete it?
 *
 * The first three are microseconds and catch most of what a model gets wrong. The probe
 * costs a few hundred milliseconds because it runs the real simulation headless, so it
 * runs last and only on a challenge that has already earned it.
 */

export type ValidationStage = "shape" | "references" | "sanity" | "solvability";

export interface ValidationFailure {
  stage: ValidationStage;
  problems: string[];
}

export type ValidationResult =
  | { ok: true; challenge: ChallengeConfig; probe: ProbeResult }
  | ({ ok: false } & ValidationFailure);

export interface ValidateOptions {
  /** Skip the probe. Only for tests that are checking the cheap gates. */
  skipProbe?: boolean;
  probeSeed?: string;
}

export async function validateChallenge(
  candidate: unknown,
  options: ValidateOptions = {},
): Promise<ValidationResult> {
  /* --- 1. shape ------------------------------------------------------------ */
  const parsed = challengeConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, stage: "shape", problems: formatSchemaError(parsed.error) };
  }
  const challenge = parsed.data;

  /* --- 2. references -------------------------------------------------------- */
  const referenceProblems = checkReferences(challenge);
  if (referenceProblems.length > 0) {
    return { ok: false, stage: "references", problems: referenceProblems };
  }

  /* --- 3. sanity ------------------------------------------------------------ */
  const sanityProblems = checkSanity(challenge);
  if (sanityProblems.length > 0) {
    return { ok: false, stage: "sanity", problems: sanityProblems };
  }

  /* --- 4. solvability ------------------------------------------------------- */
  if (options.skipProbe) {
    return {
      ok: true,
      challenge,
      probe: {
        solved: true,
        seconds: 0,
        steps: 0,
        reason: "probe skipped",
        lastTarget: "-",
        finalStatus: "won",
      },
    };
  }

  const probe = await probeChallenge(challenge, { seed: options.probeSeed });
  if (!probe.solved) {
    return { ok: false, stage: "solvability", problems: [probe.reason] };
  }

  return { ok: true, challenge, probe };
}

/** Everything the challenge names must exist in the arena it names. */
function checkReferences(challenge: ChallengeConfig): string[] {
  const problems: string[] = [];

  const arena = findArena(challenge.arenaId);
  if (!arena) {
    problems.push(
      `arenaId "${challenge.arenaId}" does not exist (known: ${ARENA_IDS.join(", ")})`,
    );
    return problems; // nothing else can be checked without an arena
  }

  const known = new Set(arenaObjectIds(arena));

  if (challenge.objective.type === "REACH_EXIT" && challenge.objective.targetId !== arena.exit.id) {
    problems.push(
      `objective targets "${challenge.objective.targetId}" but ${arena.id}'s exit is "${arena.exit.id}"`,
    );
  }

  for (const rule of challenge.rules) {
    if (!IMPLEMENTED_RULE_TYPES.includes(rule.type as never)) {
      problems.push(
        `rule "${rule.id}" uses "${rule.type}", which is declared but not implemented ` +
          `(available: ${IMPLEMENTED_RULE_TYPES.join(", ")})`,
      );
    }
    for (const target of rule.targetIds) {
      if (!known.has(target)) {
        problems.push(`rule "${rule.id}" targets "${target}", which ${arena.id} does not contain`);
      }
    }
  }

  return problems;
}

/**
 * Internal coherence.
 *
 * These are the mistakes that produce a challenge which loads fine and then is miserable
 * or impossible — the ones no type system catches.
 */
function checkSanity(challenge: ChallengeConfig): string[] {
  const problems: string[] = [];

  const ids = challenge.rules.map((rule) => rule.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    problems.push(`duplicate rule ids: ${[...new Set(duplicates)].join(", ")}`);
  }

  if (challenge.durationSeconds < MIN_DURATION || challenge.durationSeconds > MAX_DURATION) {
    problems.push(
      `durationSeconds ${challenge.durationSeconds} is outside [${MIN_DURATION}, ${MAX_DURATION}]`,
    );
  }

  // A SURVIVE_TIMER round with no timer pressure is just standing still.
  if (challenge.objective.type === "SURVIVE_TIMER" && challenge.durationSeconds < 25) {
    problems.push("a SURVIVE_TIMER round shorter than 25s is over before it starts");
  }

  // Two gaze rules disagreeing about the same platform would fight each other every step,
  // and which one wins would depend on array order.
  const wantsObserved = new Map<string, boolean>();
  for (const rule of challenge.rules) {
    if (rule.type !== "CONDITIONAL_PLATFORM") continue;
    const solidWhenObserved = rule.parameters["solidWhenObserved"] === true;
    for (const target of rule.targetIds) {
      const existing = wantsObserved.get(target);
      if (existing !== undefined && existing !== solidWhenObserved) {
        problems.push(
          `platform "${target}" is targeted by two CONDITIONAL_PLATFORM rules that disagree ` +
            `about whether looking at it makes it solid`,
        );
      }
      wantsObserved.set(target, solidWhenObserved);
    }
  }

  // More than one gravity schedule means neither is the schedule.
  const gravityRules = challenge.rules.filter((rule) => rule.type === "GRAVITY_DIRECTION");
  if (gravityRules.length > 1) {
    problems.push(
      `${gravityRules.length} GRAVITY_DIRECTION rules — only one gravity schedule can be in charge`,
    );
  }

  // Inverting gravity in an arena with nothing overhead throws the player into the void.
  const arena = findArena(challenge.arenaId);
  if (gravityRules.length > 0 && arena && arena.killCeilingY === undefined) {
    problems.push(
      `${arena.id} has no ceiling to stand on, so inverting gravity there is unsurvivable`,
    );
  }

  return problems;
}

/** One-line summary for logs and the rejection UI. */
export function describeFailure(failure: ValidationFailure): string {
  return `${failure.stage}: ${failure.problems.join("; ")}`;
}
