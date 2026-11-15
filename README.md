# PARADOX: THE IMPOSSIBLE GAMES

**An AI-generated 3D survival game where the rules of physics change every round — and the
game plays each round itself before letting you in.**

Built for the Manycore Aholo Global 3D AI Hackathon.

---

Most generative-3D projects use AI to make assets. PARADOX asks a different question:
**what if the AI designed the laws of physics instead of the furniture?**

Every round, a model proposes a *challenge* — which arena, what is true inside it for the
next ninety seconds, what counts as winning, how long you have.

- **THE FALSE FLOOR** — platforms are solid only while you are *not* looking at them. To
  cross, turn away from the ground you are about to stand on, and trust it.
- **GRAVITY ZERO** — gravity inverts on a countdown. You finish the course on the ceiling.
- **UNMADE GROUND** — both at once, plus platforms blinking on their own clock.

Because an AI that invents physical laws will cheerfully invent an impossible one, **the
game plays every round headless before a human is allowed in.** If a scripted agent cannot
finish it, nobody is sent into it.

```bash
npm install
npm run dev
```

No API key needed — the game ships with a verified pack of rounds and plays fully offline.

---

## What's interesting here

**The opponent is the verifier.** The same agent that decides whether a round is fair
enough to play also races you through it, handicapped so it stays beatable. It clears
Arena 01 in 29.5 s against its own unhandicapped 11.9 s.

**Every round is probed twice.** Once by an agent that knows the rules, once by one that
doesn't. If both succeed, the rule is inert and the round isn't a challenge. That control
test caught two bugs no type system would:

```
The False Floor    rule-aware = SOLVED 11.9s    naive = FAILED (timed out)
Unmade Ground      rule-aware = SOLVED 11.5s    naive = FAILED (timed out)
```

**Every character and prop is Aholo Lux3D.** Text-to-3D → auto-rigging → animation
retargeting, chained, with 10 in-place clips driving each contestant. All five assets are
traceable to the prompt that made them in
[`manifest.json`](public/assets/generated/manifest.json).

**The simulation is plain TypeScript.** No DOM, no React, no three.js — which is why the
same code runs the game, the verifier, the opponents, and 109 tests in plain Node.

## What we claim, and what we don't

A passing probe means *an agent completed this configuration, in this simulation, with this
seed*. It is **not** a proof the round is solvable in general, and not a claim a human will
find it fair — the agent is handed the route, where a player must deduce it. The game says
so on its own briefing screen.

## Commands

```bash
npm run dev              # play it
npm run test             # 109 tests, including a headless agent completing an arena
npm run probe:control    # rule-aware vs naive agent — proves the mechanics actually bite
npm run probe:fallbacks  # how long the agent takes on each built-in round
npm run analyze:arena    # jump reachability for an arena's authored route
npm run inspect:asset    # what is really inside a generated GLB
npm run gen:character -- --prompt "..." --name x   # text-to-3D → rig → retarget
npm run optimize:asset   # texture pass: 110.89 MB → 9.89 MB across all assets
```

## Documents

| File | Contents |
| --- | --- |
| [`docs/REPORT.md`](docs/REPORT.md) | The project report — idea, pipeline, findings, numbers |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design and module boundaries |
| [`docs/API_INTEGRATION.md`](docs/API_INTEGRATION.md) | Verified Lux3D workflow + challenge API |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Every technical decision, with the evidence |
| [`docs/BUILD_STATUS.md`](docs/BUILD_STATUS.md) | What is verified, what is not |

## Stack

React 19 · TypeScript 5.9 · Vite 8 · three.js + React Three Fiber · raw Rapier physics ·
zod · **Aholo Lux3D** for all 3D content · Claude for challenge design · audio synthesised
in-browser.
