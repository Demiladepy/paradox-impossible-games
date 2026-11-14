import { CameraRig, type CameraMode } from "./camera/rig.ts";
import { FIXED_TIMESTEP, FixedClock } from "./core/clock.ts";
import { distanceXZ, type Vec3 } from "./core/math.ts";
import { Rng } from "./core/rng.ts";
import { NO_INPUT, PlayerController, type LocomotionState, type PlayerInput } from "./player/controller.ts";
import { initPhysics, PhysicsWorld } from "./physics/world.ts";
import type { ArenaDefinition } from "./arena/types.ts";

/**
 * The simulation.
 *
 * Plain TypeScript: no DOM, no React, no three.js. The React layer reads `snapshot()`
 * once per frame and draws it. The Milestone 3 solvability probe will drive this exact
 * class headless with a scripted input stream, which is only credible because the player
 * and the probe run the same code.
 */

export type RunStatus = "running" | "won" | "lost";

export interface PlayerSnapshot {
  position: Vec3;
  facing: number;
  locomotion: LocomotionState;
  grounded: boolean;
  speed: number;
}

export interface GameSnapshot {
  status: RunStatus;
  elapsed: number;
  player: PlayerSnapshot;
  camera: { eye: Vec3; target: Vec3; mode: CameraMode; forward: Vec3 };
  /** Distance to the objective, for the HUD. */
  distanceToExit: number;
}

export interface LookInput {
  deltaYaw: number;
  deltaPitch: number;
}

export const NO_LOOK: LookInput = { deltaYaw: 0, deltaPitch: 0 };

export interface GameWorldOptions {
  seed?: number | string;
  cameraMode?: CameraMode;
}

export class GameWorld {
  readonly arena: ArenaDefinition;
  readonly physics: PhysicsWorld;
  readonly player: PlayerController;
  readonly camera: CameraRig;
  readonly rng: Rng;
  private readonly clock = new FixedClock(FIXED_TIMESTEP);

  private status: RunStatus = "running";

  private constructor(arena: ArenaDefinition, options: GameWorldOptions) {
    this.arena = arena;
    this.rng = new Rng(options.seed ?? arena.id);
    this.physics = new PhysicsWorld(arena.gravity, FIXED_TIMESTEP);

    for (const platform of arena.platforms) {
      this.physics.addStaticBox({
        id: platform.id,
        position: platform.position,
        size: platform.size,
      });
    }

    this.player = new PlayerController(arena.spawn, arena.spawnYaw);
    this.physics.addCharacter({
      position: arena.spawn,
      radius: this.player.tuning.radius,
      halfHeight: this.player.tuning.halfHeight,
    });

    this.camera = new CameraRig({ mode: options.cameraMode ?? "third", yaw: arena.spawnYaw });
    this.camera.reset(arena.spawnYaw, arena.spawn);
  }

  /** Rapier's WASM must be loaded before a world can exist, hence the async factory. */
  static async create(arena: ArenaDefinition, options: GameWorldOptions = {}): Promise<GameWorld> {
    await initPhysics();
    return new GameWorld(arena, options);
  }

  get runStatus(): RunStatus {
    return this.status;
  }

  get elapsed(): number {
    return this.clock.simulatedSeconds;
  }

  /**
   * Advance by a wall-clock delta. Look input is applied once per frame (it is already a
   * delta, so dividing it across substeps would be wrong); movement runs at fixed steps.
   */
  update(input: PlayerInput, look: LookInput, deltaSeconds: number): void {
    if (look.deltaYaw !== 0 || look.deltaPitch !== 0) {
      this.camera.look(look.deltaYaw, look.deltaPitch);
    }

    const steps = this.clock.advance(deltaSeconds);
    const effective = this.status === "running" ? input : NO_INPUT;

    for (let i = 0; i < steps; i++) {
      this.player.step(this.physics, effective, this.camera.movementBasis, FIXED_TIMESTEP);
      this.physics.step();
      this.player.syncFromPhysics(this.physics);
      this.evaluateObjective();
    }

    this.camera.update(this.player.position, Math.max(deltaSeconds, 1e-4));
  }

  private evaluateObjective(): void {
    if (this.status !== "running") return;

    const position = this.player.position;
    if (position.y < this.arena.killPlaneY) {
      this.status = "lost";
      return;
    }

    const exit = this.arena.exit;
    const withinRadius = distanceXZ(position, exit.position) <= exit.radius;
    const withinHeight = Math.abs(position.y - exit.position.y) <= 2.2;
    if (withinRadius && withinHeight) this.status = "won";
  }

  restart(): void {
    this.status = "running";
    this.clock.reset();
    this.player.teleport(this.physics, this.arena.spawn, this.arena.spawnYaw);
    this.camera.reset(this.arena.spawnYaw, this.arena.spawn);
  }

  snapshot(): GameSnapshot {
    return {
      status: this.status,
      elapsed: this.clock.simulatedSeconds,
      player: {
        position: this.player.position,
        facing: this.player.facing,
        locomotion: this.player.locomotion,
        grounded: this.player.grounded,
        speed: this.player.speed,
      },
      camera: {
        eye: this.camera.eye,
        target: this.camera.target,
        mode: this.camera.mode,
        forward: this.camera.forward,
      },
      distanceToExit: distanceXZ(this.player.position, this.arena.exit.position),
    };
  }

  dispose(): void {
    this.physics.dispose();
  }
}
