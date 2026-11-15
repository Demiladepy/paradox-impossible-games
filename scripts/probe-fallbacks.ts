/** Print how long the probe's agent takes on each fallback challenge. */
import { FALLBACK_CHALLENGES } from "../src/game/challenges/fallback.ts";
import { probeChallenge } from "../src/game/challenges/probe.ts";

for (const challenge of FALLBACK_CHALLENGES) {
  const result = await probeChallenge(challenge);
  console.log(
    `${challenge.title.padEnd(18)} ${challenge.objective.type.padEnd(14)} ` +
      `timer ${String(challenge.durationSeconds).padStart(3)}s  ` +
      `${result.solved ? "SOLVED" : "FAILED"} in ${result.seconds.toFixed(2)}s  (${result.reason})`,
  );
}
