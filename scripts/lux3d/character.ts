/**
 * The full PARADOX contestant pipeline: text-to-3D -> auto-rig -> animation retargeting.
 *
 *   npm run gen:character -- --prompt "..." --name contestant-01
 *
 * The rigged GLB and the animation GLB are both downloaded. Two things are genuinely
 * uncertain here and this script exists to answer them:
 *   1. whether auto-rigging accepts a text-generated humanoid (it runs eligibility checks)
 *   2. whether the combined retarget GLB carries the skinned mesh or clips only
 * Whatever happens is printed plainly; nothing is assumed.
 *
 * Note we pass Lux3D's own result URL straight into the next stage rather than uploading
 * anything: those URLs are publicly fetchable for two hours, which is ample for a chain.
 */

import { createRetarget, createRig, createTextTo3D, LuxApiError, pollTask, type Lux3DStyle } from "./api.ts";
import { parseRetargetActions, pickGlbUrl, pickSingleUrl, successfulActions } from "./outputs.ts";
import { readFile, writeFile } from "node:fs/promises";
import { renameAnimations } from "./glb.ts";
import { downloadTo, parseArgs, requireString, secs, slugify, upsertEntry } from "./store.ts";
import type { Lux3DVersion } from "../../src/types/manifest.ts";

/** The movement vocabulary a PARADOX contestant needs. Max 10 per retarget task. */
const DEFAULT_ANIMATIONS = [
  "Idle_Loop",
  "Walk_Loop",
  "Jog_Fwd_Loop",
  "Sprint_Loop",
  "Jump_Start",
  "Jump_Loop",
  "Jump_Land",
  "Roll",
  "Hit_Knockback",
  "Death01",
];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const prompt = requireString(args, "prompt");
  const name = slugify(requireString(args, "name", prompt));
  const version = requireString(args, "version", "G1") as Lux3DVersion;
  const style = requireString(args, "style", "photorealistic") as Lux3DStyle;
  const faceCount = Number(requireString(args, "faceCount", "30000"));
  const animationIds = requireString(args, "animations", DEFAULT_ANIMATIONS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (animationIds.length < 1 || animationIds.length > 10) {
    throw new Error(`--animations must list 1-10 ids, got ${animationIds.length}`);
  }

  /* ---- Stage 1: text-to-3D ------------------------------------------------ */
  console.log(`[1/3] text-to-3d  version=${version}  faceCount=${faceCount}`);
  console.log(`      prompt: ${prompt}`);
  const meshTaskId = await createTextTo3D({
    prompt,
    version,
    style,
    faceCount,
    outputFormat: version === "G1" ? ["zip", "glb"] : ["glb"],
    ...(version === "G1-Turbo" ? { enablePbr: true } : {}),
    aiPredictSize: true,
  });
  const meshTask = await pollTask(meshTaskId, {
    onTick: (t, e) => console.log(`      ${secs(e)} status=${t.status}`),
  });
  const meshUrl = pickGlbUrl(meshTask, version, version === "G1" ? ["zip", "glb"] : ["glb"]);
  console.log(`[1/3] mesh ready (task ${meshTaskId})`);

  /* ---- Stage 2: auto-rig -------------------------------------------------- */
  console.log(`[2/3] auto-rig`);
  let rigTaskId: number;
  try {
    rigTaskId = await createRig(meshUrl);
  } catch (error) {
    console.error(`[2/3] rig REJECTED at creation: ${describe(error)}`);
    console.error(`      The mesh is still usable as a static prop. Mesh task: ${meshTaskId}`);
    throw error;
  }
  const rigTask = await pollTask(rigTaskId, {
    onTick: (t, e) => console.log(`      ${secs(e)} status=${t.status}`),
  });
  const riggedUrl = pickSingleUrl(rigTask);
  const rigged = await downloadTo(riggedUrl, `${name}-rigged.glb`);
  console.log(`[2/3] rigged GLB ${(rigged.bytes / 1_048_576).toFixed(2)} MB -> ${rigged.path}`);

  await upsertEntry({
    name: `${name}-rigged`,
    kind: "character",
    file: `/assets/generated/${name}-rigged.glb`,
    prompt,
    style,
    version,
    faceCount,
    taskId: rigTaskId,
    source: "rig",
    createdAt: new Date().toISOString(),
    bytes: rigged.bytes,
    derivedFromTaskId: meshTaskId,
    notes: "Rigged character: model + materials + skeleton + skin.",
  });

  /* ---- Stage 3: animation retargeting ------------------------------------- */
  console.log(`[3/3] retarget ${animationIds.length} clips (combined, glb, in-place)`);
  const retargetTaskId = await createRetarget({
    rigModelUrl: riggedUrl,
    animationIds,
    animationOutputMode: "combined",
    outFormat: "glb",
    animateInPlace: true,
  });
  const retargetTask = await pollTask(retargetTaskId, {
    onTick: (t, e) => console.log(`      ${secs(e)} status=${t.status}`),
  });

  const actions = parseRetargetActions(retargetTask);
  const delivered = successfulActions(actions);
  const failed = actions.filter((a) => a.status !== "success");

  console.log(`[3/3] ${delivered.length}/${actions.length} clips delivered`);
  for (const action of failed) {
    console.warn(`      FAILED ${action.animation_id}: ${action.error?.message ?? action.status}`);
  }
  if (delivered.length === 0) {
    throw new Error("Retargeting delivered no clips. The rigged model may be unsuitable.");
  }

  // In combined mode the actions share one file; download each distinct URL once.
  const urls = [...new Set(delivered.map((a) => a.animationGlbUrl ?? a.fbxUrl).filter(Boolean))] as string[];
  let index = 0;
  for (const url of urls) {
    const suffix = urls.length === 1 ? "" : `-${++index}`;
    const ext = url.toLowerCase().includes(".fbx") ? "fbx" : "glb";
    const fileName = `${name}-anim${suffix}.${ext}`;
    const file = await downloadTo(url, fileName);
    console.log(`[3/3] animations ${(file.bytes / 1_048_576).toFixed(2)} MB -> ${file.path}`);

    // Lux3D names the clips animation_1..animation_N. Rewrite them to the IDs we asked
    // for so the game can reference "Idle_Loop" instead of a positional alias.
    let bytes = file.bytes;
    if (ext === "glb") {
      try {
        const original = await readFile(file.path);
        const { renamed, buffer } = renameAnimations(
          original,
          delivered.map((a) => a.animation_id),
        );
        await writeFile(file.path, buffer);
        bytes = buffer.byteLength;
        console.log(`[3/3] renamed ${renamed.length} clips: ${renamed.map((r) => r.to).join(", ")}`);
      } catch (error) {
        console.warn(`[3/3] clip rename skipped: ${describe(error)}`);
        console.warn(`      Clips keep their animation_N names; map them by index.`);
      }
    }

    await upsertEntry({
      name: `${name}-anim${suffix}`,
      kind: "character-animations",
      file: `/assets/generated/${fileName}`,
      prompt: "",
      taskId: retargetTaskId,
      source: "retarget",
      createdAt: new Date().toISOString(),
      bytes,
      animations: delivered.map((a) => a.animation_id),
      derivedFromTaskId: rigTaskId,
      notes: "Combined, in-place clips retargeted onto the rigged character.",
    });
  }

  console.log("");
  console.log(`DONE  mesh=${meshTaskId}  rig=${rigTaskId}  retarget=${retargetTaskId}`);
  console.log(`Open the validation scene and select "${name}-rigged" to confirm the skeleton,`);
  console.log(`then "${name}-anim" to see which clips the file actually contains.`);
}

function describe(error: unknown): string {
  if (error instanceof LuxApiError) return `${error.message} [${error.code}]`;
  return error instanceof Error ? error.message : String(error);
}

main().catch((error: unknown) => {
  if (error instanceof LuxApiError && error.isConcurrencyLimit) {
    console.error("[lux3d] concurrency limit reached - wait for a running task to finish.");
  } else {
    console.error(`[lux3d] ${describe(error)}`);
  }
  process.exitCode = 1;
});
