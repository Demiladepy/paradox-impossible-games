# Submission copy

Ready to paste. Every number here was measured on this machine; nothing is rounded up.
If you change the project after 17 Nov, re-check the numbers before pasting.

---

## Name

**PARADOX: The Impossible Games**

## Tagline (one line)

> An AI designs the laws of physics for each round — then plays the round itself, headless,
> to check a human could survive it.

Alternatives, if the form wants something shorter:

- *The floor stops existing while you look at it.*
- *Every round, new physics. Verified playable before you're let in.*

## Short description (~50 words — for a card or listing)

> PARADOX is a 3D survival race where the rules of physics change every round. One round the
> platforms stop existing while you look at them; the next, gravity turns over and you
> finish on the ceiling. An AI designs each round, and the game simulates it headless first
> to verify it can actually be finished.

## Full description

> **PARADOX: The Impossible Games** is a 3D elimination race where the laws of physics are
> not fixed. Each round, a language model designs the round itself — which arena, which
> physical laws apply, what counts as winning, how long you have. You then run that course
> against AI rivals.
>
> One round, the ground obeys your gaze: platforms dissolve while you look at them and
> solidify the instant you look away, so you cross a gap by refusing to watch where you are
> going. Another inverts gravity mid-run and you finish the course on the ceiling. A third
> blinks the floor in and out on a timer, and the only way through is to wait.
>
> **The part we are proudest of is what happens before you play.** A generated round is not
> trusted. It passes four gates, cheapest first: its shape (a strict schema — unexpected
> keys are rejected, not dropped), its references (an arena that exists, a platform that
> arena actually contains, a rule the engine actually implements), its sanity, and finally
> **solvability** — the game instantiates the round and plays it headless with an autopilot
> agent on a fixed timestep. If the agent cannot finish, the round is discarded and never
> reaches a human. The briefing card shows the probe's real completion time.
>
> We went one step further and ran a **control experiment**: every round is probed twice,
> once by an agent that understands the round's rules and once by an agent that ignores
> them. If both finish, the rule is decorative and the round is rejected. This caught two
> mechanics that looked finished and were in fact inert — a false floor that silently
> rescued the player mid-fall, and a gaze rule that could never trigger in third person
> because the camera always frames the ground beside you. No type system would have found
> either.
>
> Every character and prop in the arena was generated with **Manycore's Aholo Lux3D API**,
> through its full pipeline: text-to-3D for the arena geometry and props, automatic rigging
> for the contestants, and animation retargeting to drive them — ten clips per character,
> drawn from the API's library, renamed into the GLB at download so the game can address
> them by role instead of by index.
>
> It is built to be deterministic and offline-capable. The model is called once per round,
> before the round starts, and returns validated **data** — never code, never an
> expression to evaluate. Nothing touches the network inside the frame loop. Once a round
> has loaded you can unplug the machine and play it to completion.

## How Manycore / Aholo Lux3D was used

> Aholo Lux3D produced every piece of 3D content in the game — there is no store-bought or
> hand-modelled art in the arena.
>
> - **text-to-3D** — the platform slab the whole course is built from, the exit obelisk, the
>   arena support pillar, and the flood lamp.
> - **text-to-3D → auto-rig** — two humanoid contestants, generated from a prompt describing
>   a T-pose, then rigged by the API's `/animations/rig` endpoint into model + materials +
>   skeleton + skin.
> - **animation retargeting** — `/animations/retarget` mapped ten named clips (idle, walk,
>   jog, sprint, jump start/loop/land, roll, knockback, death) onto each rigged character.
>   Those ten clips are what the animation state machine drives off player velocity and
>   contact state.
>
> **10 Lux3D tasks across 6 assets**, every one recorded in
> `public/assets/generated/manifest.json` with its prompt, task id, style, face count and
> date, so the provenance of each asset is auditable.
>
> We wrote our own tooling around the API rather than downloading by hand: scripted
> generation and polling, a download step that rewrites animation names into the GLB (and
> *refuses* to rename when the clip counts disagree, rather than guessing), an inspector,
> and an optimisation pass. That last one mattered — the first asset we pulled was 93%
> 2K PNG textures. Compressing to 1024px WebP took the asset set from
> **120.29 MB to 10.75 MB, a 91% reduction**, with no visible loss at gameplay distance.

## Innovation, in one paragraph

> Most AI-plus-3D work generates *objects*. PARADOX generates **rules** — the behaviour of
> the world rather than the furniture in it — and then treats the model's output with the
> suspicion any untrusted input deserves. The generated round is data, validated against a
> strict schema, resolved against a closed set of implemented mechanics, and finally
> *played by a machine* before a human is allowed near it. The solvability probe and the
> naive-agent control experiment are the ideas we would keep if we had to throw everything
> else away: they turn "the AI made a level" into "the AI made a level, and here is the
> evidence it is finishable and that its rule actually does something".

## What is actually built (verified on this machine, 17 Nov 2026)

| | |
| --- | --- |
| Arenas | 2 (The Gauntlet, Inversion) |
| Rule mechanics implemented | 3 — conditional platform, gravity direction, object state |
| Rounds in the verified fallback pack | 7, all solved by the probe |
| Objectives | REACH_EXIT, SURVIVE_TIMER |
| Lux3D assets / API tasks | 6 assets, 10 tasks |
| Asset payload | 120.29 MB → 10.75 MB (−91%) |
| Tests | **119 passing** across 8 files |
| `npm run typecheck` | passes, 0 errors |
| `npm run build` | passes |
| Geometry budget | 430,294 triangles (Arena 01), 240,446 (Arena 02) |
| Offline play | verified — a loaded round completes with the network down |

## Honest limitations (say these before a judge finds them)

Stating these costs nothing and buys credibility. Every one is a refusal, not a bug:

- `SPATIAL_PORTAL` is in the rule type union and **deliberately unimplemented**. A round
  requesting it is rejected by name with a reason, not silently ignored.
- Gravity inverts along the Y axis only.
- `REACH_EXIT` on the gravity arena is beyond the probe's current agent, so it is **refused
  rather than faked**.
- The probe proves *an agent* finished the round. It does not prove a human will find it
  fair. The game says exactly that on screen, and so does the report.
- Two arenas, not a generated arena layout. The model composes rules, objectives, timers and
  parameters over hand-authored arenas — colliders are always hand-authored primitives, by
  design, because generated meshes are visual only.

## Links to supply on the form

- **Playable build** — <https://demiladepy.github.io/paradox-impossible-games/>
  (built-in verified rounds; live generation needs a server-side key)
- **Demo video** — see `docs/DEMO_SCRIPT.md`
- **Source code** — <https://github.com/Demiladepy/paradox-impossible-games>
- **Report** — `docs/REPORT.md`, exported to PDF with screenshots
- **X post** — draft in `docs/SUBMISSION.md`, must carry **#Manycorehackathon**
