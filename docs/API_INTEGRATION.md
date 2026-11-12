# Aholo Lux3D API Integration

Source: https://lux3d.aholo.ai/docs — read 2026-11-12. Everything below is quoted from
the official docs, not inferred. Nothing here has been executed yet (no API key on hand).

## 1. Verified facts

| Item | Value |
| --- | --- |
| Global host | `https://api.aholo.ai` |
| Global path prefix | `/global` |
| China host | `https://api.aholo3d.cn` (no prefix) — **keys are NOT interchangeable** |
| Auth header | `Authorization: <ApiKey>` — **no `Bearer` prefix** |
| Workflow | `create task -> poll task -> download result` |
| Poll interval | docs recommend every 10–15 s |
| **Result URL lifetime** | **2 hours.** Download and persist immediately. |
| Concurrency | Free account: 5 in-flight tasks. Pro: 20. Shared across all generate/rig/retarget endpoints. |
| Concurrency error code | `GENERATION_CONCURRENCY_LIMIT_EXCEEDED` (no credits consumed) |

### Envelope

Every response uses the same envelope:

```jsonc
{ "f": null, "c": "0", "m": "", "d": <payload> }
```

- `c === "0"` means **the HTTP call succeeded**, not that generation finished.
- On create, `d` is the numeric `taskid`.
- On query, `d.status`: `0` initialized, `1` running, `3` succeeded, `4` failed, `6` cancelled.
- Only read `d.outputs` when `d.status === 3`. Partial artifacts on a running task are not results.
- `NOT_REQUESTED` and `""` appear in `outputs[]` slots — they are **not** download URLs.

## 2. Endpoints we will use

| Purpose | Method | URL |
| --- | --- | --- |
| Text-to-3D | POST | `/global/lux3d/v1/generate/text-to-3d/task/create` |
| Image-to-3D | POST | `/global/lux3d/v1/generate/img-to-3d/task/create` |
| Auto-rig character | POST | `/global/lux3d/v1/animations/rig/task/create` |
| Retarget animations | POST | `/global/lux3d/v1/animations/retarget/task/create` |
| Mesh retopology | POST | `/global/lux3d/v1/mesh-retopology/task/create` |
| Query task (shared) | GET | `/global/lux3d/v1/generate/task/get?taskid=<id>` |

(Also available but not planned for MVP: material transfer, multimodal single-image,
four-view, part-splitting, multi-format export.)

### Text-to-3D request

```jsonc
{
  "prompt": "...",
  "style": "cyberpunk",          // photorealistic|cartoon|anime|hand_painted|cyberpunk|fantasy|glass
  "version": "G1-Turbo",         // REQUIRED: "G1" or "G1-Turbo"
  "faceCount": 20000,            // [10000, 300000], default 300000  <-- see §4
  "outputFormat": ["glb"],       // G1-Turbo honours this; G1 always returns ZIP+GLB
  "enablePbr": true,
  "aiPredictSize": true
}
```

- **G1**: higher quality, always returns `[ZIP, GLB]` (+PLY if asked). Use for hero assets.
- **G1-Turbo**: fast, composable, honours `outputFormat: ["glb"]`. Use for iteration and props.

### Query response (G1 example)

```jsonc
{ "f": null, "c": "0", "m": "",
  "d": { "taskId": 1859932, "status": 3,
         "outputs": [ { "content": ".../results.zip" }, { "content": ".../pbr_mesh.glb" } ] } }
```

Output order is fixed per task type. For G1/G1-Turbo the GLB is the item we want;
for G1 it is `outputs[1]`, for G1-Turbo it depends on the `outputFormat` list we sent.

### Character pipeline (this is the differentiator)

```
text-to-3D (humanoid prompt)  ->  GLB url
        |
        v
POST /animations/rig/task/create   { "modelUrl": "<that GLB url>" }
        |                           (GLB url is public for 2h, so we can chain
        v                            directly without uploading anything)
rigged GLB (model + materials + skeleton + skin)
        |
        v
POST /animations/retarget/task/create
{ "rigModelUrl": "<rigged glb>",
  "animationIds": ["Idle_Loop","Jog_Fwd_Loop","Sprint_Loop","Jump_Start","Jump_Loop","Jump_Land","Roll","Death01"],
  "animationOutputMode": "combined",   // all clips in ONE file
  "outFormat": "glb",                  // glb | fbx  -> we want glb for three.js
  "animateInPlace": true               // strips root motion; required for code-driven movement
}
```

Retarget result: `d.outputs[0].content` is a **JSON string** that must be parsed:

```jsonc
{ "actions": [ { "animation_id": "Idle_Loop", "status": "success", "animationGlbUrl": "..." },
               { "animation_id": "Swim_Fwd_Loop", "status": "failed", "error": {...} } ] }
```

Task `status=3` if **at least one** action succeeded. Per-action status must be checked.

85 animation IDs are available. The ones that matter for PARADOX:
`Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, `Jump_Start`, `Jump_Loop`,
`Jump_Land`, `Roll`, `Slide_Start/Loop/Exit`, `Death01`, `Hit_Knockback`, `Interact`, `A_TPose`.

### Caveats on the character pipeline

- Rigging "includes eligibility validation" — a generated mesh may be **rejected** as non-humanoid.
  Mitigation: prompt explicitly for a T-posed humanoid; keep a fallback character.
- A combined animation GLB may contain clips only (no skin). Milestone 0 must verify whether the
  clips can be bound to the rigged mesh via `THREE.AnimationMixer` on the rigged GLB's skeleton.
  This is the single most important unknown in the whole integration.

## 3. Where the API key lives

**The key is never shipped to the browser.** Lux3D is a *build-time* dependency, not a runtime one:

```
scripts/lux3d/*.ts   (Node, reads LUX3D_API_KEY from .env)
   -> generates, polls, downloads GLB
   -> writes public/assets/generated/<name>.glb
   -> writes public/assets/generated/manifest.json  (prompt, task id, version, date)
```

The game only ever loads static files from `public/assets/generated/`. This is forced on us by
the 2-hour URL expiry anyway, and it removes runtime latency, cost, quota and outage risk from
the demo. The manifest is also the evidence trail for the project report.

## 4. Performance constraint (important)

`faceCount` defaults to **300000**. A 300k-triangle mesh per contestant will not hold 60 fps
in a browser with several opponents on screen. Policy:

- Characters / props used in gameplay: request `faceCount: 15000–30000`.
- Hero asset shown in close-up: up to 100k, used once.
- If a generated mesh is still too heavy, run it through `/mesh-retopology/task/create`
  with a target face count (supports texture baking).
- **Never use a generated mesh as a physics collider.** Colliders are hand-authored primitives.

## 5. Minimum viable integration test (Milestone 0 exit)

1. `POST text-to-3d` with `version: "G1-Turbo"`, `outputFormat: ["glb"]`, `faceCount: 20000`.
2. Poll `task/get` every 12 s until `status === 3`.
3. Download the GLB to `public/assets/generated/`.
4. Load it with `useGLTF` in a Three.js/R3F scene and see it render.
5. Record task id + prompt in the manifest.

Then, as a stretch for the same day: run the rig + retarget chain on a humanoid prompt and
confirm an `Idle_Loop` clip plays.

## 6. Unknowns to resolve with a real key

- Actual wall-clock generation time for G1 vs G1-Turbo.
- Credit cost per task type (pricing page: https://lux3d.aholo.ai/pricing).
- Whether the retarget GLB carries the skinned mesh or clips only.
- Rigging acceptance rate for text-generated humanoids.
- Whether registration credits are enough for ~30–50 generations over the week.
