import { ARENA_01 } from "./arena-01.ts";
import { ARENA_02 } from "./arena-02.ts";
import type { ArenaDefinition } from "./types.ts";

/**
 * Every arena a challenge may name.
 *
 * This list is a hard boundary: a generated challenge that asks for an arena which is not
 * here is refused. The AI chooses *among* our arenas and decides what happens inside them;
 * it does not get to invent geometry.
 */
export const ARENAS: readonly ArenaDefinition[] = [ARENA_01, ARENA_02];

export const ARENA_IDS: readonly string[] = ARENAS.map((arena) => arena.id);

export function findArena(id: string): ArenaDefinition | undefined {
  return ARENAS.find((arena) => arena.id === id);
}

/** A compact description of each arena, for the challenge-generation prompt. */
export function describeArenasForPrompt(): string {
  return ARENAS.map((arena) => {
    const conditional = arena.platforms.filter((p) => p.surface === "conditional");
    const ids = arena.platforms.map((p) => p.id).join(", ");
    return [
      `- id: "${arena.id}" (${arena.name})`,
      `  exit id: "${arena.exit.id}"`,
      `  platforms: ${ids}`,
      conditional.length > 0
        ? `  authored for gaze rules: ${conditional.map((p) => p.id).join(", ")}`
        : `  has a continuous ceiling, so gravity inversion is survivable anywhere`,
    ].join("\n");
  }).join("\n");
}
