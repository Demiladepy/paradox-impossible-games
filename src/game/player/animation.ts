import type { LocomotionState } from "./controller.ts";

/**
 * Which Lux3D clip plays for each locomotion state.
 *
 * This lives in `game/` rather than the view because it is a contract with the asset
 * pipeline, not a rendering detail: Lux3D delivers clips named `animation_1…N` and
 * `gen:character` renames them to these IDs on download (docs/DECISIONS.md D-009).
 * `animation.test.ts` asserts the real shipped GLB contains every name listed here, so
 * a pipeline change that breaks the mapping fails the test suite rather than silently
 * leaving the contestant standing still.
 */
export const CLIP_FOR_STATE: Record<LocomotionState, string> = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  jog: "Jog_Fwd_Loop",
  sprint: "Sprint_Loop",
  rise: "Jump_Start",
  fall: "Jump_Loop",
};

/** Clips the game needs present in the contestant asset. */
export const REQUIRED_CLIPS: readonly string[] = [...new Set(Object.values(CLIP_FOR_STATE))];

/** Clips requested from Lux3D but not yet wired to a state — reserved for later rounds. */
export const RESERVED_CLIPS: readonly string[] = ["Jump_Land", "Roll", "Hit_Knockback", "Death01"];
