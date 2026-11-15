/** Debug: watch a rival run the course. */
import { FALLBACK_CHALLENGES } from "../src/game/challenges/fallback.ts";
import { FIXED_TIMESTEP } from "../src/game/core/clock.ts";
import { NO_LOOK } from "../src/game/GameWorld.ts";
import { NO_INPUT } from "../src/game/player/controller.ts";
import { Round } from "../src/game/progression/round.ts";

const challenge = structuredClone(FALLBACK_CHALLENGES[0]!);
const round = await Round.create(challenge);

let last = "";
for (let i = 0; i < Math.round((challenge.durationSeconds + 1) / FIXED_TIMESTEP); i++) {
  round.update(NO_INPUT, NO_LOOK, FIXED_TIMESTEP);
  const s = round.snapshot();
  const o = s.opponents[0]!;
  const key = `${o.status}`;
  if (i % 120 === 0 || key !== last) {
    console.log(
      `${s.game.elapsed.toFixed(1).padStart(5)}s rival status=${o.status.padEnd(7)} ` +
        `progress=${o.progress.toFixed(2)} pos=(${o.position.x.toFixed(1)},${o.position.y.toFixed(1)},${o.position.z.toFixed(1)})`,
    );
    last = key;
  }
  if (o.status !== "running") break;
}
round.dispose();
