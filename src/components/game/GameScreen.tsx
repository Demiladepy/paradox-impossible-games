import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { findArena } from "../../game/arena/registry.ts";
import { GameWorld, type GameSnapshot } from "../../game/GameWorld.ts";
import { DEFAULT_TUNING, type LocomotionState } from "../../game/player/controller.ts";
import { requestChallenge, type ChallengeResult } from "../../integrations/ai/challenge-client.ts";
import { useInput, type InputHandle } from "../../hooks/useInput.ts";
import { ArenaView } from "./ArenaView.tsx";
import { PlayerView } from "./PlayerView.tsx";

/**
 * The game screen.
 *
 * A round is a `ChallengeConfig`: which arena, which rules, what winning means, how long.
 * It arrives from `/api/challenge` already validated and probed, or from the built-in pack
 * when there is no network — the title card always says which.
 *
 * The React tree is a *view*. It never owns game state, and nothing here re-renders per
 * frame: the simulation is read inside `useFrame` and written onto three.js objects.
 */

/** The physics capsule is positioned at its centre; the model stands on its feet. */
const FOOT_DROP = DEFAULT_TUNING.halfHeight + DEFAULT_TUNING.radius;

export function GameScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const input = useInput(containerRef);

  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(1);
  const [world, setWorld] = useState<GameWorld | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const snapshotRef = useRef<GameSnapshot | null>(null);
  const [hud, setHud] = useState<GameSnapshot | null>(null);

  const newRound = useCallback((level: 1 | 2 | 3) => {
    setLoading(true);
    setDifficulty(level);
    requestChallenge(level)
      .then(setResult)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    newRound(1);
  }, [newRound]);

  // Build the world whenever a new challenge arrives.
  useEffect(() => {
    if (!result) return;
    const challenge = result.challenge;
    const arena = findArena(challenge.arenaId);
    if (!arena) {
      setError(`Challenge names an unknown arena "${challenge.arenaId}"`);
      return;
    }

    let disposed = false;
    let created: GameWorld | null = null;
    setWorld(null);
    snapshotRef.current = null;

    GameWorld.create(arena, {
      seed: challenge.id,
      rules: challenge.rules,
      objective: challenge.objective,
      durationSeconds: challenge.durationSeconds,
    })
      .then((instance) => {
        if (disposed) {
          instance.dispose();
          return;
        }
        for (const rejection of instance.rules.rejected) {
          console.error(`[rules] refused ${rejection.ruleId}: ${rejection.reason}`);
        }
        created = instance;
        setWorld(instance);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      disposed = true;
      created?.dispose();
    };
  }, [result]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (snapshotRef.current) setHud(snapshotRef.current);
      setLocked(input.isPointerLocked());
    }, 100);
    return () => window.clearInterval(id);
  }, [input]);

  if (error) {
    return (
      <div className="loading" style={{ color: "var(--bad)" }}>
        Could not start the round: {error}
      </div>
    );
  }

  return (
    <div className="stage" ref={containerRef}>
      <Canvas
        shadows
        camera={{ fov: 62, near: 0.1, far: 400 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
        }}
      >
        <SceneLighting />
        {world ? (
          <Simulation
            key={world.arena.id + (result?.challenge.id ?? "")}
            world={world}
            input={input}
            snapshotRef={snapshotRef}
          />
        ) : null}
      </Canvas>

      {loading ? <div className="loading">Designing a round…</div> : null}
      {!loading && world && !locked && result ? (
        <Briefing
          result={result}
          status={hud?.status ?? "running"}
          difficulty={difficulty}
          onNewRound={newRound}
        />
      ) : null}
      {world ? <GravityBanner snapshot={hud} /> : null}
      {world ? <GameHud snapshot={hud} /> : null}
    </div>
  );
}

function SceneLighting() {
  return (
    <>
      <color attach="background" args={["#05060a"]} />
      {/* Fog starting at 26 m faded the back half of a 41 m course into the background —
          you cannot aim a jump at something you cannot see. */}
      <fog attach="fog" args={["#05060a", 70, 210]} />
      {/* Generated obsidian is nearly black; without fill it reads as a hole. */}
      <ambientLight intensity={0.35} color="#9fc4ff" />
      <hemisphereLight args={["#8fc6ff", "#141a28", 0.9]} />
      <directionalLight
        position={[14, 26, 10]}
        intensity={2.4}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-far={90}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-16, 8, -22]} intensity={0.85} color="#4bd8ff" />
    </>
  );
}

interface SimulationProps {
  world: GameWorld;
  input: InputHandle;
  snapshotRef: React.RefObject<GameSnapshot | null>;
}

