# PARADOX — Engineering Instructions

AI-generated 3D survival game for the Manycore Aholo Global 3D AI Hackathon.
**Feature freeze 18 Nov 2026. Submission 19 Nov 2026, 06:00 EST.**

`PROJECT.md` is the product source of truth. `docs/ARCHITECTURE.md` is the technical one.
Read `docs/BUILD_STATUS.md` before starting any task and update it after finishing one.

## Non-negotiable rules

1. No arbitrary code execution from model output. The LLM returns validated **data**, never code.
   No `eval`, no `new Function`, no generated expressions.
2. No network calls inside the frame loop. The LLM is called once per round, before it starts.
3. No API secrets in client code. `LUX3D_API_KEY` is read only by `scripts/` (Node).
   Anything a browser can read is public.
4. Every mechanic is deterministic: fixed timestep, seeded randomness, no `Math.random()` in
   simulation code.
5. Every challenge passes validation or the known-good fallback pack is used.
6. After a round has loaded the game must play to completion with the network unplugged.
7. Do not break the working demo to add an optional feature. The demo path is sacred.
8. Never describe something as implemented, verified or working unless it has been run.
   Mocks and stubs must be labelled as such, in code and in status updates.
9. Never claim a challenge is "provably solvable". We verify by simulation probe only
   (see `docs/ARCHITECTURE.md` §4).

## Architecture boundaries

- `src/game/**` is plain TypeScript. It must not import from `src/components/**` or
  `src/integrations/**`, must not touch the DOM, and must be runnable headless in Node.
- `src/integrations/**` is the only place that talks to a network.
- `scripts/lux3d/**` is the only place that holds the Lux3D key.
- Generated meshes are **visual only**. Colliders are always hand-authored primitives.
- Rules may only touch `RuleContext`. A rule never spawns geometry or calls out.

## Commands

```
npm run dev        # vite dev server
npm run build      # production build  -- must pass before any milestone is called done
npm run typecheck  # tsc --noEmit      -- must pass before any milestone is called done
npm run test       # vitest (game logic, schemas, validators)
npm run lint
npm run gen:asset  # scripts/lux3d  -- generate + download a Lux3D asset (needs .env)
```

## Workflow per task

Before editing: read `BUILD_STATUS.md`, inspect the existing implementation, name the exact
files you will touch, state the plan and the risks.

After editing: run typecheck, tests and build. Report what **actually** passed and failed —
paste the real output. Update `BUILD_STATUS.md`. Name the next task. Then stop.

One milestone at a time. Do not start the next milestone without review.

## Conventions

- TypeScript strict. No `any` in `src/game/**`.
- Rule modules are pure and unit-tested; UI is not.
- Assets live in `public/assets/generated/` with an entry in `manifest.json`
  (prompt, task id, version, faceCount, date). The manifest is evidence for the report —
  keep it accurate.
- Commit messages: `area: what changed`.
