# Build Status

**Updated:** 2026-11-12 · **Milestone:** 0 (technical validation) · **Phase:** research complete,
awaiting approval to implement.

## Verified (evidence in hand)

- Lux3D Global API surface read from the official docs: hosts, auth header, 13 endpoints,
  async create/poll/get workflow, response envelope, status codes, concurrency limits,
  2-hour result expiry. → `docs/API_INTEGRATION.md`
- Character pipeline exists end to end: text-to-3D → auto-rig → animation retargeting,
  with 85 named animation clips including `Idle_Loop`, `Jog_Fwd_Loop`, `Jump_*`, `Roll`, `Death01`.
- `faceCount` is caller-controlled in `[10000, 300000]`, default 300000.
- Hackathon rules re-confirmed from aholo.ai/hackathon: deadline 19 Nov 06:00 EST,
  rubric 30/25/20/20/5, Lux3D mandatory, team size 1–3, required submissions =
  project report (PDF/PPT) + working demo link or video; bonus = X post (#Manycorehackathon)
  + source code link. A "Gaming Application Award" exists as a named category.
- Stack versions resolve to a mutually compatible set on Node 22.20.0. → `docs/DECISIONS.md` D-001

## Unverified (needs a real API key — blocking Milestone 0 exit)

- [ ] A Lux3D task has actually been created and completed.
- [ ] A generated GLB renders in a Three.js scene.
- [ ] Generation wall-clock time per version (G1 vs G1-Turbo).
- [ ] Credit cost per task and total budget for the week.
- [ ] Whether auto-rigging accepts a text-generated humanoid.
- [ ] Whether the retargeted "combined" GLB can drive the rigged mesh in `THREE.AnimationMixer`.

## Blocked

- Nothing is blocked. The owner confirmed a Lux3D Global API key is in hand (reminder: Global and
  China keys are not interchangeable — the key must be the Global one).
- Challenge generation still needs an LLM provider decision (`docs/DECISIONS.md` D-006), but that
  is not needed until Milestone 3.
- Repository: `Desktop\work\paradox`. Solo build. No code written yet.

## Schedule risk

The event site rendered "Today 11.13" on 2026-11-12, i.e. it is already 13 Nov in the event's
timezone. Plan against **six** working days to a 18 Nov feature freeze, not seven.

## Next task

Milestone 0, step 1: scaffold the project and run the minimum viable integration test
(`docs/API_INTEGRATION.md` §5) — one text-to-3D task, downloaded, rendering in an R3F scene.
