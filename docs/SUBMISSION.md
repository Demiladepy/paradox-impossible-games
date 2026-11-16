# Submission checklist

**Deadline: 19 November 2026, 06:00 EST** (12:00 Nigeria time). Feature freeze 18 Nov.

## Required

- [ ] **Project report (PDF or PPT).** Content is written: `docs/REPORT.md`. Export it to
      PDF with screenshots inserted at the marks below. The brief explicitly asks for
      *process screenshots and comparisons of key asset iterations* — section 4 is built
      around exactly that, so do not cut it.
- [ ] **Working demo (link or video).** Shot list: `docs/DEMO_SCRIPT.md`. Must contain
      footage of the real thing running — not concept art.

## Bonus (both cheap, take both)

- [ ] **X post** using **#Manycorehackathon**. Draft below. Keep it public until results.
- [ ] **Source code link.** Push the repo and submit the URL.

---

## Screenshots to capture

Run `npm run dev`, then take these. They carry the report.

1. **The False Floor, mid-effect** — stand on the start pad looking down the course so the
   gap-run platforms render as outlines, with the HUD showing `unmade: step-01 … step-04`.
   *This single image explains the whole game.*
2. **Looking away** — same spot, turned 180°, platforms solid again. Pair it with (1)
   side by side.
3. **The race** — a rival ahead of you on the course, HUD showing `place 2 of 2`.
4. **Gravity inverted** — standing on the ceiling in Arena 02, HUD `gravity: inverted`,
   with the countdown banner visible if you can time it.
5. **A briefing card** — showing the round title, the rules line, and the
   *"Verified playable — an agent completed this round in X s"* line.
6. **Asset Lab** — the generated contestant with the skeleton overlay on and the clip list
   visible. This is the proof the Lux3D rig pipeline worked.
7. **Terminal: `npm run probe:control`** — five rounds, two agents, rule-aware solves and
   naive fails every time. Technical judges will care about this more than any screenshot
   of the game.
8. **Terminal: `npm run inspect:asset`** — before/after the optimisation pass, for §4.

---

## X post draft

> I built PARADOX for the #Manycorehackathon: an AI-generated 3D survival game where the
> rules of physics change every round.
>
> One round the platforms stop existing while you look at them. The next, gravity turns
> over and you finish the course on the ceiling.
>
> The part I like most: an AI proposes each round's laws — and the game plays it headless
> first to check a human could actually finish. If the agent can't, nobody gets sent in.
>
> Every character and prop is @ManycoreTech Aholo Lux3D: text-to-3D → auto-rigging →
> animation retargeting, 10 clips driving each contestant.
>
> [video]

Alternative, shorter opener if the thread needs one line:

> What if an AI designed the *physics* instead of the furniture?
>
> PARADOX: every round, new rules. The floor obeys your gaze. Gravity changes its mind.
> And the game verifies each round is finishable before it lets you in. #Manycorehackathon

Notes: `@ManycoreTech` is their X handle — check it before posting. Lead with the video;
the first three seconds decide whether anyone watches.

---

## Check frame rate before you record

This is the one thing that was never measurable during development — the preview pane runs
as a background page and throttles, so every timing number taken through it is worthless.
The game now carries the instrument instead.

Press **P** in game. You get fps, triangles and draw calls straight off the renderer.

Measured geometry budget (`npm run budget`):

| Arena | Slabs | Scenery | Lamps | Characters | Total |
| --- | --- | --- | --- | --- | --- |
| The Gauntlet | 200,992 | 89,572 | 63,800 | 75,930 | **430,294** |
| Inversion | 73,088 | 53,148 | 38,280 | 75,930 | **240,446** |

On top of that the scene now carries a post pass (bloom, grade, vignette, SMAA), five
point lights, and ~900 drifting motes. All three are worth their cost visually, and all
three are the first things to trade if the machine you record on struggles.

**If fps sits below 55**, you no longer need to touch code. The game has a quality
control, bottom-right beside the sound toggle:

| Level | dpr | Shadows | Lamps | Motes | SMAA | Bloom |
| --- | --- | --- | --- | --- | --- | --- |
| High | 1.75 | 2048 | 5 | 900 | yes | yes |
| Medium | 1.35 | 1024 | 3 | 450 | no | yes |
| Low | 1.0 | 512 | 2 | 200 | no | yes |

The order is deliberate: shadow resolution and supersampling go first because neither is
something a viewer notices in motion, then point lights, which are the most expensive
thing in the scene — every material evaluates all of them per fragment. **Bloom survives
to the bottom**, because losing it undoes most of the visual gain.

Press **P** for fps. If it drops under 50 the game says so and names the level to try.
Your choice is remembered, and the Trailer inherits it.

## Pre-submission verification

Run these and confirm each passes before freezing:

```bash
npm run typecheck && npm run test && npm run build
```

```bash
npm run probe:control
```

```bash
npm run analyze:arena
```

```bash
npm run budget
```

Then play one complete run start to finish on the production build (`npm run preview`), on
the machine you will record from.

---

## Known gaps to mention honestly if asked

- `REACH_EXIT` on the gravity arena is beyond the probe; it is refused, not faked.
- Gravity inverts along Y only.
- `SPATIAL_PORTAL` is declared and unimplemented — refused by name.
- The probe proves *an agent* finished, not that a human will find it fair. The game says
  so on screen; say the same in the report and the video. It reads as rigour, not weakness.
