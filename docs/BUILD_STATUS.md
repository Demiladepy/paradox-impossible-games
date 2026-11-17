# Build Status

## 17 Nov 2026 — submission prep, and the preview pane finally rendered

Four things happened today, and the third is the one that matters.

1. **Submission copy written.** `docs/SUBMISSION_DESCRIPTION.md` (paste-ready name, tagline,
   short and full description, the Lux3D pipeline write-up, verified numbers, honest limits)
   and `docs/SUBMISSION_ANALYSIS.md` (rubric-by-rubric assessment and what to spend the
   remaining time on). `docs/DEMO_SCRIPT.md` gained a read-aloud narration block.
2. **Unmade platforms got an area, not just an outline.** They were drawn as one-pixel
   `lineBasicMaterial` wireframes — the first thing video compression destroys, in the shot
   the entire demo rests on. They now carry a faint additive footprint fill, kept at 0.17
   opacity with a slow breath so it reads as a ghost rather than a floor. **Seen working.**
3. **The preview pane rendered for the first time**, so a great deal that was built-but-unseen
   is now observed: the grading and atmosphere, the generated assets under the lighting,
   trailer camera and title cards, the HUD `unmade` line, and a live **AI-designed round**
   badge with the probe's real verified time. Three distinct generated rounds appeared —
   *Eyes on the Path*, *Don't Look Down*, *Shy Steps*.
4. **Frame rate measured at last.** Medium **59.7 fps**, Low **60.5 fps**, both vsync-capped,
   on a *dev* build inside a throttled pane. Caveat found: changing quality level degrades
   performance until reload (Medium 59.7 to 50.0 after two switches). Documented, not fixed —
   the workaround is to pick a level, reload, then record.

Also: cleared the Vitest 4 `poolOptions` deprecation (suite got faster, 4.07s to 2.50s) and
named the shadow map type explicitly, since three.js removed `PCFSoftShadowMap` and was
silently falling back while warning on every boot.

Not done: the GitHub push (blocked by the sandbox, command handed to the user), the demo
recording, the report PDF, the X post.


**Updated:** 2026-11-15 · **Milestones 0–4: COMPLETE** · Remaining: live generation run,
human play-test, demo recording, submission

## Where the project stands

A complete playable run: three rounds drawn from a pack of **seven verified rounds**, rivals
racing you, a timer, pause, result cards and a run summary. Five Lux3D assets in gameplay.
Sound. Works offline.

| Check | Result |
| --- | --- |
| `npm run typecheck` | passes, 0 errors |
| `npm run test` | **116/116 passing** across 8 files |
| `npm run build` | passes |
| `npm run probe:control` | 5 rounds × 2 agents — rule-aware solves, naive fails, every time |
| `npm run probe:fallbacks` | all 7 rounds solved by the probe |
| `npm run budget` | 366k triangles (Arena 01), 202k (Arena 02) |
| Lux3D assets | 5 assets, 12 API tasks, 110.89 MB → 9.89 MB (−91%) |

## The control experiment

```
                   rule-aware agent    agent ignoring the rules
The False Floor    SOLVED  11.9s       FAILED (timed out)
Wrong Way Round    SOLVED  11.8s       FAILED (eliminated 2.5s)
Stutter            SOLVED  16.8s       FAILED (eliminated 6.5s)
Narrow Margin      SOLVED  11.8s       FAILED (timed out)
Unmade Ground      SOLVED  11.5s       FAILED (timed out)
```

Stutter's extra five seconds is the agent waiting for blinking platforms to return — the
probe plays the round rather than racing through it.

## Verified — actually run on this machine

| Check | Result |
| --- | --- |
| `npm run typecheck` | passes, 0 errors |
| `npm run test` | **109/109 passing** across 8 files |
| `npm run build` | passes — main 1,374 kB (381 kB gzip) + lazy 4,335 kB rapier chunk |
| `POST /api/challenge` | responds with a validated, probed challenge |

## Milestone 3 exit condition — met

> "A generated challenge configuration can be loaded and played without manual code changes."

A round is now a `ChallengeConfig`: which arena, which rules, what winning means, how long.
It arrives from `/api/challenge`, is turned into a `GameWorld`, and plays. The title card is
rendered from the config, the timer comes from it, and the HUD shows the rules acting.

### The validation pipeline

Four gates, cheapest first (D-018):

