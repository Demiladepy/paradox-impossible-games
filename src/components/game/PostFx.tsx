import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
  HueSaturation,
  BrightnessContrast,
  DepthOfField,
  SMAA,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { useMemo } from "react";
import type { QualitySettings } from "../../game/settings/quality.ts";

/**
 * The post pass.
 *
 * This is the single largest visual change in the project, and it is mostly one effect:
 * bloom. The arena is lit by thin emissive edges — platform lips, the exit beam, the
 * outline of ground that has been unmade — and without bloom those read as hairline
 * strokes. With it they *glow*, the black void picks up atmosphere, and the whole thing
 * stops looking like a wireframe test and starts looking like a place.
 *
 * `luminanceThreshold` is set above the diffuse range of the generated slabs so only the
 * emissive accents bloom. Raising it much further loses the exit beam; lowering it turns
 * the floor into a smear.
 */

export function PostFx({
  settings,
  cinematic = false,
}: {
  settings: QualitySettings;
  /**
   * Trailer only. Depth of field is lovely on a camera that knows where to look and
   * actively harmful on one the player is steering — a blurred platform is a platform you
   * cannot judge a jump against.
   */
  cinematic?: boolean;
}) {
  // Chromatic aberration wants a Vector2 and will churn a new one every frame otherwise.
  const offset = useMemo(() => new THREE.Vector2(0.00042, 0.00042), []);

  return (
    <EffectComposer
      // The generated models carry their own PBR maps; letting the composer re-apply tone
      // mapping on top of the renderer's crushes them.
      enableNormalPass={false}
      multisampling={0}
    >
      {cinematic && settings.smaa ? (
        <DepthOfField focusDistance={0.012} focalLength={0.045} bokehScale={3.2} />
      ) : null}
      {settings.bloom ? (
      <Bloom
        intensity={1.35}
        luminanceThreshold={0.62}
        luminanceSmoothing={0.28}
        mipmapBlur
        radius={0.72}
      />
      ) : null}
      {settings.chromaticAberration ? (
      <ChromaticAberration
        offset={offset}
        radialModulation
        modulationOffset={0.35}
        blendFunction={BlendFunction.NORMAL}
      />
      ) : null}
      {/* A light grade. Pushing saturation and contrast after the bloom keeps the teal
          accents vivid against the near-black without the slabs turning muddy — the
          generated PBR maps are fairly desaturated on their own. */}
      <HueSaturation saturation={0.16} hue={0} />
      <BrightnessContrast brightness={-0.015} contrast={0.14} />
      <Vignette eskil={false} offset={0.24} darkness={0.82} />
      {settings.smaa ? <SMAA /> : null}
    </EffectComposer>
  );
}
