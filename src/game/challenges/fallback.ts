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
    opponents: { count: 0, difficulty: "EASY" },
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
    opponents: { count: 0, difficulty: "EASY" },
  },
];

/** Pick a fallback, preferring one near the requested difficulty. */
export function pickFallback(difficulty = 1): ChallengeConfig {
  const exact = FALLBACK_CHALLENGES.find((c) => c.difficulty === difficulty);
  if (exact) return exact;
  const first = FALLBACK_CHALLENGES[0];
  if (!first) throw new Error("the fallback pack is empty");
  return first;
}
