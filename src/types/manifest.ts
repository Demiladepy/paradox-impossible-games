/**
 * Shared contract for the generated-asset manifest.
 *
 * The manifest is written by `scripts/lux3d/*` at build time and read by the game at
 * runtime. It is also the evidence trail for the hackathon project report: every asset
 * in the game must be traceable back to the prompt and Lux3D task that produced it.
 */

export type Lux3DVersion = "G1" | "G1-Turbo";

export type AssetKind = "prop" | "arena" | "character" | "character-animations";

export interface ManifestEntry {
  /** Stable id used by the game to look the asset up. */
  name: string;
  kind: AssetKind;
  /** Path relative to the site root, e.g. "/assets/generated/contestant.glb". */
  file: string;
  /** Exact prompt sent to Lux3D. Empty for derived assets (rigged/retargeted). */
  prompt: string;
  style?: string;
  version?: Lux3DVersion;
  faceCount?: number;
  /** Lux3D task id that produced this file. */
  taskId: number;
  /** Which endpoint produced it. */
  source: "text-to-3d" | "img-to-3d" | "rig" | "retarget" | "mesh-retopology";
  /** ISO date of generation. */
  createdAt: string;
  /** Bytes on disk. */
  bytes: number;
  /** Animation clip names, for retargeted assets. */
  animations?: string[];
  /** Task id of the asset this was derived from, if any. */
  derivedFromTaskId?: number;
  notes?: string;
}

export interface AssetManifest {
  updatedAt: string;
  entries: ManifestEntry[];
}

export const EMPTY_MANIFEST: AssetManifest = {
  updatedAt: "1970-01-01T00:00:00.000Z",
  entries: [],
};
