/**
 * Minimal GLB container read/write.
 *
 * Exists for one reason: Lux3D's retargeting returns clips named `animation_1` …
 * `animation_N` rather than the animation IDs that were requested. Game code should ask
 * for "Idle_Loop", not "animation_1", so the names are rewritten into the file at
 * download time and the asset becomes self-describing.
 */

export const GLB_MAGIC = 0x46546c67; // "glTF"
export const CHUNK_JSON = 0x4e4f534a;
export const CHUNK_BIN = 0x004e4942;

export interface GlbParts {
  json: Record<string, unknown>;
  bin: Buffer | null;
}

export function parseGlb(buffer: Buffer): GlbParts {
  if (buffer.byteLength < 12 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("Not a GLB file (bad magic)");
  }
  let offset = 12;
  let json: Record<string, unknown> | null = null;
  let bin: Buffer | null = null;

  while (offset + 8 <= buffer.byteLength) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (chunkType === CHUNK_JSON) {
      json = JSON.parse(buffer.subarray(start, end).toString("utf8")) as Record<string, unknown>;
    } else if (chunkType === CHUNK_BIN) {
      bin = buffer.subarray(start, end);
    }
    offset = end + ((4 - (chunkLength % 4)) % 4);
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return { json, bin };
}

/** Re-emit a GLB. JSON chunks pad with spaces, BIN chunks pad with zeros (glTF spec). */
export function serializeGlb(parts: GlbParts): Buffer {
  const jsonBytes = Buffer.from(JSON.stringify(parts.json), "utf8");
  const jsonPadding = (4 - (jsonBytes.byteLength % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPadding, 0x20)]);

  const chunks: Buffer[] = [header(jsonChunk.byteLength, CHUNK_JSON), jsonChunk];

  if (parts.bin) {
    const binPadding = (4 - (parts.bin.byteLength % 4)) % 4;
    const binChunk = Buffer.concat([parts.bin, Buffer.alloc(binPadding, 0x00)]);
    chunks.push(header(binChunk.byteLength, CHUNK_BIN), binChunk);
  }

  const body = Buffer.concat(chunks);
  const out = Buffer.alloc(12 + body.byteLength);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4); // glTF version
  out.writeUInt32LE(out.byteLength, 8);
  body.copy(out, 12);
  return out;
}

function header(length: number, type: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32LE(length, 0);
  buffer.writeUInt32LE(type, 4);
  return buffer;
}

export interface RenameResult {
  renamed: { from: string; to: string }[];
  buffer: Buffer;
}

/**
 * Rename animation clips positionally.
 *
 * `names[i]` becomes the name of clip `i`. This relies on Lux3D emitting clips in the
 * order the animation IDs were requested — see docs/DECISIONS.md D-009 for the evidence.
 * If the clip count and the name count disagree we rename nothing and say so, rather than
 * silently mislabelling a clip, which would be worse than leaving it as animation_N.
 */
export function renameAnimations(buffer: Buffer, names: readonly string[]): RenameResult {
  const parts = parseGlb(buffer);
  const animations = parts.json["animations"];
  if (!Array.isArray(animations)) {
    throw new Error("GLB contains no animations to rename");
  }
  if (animations.length !== names.length) {
    throw new Error(
      `Clip count (${animations.length}) does not match the delivered animation list ` +
        `(${names.length}); refusing to rename positionally`,
    );
  }

  const renamed: { from: string; to: string }[] = [];
  animations.forEach((animation, index) => {
    const clip = animation as { name?: string };
    const to = names[index];
    if (!to) return;
    renamed.push({ from: clip.name ?? `#${index}`, to });
    clip.name = to;
  });

  return { renamed, buffer: serializeGlb(parts) };
}
