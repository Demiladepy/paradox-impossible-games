# Demo video

Built with the demo-video playbook's method: pick one thing, prepare an example that makes
the result obvious, write the hook around what is on screen, plan shots and words together.

---

## Step 1 — The one thing

> After watching this, someone should understand **how a platform stops existing when you
> look at it, and comes back when you look away.**

That is the whole brief. Not "how PARADOX works", not "how AI designs rounds" — **one
mechanic, demonstrated until it is obvious.**

The AI-generated-and-verified part is the *reason the mechanic is interesting*, and it gets
one line near the end. It is context, not the lesson. If you try to teach both, you teach
neither — and the generation story is much more impressive once the viewer already
understands what is being generated.

**In:** the gap run with the four conditional platforms, the HUD `unmade` line, the briefing
card, one gravity shot.
**Out:** the Asset Lab, the rule engine, the validation gates, the arena selector, anything
about architecture. All of it belongs in the written report, where a judge can read at
their own pace.

## Step 2 — Prepare the example

The platforms are only convincing if the viewer can see the *same* platform in both states.
So set the shot up deliberately:

- Stand on the **start pad**, facing down the course. All four gap-run platforms are in
  frame and visibly **outlined**, not solid.
- The HUD reads `unmade: step-01, step-02, step-03, step-04` — on-screen confirmation that
  what they are seeing is the rule, not a loading glitch.
- Turn 180°, then back. The platforms solidify and dissolve. **Do this twice**, slowly.

Run it once without recording. Check: are the outlines readable at the size people watch?
Is the HUD legible? Does the dissolve read as cause-and-effect?

Record on the **production build** (`npm run build && npm run preview`), full screen, 1080p,
sound on. Press `P` first and confirm fps is comfortably above 55, then press `P` again to
hide it.

## Step 3 — The hook

Open on the start pad with the platforms visibly missing:

> "Those platforms aren't there. They stop existing while you're looking at them."

That sentence tells the viewer exactly what to watch for, and the next five seconds deliver
it. Compare with *"Introducing PARADOX, an AI-powered 3D survival game"* — which describes
the product instead of helping anyone follow it. If you can delete a sentence and nothing
becomes harder to understand, it should not be there.

**No logo first.** The strangest thing in the game is the first frame.

---

## Step 4 — Shots and words together

About a minute. Timings are a planning aid, not a rule.

### 1 · The claim — 0:00–0:06
**On screen:** start pad, course ahead, four platforms as glowing outlines. HUD `unmade`
line visible.
**Say:** "Those platforms aren't there. They stop existing while you're looking at them."

### 2 · The proof — 0:06–0:18
**On screen:** turn away — they snap solid. Turn back — they dissolve. Twice, unhurried.
**Say:** "Look away, and the floor comes back." *(Then stop talking. Let them watch it
happen a second time in silence — the repetition is the proof, and narration over it
competes with the thing you want them to notice.)*

### 3 · The consequence — 0:18–0:30
**On screen:** walk the gap run, keeping the camera angled aside so the platforms stay
solid. Land each jump. Let one failure in if you have a clean take of it — falling through
teaches the rule faster than succeeding does.
**Say:** "So you cross ground you can't look at."

### 4 · The stakes — 0:30–0:38
**On screen:** the rival ahead on the course; close and pass them. HUD `place 1 of 2`.
**Say:** "And you're racing someone through it."

### 5 · Where the round came from — 0:38–0:48
**On screen:** cut to a briefing card. Hold long enough to read the title, the rule line,
and the verified line.
**Say:** "Every round is designed by an AI — the arena, the rules, the timer. Then the game
plays it itself, headless, before you're allowed in. If an agent can't finish it, you never
see it."

> Show the **`AI-designed round`** badge. The key is live, so this will be real. If you
> record a round from the built-in pack, that badge says `built-in round` — do not imply
> otherwise.

