import { clamp, damp, forwardFromAngles, type Vec3 } from "../core/math.ts";

/**
 * Camera state as plain data.
 *
 * Two reasons this lives in `game/` rather than the React layer:
 *
 * 1. THE FALSE FLOOR keys off where the player is looking. Gaze is simulation input, so
 *    it has to exist headless — a probe must be able to drive it.
 * 2. D-005 left the first/third-person choice open until the Round 1 prototype. Both
 *    modes live behind this one interface so switching is a flag, not a rewrite.
 *
 * It holds no three.js types; the view copies `eye` and `target` onto the real camera.
 */

export type CameraMode = "third" | "first";

const PITCH_LIMIT = Math.PI / 2 - 0.05;

export interface CameraRigOptions {
  mode?: CameraMode;
  yaw?: number;
  distance?: number;
  /** Height of the player's eyes above their feet, metres. */
  eyeHeight?: number;
}

export class CameraRig {
  mode: CameraMode;
  yaw: number;
  pitch = -0.22;
  distance: number;
  readonly eyeHeight: number;

  /** Smoothed point the camera orbits, so the view does not jitter on every step. */
  private pivot: Vec3 = { x: 0, y: 0, z: 0 };
  private initialized = false;

  constructor(options: CameraRigOptions = {}) {
    this.mode = options.mode ?? "third";
    this.yaw = options.yaw ?? 0;
    this.distance = options.distance ?? 6.5;
    this.eyeHeight = options.eyeHeight ?? 1.5;
  }

  /** Mouse/stick look, in radians. */
  look(deltaYaw: number, deltaPitch: number): void {
    this.yaw -= deltaYaw;
    this.pitch = clamp(this.pitch - deltaPitch, -PITCH_LIMIT, PITCH_LIMIT);
  }

  zoom(delta: number): void {
    this.distance = clamp(this.distance + delta, 2.5, 12);
  }

  toggleMode(): CameraMode {
    this.mode = this.mode === "third" ? "first" : "third";
    return this.mode;
  }

  /** `target` is the player's feet position. */
  update(target: Vec3, dt: number): void {
    const desired = { x: target.x, y: target.y + this.eyeHeight, z: target.z };
    if (!this.initialized) {
      this.pivot = desired;
      this.initialized = true;
      return;
    }
    // Vertical lag is shorter than horizontal: a slow vertical follow during a jump
    // reads as the camera losing the player.
    this.pivot = {
      x: damp(this.pivot.x, desired.x, 0.05, dt),
      y: damp(this.pivot.y, desired.y, 0.03, dt),
      z: damp(this.pivot.z, desired.z, 0.05, dt),
    };
  }

  /** The point the camera orbits. Exposed so an agent can predict where a given
   *  yaw/pitch would put the eye — in third person, tilting the view moves it. */
  get pivotPoint(): Vec3 {
    return this.pivot;
  }

  /** Where the player is looking. The gaze vector THE FALSE FLOOR will test against. */
  get forward(): Vec3 {
    return forwardFromAngles(this.yaw, this.pitch);
  }

  /** Horizontal basis for movement input, so "forward" means "away from the camera". */
  get movementBasis(): { forward: Vec3; right: Vec3 } {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    return {
      forward: { x: -sin, y: 0, z: -cos },
      right: { x: cos, y: 0, z: -sin },
    };
  }

  /** Camera position in world space. */
  get eye(): Vec3 {
    if (this.mode === "first") return this.pivot;
    const forward = this.forward;
    return {
      x: this.pivot.x - forward.x * this.distance,
      y: this.pivot.y - forward.y * this.distance,
      z: this.pivot.z - forward.z * this.distance,
    };
  }

  /** Point the camera looks at. */
  get target(): Vec3 {
    const forward = this.forward;
    const from = this.eye;
    return { x: from.x + forward.x, y: from.y + forward.y, z: from.z + forward.z };
  }

  reset(yaw: number, target: Vec3): void {
    this.yaw = yaw;
    this.pitch = -0.22;
    this.initialized = false;
    this.update(target, 0);
  }
}