| Gate | Catches | Tests |
| --- | --- | --- |
| shape | zod `.strict()` — missing fields, bad types, **unexpected keys** (not silently dropped), timers out of range | 5 |
| references | unknown arena, platform the arena does not contain, unimplemented rule type, objective pointing at the wrong exit | 4 |
| sanity | contradictory gaze rules, two gravity schedules, gravity in an arena with no ceiling, duplicate rule ids | 4 |
| solvability | **play it** — an agent attempts the objective in the real simulation | 5 |

Generation runs **server-side** and validates before replying, so the browser cannot be
handed something unplayable. A rejection goes back to the model as a specific reason with
one retry; after that the fallback pack is used and the UI says so.

### The probe plays the mechanics

The agent reads the active rules: under THE FALSE FLOOR it averts its gaze and strafes,
under OBJECT_STATE it waits for the floor to return, and it refuses to step into a gap no
jump can clear. Every challenge is probed twice — once by an agent that knows the rules and
once by one that does not:

```
The False Floor    aware=SOLVED  9.3s   naive=FAILED (90s timer, waiting for ground)
Unmade Ground      aware=SOLVED 10.3s   naive=FAILED (110s timer)
```

If both passed, the rule would be inert. `npm run probe:control` reproduces this.

### Two real bugs the control test found

Neither would fail a type check; neither throws.

1. **The exemption rescued the player mid-fall.** "Never unmake the floor under your feet"
   used a geometric test, which counts a platform as supporting the instant the feet pass
   within a third of a metre — i.e. just before landing. The platform you were staring at
   turned solid and caught you, so a naive agent cleared the course as fast as a rule-aware
   one. Now keyed on vertical speed (at rest vs arriving from a jump).
2. **Gaze had to move from the camera to the character's head.** Measuring the view cone
   from the camera eye made the mechanic unplayable in third person: a third-person camera
   frames the player, so the ground beside them is always in shot and no yaw clears it.

### The fallback pack

Three hand-authored challenges, every one of them put through the full pipeline **including
the probe** in CI. A fallback that does not work is worse than none, because it fails at the
moment everything else already has.

## NOT verified

- **No live generation call has ever run.** `ANTHROPIC_API_KEY` is empty, so every path
  exercised so far is the fallback. The route, client, config-to-world pipeline and offline
  play are all verified; the request shape, the model's schema compliance and the retry loop
  are not.
- Frame rate under load — the Browser pane throttles as a background page, so no timing
  number measured through it is trustworthy.
- How any of this feels to play. The False Floor is a hard mechanic and nobody has played a
  full round of it.
- `REACH_EXIT` on Arena 02 is beyond the probe (it needs gravity timing, which the agent
  does not do). It is refused rather than guessed at, and the fallback pairs that arena with
  `SURVIVE_TIMER`.

## What "verified playable" means (D-020)

*An agent completed this configuration, in this simulation, with this seed.* An existence
proof by construction. **Not** a proof the challenge is solvable in general, and **not** a
claim a human would find it fair — the agent is handed the route, where a player must deduce
it. The briefing screen says this in as many words. The failing case is the one that earns
its keep: nobody is sent into a round that could not be finished.

## Deviations

- Raw `@dimforge/rapier3d-compat` instead of `@react-three/rapier` (D-011).
- `npm run lint` still not wired up.
- `SPATIAL_PORTAL` declared but unimplemented, by design — refused with a reason.
- Opponents are in the schema (contract fidelity) but not implemented; every challenge
  currently sets `count: 0`.
- The raw 12.95 MB platform slab remains in git history from Milestone 0.

## Commands

```
npm run dev
npm run probe:fallbacks    # how long the agent takes on each built-in challenge
npm run probe:control      # rule-aware vs naive agent — proves the mechanics bite
npm run analyze:arena      # jump reachability for an arena's authored route
npm run gen:asset      -- --prompt "..." --name x
npm run gen:character  -- --prompt "..." --name x
npm run optimize:asset [-- --max 1024]
npm run inspect:asset  [-- file.glb]
npm run relabel:clips  -- <manifest entry>
```

## Schedule

Three days to an 18 Nov feature freeze.

## Next

Milestone 4 is opponents and progression. With the time left, the higher-value work is
probably: a live generation run once a key exists, a human play-test of The False Floor, and
the submission materials (report, demo video, X post). An opponent that does not work
reliably is worth less than a demo that does.
