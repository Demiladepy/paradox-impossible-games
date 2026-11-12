# Build Status

**Updated:** 2026-11-12 · **Milestone 0: COMPLETE** · Next: Milestone 1 (playable foundation)

## Milestone 0 exit condition — met

> "A real Lux3D-generated asset renders correctly inside the project."

Three assets generated through the live Global API and rendering in the validation scene.

## Verified — actually run on this machine

| Check | Result |
| --- | --- |
| `npm run typecheck` | passes, 0 errors (TS 5.9.3 strict, `noUncheckedIndexedAccess`) |
| `npm run test` | **27/27 passing** across 2 files |
| `npm run build` | passes — 572 modules, 1.24 MB JS (341 kB gzip), 2.7 s |
| Lux3D auth | `GET task/list` → HTTP 200, `c:"0"` — key valid against `api.aholo.ai/global` |

### Live API results

| Task | Endpoint | Time | Outcome |
| --- | --- | --- | --- |
| `6929533` | text-to-3D `G1-Turbo` | **104 s** | platform-slab, 18,272 tris, 12.95 MB |
| `6929612` | text-to-3D `G1` | **336 s** | contestant mesh, 30k faces requested |
| `6929848` | auto-rig | **59 s** | **accepted** a text-generated humanoid; 54 nodes, 1 skin |
| `6929908` | retarget, 10 clips | **17 s** | **10/10 delivered**, combined in-place GLB |

**G1 is 3.2× slower than G1-Turbo** (336 s vs 104 s). Use Turbo for iteration; reserve G1 for
assets that will be seen in close-up.

### Open unknowns from Milestone 0 — now answered

- **Does auto-rigging accept a text-generated humanoid?** **Yes.** First attempt, 59 s, no
  retries. Prompting for an explicit T-pose with separated limbs appears to have been enough.
- **Does the combined retarget GLB carry the skin or clips only?** **It carries everything** —
  mesh, skeleton and all 10 clips in one file. See D-010.
- **Wall-clock generation time?** Measured, table above.
- [ ] **Credit cost per task** — still unknown. 4 tasks spent; no usage figure surfaced.

### New findings (all recorded as decisions with measurements)

- **D-007** — 93% of an asset's bytes are 2K PNG textures. Geometry is ~7%. An optimisation
  pass is the first Milestone 1 task.
- **D-008** — `aiPredictSize` scaled an arena floor tile to 0.30 units. Use `customSize` for
  gameplay geometry.
- **D-009** — retargeted clips arrive as `animation_1…N`; renamed positionally on download,
  with duration evidence for why that ordering is trusted.
- **D-010** — ship the animation GLB only; the rigged GLB is the rig master and its source URL
  has expired.

## Built but NOT yet verified

- Visual confirmation that each renamed clip *looks* like its name when played. The container
  round-trip is unit-tested and the file re-parses, but the browser pane was unavailable, so
  nobody has watched `Death01` play. First thing to check when the Browser pane is open.
- `src/game/**` does not exist yet. No engine, no rules, no physics. Milestone 1.

## Deviations

- `npm run lint` is **not** wired up; `typecheck` plus strict TS carries that load.
- TypeScript 5.9.3 rather than 7.x (D-001).
- The raw 12.95 MB platform slab is in git history. After the texture pass assets should commit
  at roughly 1 MB; this one blob is the cost of the lesson and is not worth rewriting history.

## Commands

```
npm run gen:asset      -- --prompt "..." --name x [--version G1|G1-Turbo] [--faceCount n]
npm run gen:character  -- --prompt "..." --name x     # text-to-3D -> rig -> retarget
npm run inspect:asset  [-- file.glb]                  # triangles, textures, clips, durations
npm run relabel:clips  -- <manifest entry>            # rewrite animation_N -> real clip names
```

## Schedule

Six days to an 18 Nov feature freeze (the event site rendered "Today 11.13" on 12 Nov).

## Next task — Milestone 1

1. Texture optimisation pass in the asset pipeline (D-007). Everything downstream depends on it.
2. Arena scene, player movement, camera rig with both perspectives behind one interface (D-005).
3. Rapier physics and primitive colliders; the contestant GLB driven by its real clips.
