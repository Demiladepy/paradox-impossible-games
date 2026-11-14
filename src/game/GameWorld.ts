import { CameraRig, type CameraMode } from "./camera/rig.ts";
import { FIXED_TIMESTEP, FixedClock } from "./core/clock.ts";
import { distanceXZ, type Vec3 } from "./core/math.ts";
import { Rng } from "./core/rng.ts";
import {
  NO_INPUT,
  PlayerController,
  type LocomotionState,
  type PlayerInput,
} from "./player/controller.ts";
import { initPhysics, PhysicsWorld } from "./physics/world.ts";
import { platformUnderFeet } from "./arena/support.ts";
import type { ArenaDefinition } from "./arena/types.ts";
import {
  BUILT_IN_RULES,
  RuleEngine,
  type GameRule,
  type GazeView,
  type LoadReport,
  type PlayerView,
  type RuleContext,
} from "./rules/index.ts";

/**
 * The simulation.
 *
 * Plain TypeScript: no DOM, no React, no three.js. The React layer reads `snapshot()`
 * once per frame and draws it; the solvability probe drives this same class headless.
 */

export type RunStatus = "running" | "won" | "lost";

export interface PlayerSnapshot {
  position: Vec3;
  facing: number;
  locomotion: LocomotionState;
  grounded: boolean;
  speed: number;
  supportingPlatformId: string | null;
}

export interface RuleSnapshot {
  /** Platforms that currently have no collision. */
  phantom: string[];
  /** Platforms the player is currently looking at. */
  observed: string[];
  /** +1 normal, -1 when gravity is inverted. */
  upSign: number;
  warning: { message: string; secondsRemaining: number } | null;
}

export interface GameSnapshot {
  status: RunStatus;
  elapsed: number;
  player: PlayerSnapshot;
  camera: { eye: Vec3; target: Vec3; mode: CameraMode; forward: Vec3 };
  rules: RuleSnapshot;
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
  /** Overrides the arena's own rules. An empty array means "no rules at all". */
  rules?: GameRule[];
}

export class GameWorld {
  readonly arena: ArenaDefinition;
  readonly physics: PhysicsWorld;
  readonly player: PlayerController;
  readonly camera: CameraRig;
  readonly rng: Rng;
  readonly ruleEngine = new RuleEngine(BUILT_IN_RULES);

  private readonly clock = new FixedClock(FIXED_TIMESTEP);
  private status: RunStatus = "running";
  private ruleReport: LoadReport = { accepted: [], rejected: [] };

  /** Mutable views handed to rules each step — no per-step allocation. */
  private readonly playerView: PlayerView;
  private readonly gazeView: GazeView;
  private readonly ruleContext: RuleContext;
  private readonly capsuleHalf: number;

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
    this.capsuleHalf = this.player.tuning.halfHeight + this.player.tuning.radius;
    this.physics.addCharacter({
      position: arena.spawn,
      radius: this.player.tuning.radius,
      halfHeight: this.player.tuning.halfHeight,
    });

    this.camera = new CameraRig({ mode: options.cameraMode ?? "third", yaw: arena.spawnYaw });
    this.camera.reset(arena.spawnYaw, arena.spawn);

    this.playerView = {
      position: { ...arena.spawn },
      velocity: { x: 0, y: 0, z: 0 },
      grounded: false,
      supportingPlatformId: null,
    };
    this.gazeView = { origin: { ...arena.spawn }, forward: { x: 0, y: 0, z: -1 } };

    // Getters rather than a rebuilt object, so rules always read live state and the hot
    // loop allocates nothing.
    const self = this;
    this.ruleContext = {
      arena,
      get time() {
        return self.clock.simulatedSeconds;
      },
      get dt() {
        return FIXED_TIMESTEP;
      },
      get player() {
        return self.playerView;
      },
      get gaze() {
        return self.gazeView;
      },
      get effects() {
        return self.ruleEngine.effects;
      },
      setSolid: (id, solid) => self.physics.setSolid(id, solid),
      setGravity: (gravity) => self.physics.setGravity(gravity),
    };

