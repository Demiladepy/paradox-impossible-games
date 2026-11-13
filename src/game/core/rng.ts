/**
 * Seeded pseudo-random numbers.
 *
 * `Math.random()` is banned in simulation code (CLAUDE.md rule 4). Every run carries a
 * seed so a challenge can be replayed exactly — which is what makes the solvability probe
 * meaningful and what lets us reproduce a bug from a demo.
 */

export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === "string" ? hashString(seed) : seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  /** mulberry32 — small, fast, good enough for gameplay, fully deterministic. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(minInclusive: number, maxExclusive: number): number {
    return Math.floor(this.range(minInclusive, maxExclusive));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick called with an empty array");
    return items[this.int(0, items.length)] as T;
  }

  /** Snapshot/restore so a probe can fork a run without disturbing the player's. */
  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}

export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
