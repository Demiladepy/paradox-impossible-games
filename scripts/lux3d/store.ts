/**
 * Downloading results and maintaining public/assets/generated/manifest.json.
 *
 * Lux3D result URLs expire two hours after the task succeeds, so everything is pulled
 * to disk immediately and recorded. The manifest is evidence for the project report:
 * if it says an asset came from a prompt, that must be true.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_MANIFEST, type AssetManifest, type ManifestEntry } from "../../src/types/manifest.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(here, "..", "..");
export const GENERATED_DIR = join(PROJECT_ROOT, "public", "assets", "generated");
export const MANIFEST_PATH = join(GENERATED_DIR, "manifest.json");

export async function downloadTo(url: string, fileName: string): Promise<{ path: string; bytes: number }> {
  await mkdir(GENERATED_DIR, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (HTTP ${res.status}) for ${fileName}. The URL may have expired.`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const path = join(GENERATED_DIR, fileName);
  await writeFile(path, buffer);
  return { path, bytes: buffer.byteLength };
}

export async function readManifest(): Promise<AssetManifest> {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw) as AssetManifest;
    if (!Array.isArray(parsed.entries)) return { ...EMPTY_MANIFEST };
    return parsed;
  } catch {
    return { ...EMPTY_MANIFEST };
  }
}

/** Adds or replaces an entry by name, then rewrites the manifest. */
export async function upsertEntry(entry: ManifestEntry): Promise<void> {
  const manifest = await readManifest();
  const entries = manifest.entries.filter((e) => e.name !== entry.name);
  entries.push(entry);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  await mkdir(GENERATED_DIR, { recursive: true });
  await writeFile(
    MANIFEST_PATH,
    JSON.stringify({ updatedAt: new Date().toISOString(), entries }, null, 2) + "\n",
    "utf8",
  );
}

/** Minimal flag parser: --key value and --flag. */
export function parseArgs(argv: readonly string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token || !token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

export function requireString(
  args: Record<string, string | boolean>,
  key: string,
  fallback?: string,
): string {
  const value = args[key];
  if (typeof value === "string" && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required argument --${key}`);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Human-readable elapsed time for CLI progress lines. */
export function secs(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}