    const rules = options.rules ?? arena.defaultRules ?? [];
    this.ruleReport = this.ruleEngine.load(rules, arena, this.ruleContext);
  }

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

  /** Which rules loaded, and why any were refused. */
  get rules(): LoadReport {
    return this.ruleReport;
  }

  /** Swap the active rule set without rebuilding the arena. */
  setRules(rules: readonly GameRule[]): LoadReport {
    this.ruleReport = this.ruleEngine.load(rules, this.arena, this.ruleContext);
    return this.ruleReport;
  }

  update(input: PlayerInput, look: LookInput, deltaSeconds: number): void {
    if (look.deltaYaw !== 0 || look.deltaPitch !== 0) {
      this.camera.look(look.deltaYaw, look.deltaPitch);
    }

    const steps = this.clock.advance(deltaSeconds);
    const effective = this.status === "running" ? input : NO_INPUT;

    for (let i = 0; i < steps; i++) {
      this.refreshRuleViews();
      // Rules run first, so the player moves through the world this step describes.
      this.ruleEngine.update(this.ruleContext);

      this.player.step(this.physics, effective, this.camera.movementBasis, FIXED_TIMESTEP);
      this.physics.step();
      this.player.syncFromPhysics(this.physics);
      this.evaluateObjective();
    }

    this.camera.update(this.player.position, Math.max(deltaSeconds, 1e-4));
  }

  private refreshRuleViews(): void {
    const upSign = this.physics.upSign;

    this.playerView.position = this.player.position;
    this.playerView.velocity = this.player.velocity;
    this.playerView.grounded = this.player.grounded;
    this.playerView.supportingPlatformId =
      platformUnderFeet(this.arena, this.player.position, this.capsuleHalf, upSign)?.id ?? null;

    // Gaze starts at the eye, because what matters is what is on screen — in third
    // person that is the camera's position, not the character's head.
    this.gazeView.origin = this.camera.eye;
    this.gazeView.forward = this.camera.forward;
  }

  private evaluateObjective(): void {
    if (this.status !== "running") return;

    const position = this.player.position;
    if (position.y < this.arena.killPlaneY) {
      this.status = "lost";
      return;
    }
    // Inverted gravity means you can fall upwards out of the arena too.
    if (this.arena.killCeilingY !== undefined && position.y > this.arena.killCeilingY) {
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
    this.physics.setGravity(this.arena.gravity);
    this.player.teleport(this.physics, this.arena.spawn, this.arena.spawnYaw);
    this.camera.reset(this.arena.spawnYaw, this.arena.spawn);
    // Re-running load resets every rule's internal schedule and latch state.
    this.ruleReport = this.ruleEngine.load(
      this.ruleReport.accepted,
      this.arena,
      this.ruleContext,
    );
  }

  snapshot(): GameSnapshot {
    const effects = this.ruleEngine.effects;
    return {
      status: this.status,
      elapsed: this.clock.simulatedSeconds,
      player: {
        position: this.player.position,
        facing: this.player.facing,
        locomotion: this.player.locomotion,
        grounded: this.player.grounded,
        speed: this.player.speed,
        supportingPlatformId: this.playerView.supportingPlatformId,
      },
      camera: {
        eye: this.camera.eye,
        target: this.camera.target,
        mode: this.camera.mode,
        forward: this.camera.forward,
      },
      rules: {
        phantom: [...effects.phantom],
        observed: [...effects.observed],
        upSign: effects.upSign,
        warning: effects.warning,
      },
      distanceToExit: distanceXZ(this.player.position, this.arena.exit.position),
    };
  }

  dispose(): void {
    this.ruleEngine.unload(this.ruleContext);
    this.physics.dispose();
  }
}
