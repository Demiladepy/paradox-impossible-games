import { angleDelta, clamp, lengthOf, type Vec3 } from "../core/math.ts";
import type { PhysicsWorld } from "../physics/world.ts";

/**
 * Kinematic player movement.
 *
 * Deterministic by construction: no randomness, no wall-clock reads, and every step takes
 * the same fixed `dt`. The same code drives the player and, later, the solvability probe's
 * scripted agent — if they diverged, verifying a challenge would prove nothing about it.
 */

export interface PlayerInput {
  /** -1 back .. +1 forward */
  forward: number;
  /** -1 left .. +1 right */
  right: number;
  jump: boolean;
  sprint: boolean;
}

export const NO_INPUT: PlayerInput = { forward: 0, right: 0, jump: false, sprint: false };

export interface MovementBasis {
  forward: Vec3;
  right: Vec3;
}

export interface PlayerTuning {
  walkSpeed: number;
  sprintSpeed: number;
  /** Metres the player can clear straight up from standing. */
  jumpHeight: number;
  acceleration: number;
  airControl: number;
  /** Grace period after walking off a ledge during which a jump still works. */
  coyoteTime: number;
  /** A jump pressed this long before landing still fires on touchdown. */
  jumpBuffer: number;
  terminalVelocity: number;
  radius: number;
  halfHeight: number;
}

/**
 * Fraction of the desired movement that must be lost before we call it a collision.
 * Below this, the shortfall is the character controller's own slop.
 */
const BLOCKED_RATIO = 0.5;

export const DEFAULT_TUNING: PlayerTuning = {
  walkSpeed: 6.2,
  sprintSpeed: 9.4,
  jumpHeight: 2.35,
  acceleration: 62,
  airControl: 0.42,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
  terminalVelocity: 42,
  radius: 0.36,
  halfHeight: 0.52,
};

export type LocomotionState = "idle" | "walk" | "jog" | "sprint" | "rise" | "fall";

export class PlayerController {
  position: Vec3;
  velocity: Vec3 = { x: 0, y: 0, z: 0 };
  grounded = false;
  /** Which way is up, +1 or -1. Mirrors the physics world; see GRAVITY_DIRECTION. */
  private upSign = 1;
  /** Direction the body faces, radians. Lags input so turns are not instant. */
  facing: number;

  private timeSinceGrounded = Infinity;
  private timeSinceJumpPressed = Infinity;
  private jumpHeld = false;

  constructor(
    spawn: Vec3,
    spawnYaw: number,
    readonly tuning: PlayerTuning = DEFAULT_TUNING,
  ) {
    this.position = { ...spawn };
    this.facing = spawnYaw;
  }

