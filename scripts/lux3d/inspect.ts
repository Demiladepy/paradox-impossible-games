/**
 * Inspect a downloaded GLB without loading three.js: what is in it, and what it weighs.
 *
 *   npm run inspect:asset -- platform-slab.glb
 *   npm run inspect:asset            # every GLB in public/assets/generated
 *
 * Triangle count is only half the cost of a web asset — textures are usually the other
 * nine tenths. This prints both so the asset budget is based on measurements.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { GENERATED_DIR } from "./store.ts";

interface GltfImage {
  mimeType?: string;
  bufferView?: number;
  uri?: string;
  name?: string;
}

interface GltfAnimation {
  name?: string;
  samplers?: { input?: number }[];
  channels?: unknown[];
}

interface GltfJson {
  images?: GltfImage[];
  meshes?: { primitives?: unknown[] }[];
  materials?: unknown[];
  animations?: GltfAnimation[];
  accessors?: { max?: number[]; count?: number }[];
  skins?: unknown[];
  nodes?: unknown[];
  bufferViews?: { byteLength?: number }[];
}

/**
 * Clip length in seconds: the largest keyframe time across the clip's input accessors.
 * glTF stores that in accessor.max, so no BIN decoding is needed.
 */
function clipDuration(animation: GltfAnimation, accessors: GltfJson["accessors"]): number {
  let duration = 0;
  for (const sampler of animation.samplers ?? []) {
    if (sampler.input === undefined) continue;
    const max = accessors?.[sampler.input]?.max?.[0];
    if (typeof max === "number" && max > duration) duration = max;
  }
  return duration;
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function parseGlb(buffer: Buffer): { json: GltfJson; binLength: number } {
  if (buffer.byteLength < 12 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("Not a GLB file (bad magic)");
  }
  let offset = 12;
  let json: GltfJson | null = null;
  let binLength = 0;

  while (offset + 8 <= buffer.byteLength) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (chunkType === CHUNK_JSON) {
      json = JSON.parse(buffer.subarray(start, end).toString("utf8")) as GltfJson;
    } else if (chunkType === CHUNK_BIN) {
      binLength = chunkLength;
    }
    offset = end + ((4 - (chunkLength % 4)) % 4);
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return { json, binLength };
}

/** Read width/height out of a WebP header (VP8X extended, VP8L lossless, VP8 lossy). */
function webpSize(data: Buffer): { width: number; height: number } | null {
  if (data.byteLength < 30) return null;
  if (data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const format = data.toString("ascii", 12, 16);
  if (format === "VP8X") {
    return {
      width: (data.readUIntLE(24, 3) & 0xffffff) + 1,
      height: (data.readUIntLE(27, 3) & 0xffffff) + 1,
    };
  }
  if (format === "VP8L") {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === "VP8 ") {
    return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

/** Read width/height straight out of a PNG, JPEG or WebP header. */
function imageSize(data: Buffer): { width: number; height: number } | null {
  const webp = webpSize(data);
  if (webp) return webp;
  if (data.byteLength > 24 && data.readUInt32BE(0) === 0x89504e47) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.byteLength > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.byteLength) {
      if (data[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = data[i + 1] ?? 0;
      const length = data.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) };
      }
      i += 2 + length;
    }
  }
  return null;
}

function mb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(2)} MB`;
}

async function inspect(fileName: string): Promise<void> {
  const path = join(GENERATED_DIR, fileName);
  const buffer = await readFile(path);
  const { json, binLength } = parseGlb(buffer);

  const primitives = (json.meshes ?? []).reduce((n, m) => n + (m.primitives?.length ?? 0), 0);
  const views = json.bufferViews ?? [];

  let textureBytes = 0;
  const textures: string[] = [];
  for (const [index, image] of (json.images ?? []).entries()) {
    const view = image.bufferView !== undefined ? views[image.bufferView] : undefined;
    const byteLength = view?.byteLength ?? 0;
    textureBytes += byteLength;

    let dims = "unknown size";
    if (image.bufferView !== undefined && byteLength > 0) {
      // Locate the view inside the BIN chunk to read the image header.
      const offsets = buildOffsets(views);
      const start = offsets[image.bufferView] ?? 0;
      const binStart = buffer.byteLength - binLength;
      const slice = buffer.subarray(binStart + start, binStart + start + Math.min(byteLength, 64));
      const size = imageSize(slice);
      if (size) dims = `${size.width}x${size.height}`;
    }
    textures.push(`    [${index}] ${image.name ?? "image"} ${dims} ${image.mimeType ?? ""} ${mb(byteLength)}`);
  }

  console.log(`\n${fileName}  ${mb(buffer.byteLength)}`);
  console.log(`  meshes=${json.meshes?.length ?? 0} primitives=${primitives} materials=${json.materials?.length ?? 0}`);
  console.log(`  nodes=${json.nodes?.length ?? 0} skins=${json.skins?.length ?? 0} animations=${json.animations?.length ?? 0}`);
  if (json.animations?.length) {
    console.log(`  clips:`);
    for (const [index, animation] of json.animations.entries()) {
      const seconds = clipDuration(animation, json.accessors).toFixed(2);
      const channels = animation.channels?.length ?? 0;
      console.log(
        `    [${index}] ${(animation.name ?? "?").padEnd(14)} ${seconds.padStart(6)}s  ${channels} channels`,
      );
    }
  }
  const share = buffer.byteLength > 0 ? Math.round((textureBytes / buffer.byteLength) * 100) : 0;
  console.log(`  textures=${json.images?.length ?? 0} totalling ${mb(textureBytes)} (${share}% of the file)`);
  for (const line of textures) console.log(line);
}

/** bufferView byteOffsets are optional; rebuild them when absent. */
function buildOffsets(views: { byteLength?: number; byteOffset?: number }[]): number[] {
  let cursor = 0;
  return views.map((view) => {
    const offset = view.byteOffset ?? cursor;
    cursor = offset + (view.byteLength ?? 0);
    return offset;
  });
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const files =
    requested.length > 0
      ? requested
      : (await readdir(GENERATED_DIR)).filter((f) => f.toLowerCase().endsWith(".glb"));

  if (files.length === 0) {
    console.log("No GLB files in public/assets/generated.");
    return;
  }
  for (const file of files) {
    await inspect(file).catch((error: unknown) => {
      console.error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
