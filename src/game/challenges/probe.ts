import { Autopilot } from "../agent/autopilot.ts";
import { findArena } from "../arena/registry.ts";
import { FIXED_TIMESTEP } from "../core/clock.ts";
import { GameWorld, NO_LOOK } from "../GameWorld.ts";
import { DEFAULT_TUNING } from "../player/controller.ts";
import type { ChallengeConfig } from "./schema.ts";

/**
 * The solvability probe.
 *
 * Runs the **real** simulation headless — real Rapier, real rule engine, real character
 * controller — and has a scripted agent attempt the objective. No rendering, no timers,
 * as fast as the CPU allows.
 *
 * What a pass means: *an agent completed this configuration*. It is an existence proof by
 * construction, not a proof that the challenge is solvable in general, and not a claim
 * that a human would find it fair or discoverable — the agent is handed the route, where
 * a player must deduce it. We say exactly this wherever the result is shown.
 *
 * What a failure means is stronger and more useful: nobody should be sent into this.
 */

export interface ProbeResult {
  solved: boolean;
  /** Simulated seconds the attempt took. */
  seconds: number;
  steps: number;
  /** Plain-language account of how it ended. */
  reason: string;
  /** Where the agent was heading when it stopped. */
  lastTarget: string;
  finalStatus: "running" | "won" | "lost";
}

export interface ProbeOptions {
  /**
   * Hard ceiling on simulated time. Defaults to the challenge's own timer plus a margin,
   * because a round the agent cannot finish inside its timer is already a failure.
   */
  maxSeconds?: number;
  seed?: string;
  /**
   * When false, the agent plays without knowing the rules — it stares straight at the
   * platform it is crossing to. Used to prove a mechanic genuinely obstructs: if a naive
   * agent clears a challenge just as easily as a rule-aware one, the rule is inert.
   */
  agentKnowsRules?: boolean;
}

export async function probeChallenge(
  challenge: ChallengeConfig,
  options: ProbeOptions = {},
): Promise<ProbeResult> {
  const arena = findArena(challenge.arenaId);
  if (!arena) {
    return {
      solved: false,
      seconds: 0,
      steps: 0,
      reason: `unknown arena "${challenge.arenaId}"`,
      lastTarget: "-",
      finalStatus: "lost",
    };
  }

  const maxSeconds = options.maxSeconds ?? challenge.durationSeconds + 5;
  const maxSteps = Math.ceil(maxSeconds / FIXED_TIMESTEP);

  const world = await GameWorld.create(arena, {
    seed: options.seed ?? challenge.id,
    rules: challenge.rules,
    objective: challenge.objective,
    durationSeconds: challenge.durationSeconds,
  });

  // A rule the engine refused means the arena is not what the challenge describes.
  if (world.rules.rejected.length > 0) {
    const first = world.rules.rejected[0];
    world.dispose();
    return {
      solved: false,
      seconds: 0,
      steps: 0,
      reason: `rule rejected before play: ${first?.reason ?? "unknown"}`,
      lastTarget: "-",
      finalStatus: "lost",
    };
  }

  const pilot = new Autopilot(
    arena,
    DEFAULT_TUNING,
    options.agentKnowsRules === false ? [] : challenge.rules,
  );

  let steps = 0;
  for (; steps < maxSteps; steps++) {
    const snapshot = world.snapshot();
    if (snapshot.status !== "running") break;

    const input = pilot.decide(snapshot, (yaw, pitch) => {
      world.camera.yaw = yaw;
      world.camera.pitch = pitch;
    });
    world.update(input, NO_LOOK, FIXED_TIMESTEP);
  }

  const final = world.snapshot();
  const result: ProbeResult = {
    solved: final.status === "won",
    seconds: final.elapsed,
    steps,
    finalStatus: final.status,
    lastTarget: pilot.debug.target,
    reason: describe(final.status, pilot.debug, final.elapsed, challenge.durationSeconds),
  };
  world.dispose();
  return result;
}

function describe(
  status: string,
  debug: { target: string; blocked: boolean; waiting: boolean },
  seconds: number,
  duration: number,
): string {
  if (status === "won") return `agent completed the objective in ${seconds.toFixed(1)}s`;

  const where = `heading for "${debug.target}"`;
  // Running the timer out and falling off both end as "lost", and the difference matters:
  // one is a challenge that is too hard, the other is one that is too long.
  if (seconds >= duration - 1e-6) {
    const why = debug.waiting
      ? "waiting for ground that never came back"
      : debug.blocked
        ? "unable to cross a gap no jump can clear"
        : "still short of the objective";
    return `agent ran out of its ${duration}s timer, ${why}, ${where}`;
  }
  return `agent was eliminated after ${seconds.toFixed(1)}s while ${where}`;
}