### 6 · One more law — 0:48–0:55
**On screen:** Arena 02. The countdown banner, gravity inverts, the contestant turns over
and lands on the ceiling. Hold on the inversion.
**Say:** "The next round, gravity doesn't stay where you left it."

### 7 · Close — 0:55–1:00
**On screen:** run summary.
**Say / caption:** "PARADOX. The arena changes. The rules change. Surviving is the only
constant."

---

---

## The narration, straight through

Every line above, in order, with nothing else. Read it once to hear the length — it should
come out around 40 seconds spoken, which leaves the rest of the minute as silence over the
footage. **The silences are deliberate.** Do not fill them.

> Those platforms aren't there. They stop existing while you're looking at them.
>
> Look away, and the floor comes back.
>
> *(say nothing — let it happen again)*
>
> So you cross ground you can't look at.
>
> And you're racing someone through it.
>
> Every round is designed by an AI — the arena, the rules, the timer. Then the game plays it
> itself, headless, before you're allowed in. If an agent can't finish it, you never see it.
>
> The next round, gravity doesn't stay where you left it.
>
> PARADOX. The arena changes. The rules change. Surviving is the only constant.

Two notes on delivery. **Slower than feels natural** — you know what is about to happen on
screen and the viewer does not, so the pace that feels right to you is too fast for them.
And **record narration separately from gameplay** if you can; trying to play the gap run
well while talking is how you get a take with a good line over a bad jump.

If you would rather not narrate at all, every one of those lines works as an on-screen
caption. Mute, caption, music underneath. A muted autoplay in a feed is the normal case,
not the exception — so make sure the video still teaches the rule with the sound off.

## Step 5 — Edit the explanation before the polish

Rough cut with screen recording and narration only. Check it makes sense *before* adding
music, transitions or captions.

- **Cut dead time, not the steps that prove it.** Trim the walk between platforms; never
  trim the moment a platform solidifies.
- **Let the result sit.** The dissolve needs about a second on screen to register. Resist
  tightening it.
- **Zoom toward the decision**, not because something moved. One push-in on a platform
  changing state is worth more than five automatic zooms.
- **Captions away from the HUD.** Bottom-left is occupied — put them top-centre or
  bottom-centre.
- **Music under the narration, not level with it.** The game's own cues (the falling pitch
  when ground is unmade) carry information — leave them audible.

## Step 6 — The next step

End on something specific and true. Pick one:

- "Source and write-up in the repo" + the link, if the repo is public.
- "Built for the Manycore Aholo hackathon with Aholo Lux3D" + the hashtag.

Do not stack "visit the site, follow, star the repo, join the community". One action.

## Step 7 — Test before posting

Watch the export on your phone, first muted, then with sound.

- **Readable?** Can you read the HUD `unmade` line at feed size? If not, zoom that shot.
- **Followable?** Can you tell what caused the platforms to change, without the narration?
- **Timed?** Does each sentence land while its subject is on screen?
- **Understood?** Show it to someone who has not seen the game. Ask what the product did.
  If they cannot explain the floor rule, the demo has not worked yet — find the moment they
  lost it and fix that shot. "Looks cool" tells you nothing.

---

## If you would rather not record by hand

**Trailer mode** (top bar → Trailer) does it for you: the probe agent plays three rounds
while a cinematic camera shoots them to a shot list, with title cards and a letterbox.
~50 seconds, hands off the keyboard.

Use it for a **trailer**, not as the demo. It shows atmosphere and variety; it does not
teach the floor rule, because nobody is deliberately turning away to make the point. The
playbook's advice applies here too — a montage impresses, an end-to-end run explains.

Best of both: record the trailer for the X post, and record the demo above for the
submission. They have different jobs.

## Recorders

- **Cap** (cap.so) — open source, Windows, Studio mode with automatic zooms.
- **OpenScreen** (getopenscreen/openscreen) — free, Windows, zooms + captions + MP4.
- **Screen Studio** — Mac only, the smoothest automatic zooms if you have access to one.

Use automatic zooms as a first pass, then delete any that pull attention off the mechanic.
