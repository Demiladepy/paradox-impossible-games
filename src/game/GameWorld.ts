import { CameraRig, type CameraMode } from "./camera/rig.ts";
import { FIXED_TIMESTEP, FixedClock } from "./core/clock.ts";
import { distanceXZ, type Vec3 } from "./core/math.ts";
import { Rng } from "./core/rng.ts";
import {
  NO_INPUT,
  PlayerController,
  type LocomotionState,
  type PlayerInput,
  type PlayerTuning,
} from "./player/controller.ts";
import { initPhysics, PhysicsWorld } from "./physics/world.ts";
import { platformUnderFeet } from "./arena/support.ts";
import type { ArenaDefinition } from "./arena/types.ts";
import type { ChallengeObjective } from "./challenges/schema.ts";
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

/**
 * Vertical speed below which the player counts as resting on a surface rather than
 * arriving at it. The grounded bias is 2 m/s; a jump lands at roughly 10.
 */
const RESTING_SPEED = 4;

/** Height of the eyes above the capsule's centre. */
const HEAD_OFFSET = 0.55;

/** Clearance kept between the camera and whatever it would otherwise clip into. */
const CAMERA_SKIN = 0.45;

/** Closest the camera may be pulled before the character fills the frame. */
const CAMERA_MIN_DISTANCE = 1.6;

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
  camera: {
    eye: Vec3;
    target: Vec3;
    mode: CameraMode;
    forward: Vec3;
    /** Orbit centre and boom length, so an agent can predict the eye for a given gaze. */
    pivot: Vec3;
    distance: number;
  };
  rules: RuleSnapshot;
  /** Where the gaze is measured from — the character's head. */
  gazeOrigin: Vec3;
  distanceToExit: number;
  /** Seconds left, or null when the round is untimed. */
  timeRemaining: number | null;
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
  /** What winning means. Defaults to reaching the arena's exit. */
  objective?: ChallengeObjective;
  /** Round length. Omitted means untimed, which is what the traversal tests use. */
  durationSeconds?: number;
  /** Movement tuning. Opponents run slightly handicapped versions of the player's. */
  tuning?: PlayerTuning;
  /**
   * Keep the third-person camera out of the scenery. Costs a raycast per frame, so it is
   * off unless something is actually drawing this world: the solvability probe, the
   * tests and every opponent run headless, and none of them have a camera to protect.
   */
  cameraCollision?: boolean;
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
  private readonly objective: ChallengeObjective;
  private readonly durationSeconds: number | null;
  private readonly cameraCollision: boolean;

  /** Mutable views handed to rules each step — no per-step allocation. */
  private readonly playerView: PlayerView;
  private readonly gazeView: GazeView;
  private readonly ruleContext: RuleContext;
  private readonly capsuleHalf: number;

  private constructor(arena: ArenaDefinition, options: GameWorldOptions) {
    this.arena = arena;
    this.rng = new Rng(options.seed ?? arena.id);
    this.objective = options.objective ?? { type: "REACH_EXIT", targetId: arena.exit.id };
    this.durationSeconds = options.durationSeconds ?? null;
    this.cameraCollision = options.cameraCollision ?? false;
    this.physics = new PhysicsWorld(arena.gravity, FIXED_TIMESTEP);

    for (const platform of arena.platforms) {
      this.physics.addStaticBox({
        id: platform.id,
        position: platform.position,
        size: platform.size,
      });
    }

    this.player = new PlayerController(arena.spawn, arena.spawnYaw, options.tuning);
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

  /** Returns how many fixed steps ran, so anything simulated alongside can keep lockstep. */
  update(input: PlayerInput, look: LookInput, deltaSeconds: number): number {
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
    this.clampCameraToGeometry();
    return steps;
  }

  /**
   * Keep the third-person camera out of the scenery.
   *
   * Without this the boom passes straight through platforms on the ascent and the view
   * fills with the inside of a slab — which on a demo video reads as a broken game rather
   * than a tight corner.
   */
  private clampCameraToGeometry(): void {
    if (!this.cameraCollision || this.camera.mode !== "third") {
      this.camera.obstruction = null;
      return;
    }

    const forward = this.camera.forward;
    const pivot = this.camera.pivotPoint;
    const back = { x: -forward.x, y: -forward.y, z: -forward.z };

    const hit = this.physics.castRay(pivot, back, this.camera.distance + CAMERA_SKIN);
    // Pull in short of the surface, and never closer than arm's length, or the camera
    // ends up inside the character.
    this.camera.obstruction =
      hit === null ? null : Math.max(CAMERA_MIN_DISTANCE, hit - CAMERA_SKIN);
  }

  private refreshRuleViews(): void {
    const upSign = this.physics.upSign;

    this.playerView.position = this.player.position;
    this.playerView.velocity = this.player.velocity;
    this.playerView.grounded = this.player.grounded;
    // What counts as "the floor I am standing on", for THE FALSE FLOOR's exemption.
    //
    // This needs to be exactly right, and two obvious answers are both wrong. A purely
    // geometric test counts a platform as supporting the moment the feet pass within a
    // third of a metre — which during a fall is the instant before landing, so the
    // platform you were staring at quietly turns solid and catches you, and the mechanic
    // is inert. Gating on `grounded` instead fixes that but stutters: it is an output of
    // the character controller and flickers false for a step as the player settles, which
    // is enough to unmake the ground beneath them.
    //
    // Resting is the thing we actually mean, and vertical speed says it plainly: a player
    // at rest carries the small downward bias that keeps them pressed into the floor,
    // while a player arriving from a jump is moving several times faster.
    const resting = Math.abs(this.player.velocity.y) < RESTING_SPEED;
    this.playerView.supportingPlatformId =
      resting || this.player.grounded
        ? (platformUnderFeet(this.arena, this.player.position, this.capsuleHalf, upSign)?.id ??
          null)
        : null;

    // Gaze is the character's line of sight from their own head — NOT the camera's.
    //
    // Using the camera eye seemed more honest ("what is on screen") and made THE FALSE
    // FLOOR unplayable in third person. A third-person camera's entire job is to frame the
    // player, so the ground immediately beside them is always in shot; turning away swings
    // the camera around and keeps looking straight back at the same patch of floor. There
    // is literally no yaw that clears the platform you are about to step onto.
    //
    // From the head, turning away does what it says, and it behaves identically in both
    // camera modes. The direction is still the one the player aims with the mouse.
    this.gazeView.origin = {
      x: this.player.position.x,
      y: this.player.position.y + HEAD_OFFSET * upSign,
      z: this.player.position.z,
    };
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

    // Reaching the exit wins a REACH_EXIT round at any point.
    if (this.objective.type === "REACH_EXIT") {
      const exit = this.arena.exit;
      const withinRadius = distanceXZ(position, exit.position) <= exit.radius;
      const withinHeight = Math.abs(position.y - exit.position.y) <= 2.2;
      if (withinRadius && withinHeight) {
        this.status = "won";
        return;
      }
    }

    if (this.durationSeconds === null) return;
    if (this.clock.simulatedSeconds < this.durationSeconds) return;

    // Time is up. For SURVIVE_TIMER that is the win condition; otherwise it is the loss.
    this.status = this.objective.type === "SURVIVE_TIMER" ? "won" : "lost";
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
        pivot: this.camera.pivotPoint,
        distance: this.camera.distance,
      },
      rules: {
        phantom: [...effects.phantom],
        observed: [...effects.observed],
        upSign: effects.upSign,
        warning: effects.warning,
      },
      gazeOrigin: this.gazeView.origin,
      distanceToExit: distanceXZ(this.player.position, this.arena.exit.position),
      timeRemaining:
        this.durationSeconds === null
          ? null
          : Math.max(0, this.durationSeconds - this.clock.simulatedSeconds),
    };
  }

  dispose(): void {
    this.ruleEngine.unload(this.ruleContext);
    this.physics.dispose();
  }
}