  /** Jump impulse needed to reach `jumpHeight` under the current gravity. */
  private jumpSpeed(gravityY: number): number {
    return Math.sqrt(2 * Math.abs(gravityY) * this.tuning.jumpHeight);
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get locomotion(): LocomotionState {
    if (!this.grounded) return this.velocity.y * this.upSign > 0.6 ? "rise" : "fall";
    const speed = this.speed;
    if (speed < 0.35) return "idle";
    if (speed < this.tuning.walkSpeed * 0.62) return "walk";
    if (speed < this.tuning.walkSpeed * 1.04) return "jog";
    return "sprint";
  }

  step(physics: PhysicsWorld, input: PlayerInput, basis: MovementBasis, dt: number): void {
    const tuning = this.tuning;
    const gravityY = physics.gravity.y;
    const upSign = physics.upSign;
    this.upSign = upSign;

    // --- intent ---------------------------------------------------------------
    let wishX = basis.forward.x * input.forward + basis.right.x * input.right;
    let wishZ = basis.forward.z * input.forward + basis.right.z * input.right;
    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 1) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    const targetSpeed = (input.sprint ? tuning.sprintSpeed : tuning.walkSpeed) * Math.min(wishLength, 1);
    const targetX = wishX * targetSpeed;
    const targetZ = wishZ * targetSpeed;

    // --- horizontal acceleration ---------------------------------------------
    const control = this.grounded ? 1 : tuning.airControl;
    const maxDelta = tuning.acceleration * control * dt;
    this.velocity.x = approach(this.velocity.x, targetX, maxDelta);
    this.velocity.z = approach(this.velocity.z, targetZ, maxDelta);

    // --- jump ------------------------------------------------------------------
    this.timeSinceGrounded = this.grounded ? 0 : this.timeSinceGrounded + dt;

    if (input.jump && !this.jumpHeld) this.timeSinceJumpPressed = 0;
    else this.timeSinceJumpPressed += dt;
    this.jumpHeld = input.jump;

    const canJump = this.timeSinceGrounded <= tuning.coyoteTime;
    const wantsJump = this.timeSinceJumpPressed <= tuning.jumpBuffer;

    if (canJump && wantsJump) {
      this.velocity.y = upSign * this.jumpSpeed(gravityY);
      this.grounded = false;
      this.timeSinceGrounded = Infinity;
      this.timeSinceJumpPressed = Infinity;
    } else if (this.grounded && this.velocity.y * upSign <= 0) {
      // A small bias towards the floor keeps the controller pressed into it, which is what
      // makes snap-to-ground work on the way down a slope. "Towards the floor" flips with
      // gravity.
      this.velocity.y = -upSign * 2;
    } else {
      this.velocity.y = clamp(
        this.velocity.y + gravityY * dt,
        -tuning.terminalVelocity,
        tuning.terminalVelocity,
      );
    }

    // --- resolve against the world ---------------------------------------------
    const result = physics.moveCharacter({
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
      z: this.velocity.z * dt,
    });

    const applied = result.translation;

    // Blocked horizontally? Drop the velocity we did not get to use, otherwise the
    // player keeps "pushing" into a wall and shoots off the moment it ends.
    //
    // The threshold is a ratio, not an epsilon. Rapier's character controller shaves a
    // little off every step for the collision offset, autostep and ground snapping, so a
    // small shortfall is normal on flat ground — treating that as "blocked" ratchets
    // velocity down until the player creeps at walking pace divided by twenty.
    if (dt > 0) {
      const desiredX = this.velocity.x * dt;
      const desiredZ = this.velocity.z * dt;
      if (Math.abs(desiredX) > 1e-4 && Math.abs(applied.x) < Math.abs(desiredX) * BLOCKED_RATIO) {
        this.velocity.x = applied.x / dt;
      }
      if (Math.abs(desiredZ) > 1e-4 && Math.abs(applied.z) < Math.abs(desiredZ) * BLOCKED_RATIO) {
        this.velocity.z = applied.z / dt;
      }
      // Hit a ceiling — whichever surface is "above" under the current gravity.
      const risingSpeed = this.velocity.y * upSign;
      if (risingSpeed > 0 && applied.y * upSign < risingSpeed * dt * BLOCKED_RATIO) {
        this.velocity.y = 0;
      }
    }

    this.grounded = result.grounded;

    // --- facing ----------------------------------------------------------------
    if (lengthOf({ x: this.velocity.x, y: 0, z: this.velocity.z }) > 0.6) {
      const desired = Math.atan2(-this.velocity.x, -this.velocity.z);
      this.facing += angleDelta(this.facing, desired) * Math.min(1, dt * 14);
    }
  }

  /**
   * Read the body's position back after the world has stepped.
   *
   * `moveCharacter` only queues a kinematic translation; the body does not actually move
   * until `world.step()` runs. Reading the position inside `step()` would report where
   * the player was a frame ago.
   */
  syncFromPhysics(physics: PhysicsWorld): void {
    this.position = physics.characterPosition;
  }

  teleport(physics: PhysicsWorld, position: Vec3, yaw: number): void {
    this.position = { ...position };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.facing = yaw;
    this.grounded = false;
    this.timeSinceGrounded = Infinity;
    this.timeSinceJumpPressed = Infinity;
    physics.setCharacterPosition(position);
  }
}

function approach(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}
