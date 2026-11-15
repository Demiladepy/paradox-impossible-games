import { dot, forwardFromAngles, lengthOf, normalize, sub, type Vec3 } from "../core/math.ts";
import type { ArenaDefinition, PlatformDef } from "../arena/types.ts";
import { platformSamplePoints } from "../arena/support.ts";
import { analyseRoute, surfaceY, type GapAnalysis } from "../arena/reach.ts";
import type { PlayerInput, PlayerTuning } from "../player/controller.ts";
import type { GameRule } from "../rules/types.ts";
import type { GameSnapshot } from "../GameWorld.ts";

/**
 * A scripted agent that plays an arena.
 *
 * This is the solvability probe. It follows the authored route, aims at the next platform,
 * sprints only when the reach analysis says walking cannot clear the gap, jumps when it
 * runs out of floor, and — crucially — understands the rules well enough to work *with*
 * them: under THE FALSE FLOOR it looks away from the platform it is about to cross, which
 * is exactly what a player has to do.
 *
 * What a successful run proves, stated precisely: **a competent agent completed this
 * configuration**. It does not prove every configuration is winnable, and it does not
 * prove a human could discover the trick — the agent knows the route from the arena data,
 * where a player has to work it out. We do not describe it as more than it is.
 */

/** Jump this far before the edge. Enough that take-off happens on solid ground. */
const TAKEOFF_LEAD = 0.75;

/** Considered "arrived" only when properly inside the footprint, not straddling the lip. */
const ARRIVAL_MARGIN = -0.25;

/** Grounded steps without closing on the target before we assume something is in the way. */
const STUCK_STEPS = 14;

/** Steps to wait after any jump before considering another "stuck" jump. */
const JUMP_COOLDOWN = 34;

/** Extra degrees beyond the cone's own hysteresis band when averting, for safety. */
const AVERT_MARGIN_DEGREES = 13;

/**
 * Gaze positions to try when a platform must be kept out of view, cheapest first.
 *
 * Mostly yaw, and that is not an accident. The obvious move — tilt up so the floor leaves
 * the view — backfires in third person: the camera orbits the player, so looking up swings
 * the eye *downwards*, often below the very platform being avoided, which puts it squarely
 * in frame. Turning the head sideways moves the camera around the player instead, which is
 * what actually clears a slab. The upward rungs stay at the end for first person, where the
 * eye does not move.
 *
 * Both directions are offered because one side of a course is often more crowded than the
 * other, and the agent takes the first rung that genuinely clears the platform.
 */
const AVERT_LADDER: readonly { yawOffsetDegrees: number; pitch: number }[] = [
  ...[50, -50, 70, -70, 95, -95, 125, -125, 155, -155, 180].map((yawOffsetDegrees) => ({
    yawOffsetDegrees,
    pitch: -0.12,
  })),
  { yawOffsetDegrees: 0, pitch: 0.9 },
  { yawOffsetDegrees: 40, pitch: 0.9 },
];

export interface AutopilotDebug {
  waypointIndex: number;
  target: string;
  distanceToEdge: number;
  avertingGaze: boolean;
  /** True when the agent is refusing to advance because the next gap is unjumpable. */
  blocked: boolean;
  /** True when the agent is standing by for a platform to come back. */
  waiting: boolean;
}

/** What the active rules mean for how the agent should behave. */
interface GazePolicy {
  /** Platforms that must be kept OUT of the view cone to stay solid. */
  averse: Set<string>;
  /** Platforms that must be kept IN view to exist. */
  required: Set<string>;
  /** Widest cone among the gaze rules, degrees. */
  coneDegrees: number;
  /** Widest hysteresis band among the gaze rules, degrees. */
  hysteresisDegrees: number;
}

export class Autopilot {
  private index = 0;
  private readonly byId: Map<string, PlatformDef>;
  private readonly segments: GapAnalysis[];
  private readonly capsuleHalf: number;
  private readonly gaze: GazePolicy;

