import { useMemo } from "react";
import * as THREE from "three";
import { Clone, useGLTF } from "@react-three/drei";
import { surfaceY } from "../../game/arena/reach.ts";
import type { ArenaDefinition } from "../../game/arena/types.ts";

/**
 * Lamps along the route.
 *
 * Uniform lighting flattens a course: every platform reads at the same brightness, so the
 * eye gets no sense of distance or rhythm and the whole thing looks like one object. Hanging
 * a few practical lights over the route creates pools to move between, which gives the
 * traversal a beat and the arena a built, maintained feel rather than a floating one.
 *
 * Placement is derived from the arena's own route, so it works for any arena without being
 * hand-placed — and the lamp is a Lux3D asset, so the thing casting the light is visible.
 */

const LAMP_URL = "/assets/generated/flood-lamp.glb";

/** Point lights are not free; this is the budget before the rhythm stops being worth it. */
const MAX_LAMPS = 5;

/**
 * A soft radial falloff, drawn once into a canvas.
 *
 * A flat disc with additive blending still has a hard rim, and a hard rim reads as a circle
 * painted on the floor rather than as light falling on it. The gradient costs one small
 * texture and fixes it completely.
 */
function createPoolTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.45)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Alternating so the course reads as a sequence rather than a corridor of one colour. */
const LAMP_COLOURS = ["#ffd9a8", "#9fe8ff"];

interface ArenaLightsProps {
  arena: ArenaDefinition;
  /** False until the generated lamp exists, in which case only the light is placed. */
  hasLampAsset: boolean;
  /** Quality budget. Point lights are the most expensive thing in the scene. */
  maxLamps?: number;
}

export function ArenaLights({ arena, hasLampAsset, maxLamps = MAX_LAMPS }: ArenaLightsProps) {
  const poolTexture = useMemo(() => createPoolTexture(), []);
  const placements = useMemo(() => {
    const byId = new Map(arena.platforms.map((p) => [p.id, p]));
    const route = arena.route
      .map((id) => byId.get(id))
      .filter((platform): platform is NonNullable<typeof platform> => Boolean(platform));

    if (route.length === 0) return [];

    // Spread the budget evenly along the route rather than clustering at the start.
    const step = Math.max(1, Math.floor(route.length / maxLamps));
    const chosen: typeof route = [];
    for (let i = 0; i < route.length && chosen.length < maxLamps; i += step) {
      const platform = route[i];
      if (platform) chosen.push(platform);
    }

    return chosen.map((platform, index) => ({
      id: platform.id,
      colour: LAMP_COLOURS[index % LAMP_COLOURS.length] ?? "#ffd9a8",
      position: {
        x: platform.position.x,
        y: surfaceY(platform) + 7.5,
        z: platform.position.z,
      },
      surfaceY: surfaceY(platform),
    }));
  }, [arena, maxLamps]);

  return (
    <group>
      {placements.map((lamp) => (
        <group key={lamp.id} position={[lamp.position.x, lamp.position.y, lamp.position.z]}>
          {/* No shadow casting: five shadow-mapped point lights would cost far more than
              the rhythm is worth, and the key light already grounds everything. */}
          <pointLight color={lamp.colour} intensity={26} distance={16} decay={2} />
          {hasLampAsset ? <LampFixture colour={lamp.colour} /> : null}

          {/* The pool on the floor. Sells the light without needing a second shadow pass. */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, lamp.surfaceY - lamp.position.y + 0.03, 0]}
          >
            <planeGeometry args={[9.5, 9.5]} />
            <meshBasicMaterial
              map={poolTexture}
              color={lamp.colour}
              transparent
              opacity={0.26}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function LampFixture({ colour }: { colour: string }) {
  const { scene } = useGLTF(LAMP_URL);

  const fixture = useMemo(() => {
    const source = scene.clone(true);
    const box = new THREE.Box3().setFromObject(source);
    const size = new THREE.Vector3();
    box.getSize(size);
    const height = size.y || 1;

    const wrapper = new THREE.Group();
    // Hang it from its top, since it is suspended rather than standing.
    source.position.set(0, -box.max.y, 0);
    const inner = new THREE.Group();
    inner.add(source);
    inner.scale.setScalar(1 / height);
    wrapper.add(inner);
    return wrapper;
  }, [scene]);

  return (
    <group>
      <Clone object={fixture} scale={2.1} />
      {/* A small bright disc at the lamp itself, so the bloom has a source to flare. */}
      <mesh position={[0, -1.1, 0]}>
        <sphereGeometry args={[0.26, 12, 12]} />
        <meshBasicMaterial color={colour} />
      </mesh>
    </group>
  );
}
