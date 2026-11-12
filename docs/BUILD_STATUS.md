# Build Status

**Updated:** 2026-11-12 · **Milestone:** 0 (technical validation) · **Phase:** scaffold built
and green; waiting on the API key to run the first real generation.

## Verified — actually run on this machine

- `npm run typecheck` — **passes**, zero errors (TypeScript 5.9.3, strict,
  `noUncheckedIndexedAccess` on).
- `npm run test` — **19/19 passing**. Covers the Lux3D response-envelope rules:
  `NOT_REQUESTED` and `""` rejected as URLs, unfinished tasks refused so partial artifacts are
  never read as results, GLB selection for G1 (positional) and G1-Turbo (extension-matched),
  error-JSON-in-`content` rejected, retarget action payload parsing.
- `npm run build` — **passes**. 572 modules, 1.24 MB JS (341 kB gzipped) in 1.15 s.
- Dependency set resolves cleanly on Node 22.20.0: Vite 8.3.8, @vitejs/plugin-react 6.3.0,
  React 19.3.1, three 0.187.0, R3F 9.8.2, drei 10.7.9, @react-three/rapier 2.2.0, zod 4.6.7,
  vitest 5.1.0.
- `.env` is git-ignored and confirmed absent from the index.

## Built but NOT yet exercised against the live API

Everything below compiles and is typed against the documented contract. None of it has made a
real network call, so none of it is verified:

- `scripts/lux3d/api.ts` — create/poll/get, auth header without `Bearer`, envelope unwrapping,
  concurrency-limit detection.
- `scripts/lux3d/generate.ts` — `npm run gen:asset` (text-to-3D → download → manifest).
- `scripts/lux3d/character.ts` — `npm run gen:character` (text-to-3D → rig → retarget).
- `src/components/AssetViewer.tsx` — GLB loading, triangle/bone/clip reporting, skeleton overlay.
  No GLB has been loaded through it yet.

## Open unknowns (the reason the character CLI exists)

- [ ] Does auto-rigging accept a text-generated humanoid? It runs eligibility validation.
- [ ] Does the combined retarget GLB carry the skinned mesh, or clips only?
- [ ] Wall-clock generation time for G1 vs G1-Turbo.
- [ ] Credit cost per task, and whether the week's budget covers ~30–50 generations.

## Blocked

- **The first real generation needs `LUX3D_API_KEY` in `.env`.** The file exists with an empty
  key. It must be the **Global** key — a China key will not authenticate against
  `api.aholo.ai/global`.

## Deviations from the original plan

- `npm run lint` is **not** wired up. ESLint setup was traded for build time; `typecheck` plus
  strict TS is carrying that load. Revisit only if it starts costing us.
- TypeScript 5.9.3 rather than 7.x, per the risk noted in `docs/DECISIONS.md` D-001.

## Schedule risk

The event site rendered "Today 11.13" on 2026-11-12, i.e. it is already 13 Nov in the event's
timezone. Plan against **six** days to an 18 Nov feature freeze.

## Next task

Run `npm run gen:asset` against the live API, confirm the GLB renders in the validation scene,
then run `npm run gen:character` to answer the two rigging unknowns. That closes Milestone 0.
