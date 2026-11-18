/**
 * Bundles the challenge handler for the serverless function.
 *
 * Vercel compiles `api/challenge.ts` to JavaScript but leaves its import specifiers alone,
 * and this project imports with explicit `.ts` extensions throughout (the tsconfig sets
 * `allowImportingTsExtensions`). The result at runtime was every import of `src/` or
 * `server/` failing with "Cannot find module .../registry.ts" — the specifier survived and
 * the file behind it never shipped. `includeFiles` did not carry them either.
 *
 * Rather than bend the whole codebase's import style to suit one host, the handler is
 * bundled here into a single self-contained module that the function imports. Diagnosing
 * the failure one module at a time showed `@anthropic-ai/sdk` and `@dimforge/rapier3d-compat`
 * both load fine on the platform, so they stay external — bundling a WASM package is a
 * fight with no prize.
 *
 * The output is committed. It is a build artefact in a source tree, which is not lovely,
 * but it removes any dependency on *when* the host runs the build relative to packaging
 * the function, and that reliability is worth more the day a deadline lands.
 *
 * Run by `npm run build`, so it cannot drift from the handler it mirrors.
 */
import { build } from "esbuild";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

await build({
  entryPoints: [resolve(ROOT, "server/challenge-handler.ts")],
  // A leading underscore keeps Vercel from treating this as a route of its own.
  outfile: resolve(ROOT, "api/_handler.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // Both verified to load correctly on the platform; rapier carries WASM that should not
  // be inlined, and the SDK is a normal dependency the host installs anyway.
  external: ["@anthropic-ai/sdk", "@dimforge/rapier3d-compat"],
  // The handler is read by people debugging a deployment, not shipped to a browser.
  minify: false,
  sourcemap: false,
  logLevel: "info",
});

console.log("bundled server/challenge-handler.ts -> api/_handler.mjs");
