import type {
  Collider,
  KinematicCharacterController,
  RigidBody,
  World,
} from "@dimforge/rapier3d-compat";
import type { Vec3 } from "../core/math.ts";

/**
 * Rapier wrapper.
 *
 * This deliberately uses raw `@dimforge/rapier3d-compat` rather than
 * `@react-three/rapier`: the simulation has to run headless in Node for the Milestone 3
 * solvability probe, and a React-bound physics world cannot do that. See
 * docs/DECISIONS.md D-011.
 *
 * Colliders are always primitives. A Lux3D mesh is never used as collision geometry —
 * it is far too dense and its shape is not something we control.
 */

type RapierModule = typeof import("@dimforge/rapier3d-compat");

let rapier: RapierModule | null = null;
let loading: Promise<void> | null = null;

/**
 * Loads the Rapier WASM module.
 *
 * The import is dynamic so Rapier lands in its own chunk: `rapier3d-compat` inlines its
 * WASM as base64, which is roughly 4 MB, and making the whole app wait for it before
 * first paint would be a poor trade. Safe to call repeatedly and concurrently.
 */
export async function initPhysics(): Promise<void> {
  if (rapier) return;
  loading ??= (async () => {
    const module = await import("@dimforge/rapier3d-compat");
    await module.default.init();
    rapier = module;
  })();
  await loading;
}

function R(): RapierModule {
  if (!rapier) {
    throw new Error("initPhysics() must be awaited before using the physics world");
  }
  return rapier;
}

export interface BoxOptions {
  id: string;
  position: Vec3;
  /** Full extents; halved internally for Rapier. */
  size: Vec3;
}

export interface CharacterOptions {
  position: Vec3;
  radius: number;
  /** Half the height of the cylindrical section, excluding the end caps. */
  halfHeight: number;
}

export interface CharacterMoveResult {
  translation: Vec3;
  grounded: boolean;
}

export class PhysicsWorld {
  readonly world: World;
  private readonly bodies = new Map<string, RigidBody>();
  private readonly colliders = new Map<string, Collider>();

  private characterBody: RigidBody | null = null;
  private characterCollider: Collider | null = null;
  private controller: KinematicCharacterController | null = null;

  constructor(gravity: Vec3, timestep: number) {
    this.world = new (R().World)(gravity);
    this.world.timestep = timestep;
  }

  get gravity(): Vec3 {
    return this.world.gravity;
  }

  setGravity(gravity: Vec3): void {
    this.world.gravity = gravity;
    // The character controller resolves ground, slopes and autostep relative to "up".
    // Inverting gravity without telling it leaves the player's feet pointing at the sky.
    this.setControllerUp({ x: 0, y: gravity.y > 0 ? -1 : 1, z: 0 });
    // Bodies asleep under the old gravity would otherwise ignore the new direction.
    this.world.forEachRigidBody((body) => body.wakeUp());
  }

  /**
   * +1 when "up" is +Y, -1 once gravity has been inverted.
   *
   * Movement code asks this rather than inspecting the gravity vector, so there is one
   * place that decides which way is up.
   */
  get upSign(): number {
    return this.world.gravity.y > 0 ? -1 : 1;
  }

  addStaticBox({ id, position, size }: BoxOptions): void {
    if (this.bodies.has(id)) throw new Error(`Duplicate physics body id "${id}"`);

    const body = this.world.createRigidBody(
      R().RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
    );
    const collider = this.world.createCollider(
      R().ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2),
      body,
    );
    this.bodies.set(id, body);
    this.colliders.set(id, collider);
  }

  /**
   * Turn a body's collision on or off without destroying it. This is the primitive
   * THE FALSE FLOOR is built on; the rule layer that drives it lands in Milestone 2.
   */
  setSolid(id: string, solid: boolean): void {
    const collider = this.colliders.get(id);
    if (!collider) throw new Error(`No collider with id "${id}"`);
    collider.setEnabled(solid);
  }

  isSolid(id: string): boolean {
    return this.colliders.get(id)?.isEnabled() ?? false;
  }

  hasBody(id: string): boolean {
    return this.bodies.has(id);
  }

  addCharacter({ position, radius, halfHeight }: CharacterOptions): void {
    if (this.characterBody) throw new Error("Character already added");

    this.characterBody = this.world.createRigidBody(
      R().RigidBodyDesc.kinematicPositionBased().setTranslation(
        position.x,
        position.y,
        position.z,
      ),
    );
    this.characterCollider = this.world.createCollider(
      R().ColliderDesc.capsule(halfHeight, radius),
      this.characterBody,
    );

    // Offset keeps a sliver of space between collider and ground so the solver does not
    // have to resolve a permanent penetration every step.
    const controller = this.world.createCharacterController(0.02);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.enableAutostep(0.45, 0.2, true); // step over low lips without jumping
    controller.enableSnapToGround(0.4); // stay stuck to the floor going down slopes
    controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((38 * Math.PI) / 180);
    controller.setApplyImpulsesToDynamicBodies(false);
    this.controller = controller;
  }

  get characterPosition(): Vec3 {
    if (!this.characterBody) throw new Error("No character in the world");
    return this.characterBody.translation();
  }

  setCharacterPosition(position: Vec3): void {
    if (!this.characterBody) throw new Error("No character in the world");
    this.characterBody.setNextKinematicTranslation(position);
    this.characterBody.setTranslation(position, true);
  }

  /**
   * Resolve a desired movement against the world and apply the part that fits.
   * Returns what actually happened, which is how the controller learns it was blocked.
   */
  moveCharacter(desired: Vec3): CharacterMoveResult {
    if (!this.controller || !this.characterCollider || !this.characterBody) {
      throw new Error("No character in the world");
    }
    this.controller.computeColliderMovement(this.characterCollider, desired);
    const corrected = this.controller.computedMovement();
    const current = this.characterBody.translation();
    const next = {
      x: current.x + corrected.x,
      y: current.y + corrected.y,
      z: current.z + corrected.z,
    };
    this.characterBody.setNextKinematicTranslation(next);
    return { translation: corrected, grounded: this.controller.computedGrounded() };
  }

  /** The up-axis direction, derived from gravity. Gravity can be rotated in Milestone 2. */
  setControllerUp(up: Vec3): void {
    this.controller?.setUp(up);
  }

  step(): void {
    this.world.step();
  }

  dispose(): void {
    this.world.free();
    this.bodies.clear();
    this.colliders.clear();
    this.characterBody = null;
    this.characterCollider = null;
    this.controller = null;
  }
}
