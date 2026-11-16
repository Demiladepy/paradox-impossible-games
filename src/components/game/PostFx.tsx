import { EffectComposer, Bloom, Vignette, ChromaticAberration, SMAA } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { useMemo } from "react";

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

export function PostFx() {
  // Chromatic aberration wants a Vector2 and will churn a new one every frame otherwise.
  const offset = useMemo(() => new THREE.Vector2(0.00042, 0.00042), []);

  return (
    <EffectComposer
      // The generated models carry their own PBR maps; letting the composer re-apply tone
      // mapping on top of the renderer's crushes them.
      enableNormalPass={false}
      multisampling={0}
    >
      <Bloom
        intensity={1.35}
        luminanceThreshold={0.62}
        luminanceSmoothing={0.28}
        mipmapBlur
        radius={0.72}
      />
      <ChromaticAberration
        offset={offset}
        radialModulation
        modulationOffset={0.35}
        blendFunction={BlendFunction.NORMAL}
      />
      <Vignette eskil={false} offset={0.26} darkness={0.78} />
      <SMAA />
    </EffectComposer>
  );
}
