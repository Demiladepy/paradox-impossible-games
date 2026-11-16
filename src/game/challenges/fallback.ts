import type { ChallengeConfig } from "./schema.ts";

/**
 * Known-good challenges, hand-authored and verified by the probe in CI.
 *
 * These exist so PARADOX is a complete game with no network at all. If the LLM is slow,
 * rate-limited, unreachable, or simply has no key configured, a run still starts and still
 * plays — the UI says the challenge came from the pack rather than pretending otherwise
 * (CLAUDE.md rules 5 and 6).
 *
 * `fallback.test.ts` puts every one of these through the full validation pipeline,
 * including the solvability probe. If an engine change makes one unplayable, the test
 * suite fails rather than the demo.
 */

export const FALLBACK_CHALLENGES: readonly ChallengeConfig[] = [
  {
    id: "fallback-false-floor",
    title: "The False Floor",
    description:
      "The platforms obey your gaze. Look at one and it stops being there. Look away, and trust it.",
    arenaId: "arena-01",
    objective: { type: "REACH_EXIT", targetId: "exit-01" },
    durationSeconds: 90,
    difficulty: 1,
    rules: [
      {
        id: "ff-gaze",
        type: "CONDITIONAL_PLATFORM",
        targetIds: ["step-01", "step-02", "step-03", "step-04"],
        parameters: {
          solidWhenObserved: false,
          coneDegrees: 58,
          hysteresisDegrees: 10,
          exemptSupporting: true,
        },
        trigger: { type: "PLAYER_CAMERA_DIRECTION" },
      },
    ],
    opponents: { count: 1, difficulty: "EASY" },
  },

  {
    id: "fallback-inversion",
    title: "Inversion",
    description:
      "Gravity will not stay where you left it. Stay standing on something when it turns.",
    arenaId: "arena-02",
    objective: { type: "SURVIVE_TIMER", targetId: "exit-02" },
    durationSeconds: 45,
    difficulty: 2,
    rules: [
      {
        id: "inv-gravity",
        type: "GRAVITY_DIRECTION",
        targetIds: [],
        parameters: {
          intervalSeconds: 7,
          warnSeconds: 2.5,
          magnitude: 22,
          startInverted: false,
        },
        trigger: { type: "TIMER" },
      },
    ],
    // No rival in the gravity round: a contestant who falls out of the world mid-flip
    // reads as a bug rather than a race.
    opponents: { count: 0, difficulty: "EASY" },
  },

  {
    id: "fallback-unmade-ground",
    title: "Unmade Ground",
    description:
      "Some of the floor answers to your eyes. The rest answers to nothing but its own clock.",
    arenaId: "arena-01",
    objective: { type: "REACH_EXIT", targetId: "exit-01" },
    durationSeconds: 110,
    difficulty: 3,
    rules: [
      {
        id: "ug-gaze",
        type: "CONDITIONAL_PLATFORM",
        targetIds: ["step-02", "step-03", "step-04"],
        parameters: {
          solidWhenObserved: false,
          coneDegrees: 64,
          hysteresisDegrees: 10,
          exemptSupporting: true,
        },
        trigger: { type: "PLAYER_CAMERA_DIRECTION" },
      },
      {
        id: "ug-blink",
        type: "OBJECT_STATE",
        targetIds: ["rise-01", "rise-02"],
        parameters: { periodSeconds: 5, dutyCycle: 0.7, stagger: 1.6, startSolid: true },
        trigger: { type: "TIMER" },
      },
    ],
    opponents: { count: 2, difficulty: "NORMAL" },
  },

  {
    id: "fallback-wrong-way-round",
    title: "Wrong Way Round",
    description:
      "Here the floor needs witnessing. Platforms exist only while you are watching them — look away and you are standing on nothing.",
    arenaId: "arena-01",
    objective: { type: "REACH_EXIT", targetId: "exit-01" },
    durationSeconds: 90,
    difficulty: 2,
    rules: [
      {
        id: "wwr-gaze",
        type: "CONDITIONAL_PLATFORM",
        // The inverse of THE FALSE FLOOR, and it plays completely differently: instead of
        // crossing blind you must keep your eyes locked on the ground ahead, which means
        // never looking where the rival is.
        targetIds: ["step-01", "step-02", "step-03", "step-04"],
        parameters: {
          solidWhenObserved: true,
          coneDegrees: 70,
          hysteresisDegrees: 12,
          exemptSupporting: true,
        },
        trigger: { type: "PLAYER_CAMERA_DIRECTION" },
      },
    ],
    opponents: { count: 1, difficulty: "EASY" },
  },

  {
    id: "fallback-stutter",
    title: "Stutter",
    description:
      "Nothing here cares where you look. The ground keeps its own time, and it is not generous.",
    arenaId: "arena-01",
    objective: { type: "REACH_EXIT", targetId: "exit-01" },
    durationSeconds: 95,
    difficulty: 1,
    rules: [
      {
        id: "st-blink",
        type: "OBJECT_STATE",
        targetIds: ["step-01", "step-02", "step-03", "step-04"],
        parameters: { periodSeconds: 4.5, dutyCycle: 0.62, stagger: 1.1, startSolid: true },
        trigger: { type: "TIMER" },
      },
    ],
    opponents: { count: 1, difficulty: "EASY" },
  },

  {
    id: "fallback-narrow-margin",
    title: "Narrow Margin",
    description:
      "The floor is touchier than it looks. Barely glance at it and it is gone.",
    arenaId: "arena-01",
    objective: { type: "REACH_EXIT", targetId: "exit-01" },
    durationSeconds: 100,
    difficulty: 2,
    rules: [
      {
        id: "nm-gaze",
        type: "CONDITIONAL_PLATFORM",
        // A wide cone is far crueller than a narrow one: almost anything in front of you
        // counts as looking, so the only safe gaze is well off to the side.
        targetIds: ["step-02", "step-03", "step-04", "plaza"],
        parameters: {
          solidWhenObserved: false,
          coneDegrees: 96,
          hysteresisDegrees: 14,
          exemptSupporting: true,
        },
        trigger: { type: "PLAYER_CAMERA_DIRECTION" },
      },
    ],
    opponents: { count: 1, difficulty: "NORMAL" },
  },

  {
    id: "fallback-held-breath",
    title: "Held Breath",
    description:
      "Gravity turns on a count you can hear. Be standing on something when it does.",
    arenaId: "arena-02",
    objective: { type: "SURVIVE_TIMER", targetId: "exit-02" },
    durationSeconds: 60,
    difficulty: 3,
    rules: [
      {
        id: "hb-gravity",
        type: "GRAVITY_DIRECTION",
        targetIds: [],
        parameters: {
          intervalSeconds: 5,
          warnSeconds: 1.8,
          magnitude: 24,
          startInverted: false,
        },
        trigger: { type: "TIMER" },
      },
    ],
    opponents: { count: 0, difficulty: "EASY" },
  },
];

/**
 * Pick a fallback at the requested difficulty, varying between calls.
 *
 * Variety matters more here than anywhere else in the pack. With no API key the fallbacks
 * *are* the game, and a run that serves the same three rounds every time quietly makes a
 * liar of the thing on the title card. Rotating through the matching rounds keeps
 * "no two rounds play the same" true even with the network unplugged.
 */
let fallbackCursor = 0;

export function pickFallback(difficulty = 1): ChallengeConfig {
  const matching = FALLBACK_CHALLENGES.filter((c) => c.difficulty === difficulty);
  const pool = matching.length > 0 ? matching : FALLBACK_CHALLENGES;

  const chosen = pool[fallbackCursor % pool.length];
  fallbackCursor++;
  if (!chosen) throw new Error("the fallback pack is empty");
  return chosen;
}

/** Deterministic variant, for tests and probes that must not drift between calls. */
export function fallbackAt(index: number): ChallengeConfig {
  const chosen = FALLBACK_CHALLENGES[index % FALLBACK_CHALLENGES.length];
  if (!chosen) throw new Error("the fallback pack is empty");
  return chosen;
}
