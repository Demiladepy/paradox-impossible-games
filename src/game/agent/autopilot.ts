import { normalize, type Vec3 } from "../core/math.ts";
import type { ArenaDefinition, PlatformDef } from "../arena/types.ts";
import { analyseRoute, surfaceY, type GapAnalysis } from "../arena/reach.ts";
import type { PlayerInput, PlayerTuning } from "../player/controller.ts";
import type { GameSnapshot } from "../GameWorld.ts";

/**
 * A scripted agent that plays an arena.
 *
 * Two jobs. Today it is the end-to-end test: it proves spawn-to-exit is completable by
 * something other than a human who already knows the route, exercising physics, the
 * character controller, jump ballistics, the objective check and the arena data in one
 * pass. In Milestone 3 it becomes the solvability probe — the thing that decides whether
 * an AI-proposed challenge is fair before a player is allowed into it.
 *
 * It is deliberately not clever. It follows the authored route, aims at the next
 * platform, and jumps when it runs out of floor. If a layout needs more skill than this,
 * the layout is too demanding for a first encounter with an unfamiliar rule.
 */

/** Jump this far before the edge. Enough that take-off happens on solid ground. */
const TAKEOFF_LEAD = 0.75;


/**
 * Considered "arrived" only when properly inside the footprint, not straddling the lip.
 * A positive margin let the agent tick off the exit pad while still standing on the step
 * below it, after which it walked into the riser forever.
 */
const ARRIVAL_MARGIN = -0.25;

/** Steps of near-zero speed while trying to move before we assume something is in the way. */
const STUCK_STEPS = 12;

export interface AutopilotDebug {
  waypointIndex: number;
  target: string;
  distanceToEdge: number;
  jumping: boolean;
}

export class Autopilot {
  private index = 0;
  private readonly byId: Map<string, PlatformDef>;
  /** Per-segment reachability, so speed is chosen from ballistics rather than a guess. */
  private readonly segments: GapAnalysis[];
  private lastJumpStep = -999;
  private step = 0;
  private stuckSteps = 0;

  /** Distance from the capsule's centre to its feet. */
  private readonly capsuleHalf: number;

  constructor(
    private readonly arena: ArenaDefinition,
    tuning: PlayerTuning,
  ) {
    this.byId = new Map(arena.platforms.map((p) => [p.id, p]));
    this.segments = analyseRoute(arena, tuning);
    this.capsuleHalf = tuning.halfHeight + tuning.radius;
  }

  get finished(): boolean {
    return this.index >= this.arena.route.length - 1;
  }

  get debug(): AutopilotDebug {
    return {
      waypointIndex: this.index,
      target: this.arena.route[this.index + 1] ?? "exit",
      distanceToEdge: this.lastDistanceToEdge,
      jumping: this.step - this.lastJumpStep < 3,
    };
  }

  private lastDistanceToEdge = 0;

  /**
   * Decide this step's input. Also steers the camera, because movement is expressed
   * relative to where the player is looking — the agent has to look where it is going
   * for the same reason a player does.
   */
  decide(snapshot: GameSnapshot, setYaw: (yaw: number) => void): PlayerInput {
    this.step++;
    const position = snapshot.player.position;

    this.advanceWaypointIfArrived(position, snapshot.player.grounded);

    const currentId = this.arena.route[this.index];
    const nextId = this.arena.route[this.index + 1];
    const current = currentId ? this.byId.get(currentId) : undefined;
    const next = nextId ? this.byId.get(nextId) : undefined;

    // Route complete, but arriving on the exit platform is not the same as reaching the
    // exit: the objective is a radius around a marker, and the agent lands on the pad's
    // near edge. Walk to the marker itself.
    if (!next) {
      const exit = this.arena.exit.position;
      const toExit = flatDirection(position, exit);
      setYaw(Math.atan2(-toExit.x, -toExit.z));
      const remaining = Math.hypot(exit.x - position.x, exit.z - position.z);
      if (remaining < 0.3) return { forward: 0, right: 0, jump: false, sprint: false };
      // The exit marker can sit a step above the platform the agent arrives on, so the
      // final approach needs to be able to climb too.
      return { forward: 1, right: 0, jump: this.jumpIfStuck(snapshot), sprint: false };
    }

    const target: Vec3 = { x: next.position.x, y: surfaceY(next), z: next.position.z };
    const toTarget = flatDirection(position, target);

    // Face the target. yaw 0 looks down -Z, matching forwardFromAngles.
    setYaw(Math.atan2(-toTarget.x, -toTarget.z));

    // Sprint only when walking provably cannot clear the gap. Sprinting a gap that
    // walking already clears is how the agent overshot a 3 m platform and fell off it.
    const segment = this.segments[this.index];
    const sprint = segment ? !segment.clearableAtWalk : false;

    const distanceToEdge = current
      ? distanceToFootprintEdge(position, current, toTarget)
      : Number.POSITIVE_INFINITY;
    this.lastDistanceToEdge = distanceToEdge;

    const rise = current ? surfaceY(next) - surfaceY(current) : 0;
    const mustClimb = rise > 0.35;

    // Jump when about to run out of floor, or when the next surface is a step up that
    // walking into will not clear.
    const needsJump =
      snapshot.player.grounded &&
      this.step - this.lastJumpStep > 8 &&
      (distanceToEdge <= TAKEOFF_LEAD || (mustClimb && distanceToEdge <= TAKEOFF_LEAD + 1.4));

    const jump = needsJump || this.jumpIfStuck(snapshot);
    if (jump) this.lastJumpStep = this.step;

    return { forward: 1, right: 0, jump, sprint };
  }

  /**
   * Walking into a riser looks exactly like walking along flat ground, except nothing
   * moves. Rather than enumerate every ledge the route might meet, notice the lack of
   * progress and jump.
   */
  private jumpIfStuck(snapshot: GameSnapshot): boolean {
    if (!snapshot.player.grounded) {
      this.stuckSteps = 0;
      return false;
    }
    this.stuckSteps = snapshot.player.speed < 0.6 ? this.stuckSteps + 1 : 0;
    if (this.stuckSteps >= STUCK_STEPS && this.step - this.lastJumpStep > 8) {
      this.stuckSteps = 0;
      this.lastJumpStep = this.step;
      return true;
    }
    return false;
  }

  /**
   * Snap the waypoint to whichever route platform the player is actually standing on.
   *
   * Scanning backwards from the end rather than only testing the next waypoint means an
   * overshoot counts as progress. The earlier version compared the capsule's centre to
   * the platform *surface*, so a player resting correctly looked 0.88 m too high and the
   * agent spent a minute jumping on the spot trying to reach a platform it had passed.
   */
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
        return;
      }
    }
  }
}

/** Unit direction from `from` to `to`, flattened into the XZ plane. */
function flatDirection(from: Vec3, to: Vec3): Vec3 {
  return normalize({ x: to.x - from.x, y: 0, z: to.z - from.z });
}

function distanceToFootprintEdge(
  position: Vec3,
  platform: PlatformDef,
  direction: Vec3,
): number {
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