  private lastJumpStep = -999;
  private step = 0;
  private stuckSteps = 0;
  private lastDistanceToEdge = 0;
  private averting = false;
  private blocked = false;
  private waiting = false;
  /** Closest we have come to the current target, for progress-based stuck detection. */
  private bestDistance = Number.POSITIVE_INFINITY;

  constructor(
    private readonly arena: ArenaDefinition,
    tuning: PlayerTuning,
    rules: readonly GameRule[] = arena.defaultRules ?? [],
  ) {
    this.byId = new Map(arena.platforms.map((p) => [p.id, p]));
    this.segments = analyseRoute(arena, tuning);
    this.capsuleHalf = tuning.halfHeight + tuning.radius;
    this.gaze = buildGazePolicy(rules);
  }

  get finished(): boolean {
    return this.index >= this.arena.route.length - 1;
  }

  get debug(): AutopilotDebug {
    return {
      waypointIndex: this.index,
      target: this.arena.route[this.index + 1] ?? "exit",
      distanceToEdge: this.lastDistanceToEdge,
      avertingGaze: this.averting,
      blocked: this.blocked,
      waiting: this.waiting,
    };
  }

  decide(snapshot: GameSnapshot, setGaze: (yaw: number, pitch: number) => void): PlayerInput {
    this.step++;
    const position = snapshot.player.position;

    this.advanceWaypointIfArrived(position, snapshot.player.grounded);

    const currentId = this.arena.route[this.index];
    const nextId = this.arena.route[this.index + 1];
    const current = currentId ? this.byId.get(currentId) : undefined;
    const next = nextId ? this.byId.get(nextId) : undefined;

    // Route complete, but arriving on the exit platform is not the same as reaching the
    // exit: the objective is a radius around a marker.
    if (!next) {
      const exit = this.arena.exit.position;
      const toExit = flatDirection(position, exit);
      const yaw = yawTowards(toExit);
      setGaze(yaw, -0.12);
      this.averting = false;

      const remaining = Math.hypot(exit.x - position.x, exit.z - position.z);
      if (remaining < 0.3) return { forward: 0, right: 0, jump: false, sprint: false };
      return {
        ...this.inputsFor(toExit, yaw),
        jump: this.jumpIfStuck(snapshot, remaining),
        sprint: false,
      };
    }

    const target: Vec3 = { x: next.position.x, y: surfaceY(next), z: next.position.z };
    const toTarget = flatDirection(position, target);

    // --- where to look ---------------------------------------------------------
    //
    // Under THE FALSE FLOOR the platform we are heading for only exists while we are NOT
    // looking at it, so the gaze swings aside and the body strafes. This is the agent
    // playing the mechanic rather than ignoring it.
    const directYaw = yawTowards(toTarget);
    this.averting = this.gaze.averse.has(next.id);
    const gaze = this.averting
      ? this.avertFrom(next, snapshot.gazeOrigin, directYaw)
      : { yaw: directYaw, pitch: -0.12 };
    setGaze(gaze.yaw, gaze.pitch);
    const yaw = gaze.yaw;

    // --- is the next platform there right now? ----------------------------------
    //
    // Under OBJECT_STATE a platform comes and goes on its own clock, and no amount of
    // looking elsewhere changes that. The only sane play is the one a person would make:
    // stand still and go when the floor is back. Only while grounded — once committed to
    // a jump there is nothing to decide.
    if (snapshot.player.grounded && snapshot.rules.phantom.includes(next.id)) {
      this.waiting = true;
      return { forward: 0, right: 0, jump: false, sprint: false };
    }
    this.waiting = false;

    // --- is this even possible? -------------------------------------------------
    //
    // Some arenas are crossed by changing the world rather than by jumping — Arena 02's
    // islands are deliberately far beyond any jump. Walking off the edge there is suicide,
    // not effort, so the agent holds its ground and lets the run play out. A REACH_EXIT
    // challenge that depends on timing a gravity flip is simply beyond this probe, and it
    // will report that as a failure rather than pretend otherwise.
    const segment = this.segments[this.index];
    this.blocked = segment ? !segment.clearableAtSprint : false;
    if (this.blocked) {
      return { forward: 0, right: 0, jump: false, sprint: false };
    }

    // --- how fast --------------------------------------------------------------
    const sprint = segment ? !segment.clearableAtWalk : false;

    // --- when to jump -----------------------------------------------------------
    const distanceToEdge = current
      ? distanceToFootprintEdge(position, current, toTarget)
      : Number.POSITIVE_INFINITY;
    this.lastDistanceToEdge = distanceToEdge;

    const rise = current ? surfaceY(next) - surfaceY(current) : 0;
    const mustClimb = rise > 0.35;

    const needsJump =
      snapshot.player.grounded &&
      this.step - this.lastJumpStep > 8 &&
      (distanceToEdge <= TAKEOFF_LEAD || (mustClimb && distanceToEdge <= TAKEOFF_LEAD + 1.4));

    const distanceToTarget = Math.hypot(target.x - position.x, target.z - position.z);
    const jump = needsJump || this.jumpIfStuck(snapshot, distanceToTarget);
    if (jump) this.lastJumpStep = this.step;

    return { ...this.inputsFor(toTarget, yaw), jump, sprint };
  }

