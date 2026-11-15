import { pickFallback } from "../../game/challenges/fallback.ts";
import { challengeConfigSchema, type ChallengeConfig } from "../../game/challenges/schema.ts";

/**
 * Asks our own server for a challenge.
 *
 * The browser never talks to an LLM directly and never sees an API key — it calls
 * `/api/challenge`, which generates, validates and probes server-side.
 *
 * Every failure path here ends in a playable round. A dead endpoint, a timeout, a 500, a
 * malformed body: all of them fall back to the built-in pack, and the result always says
 * which it is. The game must be complete with no network at all (CLAUDE.md rule 6).
 */

export type ChallengeSource = "generated" | "fallback";

export interface ChallengeResult {
  challenge: ChallengeConfig;
  source: ChallengeSource;
  note?: string;
  probe?: { solved: boolean; seconds: number; reason: string };
}

/** Beyond this, a player is just staring at a loading screen. */
const TIMEOUT_MS = 20_000;

export async function requestChallenge(difficulty: 1 | 2 | 3 = 1): Promise<ChallengeResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch("/api/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ difficulty }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return offline(difficulty, `The challenge service answered ${response.status}.`);
    }

    const body: unknown = await response.json();
    const parsed = parseResult(body);
    if (!parsed) {
      return offline(difficulty, "The challenge service returned something unreadable.");
    }
    return parsed;
  } catch (error) {
    const reason =
      error instanceof DOMException && error.name === "AbortError"
        ? `The challenge service took longer than ${TIMEOUT_MS / 1000}s.`
        : "The challenge service could not be reached.";
    return offline(difficulty, reason);
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Re-validate the shape on arrival.
 *
 * The server already validated, but this is the boundary between our process and
 * something that was produced by a model — checking twice costs microseconds.
 */
function parseResult(body: unknown): ChallengeResult | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;

  const challenge = challengeConfigSchema.safeParse(record["challenge"]);
  if (!challenge.success) return null;

  const source: ChallengeSource = record["source"] === "generated" ? "generated" : "fallback";
  const note = typeof record["note"] === "string" ? record["note"] : undefined;
  const probe = record["probe"] as ChallengeResult["probe"] | undefined;

  return {
    challenge: challenge.data,
    source,
    ...(note ? { note } : {}),
    ...(probe ? { probe } : {}),
  };
}

function offline(difficulty: 1 | 2 | 3, reason: string): ChallengeResult {
  return {
    challenge: pickFallback(difficulty),
    source: "fallback",
    note: `${reason} Playing a round from the built-in pack.`,
  };
}
