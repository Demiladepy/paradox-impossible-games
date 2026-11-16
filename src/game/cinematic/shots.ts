import { damp, type Vec3 } from "../core/math.ts";

/**
 * Camera moves for the trailer.
 *
 * The game can film itself: the probe agent plays a round while this drives a camera that
 * has nothing to do with the player's. That separation matters — the rules read the
 * *player's* gaze to decide what is solid, so the cinematic camera must be a second,
 * purely visual camera. If it drove the gaze, pointing it at a platform would unmake the
 * floor under the agent and the trailer would film a death.
 *
 * Shots are plain data and the maths is pure, so a shot list can be reasoned about and
 * tested without a renderer.
 */

export type ShotKind = "orbit" | "track" | "dolly" | "rise" | "wide";

export interface Shot {
  kind: ShotKind;
  seconds: number;
  /** Caption shown for this shot, if any. */
  caption?: string;
  /** Big title card, for the opening and closing beats. */
  title?: string;
  /** Distance from the subject. */
  radius?: number;
  /** Height above the subject. */
  height?: number;
  /** Radians per second, for orbit. */
  speed?: number;
  /** Where the orbit begins, radians. */
  startAngle?: number;
  /** For dolly: offsets relative to the subject at the start and end of the shot. */
  from?: Vec3;
  to?: Vec3;
}

export interface ShotFrame {
  position: Vec3;
  target: Vec3;
  caption: string | null;
  title: string | null;
  /** 0 → 1 through the whole sequence, for a progress bar while recording. */
  progress: number;
}

/**
 * The trailer.
 *
 * Paced for roughly fifty seconds — long enough to show three mechanics, short enough that
 * nobody scrubs. The opening shot is deliberately the strangest thing in the game rather
 * than a logo: a contestant standing on ground that is visibly not all there.
 */
export const TRAILER_SHOTS: readonly Shot[] = [
  {
    kind: "rise",
    seconds: 6,
    title: "PARADOX",
    caption: "THE IMPOSSIBLE GAMES",
    radius: 9,
    height: 1.2,
  },
  {
    kind: "orbit",
    seconds: 7,
    caption: "THE FLOOR OBEYS YOUR GAZE",
    radius: 8.5,
    height: 3.4,
    speed: 0.26,
    startAngle: 2.1,
  },
  {
    kind: "track",
    seconds: 7,
    caption: "LOOK AWAY TO CROSS",
    radius: 7,
    height: 2.2,
  },
  {
    kind: "dolly",
    seconds: 6,
    caption: "YOU ARE NOT ALONE IN HERE",
    from: { x: -9, y: 4, z: 8 },
    to: { x: 7, y: 2.4, z: 5 },
  },
  {
    kind: "orbit",
    seconds: 7,
    caption: "GRAVITY WILL NOT STAY WHERE YOU LEFT IT",
    radius: 10,
    height: 4.5,
    speed: -0.3,
    startAngle: 0.4,
  },
  {
    kind: "wide",
    seconds: 6,
    caption: "EVERY ROUND IS DESIGNED BY AN AI",
    radius: 22,
    height: 11,
  },
  {
    kind: "track",
    seconds: 6,
    caption: "AND VERIFIED BEFORE YOU PLAY IT",
    radius: 6,
    height: 1.8,
  },
  {
    kind: "rise",
    seconds: 6,
    title: "PARADOX",
    caption: "NO TWO ROUNDS PLAY THE SAME",
    radius: 13,
    height: 5,
  },
];

export const TRAILER_SECONDS = TRAILER_SHOTS.reduce((sum, shot) => sum + shot.seconds, 0);

/** Smoothed camera state, so cuts between shots are the only hard edges. */
export class ShotDirector {
  private elapsed = 0;
  private smoothed: Vec3 | null = null;
  private smoothedTarget: Vec3 | null = null;
  private lastShotIndex = -1;

  constructor(private readonly shots: readonly Shot[] = TRAILER_SHOTS) {}

  get finished(): boolean {
    return this.elapsed >= TRAILER_SECONDS;
  }

