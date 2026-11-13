import { forwardRef, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import type { LocomotionState } from "../../game/player/controller.ts";
import { CLIP_FOR_STATE } from "../../game/player/animation.ts";

/**
 * The Lux3D contestant.
 *
 * This is the first thing that drives the retargeted clips for real, and therefore the
 * check on D-009: the clips were renamed from Lux3D's positional `animation_N` aliases to
 * the IDs we requested, and this component asks for them by name. If the mapping were
 * wrong, the wrong animation would play here.
 */

const CONTESTANT_URL = "/assets/generated/contestant-01-anim.glb";

/** Height in metres to normalise the generated model to — Lux3D's own scale varies (D-008). */
const TARGET_HEIGHT = 1.78;

/** Lux3D characters are authored facing +Z; our yaw convention has 0 facing -Z. */
const MODEL_YAW_OFFSET = Math.PI;

interface PlayerViewProps {
  /** Read every frame rather than passed as a prop, to avoid re-rendering at 60 Hz. */
  locomotionRef: React.RefObject<LocomotionState>;
  visible: boolean;
}

export const PlayerView = forwardRef<THREE.Group, PlayerViewProps>(function PlayerView(
  { locomotionRef, visible },
  ref,
) {
  const inner = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(CONTESTANT_URL);

  const model = useMemo(() => cloneSkinned(scene) as THREE.Group, [scene]);

  /** Normalise so the character stands TARGET_HEIGHT tall with feet at the group origin. */
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = size.y > 1e-5 ? TARGET_HEIGHT / size.y : 1;
    return { scale, footOffset: -box.min.y * scale };
  }, [model]);

  const { actions, mixer } = useAnimations(animations, inner);
  const current = useRef<string | null>(null);

  useEffect(() => {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.frustumCulled = false; // skinned bounds go stale during animation
      }
    });
  }, [model]);

  // Report which clips were actually found, once. If a name is missing the model will
  // stand still, and silence would make that look like a physics bug rather than a
  // naming one.
  useEffect(() => {
    const available = new Set(animations.map((clip) => clip.name));
    const missing = Object.values(CLIP_FOR_STATE).filter((name) => !available.has(name));
    if (missing.length > 0) {
      console.warn(
        `[PlayerView] contestant GLB is missing expected clips: ${missing.join(", ")}. ` +
          `Found: ${[...available].join(", ")}. Run "npm run relabel:clips -- contestant-01-anim".`,
      );
    }
  }, [animations]);

  useFrame(() => {
    const state = locomotionRef.current ?? "idle";
    const wanted = CLIP_FOR_STATE[state];
    if (wanted === current.current) return;

    const next = actions[wanted];
    if (!next) return;

    const previous = current.current ? actions[current.current] : null;
    // Airborne transitions need to be quick or the pose lags behind the arc.
    const fade = state === "rise" || state === "fall" ? 0.08 : 0.18;

    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (state === "rise") {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    previous?.fadeOut(fade);
    current.current = wanted;
  });

  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  return (
    <group ref={ref} visible={visible}>
      <group ref={inner} position={[0, fit.footOffset, 0]} rotation={[0, MODEL_YAW_OFFSET, 0]}>
        <primitive object={model} scale={fit.scale} />
      </group>
    </group>
  );
});
