# Build Status

**Updated:** 2026-11-14 · **Milestones 0, 1, 2: COMPLETE** · Next: Milestone 3 (AI challenge
generation and verification)

## Verified — actually run on this machine

| Check | Result |
| --- | --- |
| `npm run typecheck` | passes, 0 errors |
| `npm run test` | **71/71 passing** across 6 files |
| `npm run build` | passes — main 1,278 kB (354 kB gzip) + lazy 4,335 kB rapier chunk |
| `npm run analyze:arena` | 9/9 hops in Arena 01 clearable at walking speed |

## Milestone 2 exit condition — met

> "At least two mechanics work reliably in the same scene."

Both work, separately and together, with 20 tests covering them.

### THE FALSE FLOOR — `CONDITIONAL_PLATFORM`

Platforms stop existing while you look at them. Verified headless *and on screen*: with the
player facing down the course, all four gap-run platforms render as outlines and the HUD
reports `unmade: step-01, step-02, step-03, step-04`; turning 180° restores them
(`phantom: []`).

Tested: unmakes on gaze · restores on looking away · **never unmakes the platform underfoot**
· unmakes a platform observed from a different one · **does not chatter** (camera wobbling on
the cone boundary for 3 s produces ≤2 transitions).

### GRAVITY ZERO — `GRAVITY_DIRECTION`

Gravity inverts on a schedule, after a countdown. Full cycle captured live in the browser:

```
t= 6.5  y=1.40  up=+1  "GRAVITY INVERTING"   on floor-start
t= 7.9  y=7.60  up=-1                        on ceil-main
t=12.1  y=7.60  up=-1  "GRAVITY RESTORING"   on ceil-main
t=14.9  y=1.37  up=+1                        on floor-start
```

Tested: inverts on schedule and warns first · sends the player upward · lands them on the
ceiling's underside rather than losing them · **kills a player caught over a gap when gravity
restores** · holds a stable schedule over 30 s.

### Both at once

A scene running `CONDITIONAL_PLATFORM` and `GRAVITY_DIRECTION` together: both rules load,
the gaze rule still functions after the gravity rule has changed the world.

### Validation refuses bad rules — 8 tests

Unknown target ids · targeting the exit (a trigger volume, no collider) · unimplemented rule
types (`SPATIAL_PORTAL` is refused, not ignored) · unknown triggers · out-of-range numbers ·
wrong parameter types · duplicate rule ids · contradictions (a gravity warning longer than its
own interval). A rejected rule leaves the world completely untouched.

This is the foundation of Milestone 3: when the AI proposes a challenge, this layer decides
whether a player is let into it.

## Decisions closed this milestone

- **D-005 camera: third-person**, decided at its deadline. The False Floor needs a gaze you
  can aim independently of your heading; gravity inversion needs to be legible on your own
  body; and the Lux3D contestant staying on screen serves the 30% tooling criterion. Both
  modes remain behind `CameraRig`, `V` toggles.
- **D-015** rule modules parse before they apply, and loading is all-or-nothing.
- **D-016** hysteresis and the supporting-platform exemption.
- **D-017** gravity inverts along Y only, instantly, with a countdown; Arena 02's ceiling is
  continuous so inverting is always survivable.

## Arenas

| Arena | Mechanic | Notes |
| --- | --- | --- |
| `arena-01` "The Gauntlet" | THE FALSE FLOOR on the gap run | 12 platforms, 9/9 hops walkable |
| `arena-02` "Inversion" | GRAVITY ZERO | floor islands too far to jump; you cross on the ceiling |

The briefing line on the title card is generated from the rules actually loaded, not hardcoded.

## Not yet verified

- Frame rate under load. The Browser pane runs as a background page and throttles, so **no
  timing or performance number measured through it is trustworthy**. Needs a real window.
- How the False Floor *feels* to play now that it is on by default in Arena 01. It is a hard
  mechanic; whether it is hard in the good way is a question for a human.
- Arena 02 has not been played start to finish by anyone. The autopilot cannot solve it —
  crossing needs gravity timing, not jumps — so it is covered by rule tests, not an
  end-to-end run.

## Deviations

- Raw `@dimforge/rapier3d-compat` instead of `@react-three/rapier` (D-011).
- `npm run lint` still not wired up.
- `SPATIAL_PORTAL` (Round 3) declared but unimplemented, by design.
- The raw 12.95 MB platform slab remains in git history from Milestone 0.

## Commands

```
npm run dev
npm run analyze:arena
npm run gen:asset      -- --prompt "..." --name x
npm run gen:character  -- --prompt "..." --name x
npm run optimize:asset [-- --max 1024]
npm run inspect:asset  [-- file.glb]
npm run relabel:clips  -- <manifest entry>
```

## Schedule

Four days to an 18 Nov feature freeze.

## Next task — Milestone 3

1. `ChallengeConfig` schema in zod, matching PROJECT.md §6.
2. Challenge generator calling an LLM with structured output — provider still undecided
   (D-006), and it needs a server-side route so the key never reaches the browser.
3. Validation pipeline: schema → reference → constraint → **solvability probe**. The probe
   is `src/game/agent/autopilot.ts`, which already plays an arena headless.
4. A known-good fallback pack so the game is complete with no network at all.
