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
    if (!this.grounded) return this.velocity.y > 0.6 ? "rise" : "fall";
    const speed = this.speed;
    if (speed < 0.35) return "idle";
    if (speed < this.tuning.walkSpeed * 0.62) return "walk";
    if (speed < this.tuning.walkSpeed * 1.04) return "jog";
    return "sprint";
  }

  step(physics: PhysicsWorld, input: PlayerInput, basis: MovementBasis, dt: number): void {
    const tuning = this.tuning;
    const gravityY = physics.gravity.y;

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
      this.velocity.y = this.jumpSpeed(gravityY);
      this.grounded = false;
      this.timeSinceGrounded = Infinity;
      this.timeSinceJumpPressed = Infinity;
    } else if (this.grounded && this.velocity.y <= 0) {
      // A small downward bias keeps the controller pressed into the floor, which is what
      // makes snap-to-ground work on the way down a slope.
      this.velocity.y = -2;
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
    if (dt > 0) {
      if (Math.abs(applied.x) < Math.abs(this.velocity.x * dt) - 1e-4) this.velocity.x = applied.x / dt;
      if (Math.abs(applied.z) < Math.abs(this.velocity.z * dt) - 1e-4) this.velocity.z = applied.z / dt;
      // Hit a ceiling.
      if (this.velocity.y > 0 && applied.y < this.velocity.y * dt - 1e-4) this.velocity.y = 0;
    }

    this.position = physics.characterPosition;
    this.grounded = result.grounded;

    // --- facing ----------------------------------------------------------------
    if (lengthOf({ x: this.velocity.x, y: 0, z: this.velocity.z }) > 0.6) {
      const desired = Math.atan2(-this.velocity.x, -this.velocity.z);
      this.facing += angleDelta(this.facing, desired) * Math.min(1, dt * 14);
    }
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
