/**
 * Print the reachability analysis for an arena's intended route.
 *
 *   npm run analyze:arena
 *
 * Level geometry is authored by hand; this is how we find out whether it is fair before
 * a human has to discover it the hard way.
 */
import { ARENA_01 } from "../src/game/arena/arena-01.ts";
import { analyseRoute, formatRoute, jumpEnvelope } from "../src/game/arena/reach.ts";
import { DEFAULT_TUNING } from "../src/game/player/controller.ts";

const envelope = jumpEnvelope(DEFAULT_TUNING, ARENA_01.gravity.y);
console.log(`${ARENA_01.name} (${ARENA_01.id})`);
console.log(
  `gravity ${ARENA_01.gravity.y} m/s^2 · takeoff ${envelope.takeoffSpeed.toFixed(2)} m/s · ` +
    `apex ${envelope.apex.toFixed(2)} m · airtime ${envelope.flightTime.toFixed(2)} s`,
);
console.log(
  `walk ${DEFAULT_TUNING.walkSpeed} m/s · sprint ${DEFAULT_TUNING.sprintSpeed} m/s\n`,
);

const analysis = analyseRoute(ARENA_01, DEFAULT_TUNING);
console.log(formatRoute(analysis));

const hard = analysis.filter((a) => !a.clearableAtWalk);
console.log(
  `\n${analysis.length - hard.length}/${analysis.length} jumps clearable at walking speed`,
);
if (hard.length > 0) {
  console.log(`needs sprint or impossible: ${hard.map((a) => `${a.from}->${a.to}`).join(", ")}`);
}
