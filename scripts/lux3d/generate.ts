/**
 * Generate one 3D asset with Lux3D text-to-3D, download it, record it in the manifest.
 *
 *   npm run gen:asset -- --prompt "a cracked obsidian platform slab" --name platform-slab
 *   npm run gen:asset -- --prompt "..." --name hero --version G1 --faceCount 60000 --style cyberpunk
 *
 * Defaults to G1-Turbo with faceCount 20000: the server default is 300000, which will not
 * hold framerate in a browser with several of these on screen.
 */

import { createTextTo3D, LuxApiError, pollTask, type Lux3DStyle } from "./api.ts";
import { pickGlbUrl } from "./outputs.ts";
import { downloadTo, parseArgs, requireString, secs, slugify, upsertEntry } from "./store.ts";
import type { AssetKind, Lux3DVersion } from "../../src/types/manifest.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const prompt = requireString(args, "prompt");
  const name = slugify(requireString(args, "name", prompt));
  const version = requireString(args, "version", "G1-Turbo") as Lux3DVersion;
  const style = requireString(args, "style", "photorealistic") as Lux3DStyle;
  const kind = requireString(args, "kind", "prop") as AssetKind;
  const faceCount = Number(requireString(args, "faceCount", "20000"));

  if (version !== "G1" && version !== "G1-Turbo") {
    throw new Error(`--version must be G1 or G1-Turbo, got "${version}"`);
  }
  if (!Number.isFinite(faceCount) || faceCount < 10_000 || faceCount > 300_000) {
    throw new Error(`--faceCount must be between 10000 and 300000, got "${faceCount}"`);
  }

  // G1 always returns ZIP + GLB regardless of what we ask for; G1-Turbo honours the list.
  const outputFormat: ("zip" | "glb" | "ply")[] = version === "G1" ? ["zip", "glb"] : ["glb"];

  console.log(`[lux3d] text-to-3d  version=${version}  faceCount=${faceCount}  style=${style}`);
  console.log(`[lux3d] prompt: ${prompt}`);

  const taskId = await createTextTo3D({
    prompt,
    version,
    style,
    faceCount,
    outputFormat,
    ...(version === "G1-Turbo" ? { enablePbr: true } : {}),
    aiPredictSize: true,
  });
  console.log(`[lux3d] task ${taskId} created; polling every 12s`);

  const task = await pollTask(taskId, {
    onTick: (t, elapsed) => console.log(`[lux3d]   ${secs(elapsed)} status=${t.status}`),
  });

  const glbUrl = pickGlbUrl(task, version, outputFormat);
  const fileName = `${name}.glb`;
  const { path, bytes } = await downloadTo(glbUrl, fileName);
  console.log(`[lux3d] downloaded ${(bytes / 1_048_576).toFixed(2)} MB -> ${path}`);

  await upsertEntry({
    name,
    kind,
    file: `/assets/generated/${fileName}`,
    prompt,
    style,
    version,
    faceCount,
    taskId,
    source: "text-to-3d",
    createdAt: new Date().toISOString(),
    bytes,
  });
  console.log(`[lux3d] manifest updated: ${name}`);
}

main().catch((error: unknown) => {
  if (error instanceof LuxApiError && error.isConcurrencyLimit) {
    console.error("[lux3d] concurrency limit reached - wait for a running task to finish.");
    console.error("        Free accounts allow 5 in-flight tasks. No credits were consumed.");
  } else {
    console.error(`[lux3d] ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
});
