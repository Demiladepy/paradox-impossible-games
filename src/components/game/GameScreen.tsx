import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Round, type RoundResult, type RoundSnapshot } from "../../game/progression/round.ts";
import { DEFAULT_TUNING, type LocomotionState } from "../../game/player/controller.ts";
import { requestChallenge, type ChallengeResult } from "../../integrations/ai/challenge-client.ts";
import { useInput, type InputHandle } from "../../hooks/useInput.ts";
import { useGameAudio } from "../../hooks/useGameAudio.ts";
import { sound } from "../../audio/sound.ts";
import { ArenaView } from "./ArenaView.tsx";
import { CONTESTANT_URL, PlayerView, RIVAL_URL } from "./PlayerView.tsx";
import { PerfPanel, PerfProbe, type PerfSample } from "./PerfReadout.tsx";
import { PostFx } from "./PostFx.tsx";

/**
 * The game.
 *
 * A *run* is three rounds of rising difficulty. Each round is a `ChallengeConfig` — which
 * arena, which rules, what winning means, how long — that arrives from `/api/challenge`
 * already validated and probed, or from the built-in pack when there is no network. The
 * title card always says which.
 *
 * The React tree is a view. It never owns game state, and nothing here re-renders per
 * frame: the simulation is read inside `useFrame` and written onto three.js objects.
 */

const FOOT_DROP = DEFAULT_TUNING.halfHeight + DEFAULT_TUNING.radius;
const ROUNDS_PER_RUN = 3;
const RIVAL_TINTS = ["#ff5f6d", "#ffb347"];

type Phase = "loading" | "briefing" | "playing" | "roundOver" | "runOver";

interface CompletedRound {
  title: string;
  result: RoundResult;
}

