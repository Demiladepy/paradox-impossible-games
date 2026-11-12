# PARADOX: THE IMPOSSIBLE GAMES

**Project type:** AI-powered 3D survival game
**Hackathon:** Manycore Aholo Global 3D AI Hackathon
**Development window:** 12–18 November 2026
**Submission deadline:** 19 November 2026, 06:00 EST
**Primary 3D platform:** Aholo Lux3D (mandatory for all entries)

This is the product source of truth. Technical detail lives in `docs/ARCHITECTURE.md`;
permanent engineering rules live in `CLAUDE.md`.

---

## 1. Executive summary

PARADOX is an AI-generated 3D survival competition. Every round presents a new arena, a set of
unusual physical rules, interactive objects and competing entities. The player must work out how
the environment behaves, adapt, and survive.

> What if an AI could design a new survival game every time you entered the arena, while
> keeping the game fair, understandable and possible to win?

The product is not "AI generates a 3D scene". It is **AI changing the conditions under which a
player must survive inside that scene** — and the game verifying the result is playable before
letting the player in.

### Core loop

Generate → Explain → Enter → Discover → Compete → Survive → Progress

### What the project must demonstrate end to end

Generate a world → generate its contestants and objects → impose unusual physical rules →
verify the challenge is solvable → let the player compete inside it.

## 2. Locked strategic decisions

1. PARADOX is a **playable survival competition**, not a general-purpose world builder.
2. **Lux3D-generated assets must appear in actual gameplay** — contestants, obstacles, arena
   elements, interactive props. An asset that never appears in the playable build does not count.
3. The simulation is **deterministic**. AI proposes; ordinary game code owns physics, collisions,
   timers, scoring and win conditions.
4. Challenge generation is **constrained by verification**. An impressive but uncompletable
   challenge is a broken game, not innovation.
5. **One polished vertical slice first.** Three rounds is the target; one stable round is the
   first milestone.

## 3. Hackathon facts (verified 2026-11-12 from aholo.ai/hackathon)

| Criterion | Weight | Our response |
| --- | --- | --- |
| Use of Manycore Tech's tools | 30% | Lux3D-generated characters and props are the things you look at and interact with; the character pipeline uses text-to-3D, auto-rigging and animation retargeting |
| Fun and engagement | 25% | Short, tense, legible survival rounds |
| Innovation | 20% | AI-proposed physical rules, validated before play |
| Completeness | 20% | Reliable demo, runs offline, materials match reality |
| Reach | 5% | Public X post using #Manycorehackathon |

- Required submissions: **project report (PDF or PPT)** with process screenshots and asset
  iteration comparisons, and a **working demo link or video** containing footage of the real
  project running.
- Bonus submissions: **X post** with the hashtag, and a **source code link**. Both are cheap; do both.
- Team size 1–3 (solo participants still register a team). Roster locks at the deadline.
- Lux3D is required. Aholo API, LuxReal and third-party tools are optional.
- Target category: **Gaming Application Award**, with Technical Excellence as a secondary aim.

## 4. The rounds

Proposed mechanics. Implement the simplest reliable version that delivers the experience.

### Round 1 — THE FALSE FLOOR

Platforms are solid only while the player is **not** looking at them. Reach the exit before the
timer expires. Needs: platform state controller, gaze test against the camera basis, collider
toggling, unmistakable visual state feedback, exit trigger, timer.

### Round 2 — GRAVITY ZERO

Gravity changes direction on an interval or on a switch. Reach the elevated exit. Needs: gravity
controller, smooth re-basing of the character controller's up-vector, a clear warning before each flip.

### Round 3 — THE PARADOX

The connections between sections of the arena change. Find the exit before it rearranges again.
Needs: portal mapping, safe teleportation with cooldown, route indicators. **Stretch goal.**

## 5. MVP scope

**Must have:** a working 3D scene, at least one real Lux3D asset in gameplay, player movement
and camera, one complete interactive mechanic, one generated or configured challenge, a
validation layer, timer and objective, win/loss detection, clear start and end states.

**Target for the demo:** three short rounds, three distinct mechanics, one or more visible
opponents, several Lux3D assets, AI-generated briefing and configuration, verification before
play, coherent UI, audio and feedback.

**Explicitly out of scope:** multiplayer, accounts, open-world generation, dialogue,
LLM-controlled real-time physics, unlimited rule generation, procedural terrain, level editor,
inventory or economy.

## 6. Data contract

```ts
type ChallengeConfig = {
  id: string;
  title: string;
  description: string;           // player-facing briefing
  arenaId: string;
  objective: { type: "REACH_EXIT" | "SURVIVE_TIMER"; targetId: string };
  durationSeconds: number;
  difficulty: 1 | 2 | 3;
  rules: GameRule[];
  opponents: { count: number; difficulty: "EASY" | "NORMAL" };
};

type GameRule = {
  id: string;
  type: "GRAVITY_DIRECTION" | "CONDITIONAL_PLATFORM" | "SPATIAL_PORTAL" | "OBJECT_STATE";
  targetIds: string[];
  parameters: Record<string, number | string | boolean>;
  trigger: { type: string; parameters?: Record<string, number | string | boolean> };
};
```

A starting contract, to be refined once the first mechanic is validated. Every AI-produced
configuration is validated before use.

## 7. Milestones

| # | Date | Goal | Exit condition |
| --- | --- | --- | --- |
| 0 | 12 Nov | Technical validation | A real Lux3D asset renders in the project |
| 1 | 13 Nov | Playable foundation | The player moves around a functioning 3D arena |
| 2 | 14 Nov | Reality engine | Two mechanics work reliably in the same scene |
| 3 | 15 Nov | AI generation and verification | A generated challenge loads and plays with no code changes |
| 4 | 16 Nov | Opponent and progression | A full run start to finish |
| 5 | 17 Nov | Polish and integration | Coherent, legible, performant |
| 6 | 18 Nov | Freeze and submit | Reliable demo and complete submission materials |

## 8. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Lux3D output slow or inconsistent | High | Generate key assets on day 1; keep approved fallbacks; assets are build-time, not runtime |
| Generated meshes unusable as colliders | High | Never collide against generated geometry; primitives only |
| 300k-face default meshes tank framerate | High | Request `faceCount` 15k–30k; retopologise if needed |
| Auto-rigging rejects a generated humanoid | Medium | Prompt for a T-posed humanoid; keep a fallback character |
| AI creates impossible challenges | High | Schema, reference, constraint and simulation-probe validation |
| Physics rules conflict | High | Whitelist of allowed rule combinations |
| Too much time on visuals | High | Playable loop first, always |
| Demo breaks | Critical | Feature freeze 18 Nov; repeatable demo path; works offline |

## 9. Definition of done

The game starts reliably; the player controls a character in 3D; at least one Lux3D asset is
integrated into gameplay; a challenge loads from structured configuration; at least one unusual
rule visibly changes the environment; objective and timer work; win/loss detection works; the
run is replayable; the demo reproduces with no manual code changes.

Compiling is not done.

## 10. Positioning

*No two rounds play the same. The arena changes. The rules change. Survival is the only constant.*

Most generative-3D projects use AI to make assets. PARADOX uses AI to propose the challenges and
physical conditions that make those assets mean something. The player does not explore an
AI-generated world — they have to learn how it works before it eliminates them.
