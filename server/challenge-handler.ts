import Anthropic from "@anthropic-ai/sdk";
import { describeArenasForPrompt } from "../src/game/arena/registry.ts";
import { pickFallback } from "../src/game/challenges/fallback.ts";
import { MAX_DURATION, MIN_DURATION, type ChallengeConfig } from "../src/game/challenges/schema.ts";
import { describeFailure, validateChallenge } from "../src/game/challenges/validate.ts";

/**
 * Challenge generation — SERVER SIDE ONLY.
 *
 * This module reads ANTHROPIC_API_KEY and must never be imported from `src/`. The browser
 * calls `/api/challenge`; the key stays here (CLAUDE.md rule 3).
 *
 * The server validates before it answers, so a challenge that reaches the browser has
 * already been through the schema, its references, the sanity checks and the solvability
 * probe — the client cannot be handed something unplayable. On failure the model gets the
 * specific reason back and one more attempt; after that the fallback pack is used and the
 * response says so plainly rather than pretending the AI produced it.
 */

export type ChallengeSource = "generated" | "fallback";

export interface ChallengeResponse {
  challenge: ChallengeConfig;
  source: ChallengeSource;
  /** Why the fallback was used, when it was. Shown to the player, not swallowed. */
  note?: string;
  /** How the probe's agent got on, for the briefing screen. */
  probe?: { solved: boolean; seconds: number; reason: string };
  attempts: number;
}

export interface GenerateRequest {
  difficulty?: 1 | 2 | 3;
  seed?: string;
}

const MODEL = "claude-opus-5-5";
const MAX_ATTEMPTS = 2;

function systemPrompt(): string {
  return `You design single rounds for PARADOX, a 3D survival game where the physical rules change between rounds.

Return ONLY a JSON object. No prose, no markdown fence, no explanation.

ARENAS — you may only use these, exactly as named:
${describeArenasForPrompt()}

RULE TYPES — only these three are implemented. Anything else is rejected.

1. CONDITIONAL_PLATFORM — platforms whose solidity depends on whether the player is looking at them.
   trigger.type: "PLAYER_CAMERA_DIRECTION"
   targetIds: platform ids (never the exit)
   parameters:
     solidWhenObserved (boolean, default false — false means looking at it UNMAKES it)
     coneDegrees (10–170, default 58)
     hysteresisDegrees (0–45, default 10)
     exemptSupporting (boolean, default true — keep this true; false lets a player delete the floor under their own feet)

2. GRAVITY_DIRECTION — gravity inverts along Y on a schedule. ONLY usable in an arena with a ceiling.
   trigger.type: "TIMER"
   targetIds: []
   parameters:
     intervalSeconds (2–120), warnSeconds (0–10, MUST be less than intervalSeconds),
     magnitude (4–60, default 22), startInverted (boolean)

3. OBJECT_STATE — platforms blink on and off on a clock.
   trigger.type: "TIMER"
   targetIds: platform ids
   parameters:
     periodSeconds (0.5–60), dutyCycle (0.05–0.95 — fraction of each period the platform is solid),
     stagger (0–30), startSolid (boolean)

SHAPE:
{
  "id": "kebab-case-id",
  "title": "at most 60 characters",
  "description": "one or two sentences of player-facing briefing, at most 220 characters",
  "arenaId": "<one of the arena ids above>",
  "objective": { "type": "REACH_EXIT" | "SURVIVE_TIMER", "targetId": "<that arena's exit id>" },
  "durationSeconds": integer ${MIN_DURATION}–${MAX_DURATION},
  "difficulty": 1 | 2 | 3,
  "rules": [ 1–4 rules ],
  "opponents": { "count": 0, "difficulty": "EASY" }
}

HARD CONSTRAINTS — a challenge breaking any of these is rejected:
- Every targetId must be a platform that exists in the chosen arena.
- Two CONDITIONAL_PLATFORM rules must not disagree about the same platform.
- At most one GRAVITY_DIRECTION rule, and only in an arena that has a ceiling.
- Reaching the exit of a gravity arena is not currently achievable — pair GRAVITY_DIRECTION with SURVIVE_TIMER.
- No extra fields anywhere.

DESIGN GUIDANCE:
- The round should be legible. A player must be able to work out the rule by experimenting, in one or two deaths.
- The description should hint at the mechanic without explaining it outright.
- Difficulty 1: one rule, generous timer. Difficulty 3: two or three interacting rules.
- Give the player time to think: these timers are for tension, not for speedrunning.`;
}

function userPrompt(request: GenerateRequest, previousFailure?: string): string {
  const base = `Design a round at difficulty ${request.difficulty ?? 1}.`;
  if (!previousFailure) return base;
  return (
    `${base}\n\nYour previous attempt was rejected by the game's validator:\n` +
    `${previousFailure}\n\nFix exactly that and return the corrected JSON.`
  );
}

/** Pull the JSON object out of a reply, tolerating a stray fence or preamble. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object found in the model's reply");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function generateChallenge(request: GenerateRequest): Promise<ChallengeResponse> {
  const difficulty = request.difficulty ?? 1;
  const apiKey = process.env["ANTHROPIC_API_KEY"]?.trim();

  if (!apiKey) {
    return {
      challenge: pickFallback(difficulty),
      source: "fallback",
      note: "No ANTHROPIC_API_KEY configured, so this round comes from the built-in pack.",
      attempts: 0,
    };
  }

  const client = new Anthropic({ apiKey });
  let lastProblem: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: systemPrompt(),
        messages: [{ role: "user", content: userPrompt({ ...request, difficulty }, lastProblem) }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const candidate = extractJson(text);
      const result = await validateChallenge(candidate, { probeSeed: request.seed });

      if (result.ok) {
        return {
          challenge: result.challenge,
          source: "generated",
          probe: {
            solved: result.probe.solved,
            seconds: result.probe.seconds,
            reason: result.probe.reason,
          },
          attempts: attempt,
        };
      }

      lastProblem = describeFailure(result);
      console.warn(`[challenge] attempt ${attempt} rejected — ${lastProblem}`);
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
      console.warn(`[challenge] attempt ${attempt} failed — ${lastProblem}`);
    }
  }

  return {
    challenge: pickFallback(difficulty),
    source: "fallback",
    note: `The generated challenge did not pass validation (${lastProblem ?? "unknown"}), so this round comes from the built-in pack.`,
    attempts: MAX_ATTEMPTS,
  };
}

/** Minimal framework-agnostic handler, usable from Vite middleware or a serverless route. */
export async function handleChallengeRequest(body: unknown): Promise<ChallengeResponse> {
  const request = (body ?? {}) as GenerateRequest;
  const difficulty =
    request.difficulty === 2 || request.difficulty === 3 ? request.difficulty : 1;
  return generateChallenge({ difficulty, ...(request.seed ? { seed: request.seed } : {}) });
}
