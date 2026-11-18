/**
 * Which import is breaking the challenge function?
 *
 * Imports each dependency of the handler in turn, dynamically, and reports the first that
 * throws. A load-time crash reports only FUNCTION_INVOCATION_FAILED with no detail, so the
 * cheapest way to find the culprit is to ask the runtime one module at a time.
 */
export default async function handler(
  _req: unknown,
  res: { setHeader(n: string, v: string): void; end(b: string): void },
): Promise<void> {
  const steps: Record<string, string> = {};

  const probe = async (name: string, load: () => Promise<unknown>): Promise<void> => {
    try {
      await load();
      steps[name] = "ok";
    } catch (error) {
      steps[name] = `FAILED: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  await probe("@anthropic-ai/sdk", () => import("@anthropic-ai/sdk"));
  await probe("arena/registry", () => import("../src/game/arena/registry.ts"));
  await probe("challenges/schema", () => import("../src/game/challenges/schema.ts"));
  await probe("challenges/fallback", () => import("../src/game/challenges/fallback.ts"));
  await probe("challenges/validate", () => import("../src/game/challenges/validate.ts"));
  await probe("rapier3d-compat", () => import("@dimforge/rapier3d-compat"));
  await probe("challenge-handler", () => import("../server/challenge-handler.ts"));

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(steps, null, 2));
}
