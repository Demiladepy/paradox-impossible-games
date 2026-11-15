import { describe, expect, it } from "vitest";
import { FALLBACK_CHALLENGES, pickFallback } from "./fallback.ts";
import { probeChallenge } from "./probe.ts";
import { describeFailure, validateChallenge } from "./validate.ts";
import type { ChallengeConfig } from "./schema.ts";

/**
 * The validation pipeline.
 *
 * Two things are being proved. First, that the fallback pack is genuinely playable — a
 * fallback that does not work is worse than no fallback, because it fails at exactly the
 * moment everything else already has. Second, that a malformed or unfair challenge is
 * refused with a reason specific enough to feed back to the model on a retry.
 */

const valid = (): ChallengeConfig => structuredClone(FALLBACK_CHALLENGES[0]!);

describe("the fallback pack is actually playable", () => {
  it.each(FALLBACK_CHALLENGES.map((c) => [c.title, c] as const))(
    "%s passes every gate including the solvability probe",
    async (_title, challenge) => {
      const result = await validateChallenge(challenge);
      expect(
        result.ok,
        result.ok ? "" : `rejected at ${describeFailure(result)}`,
      ).toBe(true);
      if (result.ok) {
        expect(result.probe.solved).toBe(true);
        // SURVIVE_TIMER rounds end exactly on the timer, which lands one step past it.
        expect(result.probe.seconds).toBeLessThanOrEqual(challenge.durationSeconds + 0.1);
      }
    },
    20_000,
  );

  it("offers a fallback for every difficulty the generator can ask for", () => {
    for (const difficulty of [1, 2, 3] as const) {
      expect(pickFallback(difficulty)).toBeDefined();
    }
  });

  it("has unique ids", () => {
    const ids = FALLBACK_CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("gate 1 — shape", () => {
  it("rejects a non-object", async () => {
    const result = await validateChallenge("not a challenge");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe("shape");
  });

  it("rejects a missing field", async () => {
    const challenge = valid() as Partial<ChallengeConfig>;
    delete challenge.objective;
    const result = await validateChallenge(challenge);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("shape");
      expect(result.problems.join(" ")).toMatch(/objective/);
    }
  });

  it("rejects an unexpected field rather than silently dropping it", async () => {
    const result = await validateChallenge({ ...valid(), onComplete: "alert('hi')" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe("shape");
  });

  it("rejects a timer outside the supported range", async () => {
    const result = await validateChallenge({ ...valid(), durationSeconds: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe("shape");
  });

  it("rejects a challenge with no rules at all", async () => {
    const result = await validateChallenge({ ...valid(), rules: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe("shape");
  });
});

describe("gate 2 — references", () => {
  it("rejects an unknown arena", async () => {
    const result = await validateChallenge({ ...valid(), arenaId: "arena-99" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("references");
      expect(result.problems.join(" ")).toMatch(/does not exist/);
    }
  });

  it("rejects a rule targeting a platform the arena does not contain", async () => {
    const challenge = valid();
    challenge.rules[0]!.targetIds = ["imaginary-platform"];
    const result = await validateChallenge(challenge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).toMatch(/does not contain/);
  });

  it("rejects a declared-but-unimplemented rule type", async () => {
    const challenge = valid();
    challenge.rules[0]!.type = "SPATIAL_PORTAL";
    const result = await validateChallenge(challenge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).toMatch(/not implemented/);
  });

  it("rejects an objective pointing at the wrong exit", async () => {
    const challenge = valid();
    challenge.objective = { type: "REACH_EXIT", targetId: "exit-02" };
    const result = await validateChallenge(challenge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).toMatch(/exit/);
  });
});

describe("gate 3 — sanity", () => {
  it("rejects two gaze rules that disagree about the same platform", async () => {
    const challenge = valid();
    challenge.rules.push({
      id: "contradiction",
      type: "CONDITIONAL_PLATFORM",
      targetIds: ["step-02"],
      parameters: { solidWhenObserved: true },
      trigger: { type: "PLAYER_CAMERA_DIRECTION" },
    });
    const result = await validateChallenge(challenge);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("sanity");
      expect(result.problems.join(" ")).toMatch(/disagree/);
    }
  });

  it("rejects more than one gravity schedule", async () => {
    const challenge = structuredClone(FALLBACK_CHALLENGES[1]!);
    challenge.rules.push({ ...challenge.rules[0]!, id: "second-gravity" });
    const result = await validateChallenge(challenge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).toMatch(/only one gravity schedule/);
  });

  it("rejects inverting gravity in an arena with no ceiling", async () => {
    const challenge = valid();
    challenge.rules = [
      {
        id: "no-ceiling-gravity",
        type: "GRAVITY_DIRECTION",
        targetIds: [],
        parameters: { intervalSeconds: 7, warnSeconds: 2 },
        trigger: { type: "TIMER" },
      },
    ];
    const result = await validateChallenge(challenge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).toMatch(/no ceiling/);
  });

  it("rejects duplicate rule ids", async () => {
    const challenge = valid();
    challenge.rules.push({ ...challenge.rules[0]! });
    const result = await validateChallenge(challenge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).toMatch(/duplicate rule ids/);
  });
});

describe("gate 4 — solvability", () => {
  it("accepts a challenge an agent can finish, and reports how long it took", async () => {
    const result = await validateChallenge(valid());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.probe.solved).toBe(true);
      expect(result.probe.seconds).toBeGreaterThan(0);
      expect(result.probe.reason).toMatch(/completed the objective/);
    }
  }, 20_000);

  it("refuses a challenge that passes every cheap gate but cannot be finished", async () => {
    // Reaching Arena 02's exit requires crossing on the ceiling while gravity is inverted.
    // Nothing about the configuration is malformed — it survives shape, references and
    // sanity — and only actually playing it reveals that it cannot be completed.
    const challenge = structuredClone(FALLBACK_CHALLENGES[1]!);
    challenge.objective = { type: "REACH_EXIT", targetId: "exit-02" };
    challenge.durationSeconds = 40;

    const result = await validateChallenge(challenge);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("solvability");
      expect(result.problems.join(" ")).toMatch(/ran out of|eliminated/);
    }
  }, 25_000);

  it("proves THE FALSE FLOOR actually obstructs: a naive agent fails where a rule-aware one passes", async () => {
    const challenge = valid();

    const aware = await probeChallenge(challenge, { agentKnowsRules: true });
    const naive = await probeChallenge(challenge, { agentKnowsRules: false });

    expect(aware.solved, `rule-aware agent: ${aware.reason}`).toBe(true);
    expect(naive.solved, `naive agent unexpectedly succeeded: ${naive.reason}`).toBe(false);
  }, 30_000);

  it("refuses to pretend it can solve a gravity-timed crossing", async () => {
    // REACH_EXIT on arena-02 needs the player to cross on the ceiling while gravity is
    // inverted. The probe's agent does not time gravity flips, so it cannot finish — and
    // the honest result is a refusal, not a guess.
    const challenge = structuredClone(FALLBACK_CHALLENGES[1]!);
    challenge.objective = { type: "REACH_EXIT", targetId: "exit-02" };
    challenge.durationSeconds = 60;

    const probe = await probeChallenge(challenge);
    expect(probe.solved).toBe(false);
    expect(probe.reason).toMatch(/ran out of|eliminated/);
  }, 20_000);

  it("runs the same way twice", async () => {
    const a = await probeChallenge(valid(), { seed: "repeat" });
    const b = await probeChallenge(valid(), { seed: "repeat" });
    expect(a.steps).toBe(b.steps);
    expect(a.solved).toBe(b.solved);
  }, 30_000);
});
