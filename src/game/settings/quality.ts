/**
 * Visual quality levels.
 *
 * Everything added for the look — bloom, five point lights, shadow resolution, drifting
 * motes, supersampling — costs frames, and the machine that matters is whichever one the
 * demo gets recorded on. Rather than guess a single setting, these are the dials in the
 * order they should be traded: the cheapest visual loss first, bloom last, because losing
 * bloom undoes most of the gain.
 *
 * Plain data, so the renderer reads it and nothing here imports three.js.
 */

export type QualityLevel = "high" | "medium" | "low";

export interface QualitySettings {
  label: string;
  /** Device pixel ratio ceiling. */
  dpr: number;
  /** Shadow map resolution for the key light. */
  shadowMapSize: number;
  /** How many practical lamps to hang along the route. */
  maxLamps: number;
  /** Drifting motes in the void. */
  moteCount: number;
  bloom: boolean;
  smaa: boolean;
  chromaticAberration: boolean;
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  high: {
    label: "High",
    dpr: 1.75,
    shadowMapSize: 2048,
    maxLamps: 5,
    moteCount: 900,
    bloom: true,
    smaa: true,
    chromaticAberration: true,
  },
  // Shadow resolution and supersampling go first: both are expensive and neither is
  // something a viewer notices in motion.
  medium: {
    label: "Medium",
    dpr: 1.35,
    shadowMapSize: 1024,
    maxLamps: 3,
    moteCount: 450,
    bloom: true,
    smaa: false,
    chromaticAberration: true,
  },
  // Point lights are the most expensive thing in the scene — every material evaluates all
  // of them per fragment — so Low drops to two and keeps bloom, which is what the look
  // actually rests on.
  low: {
    label: "Low",
    dpr: 1,
    shadowMapSize: 512,
    maxLamps: 2,
    moteCount: 200,
    bloom: true,
    smaa: false,
    chromaticAberration: false,
  },
};

export const QUALITY_ORDER: readonly QualityLevel[] = ["high", "medium", "low"];

const STORAGE_KEY = "paradox.quality";

/** Remembered per browser. Falls back to High whenever storage is unavailable. */
export function loadQuality(): QualityLevel {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "high" || stored === "medium" || stored === "low") return stored;
  } catch {
    /* private window, blocked storage, thumbnail capture — High is a fine default */
  }
  return "high";
}

export function saveQuality(level: QualityLevel): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, level);
  } catch {
    /* losing the preference is not worth an error */
  }
}

/** The next level down, or null at the bottom. */
export function nextLevelDown(level: QualityLevel): QualityLevel | null {
  const index = QUALITY_ORDER.indexOf(level);
  return QUALITY_ORDER[index + 1] ?? null;
}
