# Demo video — shot list

**Target: 90 seconds.** The rubric rewards a demo that makes the idea land, and judges watch
a lot of these. The product proposition has to be clear by **0:15**, not 0:60.

Record at 1920×1080, windowed, with the HUD visible. Sound on — the cues carry information
and silence reads as unfinished.

---

## 0:00 – 0:08 · The hook

**On screen:** title card, then straight into the start pad with the contestant standing,
camera looking down the course. The gap-run platforms are **outlines**, not solid.

**Voice/caption:**
> "Those platforms aren't there. They stop existing while you look at them."

Do not explain the game first. Show the strangest thing immediately.

## 0:08 – 0:20 · The mechanic, demonstrated

**Action:** turn the camera away — the platforms snap solid. Turn back — they vanish. Do it
twice, deliberately, so the causation is unmistakable. Then walk across while looking aside.

**Caption:** `look away to cross`

This is the single most important shot in the video. Rehearse it.

## 0:20 – 0:32 · It's a race

**Action:** the rival is ahead of you on the course. Catch and pass them. Let the HUD
`place 1 of 2` be visible as you do.

**Voice:**
> "You're racing a rival through it — and the rival is the same agent that verified the
> round was finishable in the first place."

## 0:32 – 0:45 · The round was designed, and checked

**Action:** cut to a briefing card. Hold long enough to read the title, the rules line, and
the verified line.

**Voice:**
> "Every round is designed by an AI: which arena, what the laws are, how long you have.
> Then the game plays it headless before you're allowed in. If an agent can't finish, you
> never see it."

If generation is live, show the `AI-designed round` badge. If running from the pack, show
the built-in badge — **do not imply it was generated when it wasn't.**

## 0:45 – 1:02 · A different law entirely

**Action:** Arena 02. The countdown banner appears, gravity inverts, the contestant turns
over and lands on the ceiling, and you run along it. Hold on the moment of inversion.

**Voice:**
> "The next round, gravity doesn't stay where you left it."

## 1:02 – 1:12 · The pipeline (for the 30%)

**Action:** quick cut to the Asset Lab — the generated contestant rotating with the skeleton
overlay on and the clip names visible.

**Voice:**
> "Every character and prop is Aholo Lux3D: text to 3D, auto-rigged, then ten animation
> clips retargeted onto it."

Optionally flash the terminal running `npm run probe:control` for two seconds. Technical
judges will notice.

## 1:12 – 1:22 · Close

**Action:** run summary screen — three rounds, times, survived count.

**Caption / voice:**
> "PARADOX. No two rounds play the same. The arena changes. The rules change.
> Surviving is the only constant."

---

## Recording notes

- **Play the run twice before recording.** The False Floor takes practice and a fumbled
  demo costs more than a re-record.
- Use the production build (`npm run build && npm run preview`) — dev-server HMR can stall a
  frame at the worst moment.
- Close other windows. A background window stealing focus can pause rendering.
- If a round goes badly mid-take, press `R` and keep going; that is cheaper than restarting
  the recording.
- Capture 10–15 seconds of extra footage of each mechanic so the edit has room.

## What not to do

- Don't open with architecture or a slide. Open with the floor disappearing.
- Don't narrate over the gravity flip — let the sound and the image carry it.
- Don't claim the challenges are "provably solvable". Say *verified by simulation*. The
  distinction is a strength: it is the thing almost nobody else will have built.