function Simulation({ world, input, snapshotRef }: SimulationProps) {
  const { camera, scene } = useThree();
  const playerRef = useRef<THREE.Group>(null);
  const locomotionRef = useRef<LocomotionState>("idle");
  const upSignRef = useRef(1);
  const [thirdPerson, setThirdPerson] = useState(world.camera.mode === "third");

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>)["__paradox"] = { scene, camera, world };
    return () => {
      delete (window as unknown as Record<string, unknown>)["__paradox"];
    };
  }, [scene, camera, world]);

  useFrame((_, delta) => {
    const raw = input.consume();

    if (input.consumePressed("toggleCamera")) {
      setThirdPerson(world.camera.toggleMode() === "third");
    }
    if (input.consumePressed("restart")) {
      world.restart();
    }

    world.update(
      { forward: raw.forward, right: raw.right, jump: raw.jump, sprint: raw.sprint },
      { deltaYaw: raw.deltaYaw, deltaPitch: raw.deltaPitch },
      delta,
    );

    const snapshot = world.snapshot();
    snapshotRef.current = snapshot;

    const { eye, target } = snapshot.camera;
    camera.position.set(eye.x, eye.y, eye.z);
    // Roll the view with gravity, so standing on the ceiling does not look like standing
    // on the floor with the world drawn wrong.
    camera.up.set(0, snapshot.rules.upSign, 0);
    camera.lookAt(target.x, target.y, target.z);

    const group = playerRef.current;
    if (group) {
      const p = snapshot.player.position;
      group.position.set(p.x, p.y - FOOT_DROP * snapshot.rules.upSign, p.z);
      group.rotation.y = snapshot.player.facing;
    }
    locomotionRef.current = snapshot.player.locomotion;
    upSignRef.current = snapshot.rules.upSign;
  });

  return (
    // useGLTF suspends while the assets stream in. Without a boundary inside the Canvas
    // the whole subtree unwinds and the frame loop above never gets to run.
    <Suspense fallback={null}>
      <ArenaView arena={world.arena} snapshotRef={snapshotRef} />
      <PlayerView
        ref={playerRef}
        locomotionRef={locomotionRef}
        upSignRef={upSignRef}
        visible={thirdPerson}
      />
    </Suspense>
  );
}

/** The countdown before gravity flips. Impossible to miss on purpose. */
function GravityBanner({ snapshot }: { snapshot: GameSnapshot | null }) {
  const warning = snapshot?.rules.warning;
  if (!warning) return null;
  return (
    <div className="gravity-banner">
      <span className="label">{warning.message}</span>
      <span className="count">{warning.secondsRemaining.toFixed(1)}s</span>
    </div>
  );
}

function Briefing({
  result,
  status,
  difficulty,
  onNewRound,
}: {
  result: ChallengeResult;
  status: string;
  difficulty: 1 | 2 | 3;
  onNewRound: (level: 1 | 2 | 3) => void;
}) {
  const { challenge, source, probe, note } = result;
  const heading =
    status === "won" ? "Arena cleared" : status === "lost" ? "Eliminated" : challenge.title;

  return (
    <div className="overlay">
      <div className="overlay-card">
        <span className={`source-badge ${source}`}>
          {source === "generated" ? "AI-designed round" : "built-in round"}
        </span>
        <h2>{heading}</h2>
        <p>{challenge.description}</p>

        <div className="challenge-meta">
          <span>difficulty {challenge.difficulty}</span>
          <span>·</span>
          <span>{challenge.durationSeconds}s</span>
          <span>·</span>
          <span>{challenge.objective.type === "REACH_EXIT" ? "reach the exit" : "survive"}</span>
        </div>

        {/* Say exactly what the verification does and does not mean. */}
        {probe?.solved ? (
          <p className="verified">
            Verified playable — an agent completed this round in {probe.seconds.toFixed(1)}s.
            That is not a proof it is winnable for everyone.
          </p>
        ) : null}
        {note ? <p className="note">{note}</p> : null}

        <p className="hint">Click to take control</p>
        <ul className="keys">
          <li>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> move
          </li>
          <li>
            <kbd>Space</kbd> jump · <kbd>Shift</kbd> sprint
          </li>
          <li>
            <kbd>V</kbd> camera · <kbd>R</kbd> restart · <kbd>Esc</kbd> release
          </li>
        </ul>

        <div className="arena-pick" onClick={(event) => event.stopPropagation()}>
          {([1, 2, 3] as const).map((level) => (
            <button
              key={level}
              className="clip"
              aria-pressed={level === difficulty}
              onClick={() => onNewRound(level)}
            >
              new round · {level}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GameHud({ snapshot }: { snapshot: GameSnapshot | null }) {
  if (!snapshot) return null;
  const { player, status, elapsed, distanceToExit, camera, rules, timeRemaining } = snapshot;
  const urgent = timeRemaining !== null && timeRemaining < 10;

  return (
    <div className="hud game-hud">
      <div className="row">
        <span className="k">status</span>
        <span className={`v ${status === "won" ? "ok" : status === "lost" ? "bad" : ""}`}>
          {status}
        </span>
      </div>
      <div className="row">
        <span className="k">{timeRemaining === null ? "time" : "remaining"}</span>
        <span className={`v ${urgent ? "bad" : ""}`}>
          {timeRemaining === null ? `${elapsed.toFixed(1)}s` : `${timeRemaining.toFixed(1)}s`}
        </span>
      </div>
      <div className="row">
        <span className="k">speed</span>
        <span className="v">{player.speed.toFixed(1)} m/s</span>
      </div>
      <div className="row">
        <span className="k">state</span>
        <span className="v">
          {player.locomotion}
          {player.grounded ? "" : " · airborne"}
        </span>
      </div>
      <div className="row">
        <span className="k">to exit</span>
        <span className="v">{distanceToExit.toFixed(1)} m</span>
      </div>
      <div className="row">
        <span className="k">gravity</span>
        <span className={`v ${rules.upSign < 0 ? "warn" : ""}`}>
          {rules.upSign < 0 ? "inverted" : "normal"}
        </span>
      </div>
      <div className="row">
        <span className="k">unmade</span>
        <span className={`v ${rules.phantom.length > 0 ? "warn" : ""}`}>
          {rules.phantom.length > 0 ? rules.phantom.join(", ") : "none"}
        </span>
      </div>
      <div className="row">
        <span className="k">camera</span>
        <span className="v">{camera.mode === "third" ? "third-person" : "first-person"}</span>
      </div>
    </div>
  );
}
