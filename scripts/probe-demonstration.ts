/**
 * Does the teaching beat actually teach anything?
 *
 * The unit tests prove the gaze points where it should. They do not prove the *world*
 * answers it — that the platform genuinely loses its collider while the agent stares and
 * genuinely gets it back when it looks away. That is the claim the trailer makes on
 * screen, so it is worth checking against the real rule engine rather than a mock.
 *
 * This runs the actual round, headless, driving the real gaze schedule, and reports what
 * the rules did. Run it with `npm run probe:demo`.
 */
import { FALLBACK_CHALLENGES } from "../src/game/challenges/fallback.ts";
import { Round } from "../src/game/progression/round.ts";
import {
  DEMONSTRATION_PHASES,
  GazeDemonstration,
  pickDemonstrationTarget,
} from "../src/game/cinematic/demonstration.ts";
import { NO_LOOK } from "../src/game/GameWorld.ts";

const STILL = { forward: 0, right: 0, jump: false, sprint: false };
const DT = 1 / 60;

async function main(): Promise<void> {
  const challenge = FALLBACK_CHALLENGES.find((c) => c.id === "fallback-false-floor");
  if (!challenge) throw new Error("fallback-false-floor is missing");

  const round = await Round.create(challenge);

  // Let the agent settle onto the spawn pad exactly as it would in the trailer.
  for (let i = 0; i < 90; i++) round.update(STILL, NO_LOOK, DT);

  const snapshot = round.snapshot().game;
  const target = pickDemonstrationTarget(
    round.world.arena,
    round.world.rules.accepted,
    snapshot.player.position,
    snapshot.player.supportingPlatformId,
  );

  if (!target) {
    console.error("No demonstration target found — the beat would be skipped.");
    process.exitCode = 1;
    round.dispose();
    return;
  }

  console.log(`Target platform: ${target.id}`);
  console.log(`Standing on:     ${snapshot.player.supportingPlatformId ?? "(nothing)"}\n`);

  const demo = new GazeDemonstration();
  // Per phase: how many steps the target was phantom (no collider).
  const tally = DEMONSTRATION_PHASES.map(() => ({ phantom: 0, steps: 0 }));

  let elapsed = 0;
  let phaseIndex = 0;
  let phaseEnd = DEMONSTRATION_PHASES[0]?.seconds ?? 0;

  while (phaseIndex < DEMONSTRATION_PHASES.length) {
    const game = round.snapshot().game;
    const frame = demo.update(game.gazeOrigin, target, DT);
    round.world.camera.yaw = frame.yaw;
    round.world.camera.pitch = frame.pitch;
    round.update(STILL, NO_LOOK, DT);

    const after = round.snapshot().game;
    const bucket = tally[phaseIndex];
    if (bucket) {
      bucket.steps++;
      if (after.rules.phantom.includes(target.id)) bucket.phantom++;
    }

    elapsed += DT;
    if (elapsed >= phaseEnd) {
      phaseIndex++;
      phaseEnd += DEMONSTRATION_PHASES[phaseIndex]?.seconds ?? 0;
    }
  }

  let failures = 0;
  console.log("phase                                  intent     unmade   verdict");
  console.log("-".repeat(72));

  DEMONSTRATION_PHASES.forEach((phase, index) => {
    const bucket = tally[index];
    if (!bucket || bucket.steps === 0) return;
    const share = bucket.phantom / bucket.steps;

    // The ease at the start of a phase means the state flips partway through, so judge the
    // settled portion: by the end of a phase the platform must be in the intended state.
    const settled = share > 0.55 ? "unmade" : share < 0.45 ? "solid" : "mixed";
    const intended = phase.staring ? "unmade" : "solid";
    const pass = settled === intended;
    if (!pass) failures++;

    console.log(
      `${phase.caption.padEnd(38)} ${intended.padEnd(10)} ` +
        `${(share * 100).toFixed(0).padStart(5)}%   ${pass ? "PASS" : "FAIL"}`,
    );
  });

  console.log("-".repeat(72));
  const finalState = round.snapshot().game;
  console.log(
    `Agent survived the beat: ${finalState.status === "running" ? "yes" : `NO (${finalState.status})`}`,
  );
  if (finalState.status !== "running") failures++;

  round.dispose();

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed — the beat does not demonstrate the rule.`);
    process.exitCode = 1;
  } else {
    console.log("\nThe platform follows the gaze. The beat demonstrates the rule.");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
