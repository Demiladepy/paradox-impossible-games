import { describe, expect, it } from "vitest";
import { FALLBACK_CHALLENGES } from "../challenges/fallback.ts";
import { FIXED_TIMESTEP } from "../core/clock.ts";
import { NO_LOOK } from "../GameWorld.ts";
import { NO_INPUT } from "../player/controller.ts";
import { Round } from "./round.ts";

/**
 * Rounds and rivals.
 *
 * The rival is the solvability probe with a handicap, so the thing being checked is not
 * "can an agent play this" — that is already covered — but that a rival actually races,
 * stays beatable, and never corrupts the player's own simulation.
 */

const falseFloor = () => structuredClone(FALLBACK_CHALLENGES[0]!);

/** Advance a round by a number of simulated seconds with the player standing still. */
function idle(round: Round, seconds: number): void {
  const steps = Math.round(seconds / FIXED_TIMESTEP);
  for (let i = 0; i < steps; i++) round.update(NO_INPUT, NO_LOOK, FIXED_TIMESTEP);
}

describe("Round", () => {
  it("spawns the rivals the challenge asks for", async () => {
    const round = await Round.create(falseFloor());
    expect(round.snapshot().opponents).toHaveLength(1);
    round.dispose();
  });

  it("lets the rival run the course while the player stands still", async () => {
    const round = await Round.create(falseFloor());
    const start = round.snapshot().opponents[0]!.progress;

    idle(round, 6);
    const later = round.snapshot().opponents[0]!;

    expect(later.progress).toBeGreaterThan(start + 0.2);
    expect(later.status).toBe("running");
    round.dispose();
  });

  it("hesitates at the start so the player is not instantly behind", async () => {
    const round = await Round.create(falseFloor());
    idle(round, 1.0); // EASY reaction delay is 1.6s
    expect(round.snapshot().opponents[0]!.progress).toBeLessThan(0.05);
    round.dispose();
  });

  it("finishes the course, and the player who does nothing loses", async () => {
    const challenge = falseFloor();
    const round = await Round.create(challenge);
    idle(round, challenge.durationSeconds + 1);

    const snapshot = round.snapshot();
    expect(snapshot.opponents[0]!.status).toBe("won");
    expect(snapshot.opponents[0]!.finishedAt).toBeGreaterThan(0);
    expect(snapshot.result?.status).toBe("lost");
    // Last place: the rival got there, the player did not.
    expect(snapshot.result?.placement).toBe(2);
    round.dispose();
  });

  it("is beatable — a rival takes meaningfully longer than the unhandicapped agent", async () => {
    const challenge = falseFloor();
    const round = await Round.create(challenge);
    idle(round, challenge.durationSeconds + 1);

    const finishedAt = round.snapshot().opponents[0]!.finishedAt;
    // The probe's agent clears this course in about 9.3s at full speed. A rival slowed to
    // 68% and hesitating for 1.6s should be well behind that, leaving room to win.
    expect(finishedAt).toBeGreaterThan(13);
    round.dispose();
  });

  it("does not let a rival disturb the player's world", async () => {
    const challenge = falseFloor();
    const withRival = await Round.create(challenge);

    const soloChallenge = { ...challenge, opponents: { count: 0, difficulty: "EASY" as const } };
    const solo = await Round.create(soloChallenge);

    idle(withRival, 5);
    idle(solo, 5);

    const a = withRival.snapshot().game.player.position;
    const b = solo.snapshot().game.player.position;
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
    expect(a.z).toBeCloseTo(b.z, 9);

    withRival.dispose();
    solo.dispose();
  });

  it("runs the race identically twice", async () => {
    const read = async () => {
      const round = await Round.create(falseFloor());
      idle(round, 8);
      const p = round.snapshot().opponents[0]!.position;
      round.dispose();
      return `${p.x.toFixed(10)},${p.y.toFixed(10)},${p.z.toFixed(10)}`;
    };
    expect(await read()).toBe(await read());
  });

  it("reports a live placement the HUD can show", async () => {
    const round = await Round.create(falseFloor());
    expect(round.snapshot().livePlacement).toBe(1); // nobody has moved yet
    idle(round, 6);
    expect(round.snapshot().livePlacement).toBe(2); // the rival is ahead
    round.dispose();
  });

  it("restarts cleanly, rivals included", async () => {
    const round = await Round.create(falseFloor());
    idle(round, 6);
    expect(round.snapshot().opponents[0]!.progress).toBeGreaterThan(0.1);

    round.restart();
    const snapshot = round.snapshot();
    expect(snapshot.opponents[0]!.progress).toBeLessThan(0.05);
    expect(snapshot.opponents[0]!.finishedAt).toBeNull();
    expect(snapshot.result).toBeNull();
    expect(snapshot.game.elapsed).toBe(0);
    round.dispose();
  });
});
