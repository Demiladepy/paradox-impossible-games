# Submission analysis

Written 17 Nov 2026, against the published rubric. Feature freeze is tomorrow; submission
is 19 Nov, 06:00 EST. This is an assessment, not a pep talk — the useful version of this
document is the one that names the weak link.

## The rubric, weighted

| Criterion | Weight | Honest estimate | Confidence |
| --- | --- | --- | --- |
| Manycore tool usage | 30% | **26–28 / 30** | high |
| Fun / engagement | 25% | **18–21 / 25** | medium (was low — fps and visuals now verified) |
| Innovation | 20% | **17–18 / 20** | high |
| Completeness | 20% | **17–18 / 20** | high |
| Reach | 5% | **4–5 / 5** | high, if the post goes out |
| | | **≈ 82–90 / 100** | |

That spread is almost entirely one criterion. Three of the five are as good as they are
going to get. **The variance lives in Fun / engagement, and it is 25% of the grade.**

---

## Where this is genuinely strong

**Manycore tool usage — 30%, the heaviest criterion, and the best-served one.**
Most entries will call text-to-3D and show the result. This project used three endpoints as
a *pipeline*: text-to-3D → auto-rig → animation retargeting, with ten named clips driving a
real animation state machine off velocity and ground contact. There is a manifest recording
every prompt, task id, style and face count, custom scripted tooling around the API, and an
optimisation pass that cut 120.29 MB to 10.75 MB. The clip-renaming step — which refuses to
rename when the counts disagree rather than guessing — is the kind of detail that reads as
*engineering*, not *demo*. This criterion is close to maxed.

**Innovation — 20%.** "The AI generates rules rather than objects" is a genuinely different
answer to the prompt. The solvability probe is the strongest single idea in the project, and
the control experiment is better still, because it is falsifiable: it found two mechanics
that looked finished and were inert. That is a real result, not a feature list.

**Completeness — 20%.** 119 tests, typecheck and build clean, verified offline play, honest
documented limitations, and refusals where capability runs out instead of fakery. A judge who
opens the repo will find it in good order.

---

## The weak link, stated plainly

**Fun / engagement is 25% of the grade and it is the one thing nobody has verified.**

Three specific exposures:

1. ~~**The frame rate has never been measured.**~~ **Resolved, 17 Nov — and it is good news.**
   Measured with `requestAnimationFrame` in the browser: **Medium 59.7 fps and Low 60.5 fps on
   a fresh load, both vsync-capped**, in a *dev* build inside a throttled preview pane. A
   production build full-screen will be at least this good. One caveat found and documented:
   changing quality level degrades performance until reload (Medium falls 59.7 to 50.0 after
   two switches), so **pick a level, reload, then record**. Worth knowing, not worth fixing
   the day before a deadline.
2. ~~**Most of the recent visual work has never been seen running.**~~ **Resolved, 17 Nov.**
   The preview pane finally rendered. Confirmed working on screen: the atmosphere and grading,
   the generated slab and pillar assets under the lighting rhythm, the trailer's cinematic
   camera and title cards, the HUD `unmade: step-01 … step-04` line, the briefing card with a
   live **AI-designed round** badge and the probe's real verified time, and the quality
   control. Three different live-generated rounds appeared across the session — *Eyes on the
   Path*, *Don't Look Down*, *Shy Steps* — so generation variety is real, not a single
   cached response.
3. **Judges mostly watch the video.** Realistically, a large share of the fun/engagement score
   is set by a 60-second recording, not by anyone playing. Which means the video is not
   documentation of the work — for this criterion it *is* the work.

**Reach — 5%** is free and currently unclaimed. One X post with #Manycorehackathon. Do not
leave five points on the table for want of a tweet.

---

## What I would actually do with the time left

In priority order. The ordering is the point: none of the top three items is code.

1. ~~**Measure the frame rate.**~~ Done — Medium and Low hold 60. Still worth one
   confirmation pass on the production build (`npm run build && npm run preview`, press `P`)
   on the machine you record from, because that is the one configuration nobody has measured.
   Set the quality level first, **then reload**, then record.
2. **Record the demo video** to `docs/DEMO_SCRIPT.md`. One mechanic, taught until obvious.
   This is the highest-leverage remaining work by a wide margin.
3. **Post on X** with the trailer and #Manycorehackathon. Five points, ten minutes.
4. **Export the report to PDF** with the eight screenshots listed in `docs/SUBMISSION.md`.
   The brief explicitly asks for process screenshots and asset iteration comparisons —
   section 4 of the report is built for that, so do not cut it.
5. **Push the repo** and paste the URL. Bonus points, already audited clean.
6. *Only then*, if time remains: more visual polish.

**The temptation to resist** is spending tomorrow on item 6. Another lighting pass moves
fun/engagement by perhaps a point. A demo video that actually teaches the floor rule moves
it by several, and a measured 60 fps protects all of them. The project is in better shape
than its presentation — that gap is where the marks are.

---

## Does this win?

**It can place.** The honest read: this is a strong entry whose technical story is well above
the median for a hackathon of this kind, and whose risk is presentation rather than substance.
The ceiling is set by how well 60 seconds of video communicates one strange, memorable idea.

What works in its favour is that the central image is *weird and legible at a glance* — a
platform that stops existing while you look at it. That survives compression into a feed.
Plenty of competent entries will not have one memorable frame; this one does, and it is the
first frame of the video.

What works against it: two arenas, three rule mechanics, and a race against scripted rivals.
Breadth is where this is thinnest, and it is too late to fix breadth honestly. So do not try.
**Depth, demonstrated clearly, beats breadth claimed vaguely** — and the validation-plus-control
story is a depth argument no amount of extra content would replace.

One further thing worth saying out loud in the report and the video: the probe proves an agent
finished, not that a human will find it fair. Saying that unprompted reads as rigour. Judges
notice who marks their own homework honestly, and it is the cheapest credibility in the
submission.
