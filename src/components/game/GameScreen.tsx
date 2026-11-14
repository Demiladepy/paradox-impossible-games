import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ARENA_01 } from "../../game/arena/arena-01.ts";
import { ARENA_02 } from "../../game/arena/arena-02.ts";
import type { ArenaDefinition } from "../../game/arena/types.ts";
import { GameWorld, type GameSnapshot } from "../../game/GameWorld.ts";
import { DEFAULT_TUNING, type LocomotionState } from "../../game/player/controller.ts";
import { useInput, type InputHandle } from "../../hooks/useInput.ts";
import { ArenaView } from "./ArenaView.tsx";
import { PlayerView } from "./PlayerView.tsx";

/**
 * The game screen.
 *
 * The React tree is a *view*. It never owns game state — `GameWorld` does, in plain
 * TypeScript — and nothing here re-renders per frame: the simulation is read inside
 * `useFrame` and written straight onto three.js objects.
 */

/** The physics capsule is positioned at its centre; the model stands on its feet. */
const FOOT_DROP = DEFAULT_TUNING.halfHeight + DEFAULT_TUNING.radius;

const ARENAS: ArenaDefinition[] = [ARENA_01, ARENA_02];

export function GameScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const input = useInput(containerRef);

  const [arenaId, setArenaId] = useState(ARENA_01.id);
  const arena = useMemo(() => ARENAS.find((a) => a.id === arenaId) ?? ARENA_01, [arenaId]);

  const [world, setWorld] = useState<GameWorld | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const snapshotRef = useRef<GameSnapshot | null>(null);
  const [hud, setHud] = useState<GameSnapshot | null>(null);

  useEffect(() => {
    let disposed = false;
    let created: GameWorld | null = null;
    setWorld(null);
    snapshotRef.current = null;

    GameWorld.create(arena, { seed: arena.id })
      .then((instance) => {
        if (disposed) {
          instance.dispose();
          return;
        }
        // A refused rule means the arena is not behaving as authored. Say so loudly
        // rather than letting the player wonder why nothing is strange.
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
  }, [arena]);

  // The HUD only needs to be readable, not frame-accurate.
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
        Could not start the simulation: {error}
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
        {world ? <Simulation key={world.arena.id} world={world} input={input} snapshotRef={snapshotRef} /> : null}
      </Canvas>

      {!world ? <div className="loading">Loading arena…</div> : null}
      {world && !locked ? (
        <ClickToPlay
          arena={arena}
          status={hud?.status ?? "running"}
          arenas={ARENAS}
          onPick={setArenaId}
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
      {/* The course runs 41 m. Fog starting at 26 m faded the back half of it into the
          background, so the exit and the platforms leading to it were invisible from the
          start pad — you cannot aim a jump at something you cannot see. */}
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

  // Dev-only handle for inspecting the live scene from the console or a test harness.
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

function ClickToPlay({
  arena,
  status,
  arenas,
  onPick,
}: {
  arena: ArenaDefinition;
  status: string;
  arenas: ArenaDefinition[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="overlay">
      <div className="overlay-card">
        <h2>{status === "won" ? "Arena cleared" : status === "lost" ? "Eliminated" : arena.name}</h2>
        <p>{describeRules(arena)}</p>
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
          {arenas.map((option) => (
            <button
              key={option.id}
              className="clip"
              aria-pressed={option.id === arena.id}
              onClick={() => onPick(option.id)}
            >
              {option.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A one-line briefing derived from the rules actually loaded, not hardcoded prose. */
function describeRules(arena: ArenaDefinition): string {
  const rules = arena.defaultRules ?? [];
  if (rules.length === 0) return "Ordinary physics. Reach the exit.";
  const lines = rules.map((rule) => {
    switch (rule.type) {
      case "CONDITIONAL_PLATFORM":
        return rule.parameters["solidWhenObserved"] === true
          ? "Platforms exist only while you watch them."
          : "Platforms obey your gaze. Look away to cross.";
      case "GRAVITY_DIRECTION":
        return "Gravity will not stay where you left it.";
      case "OBJECT_STATE":
        return "Some ground comes and goes.";
      default:
        return "Something here does not behave.";
    }
  });
  return lines.join(" ");
}

function GameHud({ snapshot }: { snapshot: GameSnapshot | null }) {
  if (!snapshot) return null;
  const { player, status, elapsed, distanceToExit, camera, rules } = snapshot;

  return (
    <div className="hud game-hud">
      <div className="row">
        <span className="k">status</span>
        <span className={`v ${status === "won" ? "ok" : status === "lost" ? "bad" : ""}`}>
          {status}
        </span>
      </div>
      <div className="row">
        <span className="k">time</span>
        <span className="v">{elapsed.toFixed(1)}s</span>
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
