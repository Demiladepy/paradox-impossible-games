import { Autopilot } from "../agent/autopilot.ts";
import type { ArenaDefinition } from "../arena/types.ts";
import type { ChallengeConfig } from "../challenges/schema.ts";
import { FIXED_TIMESTEP } from "../core/clock.ts";
import { GameWorld, NO_LOOK, type RunStatus } from "../GameWorld.ts";
import { DEFAULT_TUNING, NO_INPUT, type LocomotionState, type PlayerTuning } from "../player/controller.ts";
import type { Vec3 } from "../core/math.ts";

/**
 * A rival contestant.
 *
 * The opponent is the solvability probe, racing you. The same `Autopilot` that decides
 * whether a challenge is fair enough to let a player into it also runs the round alongside
 * them — which means the opponent is guaranteed to understand every mechanic the validator
 * understands, and gets better for free every time the probe does.
 *
 * ## Each contestant observes their own arena
 *
 * The opponent runs its own `GameWorld` over the same arena and the same rules, stepped in
 * lockstep with the player's. That is a deliberate design choice, not only a convenience.
 * THE FALSE FLOOR keys off *a* gaze; with one shared world, the rival glancing at a platform
 * would unmake it under the player's feet, so the round would be decided by someone else's
 * eyes. Giving each contestant their own reality is both fairer and, for a game called
 * PARADOX, the more interesting answer: you are not racing through the same arena, you are
 * racing through your own version of it.
 *
 * The cost is a second physics world — a dozen static boxes and one capsule, which is
 * nothing — and it keeps the player's simulation completely untouched by this feature.
 */

export interface OpponentSnapshot {
  id: string;
  position: Vec3;
  facing: number;
  locomotion: LocomotionState;
  status: RunStatus;
  /** 0 at the spawn, 1 at the exit. Drives the race readout. */
  progress: number;
  /** Which way is up for this rival, so the renderer can flip them with their gravity. */
  upSign: number;
  /** Seconds it took them to finish, once they have. */
  finishedAt: number | null;
}

/** How hard a rival is to beat. The agent plays perfectly, so the handicap does the work. */
export interface OpponentSkill {
  /** Multiplier on walk and sprint speed. */
  speed: number;
  /** Seconds of hesitation at the start, so the player is never instantly behind. */
  reactionDelay: number;
}

export const OPPONENT_SKILL: Record<"EASY" | "NORMAL", OpponentSkill> = {
  // Tuned so a competent player wins comfortably and a hesitant one does not.
  EASY: { speed: 0.68, reactionDelay: 1.6 },
  NORMAL: { speed: 0.85, reactionDelay: 0.7 },
};

export class Opponent {
  private readonly world: GameWorld;
  private readonly pilot: Autopilot;
  private readonly startDistance: number;
  private elapsed = 0;
  private finished: number | null = null;

  private constructor(
    readonly id: string,
    arena: ArenaDefinition,
    world: GameWorld,
    private readonly skill: OpponentSkill,
  ) {
    this.world = world;
    this.pilot = new Autopilot(arena, world.player.tuning, world.rules.accepted);
    this.startDistance = Math.max(1e-3, world.snapshot().distanceToExit);
  }

  static async create(
    arena: ArenaDefinition,
    challenge: ChallengeConfig,
    index: number,
  ): Promise<Opponent> {
    const skill = OPPONENT_SKILL[challenge.opponents.difficulty] ?? OPPONENT_SKILL.EASY;
    const tuning: PlayerTuning = {
      ...DEFAULT_TUNING,
      walkSpeed: DEFAULT_TUNING.walkSpeed * skill.speed,
      sprintSpeed: DEFAULT_TUNING.sprintSpeed * skill.speed,
    };

    const world = await GameWorld.create(arena, {
      // A different seed per rival so they are not all the same run.
      seed: `${challenge.id}-rival-${index}`,
      rules: challenge.rules,
      objective: challenge.objective,
      durationSeconds: challenge.durationSeconds,
      tuning,
    });

    return new Opponent(`rival-${index + 1}`, arena, world, skill);
  }

  /** Step in lockstep with the player's world. */
  update(steps: number): void {
    for (let i = 0; i < steps; i++) {
      this.elapsed += FIXED_TIMESTEP;

      const snapshot = this.world.snapshot();
      if (snapshot.status !== "running") {
        if (this.finished === null && snapshot.status === "won") this.finished = this.elapsed;
        // Keep stepping so a fallen rival finishes its fall rather than freezing mid-air.
        this.world.update(NO_INPUT, NO_LOOK, FIXED_TIMESTEP);
        continue;
      }

      // Hesitate at the start. Without it the rival is simply gone before the player has
      // worked out which way is forward.
      if (this.elapsed < this.skill.reactionDelay) {
        this.world.update(NO_INPUT, NO_LOOK, FIXED_TIMESTEP);
        continue;
      }

      const input = this.pilot.decide(snapshot, (yaw, pitch) => {
        this.world.camera.yaw = yaw;
        this.world.camera.pitch = pitch;
      });
      this.world.update(input, NO_LOOK, FIXED_TIMESTEP);
    }
  }

  snapshot(): OpponentSnapshot {
    const s = this.world.snapshot();
    const progress =
      s.status === "won" ? 1 : 1 - Math.min(1, s.distanceToExit / this.startDistance);

    return {
      id: this.id,
      position: s.player.position,
      facing: s.player.facing,
      locomotion: s.player.locomotion,
      status: s.status,
      progress: Math.max(0, progress),
      upSign: s.rules.upSign,
      finishedAt: this.finished,
    };
  }

  restart(): void {
    this.world.restart();
    this.elapsed = 0;
    this.finished = null;
  }

  dispose(): void {
    this.world.dispose();
  }
}
