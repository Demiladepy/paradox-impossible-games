# PARADOX: THE IMPOSSIBLE GAMES

An AI-generated 3D survival game. Each round is a new arena with a new set of physical rules —
platforms that are solid only when you are not looking at them, gravity that changes direction,
a space that rearranges itself. An AI proposes each challenge; the game verifies it is playable
before letting you in.

Built for the Manycore Aholo Global 3D AI Hackathon. Characters and props are generated with
Aholo Lux3D (text-to-3D, auto-rigging, animation retargeting).

## Status

Milestone 0 — technical validation. See `docs/BUILD_STATUS.md` for what is verified, what is
unverified and what is blocked.

## Documents

| File | Contents |
| --- | --- |
| `PROJECT.md` | Product definition, scope, milestones |
| `docs/ARCHITECTURE.md` | System design and module boundaries |
| `docs/API_INTEGRATION.md` | Verified Aholo Lux3D API workflow |
| `docs/DECISIONS.md` | Technical decisions and open questions |
| `docs/BUILD_STATUS.md` | What works, what is unverified, what is blocked |
| `CLAUDE.md` | Permanent engineering instructions |

## A note on "verified solvable"

Generated challenges are checked by running the real rule engine headless and having a scripted
agent attempt the objective. That demonstrates a challenge **was completed by an agent**. It is
not a mathematical proof that every configuration is winnable, and we do not claim one.

## Setup

```bash
cp .env.example .env     # add your Lux3D Global API key
npm install
npm run dev
```
