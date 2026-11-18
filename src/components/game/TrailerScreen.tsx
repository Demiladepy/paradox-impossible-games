import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FALLBACK_CHALLENGES } from "../../game/challenges/fallback.ts";
import { Autopilot } from "../../game/agent/autopilot.ts";
import { ShotDirector, TRAILER_SECONDS } from "../../game/cinematic/shots.ts";
import {
  GazeDemonstration,
  pickDemonstrationTarget,
  surfacePoint,
} from "../../game/cinematic/demonstration.ts";
import type { PlatformDef } from "../../game/arena/types.ts";
import { NO_LOOK } from "../../game/GameWorld.ts";
import { Round, type RoundSnapshot } from "../../game/progression/round.ts";
import { DEFAULT_TUNING, type LocomotionState } from "../../game/player/controller.ts";
import { ArenaView } from "./ArenaView.tsx";
import { Atmosphere } from "./Atmosphere.tsx";
import { ArenaLights } from "./ArenaLights.tsx";
import { Backdrop } from "./Backdrop.tsx";
import { ContactShadows, type ShadowTarget } from "./ContactShadows.tsx";
import { ImpactField, type ImpactEvent } from "./ImpactField.tsx";
import { CONTESTANT_URL, PLAYER_TINT, PlayerView, RIVAL_URL } from "./PlayerView.tsx";
import { PostFx } from "./PostFx.tsx";
import type { QualitySettings } from "../../game/settings/quality.ts";
// The trailer inherits whatever quality the player last chose in game.
import { loadQuality, QUALITY } from "../../game/settings/quality.ts";

/**
 * Trailer mode — the game films itself.
 *
 * The probe agent plays a sequence of rounds while a cinematic camera shoots them, with
 * title cards on a timer. Point a screen recorder at it, press play, and fifty seconds
 * later you have usable footage with no one touching a key.
 *
 * The important detail is that there are **two cameras**. The rules read the *player's*
 * gaze to decide which platforms exist, so the cinematic camera has to be a separate,
 * purely visual thing. If it drove the gaze, swinging it round to frame a nice shot would
 * unmake the floor under the agent and the trailer would film a death.
 */

const FOOT_DROP = DEFAULT_TUNING.halfHeight + DEFAULT_TUNING.radius;

/** Rounds to run through, chosen so the mechanics appear in the order the shots mention. */
const TRAILER_ROUNDS = ["fallback-false-floor", "fallback-wrong-way-round", "fallback-inversion"];

