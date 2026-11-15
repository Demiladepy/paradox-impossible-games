import { findArena } from "../arena/registry.ts";
import type { ChallengeConfig } from "../challenges/schema.ts";
import { GameWorld, type GameSnapshot, type LookInput, type RunStatus } from "../GameWorld.ts";
import { Opponent, type OpponentSnapshot } from "../opponents/opponent.ts";
import type { PlayerInput } from "../player/controller.ts";

/**
 * One round: the player's world, the rivals racing them through it, and the result.
 *
 * Owning both here rather than inside `GameWorld` keeps the dependency one-way — a rival
 * *is* a `GameWorld` with an agent attached, so a world that owned rivals would own itself.
 *
 * Everything advances on the same fixed-step count, so the race is deterministic: replay
 * the same inputs and the same rival finishes in the same place at the same time.
 */

export interface RoundResult {
  status: RunStatus;
  /** Simulated seconds when the round ended. */
  seconds: number;
  /** 1 = first across the line. Counts only contestants who actually finished. */
  placement: number;
  totalContestants: number;
}

export interface RoundSnapshot {
  game: GameSnapshot;
  opponents: OpponentSnapshot[];
  /** Where the player currently stands in the race, 1-based. */
  livePlacement: number;
  result: RoundResult | null;
}

export class Round {
  private readonly opponents: Opponent[];
  private result: RoundResult | null = null;
  private readonly startDistance: number;

  private constructor(
    readonly challenge: ChallengeConfig,
    readonly world: GameWorld,
    opponents: Opponent[],
  ) {
    this.opponents = opponents;
    this.startDistance = Math.max(1e-3, world.snapshot().distanceToExit);
  }

  static async create(challenge: ChallengeConfig): Promise<Round> {
    const arena = findArena(challenge.arenaId);
    if (!arena) throw new Error(`Challenge names an unknown arena "${challenge.arenaId}"`);

    const world = await GameWorld.create(arena, {
      seed: challenge.id,
      rules: challenge.rules,
      objective: challenge.objective,
      durationSeconds: challenge.durationSeconds,
    });

    const opponents: Opponent[] = [];
    for (let i = 0; i < challenge.opponents.count; i++) {
      opponents.push(await Opponent.create(arena, challenge, i));
    }

    return new Round(challenge, world, opponents);
  }

  get isOver(): boolean {
    return this.result !== null;
  }

  update(input: PlayerInput, look: LookInput, deltaSeconds: number): void {
    const before = this.world.runStatus;
    const steps = this.world.update(input, look, deltaSeconds);
    for (const opponent of this.opponents) opponent.update(steps);

    if (before === "running" && this.world.runStatus !== "running" && !this.result) {
      this.result = this.buildResult();
    }
  }

  private buildResult(): RoundResult {
    const snapshot = this.world.snapshot();
    const finishedBefore = this.opponents.filter((o) => {
      const s = o.snapshot();
      return s.finishedAt !== null && s.finishedAt <= snapshot.elapsed;
    }).length;

    return {
      status: snapshot.status,
      seconds: snapshot.elapsed,
      // Losing is last, however fast you got there.
      placement:
        snapshot.status === "won" ? finishedBefore + 1 : this.opponents.length + 1,
      totalContestants: this.opponents.length + 1,
    };
  }

  snapshot(): RoundSnapshot {
    const game = this.world.snapshot();
    const opponents = this.opponents.map((o) => o.snapshot());

    const playerProgress =
      game.status === "won" ? 1 : 1 - Math.min(1, game.distanceToExit / this.startDistance);
    const ahead = opponents.filter((o) => o.progress > playerProgress).length;

    return {
      game,
      opponents,
      livePlacement: ahead + 1,
      result: this.result,
    };
  }

  restart(): void {
    this.world.restart();
    for (const opponent of this.opponents) opponent.restart();
    this.result = null;
  }

  dispose(): void {
    this.world.dispose();
    for (const opponent of this.opponents) opponent.dispose();
  }
}