export function GameScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const input = useInput(containerRef);

  const [phase, setPhase] = useState<Phase>("loading");
  const [roundIndex, setRoundIndex] = useState(0);
  const [history, setHistory] = useState<CompletedRound[]>([]);
  const [challenge, setChallenge] = useState<ChallengeResult | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [rivalUrl, setRivalUrl] = useState(CONTESTANT_URL);
  const [muted, setMuted] = useState(false);
  const [perf, setPerf] = useState<PerfSample | null>(null);

  const pausedRef = useRef(false);
  const snapshotRef = useRef<RoundSnapshot | null>(null);
  const [hud, setHud] = useState<RoundSnapshot | null>(null);

  // Use the rival character only once it exists on disk — a missing GLB would suspend
  // forever behind the Canvas boundary and the game would simply never appear.
  useEffect(() => {
    fetch("/assets/generated/manifest.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((manifest: { entries?: { name: string }[] } | null) => {
        const has = manifest?.entries?.some((entry) => entry.name === "rival-01-anim");
        if (has) setRivalUrl(RIVAL_URL);
      })
      .catch(() => {
        /* keep the default contestant */
      });
  }, []);

  const loadRound = useCallback((index: number) => {
    setPhase("loading");
    setRoundIndex(index);
    const difficulty = (Math.min(index + 1, 3) as 1 | 2 | 3);
    requestChallenge(difficulty)
      .then(setChallenge)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  const startRun = useCallback(() => {
    setHistory([]);
    loadRound(0);
  }, [loadRound]);

  useEffect(() => {
    startRun();
  }, [startRun]);

  // Build the round whenever a challenge arrives.
  useEffect(() => {
    if (!challenge) return;
    let disposed = false;
    let created: Round | null = null;
    setRound(null);
    snapshotRef.current = null;

    Round.create(challenge.challenge)
      .then((instance) => {
        if (disposed) {
          instance.dispose();
          return;
        }
        for (const rejection of instance.world.rules.rejected) {
          console.error(`[rules] refused ${rejection.ruleId}: ${rejection.reason}`);
        }
        created = instance;
        setRound(instance);
        setPhase("briefing");
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      disposed = true;
      created?.dispose();
    };
  }, [challenge]);

  // Sample for the HUD, and notice when a round ends.
  useEffect(() => {
    const id = window.setInterval(() => {
      const snapshot = snapshotRef.current;
      if (snapshot) setHud(snapshot);
      const isLocked = input.isPointerLocked();
      setLocked(isLocked);

      if (snapshot?.result && phase === "playing") {
        setHistory((prior) => [
          ...prior,
          { title: challenge?.challenge.title ?? "Round", result: snapshot.result! },
        ]);
        setPhase(roundIndex + 1 >= ROUNDS_PER_RUN ? "runOver" : "roundOver");
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [input, phase, roundIndex, challenge]);

  useEffect(() => {
    if (phase === "briefing" && locked) setPhase("playing");
  }, [phase, locked]);

  // Releasing the mouse mid-round used to leave the simulation running with nobody at the
  // controls — the timer drained, rivals kept going, and the player came back to a round
  // they had already lost. Pressing Esc now stops the world.
  const paused = phase === "playing" && !locked;
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Browsers refuse to start an AudioContext outside a user gesture, and taking pointer
  // lock is the one gesture every player makes.
  useEffect(() => {
    if (!locked) return;
    sound.resume();
    sound.startDrone();
  }, [locked]);

  if (error) {
    return (
      <div className="loading" style={{ color: "var(--bad)" }}>
        Could not start the round: {error}
      </div>
    );
  }

  const overlayOpen = phase !== "playing";

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
        <PerfProbe onSample={setPerf} />
        {round ? (
          <Simulation
            key={round.challenge.id + roundIndex}
            round={round}
            input={input}
            snapshotRef={snapshotRef}
            rivalUrl={rivalUrl}
            pausedRef={pausedRef}
          />
        ) : null}
        <PostFx />
      </Canvas>

      {phase === "loading" ? <div className="loading">Designing a round…</div> : null}

      {phase === "briefing" && challenge ? (
        <Briefing challenge={challenge} roundNumber={roundIndex + 1} total={ROUNDS_PER_RUN} />
      ) : null}

      {phase === "roundOver" && hud?.result ? (
        <RoundOver
          title={challenge?.challenge.title ?? "Round"}
          result={hud.result}
          roundNumber={roundIndex + 1}
          onNext={() => loadRound(roundIndex + 1)}
          onRetry={() => {
            round?.restart();
            setHistory((prior) => prior.slice(0, -1));
            setPhase("briefing");
          }}
        />
      ) : null}

      {phase === "runOver" ? <RunOver history={history} onRestart={startRun} /> : null}

      {paused ? <Paused /> : null}

      <PerfPanel sample={perf} />

      {round && !overlayOpen ? <GravityBanner snapshot={hud} /> : null}
      {round ? <GameHud snapshot={hud} roundNumber={roundIndex + 1} total={ROUNDS_PER_RUN} /> : null}
      <button
        className="mute"
        aria-pressed={muted}
        onClick={(event) => {
          event.stopPropagation();
          const next = !muted;
          setMuted(next);
          sound.setMuted(next);
        }}
      >
        {muted ? "sound off" : "sound on"}
      </button>
    </div>
  );
}

function SceneLighting() {
  return (
    <>
      <color attach="background" args={["#04050a"]} />
      {/* Fog starting at 26 m faded the back half of a 41 m course into the background —
          you cannot aim a jump at something you cannot see. */}
      <fog attach="fog" args={["#04050a", 60, 190]} />
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
      {/* Rim light from behind the course: separates the contestants from the void and
          gives the bloom a cool edge to pick up. */}
      <directionalLight position={[-16, 9, -26]} intensity={1.5} color="#49d6ff" />
      <directionalLight position={[18, 6, -30]} intensity={0.7} color="#ff7a9c" />
    </>
  );
}

interface SimulationProps {
  round: Round;
  input: InputHandle;
  snapshotRef: React.RefObject<RoundSnapshot | null>;
  rivalUrl: string;
  /** True while the player has released the mouse. The world holds still. */
  pausedRef: React.RefObject<boolean>;
}

function Simulation({ round, input, snapshotRef, rivalUrl, pausedRef }: SimulationProps) {
  const { camera, scene } = useThree();
  const playAudio = useGameAudio();
  const playerRef = useRef<THREE.Group>(null);
  const rivalRefs = useRef<(THREE.Group | null)[]>([]);
  const locomotionRef = useRef<LocomotionState>("idle");
  const upSignRef = useRef(1);
  const rivalLocomotion = useRef<LocomotionState[]>([]);
  const phantomRef = useRef<string[]>([]);
  const rivalUp = useRef<number[]>([]);
  const [thirdPerson, setThirdPerson] = useState(round.world.camera.mode === "third");

  const rivalCount = round.snapshot().opponents.length;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>)["__paradox"] = { scene, camera, round };
    return () => {
      delete (window as unknown as Record<string, unknown>)["__paradox"];
    };
  }, [scene, camera, round]);

  useFrame((_, delta) => {
    const raw = input.consume();

    // Paused: keep drawing, but advance nothing. Input is still drained above so a key
    // held down at the moment of pausing does not fire the instant control returns.
    if (pausedRef.current) return;

    if (input.consumePressed("toggleCamera")) {
      setThirdPerson(round.world.camera.toggleMode() === "third");
    }
    if (input.consumePressed("restart")) {
      round.restart();
    }

    round.update(
      { forward: raw.forward, right: raw.right, jump: raw.jump, sprint: raw.sprint },
      { deltaYaw: raw.deltaYaw, deltaPitch: raw.deltaPitch },
      delta,
    );

    const snapshot = round.snapshot();
    snapshotRef.current = snapshot;
    playAudio(snapshot);
    const game = snapshot.game;

    const { eye, target } = game.camera;
    camera.position.set(eye.x, eye.y, eye.z);
    // Roll the view with gravity, so standing on the ceiling does not look like standing
    // on the floor with the world drawn wrong.
    camera.up.set(0, game.rules.upSign, 0);
    camera.lookAt(target.x, target.y, target.z);

    const group = playerRef.current;
    if (group) {
      const p = game.player.position;
      group.position.set(p.x, p.y - FOOT_DROP * game.rules.upSign, p.z);
      group.rotation.y = game.player.facing;
    }
    locomotionRef.current = game.player.locomotion;
    upSignRef.current = game.rules.upSign;
    phantomRef.current = game.rules.phantom;

    snapshot.opponents.forEach((rival, index) => {
      const rivalGroup = rivalRefs.current[index];
      if (rivalGroup) {
        rivalGroup.position.set(
          rival.position.x,
          rival.position.y - FOOT_DROP * rival.upSign,
          rival.position.z,
        );
        rivalGroup.rotation.y = rival.facing;
      }
      rivalLocomotion.current[index] = rival.locomotion;
      rivalUp.current[index] = rival.upSign;
    });
  });

  return (
    // useGLTF suspends while the assets stream in. Without a boundary inside the Canvas
    // the whole subtree unwinds and the frame loop above never gets to run.
    <Suspense fallback={null}>
      <ArenaView arena={round.world.arena} phantomRef={phantomRef} />
      <PlayerView
        ref={playerRef}
        locomotionRef={locomotionRef}
        upSignRef={upSignRef}
        visible={thirdPerson}
      />
      {Array.from({ length: rivalCount }, (_, index) => (
        <RivalView
          key={index}
          index={index}
          url={rivalUrl}
          refs={rivalRefs}
          locomotion={rivalLocomotion}
          up={rivalUp}
        />
      ))}
    </Suspense>
  );
}

/** One rival. Split out so each gets its own stable refs into the shared arrays. */
function RivalView({
  index,
  url,
  refs,
  locomotion,
  up,
}: {
  index: number;
  url: string;
  refs: React.RefObject<(THREE.Group | null)[]>;
  locomotion: React.RefObject<LocomotionState[]>;
  up: React.RefObject<number[]>;
}) {
  const locoRef = useRef<LocomotionState>("idle");
  const upRef = useRef(1);

  useFrame(() => {
    locoRef.current = locomotion.current?.[index] ?? "idle";
    upRef.current = up.current?.[index] ?? 1;
  });

  return (
    <PlayerView
      ref={(group) => {
        if (refs.current) refs.current[index] = group;
      }}
      locomotionRef={locoRef}
      upSignRef={upRef}
      visible
      url={url}
      tint={RIVAL_TINTS[index % RIVAL_TINTS.length] ?? "#ff5f6d"}
    />
  );
}

function Paused() {
  return (
    <div className="overlay">
      <div className="overlay-card">
        <div className="round-counter">Paused</div>
        <h2>Round held</h2>
        <p>Nothing is moving. Your rivals are waiting too.</p>
        <p className="hint">Click to resume</p>
      </div>
    </div>
  );
}

/** The countdown before gravity flips. Impossible to miss on purpose. */
function GravityBanner({ snapshot }: { snapshot: RoundSnapshot | null }) {
  const warning = snapshot?.game.rules.warning;
  if (!warning) return null;
  return (
    <div className="gravity-banner">
      <span className="label">{warning.message}</span>
      <span className="count">{warning.secondsRemaining.toFixed(1)}s</span>
    </div>
  );
}

function Briefing({
  challenge,
  roundNumber,
  total,
}: {
  challenge: ChallengeResult;
  roundNumber: number;
  total: number;
}) {
  const { challenge: config, source, probe, note } = challenge;

  return (
    <div className="overlay">
      <div className="overlay-card">
        <span className={`source-badge ${source}`}>
          {source === "generated" ? "AI-designed round" : "built-in round"}
        </span>
        <div className="round-counter">
          Round {roundNumber} of {total}
        </div>
        <h2>{config.title}</h2>
        <p>{config.description}</p>

        <div className="challenge-meta">
          <span>difficulty {config.difficulty}</span>
          <span>·</span>
          <span>{config.durationSeconds}s</span>
          <span>·</span>
          <span>{config.objective.type === "REACH_EXIT" ? "reach the exit" : "survive"}</span>
          {config.opponents.count > 0 ? (
            <>
              <span>·</span>
              <span>
                {config.opponents.count} rival{config.opponents.count > 1 ? "s" : ""}
              </span>
            </>
          ) : null}
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
            <kbd>V</kbd> camera · <kbd>R</kbd> restart · <kbd>P</kbd> stats · <kbd>Esc</kbd> pause
          </li>
        </ul>
      </div>
    </div>
  );
}

function RoundOver({
  title,
  result,
  roundNumber,
  onNext,
  onRetry,
}: {
  title: string;
  result: RoundResult;
  roundNumber: number;
  onNext: () => void;
  onRetry: () => void;
}) {
  const won = result.status === "won";
  return (
    <div className="overlay">
      <div className="overlay-card">
        <div className="round-counter">Round {roundNumber}</div>
        <h2 className={won ? "won" : "lost"}>{won ? "Survived" : "Eliminated"}</h2>
        <p>{title}</p>
        <div className="challenge-meta">
          <span>{result.seconds.toFixed(1)}s</span>
          {result.totalContestants > 1 ? (
            <>
              <span>·</span>
              <span>
                placed {result.placement} of {result.totalContestants}
              </span>
            </>
          ) : null}
        </div>
        <div className="arena-pick" onClick={(event) => event.stopPropagation()}>
          <button className="clip" onClick={onRetry}>
            retry round
          </button>
          <button className="clip primary" onClick={onNext}>
            next round
          </button>
        </div>
      </div>
    </div>
  );
}

function RunOver({ history, onRestart }: { history: CompletedRound[]; onRestart: () => void }) {
  const survived = history.filter((entry) => entry.result.status === "won").length;
  const total = history.reduce((sum, entry) => sum + entry.result.seconds, 0);

  return (
    <div className="overlay">
      <div className="overlay-card">
        <div className="round-counter">Run complete</div>
        <h2 className={survived === history.length ? "won" : ""}>
          {survived} of {history.length} survived
        </h2>
        <ul className="run-summary">
          {history.map((entry, index) => (
            <li key={index}>
              <span className="round-name">
                {index + 1}. {entry.title}
              </span>
              <span className={entry.result.status === "won" ? "ok" : "bad"}>
                {entry.result.status === "won"
                  ? `${entry.result.seconds.toFixed(1)}s`
                  : "eliminated"}
              </span>
            </li>
          ))}
        </ul>
        <div className="challenge-meta">
          <span>{total.toFixed(1)}s total</span>
        </div>
        <div className="arena-pick" onClick={(event) => event.stopPropagation()}>
          <button className="clip primary" onClick={onRestart}>
            new run
          </button>
        </div>
      </div>
    </div>
  );
}

function GameHud({
  snapshot,
  roundNumber,
  total,
}: {
  snapshot: RoundSnapshot | null;
  roundNumber: number;
  total: number;
}) {
  if (!snapshot) return null;
  const { game, opponents, livePlacement } = snapshot;
  const { player, status, elapsed, distanceToExit, rules, timeRemaining } = game;
  const urgent = timeRemaining !== null && timeRemaining < 10;

  return (
    <div className="hud game-hud">
      <div className="row">
        <span className="k">round</span>
        <span className="v">
          {roundNumber} / {total}
        </span>
      </div>
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
      {opponents.length > 0 ? (
        <div className="row">
          <span className="k">place</span>
          <span className={`v ${livePlacement === 1 ? "ok" : "warn"}`}>
            {livePlacement} of {opponents.length + 1}
          </span>
        </div>
      ) : null}
      <div className="row">
        <span className="k">to exit</span>
        <span className="v">{distanceToExit.toFixed(1)} m</span>
      </div>
      <div className="row">
        <span className="k">state</span>
        <span className="v">
          {player.locomotion}
          {player.grounded ? "" : " · airborne"}
        </span>
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
    </div>
  );
}
