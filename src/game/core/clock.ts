/**
 * Fixed-timestep accumulator.
 *
 * The simulation must advance in identical increments regardless of display refresh rate,
 * otherwise a challenge that a player completes at 144 Hz might be impossible at 60 Hz —
 * and the Milestone 3 solvability probe, which runs the same simulation headless and as
 * fast as it can, would not predict anything about real play.
 */

export const FIXED_TIMESTEP = 1 / 60;

/** Never simulate more than this many steps for one frame; beyond it we let time slip. */
const MAX_STEPS_PER_FRAME = 5;

export class FixedClock {
  private accumulator = 0;
  private elapsed = 0;
  private steps = 0;

  constructor(readonly timestep: number = FIXED_TIMESTEP) {}

  /**
   * Feed in wall-clock delta; returns how many fixed steps to run now.
   * A long stall (tab backgrounded, a slow asset decode) is dropped rather than
   * replayed as a burst, which would teleport bodies through colliders.
   */
  advance(deltaSeconds: number): number {
    // Guard against negative or absurd deltas from timer glitches.
    const delta = Math.max(0, Math.min(deltaSeconds, 0.25));
    this.accumulator += delta;

    let steps = 0;
    while (this.accumulator >= this.timestep && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= this.timestep;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.steps += steps;
    this.elapsed += steps * this.timestep;
    return steps;
  }

  /** Fraction into the next step, for interpolating rendered positions. */
  get alpha(): number {
    return this.accumulator / this.timestep;
  }

  /** Simulated time in seconds — always a whole number of timesteps. */
  get simulatedSeconds(): number {
    return this.elapsed;
  }

  get stepCount(): number {
    return this.steps;
  }

  reset(): void {
    this.accumulator = 0;
    this.elapsed = 0;
    this.steps = 0;
  }
}
