import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

export interface ModelStats {
  triangles: number;
  meshes: number;
  skinnedMeshes: number;
  bones: number;
  clips: string[];
  /** Longest dimension of the model's bounding box, in the file's own units. */
  sizeMeters: number;
}

interface ModelProps {
  url: string;
  activeClip: string | null;
  showSkeleton: boolean;
  onStats: (stats: ModelStats) => void;
}

function Model({ url, activeClip, showSkeleton, onStats }: ModelProps) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);

  // Clone so switching assets (and StrictMode double-mounts) can't corrupt the cache.
  const model = useMemo(() => cloneSkinned(scene) as THREE.Group, [scene]);
  const { actions, mixer } = useAnimations(animations, group);

  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2 / maxDim;
    return { scale, center, maxDim };
  }, [model]);

  const skeleton = useMemo(() => {
    if (!showSkeleton) return null;
    const helper = new THREE.SkeletonHelper(model);
    (helper.material as THREE.LineBasicMaterial).depthTest = false;
    return helper;
  }, [model, showSkeleton]);

  useLayoutEffect(() => {
    let triangles = 0;
    let meshes = 0;
    let skinnedMeshes = 0;
    let bones = 0;

    model.traverse((child) => {
      if (child instanceof THREE.Bone) bones++;
      if (child instanceof THREE.SkinnedMesh) skinnedMeshes++;
      if (child instanceof THREE.Mesh) {
        meshes++;
        const geometry = child.geometry;
        const index = geometry.getIndex();
        const position = geometry.getAttribute("position");
        if (index) triangles += index.count / 3;
        else if (position) triangles += position.count / 3;
      }
    });

    onStats({
      triangles: Math.round(triangles),
      meshes,
      skinnedMeshes,
      bones,
      clips: animations.map((clip) => clip.name),
      sizeMeters: fit.maxDim,
    });
  }, [model, animations, fit.maxDim, onStats]);

  useEffect(() => {
    mixer.stopAllAction();
    if (!activeClip) return;
    const action = actions[activeClip];
    if (!action) return;
    action.reset().fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, mixer, activeClip]);

  return (
    <group ref={group}>
      <group scale={fit.scale} position={[0, 0, 0]}>
        <group position={[-fit.center.x, -fit.center.y, -fit.center.z]}>
          <primitive object={model} />
          {skeleton ? <primitive object={skeleton} /> : null}
        </group>
      </group>
    </group>
  );
}

interface AssetViewerProps {
  url: string;
  activeClip: string | null;
  showSkeleton: boolean;
  onStats: (stats: ModelStats) => void;
}

export function AssetViewer({ url, activeClip, showSkeleton, onStats }: AssetViewerProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
  }, [url]);

  return (
    <>
      <Canvas
        camera={{ position: [2.6, 1.9, 3.1], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <color attach="background" args={["#07080c"]} />
        <fog attach="fog" args={["#07080c", 8, 22]} />

        {/* Deliberately no drei <Environment> preset: those fetch an HDR from a CDN, and
            this project has to run with the network unplugged. Plain lights instead. */}
        <hemisphereLight args={["#9fd8ff", "#10131c", 0.65]} />
        <directionalLight position={[4, 6, 3]} intensity={2.1} color="#ffffff" />
        <directionalLight position={[-5, 2, -4]} intensity={0.9} color="#5ef2c4" />
        <pointLight position={[0, -2, 2]} intensity={0.4} color="#6b8cff" />

        <Suspense fallback={null}>
          <Model
            key={url}
            url={url}
            activeClip={activeClip}
            showSkeleton={showSkeleton}
            onStats={(stats) => {
              setReady(true);
              onStats(stats);
            }}
          />
        </Suspense>

        <Grid
          args={[24, 24]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#1b2130"
          sectionSize={2}
          sectionThickness={1}
          sectionColor="#2a3447"
          fadeDistance={20}
          fadeStrength={1.2}
          infiniteGrid
          position={[0, -1.02, 0]}
        />

        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={1.4}
          maxDistance={12}
          target={[0, 0, 0]}
          autoRotate
          autoRotateSpeed={0.6}
        />
      </Canvas>
      {!ready ? <div className="loading">Loading asset…</div> : null}
    </>
  );
}
