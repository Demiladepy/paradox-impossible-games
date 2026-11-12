/**
 * Rewrite a retargeted GLB's clip names from Lux3D's positional `animation_N` aliases to
 * the animation IDs recorded in the manifest.
 *
 *   npm run relabel:clips -- contestant-01-anim
 *
 * `gen:character` does this automatically on download. This command exists for assets
 * generated before that was wired up, and for re-running it if a rename was skipped.
 * It is positional — see docs/DECISIONS.md D-009 for why that ordering is trusted.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renameAnimations } from "./glb.ts";
import { GENERATED_DIR, readManifest } from "./store.ts";

async function main(): Promise<void> {
  const target = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!target) {
    throw new Error("Usage: npm run relabel:clips -- <manifest entry name>");
  }

  const manifest = await readManifest();
  const entry = manifest.entries.find((e) => e.name === target);
  if (!entry) {
    throw new Error(`No manifest entry named "${target}"`);
  }
  if (!entry.animations?.length) {
    throw new Error(`Manifest entry "${target}" records no animation list`);
  }

  const fileName = entry.file.split("/").pop();
  if (!fileName) throw new Error(`Manifest entry "${target}" has no file path`);
  const path = join(GENERATED_DIR, fileName);

  const original = await readFile(path);
  const { renamed, buffer } = renameAnimations(original, entry.animations);
  await writeFile(path, buffer);

  console.log(`${fileName}: renamed ${renamed.length} clips`);
  for (const change of renamed) console.log(`  ${change.from.padEnd(14)} -> ${change.to}`);
  console.log(`  ${original.byteLength} -> ${buffer.byteLength} bytes`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