  /**
   * Find somewhere to look that keeps `platform` out of the view cone.
   *
   * The rule tests the platform's centre and its four corners, so a slab that is wide or
   * close can clip the cone even when its centre is well off to one side — which is why a
   * fixed sideways offset was not enough. Walks a ladder of increasingly drastic gaze
   * positions and takes the first that clears every sample point, with margin.
   */
  private avertFrom(
    platform: PlatformDef,
    eye: Vec3,
    directYaw: number,
  ): { yaw: number; pitch: number } {
    // Must clear the rule's *exit* threshold (the wider, latched one), plus margin.
    const thresholdDegrees =
      (this.gaze.coneDegrees + this.gaze.hysteresisDegrees) / 2 + AVERT_MARGIN_DEGREES;
    const cosThreshold = Math.cos(degToRad(thresholdDegrees));
    const points = platformSamplePoints(platform);

    for (const candidate of AVERT_LADDER) {
      const yaw = directYaw + degToRad(candidate.yawOffsetDegrees);
      const forward = forwardFromAngles(yaw, candidate.pitch);

      let worst = -1;
      for (const point of points) {
        const offset = sub(point, eye);
        const distance = lengthOf(offset);
        if (distance < 1e-3) {
          worst = 1;
          break;
        }
        worst = Math.max(worst, dot(normalize(offset), forward));
      }

      if (worst < cosThreshold) return { yaw, pitch: candidate.pitch };
    }

    // Nothing clears it — stand on the last rung and let the run report the failure
    // rather than quietly pretending the platform is safe.
    const last = AVERT_LADDER[AVERT_LADDER.length - 1]!;
    return { yaw: directYaw + degToRad(last.yawOffsetDegrees), pitch: last.pitch };
  }

  /**
   * Convert a desired world direction into stick input relative to where we are looking.
   *
   * Movement is expressed in the camera basis, so an agent that looks one way and walks
   * another has to resolve its intent onto the forward/strafe axes — exactly what a
   * player's fingers do when they hold D while turning the mouse.
   */
  private inputsFor(direction: Vec3, yaw: number): { forward: number; right: number } {
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // Must match CameraRig.movementBasis.
    const forwardAxis = { x: -sin, z: -cos };
    const rightAxis = { x: cos, z: -sin };

    return {
      forward: direction.x * forwardAxis.x + direction.z * forwardAxis.z,
      right: direction.x * rightAxis.x + direction.z * rightAxis.z,
    };
  }

