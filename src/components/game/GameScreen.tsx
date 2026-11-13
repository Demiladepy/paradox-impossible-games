import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ARENA_01 } from "../../game/arena/arena-01.ts";
import { GameWorld, type GameSnapshot } from "../../game/GameWorld.ts";
import { DEFAULT_TUNING, type LocomotionState } from "../../game/player/controller.ts";
import { useInput, type InputHandle } from "../../hooks/useInput.ts";
import { ArenaView } from "./ArenaView.tsx";
import { PlayerView } from "./PlayerView.tsx";

/**
 * Milestone 1 playable foundation: the arena, the contestant, and movement.
 *
 * The React tree is a *view*. It never owns game state — `GameWorld` does, in plain
 * TypeScript — and nothing here re-renders per frame: the simulation is read inside
 * `useFrame` and written straight onto three.js objects.
 */

/** The physics capsule is positioned at its centre; the model stands on its feet. */
const FOOT_DROP = DEFAULT_TUNING.halfHeight + DEFAULT_TUNING.radius;

export function GameScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const input = useInput(containerRef);

  const [world, setWorld] = useState<GameWorld | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const snapshotRef = useRef<GameSnapshot | null>(null);
  const [hud, setHud] = useState<GameSnapshot | null>(null);

  useEffect(() => {
    let disposed = false;
    let created: GameWorld | null = null;

    GameWorld.create(ARENA_01, { seed: "arena-01" })
      .then((instance) => {
        if (disposed) {
          instance.dispose();
          return;
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
  }, []);

  // The HUD only needs to be readable, not frame-accurate. Ten updates a second keeps
  // React out of the render loop entirely.
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
        {world ? <Simulation world={world} input={input} snapshotRef={snapshotRef} /> : null}
      </Canvas>

      {!world ? <div className="loading">Loading arena…</div> : null}
      {world && !locked ? <ClickToPlay status={hud?.status ?? "running"} /> : null}
      {world ? <GameHud snapshot={hud} /> : null}
    </div>
  );
}

function SceneLighting() {
  return (
    <>
      <color attach="background" args={["#05060a"]} />
      <fog attach="fog" args={["#05060a", 26, 96]} />
      <hemisphereLight args={["#8fc6ff", "#0a0d16", 0.5]} />
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
  /** Written every frame; the HUD samples it on a timer instead of re-rendering here. */
  snapshotRef: React.RefObject<GameSnapshot | null>;
}

function Simulation({ world, input, snapshotRef }: SimulationProps) {
  const { camera } = useThree();
  const playerRef = useRef<THREE.Group>(null);
  const locomotionRef = useRef<LocomotionState>("idle");
  const [thirdPerson, setThirdPerson] = useState(world.camera.mode === "third");

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
    camera.lookAt(target.x, target.y, target.z);

    const group = playerRef.current;
    if (group) {
      const p = snapshot.player.position;
      group.position.set(p.x, p.y - FOOT_DROP, p.z);
      group.rotation.y = snapshot.player.facing;
    }
    locomotionRef.current = snapshot.player.locomotion;
  });

  return (
    // useGLTF suspends while the assets stream in. Without a boundary inside the Canvas
    // the whole subtree unwinds and the frame loop above never gets to run.
    <Suspense fallback={null}>
      <ArenaView arena={world.arena} />
      <PlayerView ref={playerRef} locomotionRef={locomotionRef} visible={thirdPerson} />
    </Suspense>
  );
}

function ClickToPlay({ status }: { status: string }) {
  return (
    <div className="overlay">
      <div className="overlay-card">
        <h2>{status === "won" ? "Arena cleared" : status === "lost" ? "Eliminated" : "Arena 01"}</h2>
        <p>The Gauntlet</p>
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
      </div>
    </div>
  );
}

function GameHud({ snapshot }: { snapshot: GameSnapshot | null }) {
  if (!snapshot) return null;
  const { player, status, elapsed, distanceToExit, camera } = snapshot;

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
        <span className="k">camera</span>
        <span className="v">{camera.mode === "third" ? "third-person" : "first-person"}</span>
      </div>
    </div>
  );
}
