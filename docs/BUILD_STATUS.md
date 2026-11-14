# Build Status

**Updated:** 2026-11-14 · **Milestone 0: COMPLETE** · **Milestone 1: COMPLETE, verified end
to end** · Next: Milestone 2 (reality rule engine)

## Verified — actually run on this machine

| Check | Result |
| --- | --- |
| `npm run typecheck` | passes, 0 errors |
| `npm run test` | **51/51 passing** across 5 files |
| `npm run build` | passes — main 1,265 kB (350 kB gzip) + lazy 4,335 kB rapier chunk |
| `npm run analyze:arena` | 9/9 hops clearable at walking speed |

### End to end, headless

The autopilot plays ARENA_01 from spawn to exit with no human input, **winning in 9.4
simulated seconds**, and the run is reproducible step for step. That single test exercises
arena data, Rapier collision, the character controller, jump ballistics, the camera basis
movement is expressed in, and the objective check.

### End to end, in a real browser

Confirmed by driving the live page (synthetic key events + the dev scene handle):

- Both GLBs fetch and parse (1.4 MB and 1.9 MB, ~70 ms each); Rapier's chunk loads and its
  WASM initialises client-side.
- Input moves the player: speed ramps 0 → 3.37 → 6.20 m/s, locomotion transitions
  `fall → walk → jog` exactly as the controller defines them.
- Jumping works: the player cleared four platforms under synthetic input.
- **The skeleton animates.** Sampling `mixamorigLeftUpLeg` over time shows the bone
  rotating while idle, so `Idle_Loop` is genuinely playing — the renamed clips drive the
  rig. (Lux3D's auto-rig uses Mixamo bone naming.)
- The arena renders legibly: contestant on the start pad facing down the course, teal lips
  on the conditional platforms, the staircase and the exit beam all visible from spawn.
- `MODEL_YAW_OFFSET = Math.PI` was a correct guess — the contestant faces the right way.

Caveat: the Browser pane runs as a background page, so its frame rate is throttled and
**no timing or performance number from it is trustworthy**. Frame rate under load is still
unmeasured.

## Bugs found and fixed this session

All four were silent — none threw, and three looked like "the controls feel broken":

1. **Spawn penetration.** The capsule spawned 0.18 m inside the start pad. Rapier's
   character controller spent ~32 s resolving the overlap instead of moving; the player
   crept at ~0.3 m/s. Now `spawnClearance()` + a test.
2. **Velocity clamp ratchet.** The "am I blocked?" check used a `1e-4` absolute tolerance,
   but the controller shaves a sliver off every step for collision offset and ground
   snapping. Normal walking was read as a collision and velocity was ratcheted to a crawl.
   Now a ratio threshold.
3. **Stale position read.** `moveCharacter` only queues a kinematic translation; the body
   does not move until `world.step()`. The controller read its own position a frame early.
   Now `syncFromPhysics()` after the step.
4. **Wedge gap.** The first gap was 0.50 m against a 0.72 m body: too narrow to fall
   through, too wide to step over. Holding forward did nothing. Now flush, with
   `wedgeGaps()` guarding the class of bug.

Plus two autopilot defects worth noting, because the probe has to be trustworthy:
it sprinted gaps that walking already cleared and overshot a platform; and it compared the
capsule *centre* against a platform *surface*, so a correctly-standing agent looked 0.88 m
too high and never advanced its waypoint.

## Design change

The ascent was three 1.4 m climbs with lateral offsets — fiddly for a human and for the
agent. It is now a staircase: four even 1.0 m rises with overlapping footprints. The gap
run keeps the jumping. PARADOX should be hard because the rules are strange, not because
the geometry is fussy.

## Readability pass

The course was effectively invisible past the start pad: fog began at 26 m over a 41 m
course, and the generated obsidian is nearly black with no fill light. Fog now starts at
70 m, an ambient fill was added, platform lips were brightened, and the camera pitch was
dropped so it looks down the course rather than at the player's shoulders.

## Milestone 1 scope — all met

Application shell · 3D scene · player movement · camera controls (both perspectives behind
one `CameraRig`) · physics and collision · generated assets in gameplay · basic arena.

**Exit condition — "the player can move around a functioning 3D arena" — met and verified
both headless and on screen.**

## Deviations

- Raw `@dimforge/rapier3d-compat` instead of `@react-three/rapier` (D-011).
- `npm run lint` still not wired up.
- The raw 12.95 MB platform slab remains in git history from Milestone 0.

## Not yet verified

- Frame rate under load (the pane throttles; needs a real window).
- Whether each clip *looks* like its name beyond `Idle_Loop` — names and playback are
  proven, individual motions are not.
- How the course feels to a human now that it is visible and the spawn bug is gone.

## Commands

```
npm run dev
npm run analyze:arena                      # jump reachability for the authored route
npm run gen:asset      -- --prompt "..." --name x
npm run gen:character  -- --prompt "..." --name x
npm run optimize:asset [-- --max 1024]
npm run inspect:asset  [-- file.glb]
npm run relabel:clips  -- <manifest entry>
```

## Schedule

Four days to an 18 Nov feature freeze.

## Next task — Milestone 2

1. Rule registry and `RuleContext` (architecture §3).
2. `CONDITIONAL_PLATFORM` — THE FALSE FLOOR — on the `conditional` platforms already
   authored in ARENA_01, keyed off `camera.forward`, built on `PhysicsWorld.setSolid`.
3. `GRAVITY_DIRECTION` via `setGravity` and `setControllerUp`.
4. Decide the camera perspective for real — D-005's deadline is the end of Milestone 2.