  /**
   * Walking into a riser looks exactly like walking along flat ground, except nothing
   * moves. Rather than enumerate every ledge the route might meet, notice the lack of
   * progress and jump.
   */
  private jumpIfStuck(snapshot: GameSnapshot, distanceToTarget: number): boolean {
    if (!snapshot.player.grounded) {
      this.stuckSteps = 0;
      return false;
    }

    // Progress, not speed, is the thing that matters. Keying on speed produced a loop:
    // land from a jump with no horizontal velocity, register as stuck, jump again, and
    // never spend long enough on the ground to walk anywhere. A slow rival would hop on
    // the spot two metres from the exit until the timer ran out.
    if (distanceToTarget < this.bestDistance - 0.05) {
      this.bestDistance = distanceToTarget;
      this.stuckSteps = 0;
      return false;
    }

    this.stuckSteps++;
    if (this.stuckSteps >= STUCK_STEPS && this.step - this.lastJumpStep > JUMP_COOLDOWN) {
      this.stuckSteps = 0;
      this.lastJumpStep = this.step;
      return true;
    }
    return false;
  }

  /** Snap the waypoint to whichever route platform the player is actually standing on. */
  private advanceWaypointIfArrived(position: Vec3, grounded: boolean): void {
    if (!grounded) return;
    const feet = position.y - this.capsuleHalf;

    for (let i = this.arena.route.length - 1; i > this.index; i--) {
      const id = this.arena.route[i];
      const platform = id ? this.byId.get(id) : undefined;
      if (!platform) continue;

      const insideX =
        Math.abs(position.x - platform.position.x) <= platform.size.x / 2 + ARRIVAL_MARGIN;
      const insideZ =
        Math.abs(position.z - platform.position.z) <= platform.size.z / 2 + ARRIVAL_MARGIN;
      const standingOn = Math.abs(feet - surfaceY(platform)) < 0.4;

      if (insideX && insideZ && standingOn) {
        this.index = i;
        this.stuckSteps = 0;
        this.bestDistance = Number.POSITIVE_INFINITY;
        return;
      }
    }
  }
}

/** Read the active rules to work out which platforms the gaze must avoid or seek. */
function buildGazePolicy(rules: readonly GameRule[]): GazePolicy {
  const policy: GazePolicy = {
    averse: new Set(),
    required: new Set(),
    coneDegrees: 62,
    hysteresisDegrees: 9,
  };

  for (const rule of rules) {
    if (rule.type !== "CONDITIONAL_PLATFORM") continue;

    const solidWhenObserved = rule.parameters["solidWhenObserved"] === true;
    const cone = rule.parameters["coneDegrees"];
    if (typeof cone === "number" && cone > policy.coneDegrees) policy.coneDegrees = cone;
    const hysteresis = rule.parameters["hysteresisDegrees"];
    if (typeof hysteresis === "number" && hysteresis > policy.hysteresisDegrees) {
      policy.hysteresisDegrees = hysteresis;
    }

    for (const id of rule.targetIds) {
      if (solidWhenObserved) policy.required.add(id);
      else policy.averse.add(id);
    }
  }
  return policy;
}

/** Yaw that looks along a flat direction. Matches forwardFromAngles in core/math. */
function yawTowards(direction: Vec3): number {
  return Math.atan2(-direction.x, -direction.z);
}

/** Unit direction from `from` to `to`, flattened into the XZ plane. */
function flatDirection(from: Vec3, to: Vec3): Vec3 {
  return normalize({ x: to.x - from.x, y: 0, z: to.z - from.z });
}

const degToRad = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * How far the player can travel in `direction` before leaving the platform footprint.
 * A slab-edge ray/AABB intersection in the XZ plane.
 */
function distanceToFootprintEdge(position: Vec3, platform: PlatformDef, direction: Vec3): number {
  const halfX = platform.size.x / 2;
  const halfZ = platform.size.z / 2;
  const localX = position.x - platform.position.x;
  const localZ = position.z - platform.position.z;

  let distance = Number.POSITIVE_INFINITY;

  if (Math.abs(direction.x) > 1e-6) {
    const edge = direction.x > 0 ? halfX : -halfX;
    const t = (edge - localX) / direction.x;
    if (t >= 0) distance = Math.min(distance, t);
  }
  if (Math.abs(direction.z) > 1e-6) {
    const edge = direction.z > 0 ? halfZ : -halfZ;
    const t = (edge - localZ) / direction.z;
    if (t >= 0) distance = Math.min(distance, t);
  }

  return Number.isFinite(distance) ? Math.max(0, distance) : 0;
}
