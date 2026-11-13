# Build Status

**Updated:** 2026-11-13 · **Milestone 0: COMPLETE** · **Milestone 1: code complete, one
verification outstanding** · Next: Milestone 2 (reality rule engine)

## Verified — actually run on this machine

| Check | Result |
| --- | --- |
| `npm run typecheck` | passes, 0 errors |
| `npm run test` | **42/42 passing** across 4 files |
| `npm run build` | passes — main 1,265 kB (350 kB gzip) + 4,335 kB lazy rapier chunk |
| Asset optimisation | **54.24 MB → 4.68 MB (−91%)**, clips and skins intact |

### The simulation runs headless

`src/game/GameWorld.test.ts` drives the real arena in plain Node — no DOM, no renderer:

- the player settles onto the start pad rather than falling through it
- forward input moves the player towards -Z
- **determinism**: the same 180-step input script twice gives bit-identical positions
- falling past the kill plane loses the run; reaching the exit wins it
- input is ignored once the run is over; restart returns to spawn
- `setSolid(id, false)` drops the player through a platform — the primitive THE FALSE
  FLOOR is built on

This is the foundation the Milestone 3 solvability probe needs (D-011).

### The animation contract is checked against the real asset

`src/game/player/animation.test.ts` reads the shipped `contestant-01-anim.glb` and asserts
every clip the game asks for by name exists, that the clips reserved for later rounds
survive, and that **no `animation_N` aliases remain**. A pipeline regression that silently
left the contestant standing still now fails the suite.

### Asset optimisation (D-007)

| Asset | Before | After |
| --- | --- | --- |
| contestant-01-anim.glb | 20.98 MB | **1.89 MB** |
| contestant-01-rigged.glb | 20.31 MB | **1.42 MB** |
| platform-slab.glb | 12.95 MB | **1.36 MB** |

Textures resized to 1024×1024 and re-encoded as WebP; all 10 clips, the skin and the
54-node skeleton verified intact afterwards. Originals kept in `_raw/` (git-ignored).

### Confirmed in a real browser

- The app shell renders with no console errors.
- `GameWorld.create()` **resolves in the browser** — the title overlay only renders once it
  has, so Rapier's WASM initialised and the arena was built client-side.
- The lazy rapier chunk is fetched at runtime, confirming D-012 works outside the bundler.

## NOT verified — needs a human to look

**Nobody has seen the game render.** The Browser pane was hidden for this whole session and
the session was not open in any window, so the document stayed 0×0, the canvas never got a
real size, and React Three Fiber never drew a frame. No screenshot was possible.

Specifically unverified:

- [ ] The arena and the Lux3D slab platforms actually draw, and the course reads clearly.
- [ ] The contestant renders at a sensible scale and the right way round
      (`MODEL_YAW_OFFSET` in `PlayerView.tsx` assumes the model faces +Z — **a guess**).
- [ ] The retargeted clips play and look like their names. Names are proven correct; the
      *motion* is not.
- [ ] Movement feel: jump height against the authored gaps, camera follow, mouse look.
- [ ] Frame rate with ~9 slab platforms on screen.

**To check:** open the Browser pane, or run `npm run dev` and open http://localhost:5173.
Click the canvas to take control. `V` switches first/third person, `R` restarts.

Expect to find at least one thing wrong here. The model orientation in particular is a
coin-flip, and jump distances were authored by eye against tuning values, not play-tested.

## Milestone 1 scope

| Required | State |
| --- | --- |
| Application shell | done — Play / Asset Lab tabs |
| 3D scene | done, unseen |
| Player movement | done, headless-tested, unplayed |
| Camera controls | done — both perspectives behind one `CameraRig` (D-005), unseen |
| Physics and collision | done, headless-tested |
| Load the generated asset | done — slab on platforms, contestant as the player |
| Basic arena | done — ARENA_01 "The Gauntlet", 12 platforms |

**Exit condition — "the player can move around a functioning 3D arena" — is met in
simulation and unconfirmed on screen.**

## Deviations

- `@react-three/rapier` removed in favour of raw `@dimforge/rapier3d-compat` (D-011).
- `npm run lint` still not wired up.
- The raw 12.95 MB platform slab remains in git history from Milestone 0.

## Commands

```
npm run dev
npm run gen:asset      -- --prompt "..." --name x [--version G1|G1-Turbo] [--faceCount n]
npm run gen:character  -- --prompt "..." --name x
npm run optimize:asset [-- --max 1024] [-- name]
npm run inspect:asset  [-- file.glb]
npm run relabel:clips  -- <manifest entry>
```

## Schedule

Five days to an 18 Nov feature freeze.

## Next task — Milestone 2

1. Play-test Arena 01 and fix whatever the first look exposes.
2. Rule registry and `RuleContext` (architecture §3).
3. `CONDITIONAL_PLATFORM` — THE FALSE FLOOR — on the `conditional` platforms already
   authored in ARENA_01, keyed off `camera.forward`.
4. `GRAVITY_DIRECTION`, using `PhysicsWorld.setGravity` and `setControllerUp`.
5. Decide the camera perspective for real (D-005 deadline is end of Milestone 2).
