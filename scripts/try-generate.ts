/** Exercise live challenge generation end to end, including validation and the probe. */
import { handleChallengeRequest } from "../server/challenge-handler.ts";

const difficulty = Number(process.argv[2] ?? 1);
const started = Date.now();
const result = await handleChallengeRequest({ difficulty });
const seconds = ((Date.now() - started) / 1000).toFixed(1);

console.log(`source   : ${result.source}   (${result.attempts} attempt(s), ${seconds}s)`);
if (result.note) console.log(`note     : ${result.note}`);
console.log(`title    : ${result.challenge.title}`);
console.log(`briefing : ${result.challenge.description}`);
console.log(`arena    : ${result.challenge.arenaId}`);
console.log(`objective: ${result.challenge.objective.type}  ${result.challenge.durationSeconds}s  difficulty ${result.challenge.difficulty}`);
console.log(`rivals   : ${result.challenge.opponents.count} ${result.challenge.opponents.difficulty}`);
for (const rule of result.challenge.rules) {
  console.log(`rule     : ${rule.type} -> [${rule.targetIds.join(", ")}] ${JSON.stringify(rule.parameters)}`);
}
if (result.probe) console.log(`probe    : ${result.probe.reason}`);