export function TrailerScreen() {
  const [playing, setPlaying] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [round, setRound] = useState<Round | null>(null);
  const [card, setCard] = useState<{ title: string | null; caption: string | null }>({
    title: null,
    caption: null,
  });
  const [progress, setProgress] = useState(0);
  const [rivalUrl, setRivalUrl] = useState(CONTESTANT_URL);
  const [hasLamp, setHasLamp] = useState(false);
  const settings = QUALITY[loadQuality()];

  const director = useMemo(() => new ShotDirector(), []);

  useEffect(() => {
    fetch("/assets/generated/manifest.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((manifest: { entries?: { name: string }[] } | null) => {
        const names = new Set((manifest?.entries ?? []).map((entry) => entry.name));
        if (names.has("rival-01-anim")) setRivalUrl(RIVAL_URL);
        setHasLamp(names.has("flood-lamp"));
      })
      .catch(() => {
        /* keep the default */
      });
  }, []);

  // Load whichever round the sequence is on.
  useEffect(() => {
    const id = TRAILER_ROUNDS[roundIndex % TRAILER_ROUNDS.length];
    const challenge = FALLBACK_CHALLENGES.find((c) => c.id === id) ?? FALLBACK_CHALLENGES[0];
    if (!challenge) return;

    let disposed = false;
    let created: Round | null = null;
    setRound(null);

    Round.create(challenge)
      .then((instance) => {
        if (disposed) {
          instance.dispose();
          return;
        }
        created = instance;
        setRound(instance);
      })
      .catch(() => {
        /* a failed round just means the trailer moves on */
      });

    return () => {
      disposed = true;
      created?.dispose();
    };
  }, [roundIndex]);

  const start = () => {
    director.reset();
    setProgress(0);
    setRoundIndex(0);
    setPlaying(true);
  };

  return (
    <div className="stage trailer">
      <Canvas
        // three.js removed PCFSoftShadowMap, which is what a bare `shadows` asks for; it
        // was silently falling back to PCFShadowMap and warning on every boot. Naming the
        // type we actually get keeps the console clean and the shadows identical.
        shadows="percentage"
        camera={{ fov: 46, near: 0.1, far: 400 }}
        dpr={[1, settings.dpr]}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
        }}
      >
        <TrailerLighting shadowMapSize={settings.shadowMapSize} />
        {round ? (
          <CinematicRunner
            key={`${round.challenge.id}-${roundIndex}`}
            round={round}
            director={director}
            playing={playing}
            rivalUrl={rivalUrl}
            hasLamp={hasLamp}
            settings={settings}
            onCard={setCard}
            onProgress={setProgress}
            onRoundFinished={() => setRoundIndex((index) => index + 1)}
            onFinished={() => setPlaying(false)}
          />
        ) : null}
        <PostFx settings={settings} cinematic />
      </Canvas>

      {/* Letterbox. Costs nothing and makes a screen capture read as footage. */}
      <div className="letterbox top" />
      <div className="letterbox bottom" />

      {playing ? (
        <div className="trailer-cards">
          {card.title ? <h1 className="trailer-title">{card.title}</h1> : null}
          {card.caption ? <p className="trailer-caption">{card.caption}</p> : null}
        </div>
      ) : null}

      {!playing ? (
        <div className="overlay">
          <div className="overlay-card">
            <div className="round-counter">Trailer mode</div>
            <h2>The game films itself</h2>
            <p>
              The same agent that verifies a round is finishable will play three of them
              while a cinematic camera shoots it. {Math.round(TRAILER_SECONDS)} seconds, no
              hands on the keyboard.
            </p>
            <p className="hint">Start a screen recording, then press play</p>
            <div className="arena-pick" onClick={(event) => event.stopPropagation()}>
              <button className="clip primary" onClick={start}>
                play trailer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {playing ? (
        <div className="trailer-progress">
          <div className="bar" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function TrailerLighting({ shadowMapSize }: { shadowMapSize: number }) {
  return (
    <>
      <color attach="background" args={["#04050a"]} />
      <fog attach="fog" args={["#04050a", 55, 180]} />
      <ambientLight intensity={0.38} color="#9fc4ff" />
      <hemisphereLight args={["#8fc6ff", "#141a28", 0.95]} />
      <directionalLight
        position={[14, 26, 10]}
        intensity={2.6}
        color="#ffffff"
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-far={90}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-16, 9, -26]} intensity={1.7} color="#49d6ff" />
      <directionalLight position={[18, 6, -30]} intensity={0.8} color="#ff7a9c" />
    </>
  );
}

interface RunnerProps {
  round: Round;
  director: ShotDirector;
  playing: boolean;
  rivalUrl: string;
  hasLamp: boolean;
  settings: QualitySettings;
  onCard: (card: { title: string | null; caption: string | null }) => void;
  onProgress: (progress: number) => void;
  onRoundFinished: () => void;
  onFinished: () => void;
}

function CinematicRunner({
  round,
  director,
  playing,
  rivalUrl,
  hasLamp,
  settings,
  onCard,
  onProgress,
  onRoundFinished,
  onFinished,
}: RunnerProps) {
  const { camera } = useThree();
  const playerRef = useRef<THREE.Group>(null);
  const rivalRef = useRef<THREE.Group>(null);
  const locomotionRef = useRef<LocomotionState>("idle");
  const rivalLocomotionRef = useRef<LocomotionState>("idle");
  const upSignRef = useRef(1);
  const rivalUpRef = useRef(1);
  const phantomRef = useRef<string[]>([]);
  const snapshotRef = useRef<RoundSnapshot | null>(null);
  const impactsRef = useRef<ImpactEvent[]>([]);
  const shadowTargetsRef = useRef<ShadowTarget[]>([]);
  const lastCard = useRef("");
  const announced = useRef(false);
  const demoCaption = useRef<string | null>(null);

  const pilot = useMemo(
    () => new Autopilot(round.world.arena, DEFAULT_TUNING, round.world.rules.accepted),
    [round],
  );

  // The teaching beat takes the agent's gaze away from the autopilot for a few seconds.
  const demo = useMemo(() => new GazeDemonstration(), [round]);
  const demoTarget = useRef<PlatformDef | null>(null);
  const wasDemonstrating = useRef(false);

  const hasRival = round.snapshot().opponents.length > 0;

  useFrame((_, delta) => {
    const snapshot = round.snapshot();
    snapshotRef.current = snapshot;
    const game = snapshot.game;

    if (playing) {
      // The agent plays; its gaze still drives the rules, which is why the shot camera
      // below is kept entirely separate from the rig.
      // Is the teaching beat live? Asked before the step, because the gaze it sets is what
      // the rules read this frame.
      const demonstrating = director.demonstrating;
      if (demonstrating && !wasDemonstrating.current) {
        // Choose the platform at the moment the beat begins — wherever the agent happens
        // to have got to by then. A target chosen up front would be behind it.
        demoTarget.current = pickDemonstrationTarget(
          round.world.arena,
          round.world.rules.accepted,
          game.player.position,
          game.player.supportingPlatformId,
        );
        demo.reset();
      }
      wasDemonstrating.current = demonstrating;

      const staged = demonstrating ? demoTarget.current : null;

      if (game.status === "running") {
        if (staged) {
          // The agent stands still and performs. Its own navigation would walk it off the
          // mark mid-sentence, so the autopilot sits this beat out entirely.
          const frame = demo.update(game.gazeOrigin, staged, delta);
          round.world.camera.yaw = frame.yaw;
          round.world.camera.pitch = frame.pitch;
          demoCaption.current = frame.caption;
          round.update({ forward: 0, right: 0, jump: false, sprint: false }, NO_LOOK, delta);
        } else {
          demoCaption.current = null;
          const input = pilot.decide(game, (yaw, pitch) => {
            round.world.camera.yaw = yaw;
            round.world.camera.pitch = pitch;
          });
          round.update(input, NO_LOOK, delta);
        }
      } else if (!announced.current) {
        announced.current = true;
        onRoundFinished();
      }

      const subject = game.player.position;
      const focus = staged ? surfacePoint(staged) : null;
      const frame = director.update(subject, delta, focus);

      camera.position.set(frame.position.x, frame.position.y, frame.position.z);
      camera.up.set(0, 1, 0);
      camera.lookAt(frame.target.x, frame.target.y, frame.target.z);

      // During the beat the words come from the gaze schedule, so they can never drift out
      // of step with what the platform is doing.
      const caption = frame.demonstrate ? demoCaption.current : frame.caption;
      const key = `${frame.title ?? ""}|${caption ?? ""}`;
      if (key !== lastCard.current) {
        lastCard.current = key;
        onCard({ title: frame.title, caption });
      }
      onProgress(frame.progress);
      if (director.finished) onFinished();
    }

    // Keep the view alive even before play, so the idle screen is not a black rectangle.
    const group = playerRef.current;
    if (group) {
      const p = game.player.position;
      group.position.set(p.x, p.y - FOOT_DROP * game.rules.upSign, p.z);
      group.rotation.y = game.player.facing;
    }
    locomotionRef.current = game.player.locomotion;
    upSignRef.current = game.rules.upSign;
    phantomRef.current = game.rules.phantom;

    const targets = shadowTargetsRef.current;
    targets.length = 0;
    targets.push({ position: game.player.position, upSign: game.rules.upSign });
    for (const other of snapshot.opponents) {
      targets.push({
        position: { ...other.position, x: other.position.x + other.renderOffsetX },
        upSign: other.upSign,
      });
    }

    const rival = snapshot.opponents[0];
    if (rival && rivalRef.current) {
      rivalRef.current.position.set(
        rival.position.x + rival.renderOffsetX,
        rival.position.y - FOOT_DROP * rival.upSign,
        rival.position.z,
      );
      rivalRef.current.rotation.y = rival.facing;
      rivalLocomotionRef.current = rival.locomotion;
      rivalUpRef.current = rival.upSign;
    }

    if (!playing) {
      // A slow idle orbit so the start screen has motion behind it.
      const t = performance.now() * 0.00013;
      const subject = game.player.position;
      camera.position.set(
        subject.x + Math.cos(t) * 11,
        subject.y + 4.5,
        subject.z + Math.sin(t) * 11,
      );
      camera.lookAt(subject.x, subject.y + 1, subject.z);
    }
  });

  return (
    <Suspense fallback={null}>
      <ArenaView arena={round.world.arena} phantomRef={phantomRef} />
      <Backdrop arena={round.world.arena} />
      <ContactShadows arena={round.world.arena} targetsRef={shadowTargetsRef} />
      <Atmosphere arena={round.world.arena} moteCount={settings.moteCount} />
      <ArenaLights
        arena={round.world.arena}
        hasLampAsset={hasLamp}
        maxLamps={settings.maxLamps}
      />
      <ImpactField eventsRef={impactsRef} />
      <PlayerView
        ref={playerRef}
        locomotionRef={locomotionRef}
        upSignRef={upSignRef}
        visible
        tint={PLAYER_TINT}
      />
      {hasRival ? (
        <PlayerView
          ref={rivalRef}
          locomotionRef={rivalLocomotionRef}
          upSignRef={rivalUpRef}
          visible
          url={rivalUrl}
          tint="#ff5f6d"
        />
      ) : null}
    </Suspense>
  );
}
