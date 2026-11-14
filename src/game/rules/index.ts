import { conditionalPlatform } from "./conditional-platform.ts";
import { gravityDirection } from "./gravity-direction.ts";
import { objectState } from "./object-state.ts";
import type { RuleModule, RuleType } from "./types.ts";

export { RuleEngine, type LoadReport, type RuleRejection } from "./engine.ts";
export * from "./types.ts";
export { conditionalPlatform } from "./conditional-platform.ts";
export { gravityDirection } from "./gravity-direction.ts";
export { objectState } from "./object-state.ts";

/**
 * Every rule the engine can run.
 *
 * This list is the boundary of what a generated challenge may ask for. A rule naming a
 * type that is not here is rejected at load, not ignored — which is what keeps "the AI
 * designs the challenge" from meaning "the AI can do anything".
 *
 * SPATIAL_PORTAL is declared in the type union but deliberately unimplemented; it is the
 * Round 3 stretch goal (PROJECT.md §4), and a challenge requesting it will be refused
 * with a clear reason rather than silently doing nothing.
 */
export const BUILT_IN_RULES: readonly RuleModule<never>[] = [
  conditionalPlatform as unknown as RuleModule<never>,
  gravityDirection as unknown as RuleModule<never>,
  objectState as unknown as RuleModule<never>,
];

export const IMPLEMENTED_RULE_TYPES: readonly RuleType[] = [
  "CONDITIONAL_PLATFORM",
  "GRAVITY_DIRECTION",
  "OBJECT_STATE",
];
