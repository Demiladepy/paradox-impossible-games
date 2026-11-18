# Submission checklist

**Deadline: 19 November 2026, 06:00 EST** (12:00 Nigeria time). Feature freeze 18 Nov.

## The submission form, field by field

What the form actually asks for, and what to put in each box.

### Required (0/4 until these are in)

**1. Working demo / promotional video** — *choose one method.*
Upload the video file. The form accepts "a working version" *or* "a demo video showing the
actual project running", and a video is the safer of the two: a hosted link is one dead
dev server away from scoring zero. Record Trailer mode, which now opens with the teaching
beat that demonstrates the gaze rule hands-off.

> The form says "Recommended: Submit a ModelScope Studio link." ModelScope Studios host
> Gradio and Streamlit apps; this is a static WebGL build with a small Node endpoint, so it
> is not a natural fit and is not worth discovering that the night before the deadline.
> **Take the video.** If there is spare time afterwards, a static deploy link can go in as
> well — but the video is what gets graded.

**2. Project report** — upload **`docs/PARADOX-report.pdf`**.
Built by `npm run report` from `docs/REPORT.md`. Drop the eight screenshots listed below
into `docs/report-assets/` and run it again; each one renders as a labelled placeholder
until its file is there, so nothing goes missing quietly.

**3. Ecosystem devices and technologies used** — select **None**.
Insta360, DEEP Robotics and WorkBuddy were not used. Claiming otherwise is the kind of
thing that unravels under one question.

**4. Application tracks** — select **Gaming Application Award** and **Film & TV Application
Award**.

- *Gaming* is the primary and is not in doubt.
- *Film & TV* is a genuine second rather than padding: Trailer mode is a shot director — a
  typed shot list, a cinematic camera independent of the player's, scripted title cards and
  a staged demonstration beat — and the game films itself with no operator. That is an AI
  3D application to filmed content, which is what the track is for.
- Skip Spatial Design, 3D Printing and Embodied AI. Nothing here is an honest fit, and a
  scattershot entry reads worse than a focused one.

If you would rather be narrow, **Gaming alone is the safe answer.**

### Bonus (both worth taking)

- **Social media post link** — copy in `docs/X_POST.md`. One post, `#Manycorehackathon`,
  video native, link in a reply.
- **Source code** — `https://github.com/Demiladepy/paradox-impossible-games` *(done)*.

---

## Companion documents

- **`SUBMISSION_DESCRIPTION.md`** — paste-ready copy: name, tagline, short and full
  description, how Lux3D was used, innovation paragraph, verified numbers, honest limits.
- **`SUBMISSION_ANALYSIS.md`** — rubric-by-rubric assessment, the weak link, and what to
  spend the remaining time on. Read this one before deciding what to build next.
- **`DEMO_SCRIPT.md`** — the video: one mechanic, shot list, narration.

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

## The AI badge should say "AI-designed round"

With a key in `.env`, `npm run dev` now generates live rounds — the badge on the briefing
card reads **AI-designed round** and the verified line shows the probe's real time. If it
says *built-in round*, the key is not reaching the server; check `.env` and restart the
dev server.

## Frame rate — measured 17 Nov 2026

It is no longer an unknown. Measured in the browser with `requestAnimationFrame`, on a
**dev build inside the preview pane** (which throttles), canvas 1280x674 CSS at dpr 1.5:

| Level | Drawing buffer | fps, fresh load |
| --- | --- | --- |
| Medium | 1728 x 909 | **59.7** (vsync cap) |
| Low | 1280 x 674 | **60.5 / 59.6** |
| High | 1920 x 1011 | not measured fresh; in-game badge read 35 during trailer playback |

**Medium and Low are vsync-capped even in a dev build in a throttled pane.** A production
build full-screen will be at least this good. The quality control works, and the in-game
badge correctly flags a low reading and names the level to try.

### One real caveat — pick a quality, then reload

Changing quality level degrades performance until the page is reloaded. Measured on the
same scene, pane visible throughout:

```
Medium, fresh load .................. 59.7 fps
Low, after one switch ............... 60.5 fps
Medium, after two switches .......... 50.0 fps   <-- same settings, 16% slower
after heavy switching + trailer ..... ~30 fps
```

Something in the quality change is not fully released — most likely render targets or
shader programs behind the effect composer. It is **not** worth fixing the day before a
deadline, because the workaround is complete and free:

> **Pick the quality level you want, reload the page, then start recording.**

The choice is remembered in `localStorage`, so it survives the reload. Do not click
through the levels mid-recording.

Press **P** in game for fps, triangles and draw calls off the renderer.

Measured geometry budget (`npm run budget`):

| Arena | Slabs | Scenery | Lamps | Characters | Total |
| --- | --- | --- | --- | --- | --- |
| The Gauntlet | 200,992 | 89,572 | 63,800 | 75,930 | **430,294** |
| Inversion | 73,088 | 53,148 | 38,280 | 75,930 | **240,446** |

| Level | dpr | Shadows | Lamps | Motes | SMAA | Bloom |
| --- | --- | --- | --- | --- | --- | --- |
| High | 1.75 | 2048 | 5 | 900 | yes | yes |
| Medium | 1.35 | 1024 | 3 | 450 | no | yes |
| Low | 1.0 | 512 | 2 | 200 | no | yes |

The order is deliberate: shadow resolution and supersampling go first because neither is
something a viewer notices in motion, then point lights, which are the most expensive thing
in the scene. **Bloom survives to the bottom**, because losing it undoes most of the visual
gain.

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
