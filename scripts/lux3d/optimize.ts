/**
 * Shrink a generated GLB so it can be shipped to a browser.
 *
 *   npm run optimize:asset                      # every GLB in public/assets/generated
 *   npm run optimize:asset -- platform-slab     # one manifest entry
 *   npm run optimize:asset -- --max 512         # smaller textures for background props
 *
 * Measured on the first Lux3D output: 93% of a 12.95 MB asset was two 2048x2048 PNGs
 * (docs/DECISIONS.md D-007). Geometry is almost free by comparison, so this pass resizes
 * textures and re-encodes them as WebP, then prunes anything unreferenced.
 *
 * Originals are kept in public/assets/generated/_raw/ (git-ignored) so a bad setting can
 * always be re-run from the source file rather than regenerated at cost.
 */

import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress, TextureResizeFilter } from "@gltf-transform/functions";
import sharp from "sharp";
import { GENERATED_DIR, parseArgs, readManifest } from "./store.ts";

const RAW_DIR = join(GENERATED_DIR, "_raw");

function mb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(2)} MB`;
}

async function optimize(fileName: string, maxSize: number, quality: number): Promise<void> {
  const livePath = join(GENERATED_DIR, fileName);
  const rawPath = join(RAW_DIR, fileName);

  // First run moves the original aside; later runs always start from the pristine file so
  // repeated passes never re-compress an already-compressed texture.
  await mkdir(RAW_DIR, { recursive: true });
  if (!existsSync(rawPath)) {
    await rename(livePath, rawPath);
  }

  const before = (await stat(rawPath)).size;
  // Register every Khronos/vendor extension, otherwise unregistered ones are silently
  // dropped on write and any texture only they reference looks unused to prune().
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.read(rawPath);

  await document.transform(
    dedup(),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      resize: [maxSize, maxSize],
      resizeFilter: TextureResizeFilter.LANCZOS3,
      quality,
    }),
    prune({ keepAttributes: false, keepLeaves: false }),
  );

  const output = await io.writeBinary(document);
  await writeFile(livePath, output);

  const after = output.byteLength;
  const saved = before > 0 ? Math.round((1 - after / before) * 100) : 0;
  console.log(
    `${fileName.padEnd(28)} ${mb(before).padStart(9)} -> ${mb(after).padStart(9)}  (-${saved}%)`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const maxSize = Number(args["max"] ?? 1024);
  const quality = Number(args["quality"] ?? 85);
  const named = process.argv.slice(2).filter((a) => !a.startsWith("--"));

  if (!Number.isFinite(maxSize) || maxSize < 64 || maxSize > 4096) {
    throw new Error(`--max must be between 64 and 4096, got "${maxSize}"`);
  }

  let files: string[];
  if (named.length > 0) {
    const manifest = await readManifest();
    files = named.map((name) => {
      const entry = manifest.entries.find((e) => e.name === name);
      const fileName = entry?.file.split("/").pop();
      if (!fileName) throw new Error(`No manifest entry named "${name}"`);
      return fileName;
    });
  } else {
    files = (await readdir(GENERATED_DIR)).filter((f) => f.toLowerCase().endsWith(".glb"));
  }

  if (files.length === 0) {
    console.log("Nothing to optimize.");
    return;
  }

  console.log(`Resizing textures to <=${maxSize}px, WebP quality ${quality}\n`);
  let before = 0;
  let after = 0;
  for (const file of files) {
    const rawPath = join(RAW_DIR, file);
    const sourceSize = existsSync(rawPath)
      ? (await stat(rawPath)).size
      : (await stat(join(GENERATED_DIR, file))).size;
    await optimize(file, maxSize, quality);
    before += sourceSize;
    after += (await readFile(join(GENERATED_DIR, file))).byteLength;
  }

  console.log(
    `\ntotal ${mb(before)} -> ${mb(after)}  (-${Math.round((1 - after / before) * 100)}%)`,
  );
  console.log(`originals kept in public/assets/generated/_raw/ (git-ignored)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