  reset(): void {
    this.elapsed = 0;
    this.smoothed = null;
    this.smoothedTarget = null;
    this.lastShotIndex = -1;
  }

  /** `subject` is whatever the camera should be looking at — normally the player. */
  update(subject: Vec3, dt: number): ShotFrame {
    this.elapsed += dt;

    let remaining = this.elapsed;
    let index = 0;
    for (; index < this.shots.length - 1; index++) {
      const shot = this.shots[index];
      if (!shot || remaining < shot.seconds) break;
      remaining -= shot.seconds;
    }

    const shot = this.shots[index] ?? this.shots[this.shots.length - 1];
    if (!shot) {
      return { position: subject, target: subject, caption: null, title: null, progress: 1 };
    }

    const t = Math.min(1, remaining / shot.seconds);
    const raw = framePosition(shot, subject, remaining, t);

    // A cut should be instant; everything within a shot should glide.
    const cut = index !== this.lastShotIndex;
    this.lastShotIndex = index;
    if (cut || !this.smoothed || !this.smoothedTarget) {
      this.smoothed = raw.position;
      this.smoothedTarget = raw.target;
    } else {
      this.smoothed = {
        x: damp(this.smoothed.x, raw.position.x, 0.09, dt),
        y: damp(this.smoothed.y, raw.position.y, 0.09, dt),
        z: damp(this.smoothed.z, raw.position.z, 0.09, dt),
      };
      this.smoothedTarget = {
        x: damp(this.smoothedTarget.x, raw.target.x, 0.06, dt),
        y: damp(this.smoothedTarget.y, raw.target.y, 0.06, dt),
        z: damp(this.smoothedTarget.z, raw.target.z, 0.06, dt),
      };
    }

    return {
      position: this.smoothed,
      target: this.smoothedTarget,
      caption: shot.caption ?? null,
      title: shot.title ?? null,
      progress: Math.min(1, this.elapsed / TRAILER_SECONDS),
    };
  }
}

function framePosition(
  shot: Shot,
  subject: Vec3,
  elapsedInShot: number,
  t: number,
): { position: Vec3; target: Vec3 } {
  const radius = shot.radius ?? 8;
  const height = shot.height ?? 3;

  switch (shot.kind) {
    case "orbit": {
      const angle = (shot.startAngle ?? 0) + elapsedInShot * (shot.speed ?? 0.25);
      return {
        position: {
          x: subject.x + Math.cos(angle) * radius,
          y: subject.y + height,
          z: subject.z + Math.sin(angle) * radius,
        },
        target: { x: subject.x, y: subject.y + 0.9, z: subject.z },
      };
    }

    // Behind and slightly to one side, drifting across — the standard chase shot.
    case "track": {
      const drift = Math.sin(elapsedInShot * 0.45) * 2.6;
      return {
        position: { x: subject.x + drift, y: subject.y + height, z: subject.z + radius },
        target: { x: subject.x, y: subject.y + 0.9, z: subject.z - 2 },
      };
    }

    case "dolly": {
      const from = shot.from ?? { x: -8, y: 3, z: 6 };
      const to = shot.to ?? { x: 8, y: 3, z: 6 };
      const eased = t * t * (3 - 2 * t);
      return {
        position: {
          x: subject.x + from.x + (to.x - from.x) * eased,
          y: subject.y + from.y + (to.y - from.y) * eased,
          z: subject.z + from.z + (to.z - from.z) * eased,
        },
        target: { x: subject.x, y: subject.y + 0.9, z: subject.z },
      };
    }

    // Starts low and climbs, so the arena opens up beneath the camera.
    case "rise": {
      const eased = t * t;
      return {
        position: {
          x: subject.x + Math.cos(0.7) * radius,
          y: subject.y + height + eased * 6,
          z: subject.z + Math.sin(0.7) * radius,
        },
        target: { x: subject.x, y: subject.y + 1.1, z: subject.z },
      };
    }

    case "wide":
    default:
      return {
        position: { x: subject.x + radius * 0.3, y: subject.y + height, z: subject.z + radius },
        target: { x: subject.x, y: subject.y, z: subject.z - 12 },
      };
  }
}
