# PARADOX — Technical Architecture

## 1. Shape of the system

Three things run at three different times. Keeping them apart is the whole architecture.

```
BUILD TIME (Node CLI, has secrets)      GENERATION TIME (once per round)      FRAME TIME (60fps, no AI)
-------------------------------         -------------------------------       -----------------------
scripts/lux3d/generate.ts               challenge generator (LLM)             Rapier physics step
  text-to-3d / rig / retarget             -> ChallengeConfig JSON             rule engine update()
  poll -> download -> manifest          zod schema validation                 opponent FSM tick
  commits GLB into public/              solvability validation                render
                                        -> accepted | fallback pack
```

Nothing crosses these boundaries. The frame loop never calls a network. The LLM never
touches physics. The Lux3D key never reaches the browser.

## 2. Modules and ownership

```
src/
  game/
    engine/        GameLoop, scene bootstrap, fixed-timestep driver
    physics/       Rapier world, collider factories, character controller
    rules/         RuleEngine + one module per rule type (pure, deterministic)
    entities/      Player, Opponent, Platform, Exit, Hazard
    opponents/     finite state machine + navigation
    challenges/    ChallengeConfig types, loader, built-in fallback pack
    validation/    zod schemas + deterministic solvability checks
    progression/   run state, rounds, scoring, win/loss
  integrations/
    ai/            challenge generation client (calls OUR endpoint, never a vendor directly)
  components/      React UI: menu, briefing, HUD, result screens
  types/
scripts/
  lux3d/           asset generation CLI (Node only, reads .env)
public/assets/generated/   committed GLBs + manifest.json
```

**Dependency rule:** `game/*` must not import from `components/*` or `integrations/*`.
The game is a plain TypeScript simulation that React renders; it must be testable in Node
with no DOM and no network.

## 3. The Reality Rule Engine

The rule engine is the heart of the product and it is **ordinary deterministic code**.

```ts
interface RuleModule<P> {
  type: RuleType;
  validate(params: unknown, world: WorldIndex): Result<P>;   // compile-time-ish check
  init(ctx: RuleContext, params: P): void;
  update(ctx: RuleContext, params: P, dt: number): void;     // called at fixed timestep
  dispose(ctx: RuleContext): void;
}
```

`RuleContext` is the only thing a rule may touch: named bodies, the gravity vector, the
player transform/camera basis, and a timeline clock. A rule cannot spawn geometry, call a
network, or read React state.

MVP rule types:

| Type | Effect | Determinism note |
| --- | --- | --- |
| `CONDITIONAL_PLATFORM` | toggles collider solidity on an observation predicate | predicate is a dot-product test against camera forward + a hysteresis band, so it cannot chatter |
| `GRAVITY_DIRECTION` | rotates the world gravity vector on a schedule or trigger | vector is slerped over ~0.4 s; player controller re-bases its "up" |
| `SPATIAL_PORTAL` | maps an entry volume to an exit transform | cooldown per body; stretch goal only |
| `OBJECT_STATE` | enables/disables/moves a named body | the generic escape hatch |

Everything is driven from a single fixed timestep (1/60) accumulator so a replay with the
same seed and the same inputs produces the same result. That is what makes verification mean
anything.

## 4. Challenge pipeline

```
ChallengeRequest(round, difficulty, seed)
  -> LLM structured output
  -> zod parse                      (shape)
  -> reference check                (every targetId exists in the arena)
  -> constraint check               (timer bounds, rule-pair blacklist, opponent count)
  -> solvability probe              (headless sim: can a scripted agent reach the exit?)
  -> accepted  |  retry (max 2, with the failure reason fed back)  |  fallback pack
```

### Solvability probe — what it honestly is

We run the **real** simulation headless, with the real rule engine, driving a scripted agent
along a coarse waypoint graph of the arena, at an accelerated fixed timestep. If the agent
reaches the exit within the configured timer, the challenge is accepted.

This is an **existence proof by construction**, not a proof of solvability. It proves "a
competent agent completed it under these rules", not "every configuration is winnable".
We say exactly that in the UI and the report. No claim of mathematical guarantee.

Cost: the probe is a few hundred ms because it runs at a fixed timestep with no rendering.

## 5. Where the AI boundary sits

The LLM may choose: round title, briefing text, arena theme, which rule types to combine,
rule parameters within declared ranges, timer, difficulty, opponent count.

The LLM may **not**: emit code, name new rule types, address objects that do not exist,
alter a running round, or change physics constants outside the declared ranges.

Enforcement is the zod schema plus the reference and constraint checks — not prompt wording.
Unknown fields are stripped; unknown rule types are rejected outright.

## 6. Runtime failure policy

- No network call occurs after a round has loaded. A dropped connection mid-round is invisible.
- If challenge generation fails or times out (6 s), the fallback pack is used and the UI says
  "offline challenge" rather than pretending.
- All assets are local static files. The demo runs with the laptop in airplane mode.

## 7. Rendering / physics split

Three.js (via R3F) owns what is drawn. Rapier owns what is solid. They meet only in the
entity layer, which copies Rapier transforms onto Three.js objects once per frame.
Generated meshes are visual only; every collider is a primitive (cuboid/ball/capsule) or a
hand-authored convex hull.
