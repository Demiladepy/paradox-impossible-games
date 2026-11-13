/**
 * Minimal vector maths for the simulation.
 *
 * `Vec3` is a plain `{x, y, z}` on purpose: it is structurally compatible with both
 * Rapier's vectors and three.js's `Vector3`, so the simulation never has to import a
 * rendering library and stays runnable headless in Node.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const copy = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const scale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const lengthOf = (v: Vec3): number => Math.sqrt(dot(v, v));

export const distance = (a: Vec3, b: Vec3): number => lengthOf(sub(a, b));

/** Horizontal distance, ignoring height. Used for "did they reach the exit" checks. */
export const distanceXZ = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

export function normalize(v: Vec3): Vec3 {
  const length = lengthOf(v);
  return length > 1e-8 ? scale(v, 1 / length) : vec3();
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/**
 * Smoothing that behaves the same at any framerate.
 * `halfLife` is the time in seconds for the gap to halve.
 */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  return target + (current - target) * Math.pow(2, -dt / halfLife);
}

/** Direction a yaw/pitch pair is looking, in a Y-up right-handed world. */
export function forwardFromAngles(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cosPitch,
  };
}

/** Shortest signed angular difference, in radians, wrapped to [-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
