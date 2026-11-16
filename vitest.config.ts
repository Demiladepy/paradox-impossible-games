import { defineConfig } from "vitest/config";

/**
 * Test configuration.
 *
 * The default 5 s timeout is wrong for this suite. Most of these tests run a real physics
 * simulation for tens of simulated seconds — the solvability probe plays a whole arena,
 * and the round tests play one with rivals alongside. They take a second or two on an idle
 * machine and several times that on a busy one, and a timeout failure there says nothing
 * about the code. Give them room; a genuine hang will still be caught.
 */
export default defineConfig({
  test: {
    testTimeout: 45_000,
    hookTimeout: 45_000,
    // The simulations are CPU-bound, so piling on workers makes every one of them slower.
    pool: "threads",
    poolOptions: { threads: { singleThread: false, maxThreads: 4 } },
  },
});
