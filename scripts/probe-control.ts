/** Control experiment: does the mechanic actually obstruct an agent that ignores it? */
import { FALLBACK_CHALLENGES } from "../src/game/challenges/fallback.ts";
import { probeChallenge } from "../src/game/challenges/probe.ts";

for (const challenge of FALLBACK_CHALLENGES.filter((c) => c.arenaId === "arena-01")) {
  const aware = await probeChallenge(challenge, { agentKnowsRules: true });
  const naive = await probeChallenge(challenge, { agentKnowsRules: false });
  console.log(
    `${challenge.title.padEnd(18)} aware=${aware.solved ? "SOLVED " : "FAILED "} ${aware.seconds.toFixed(1)}s   ` +
      `naive=${naive.solved ? "SOLVED " : "FAILED "} ${naive.seconds.toFixed(1)}s  (${naive.reason})`,
  );
}
