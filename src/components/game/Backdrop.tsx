import { useMemo } from "react";
import * as THREE from "three";
import { Rng } from "../../game/core/rng.ts";
import type { ArenaDefinition } from "../../game/arena/types.ts";

/**
 * A horizon for the void.
 *
 * Flat black has no altitude — the arena could be floating six metres above a floor or six
 * kilometres above nothing, and the eye cannot tell. A graded sky and a silhouetted skyline
 * put the course *somewhere*: suspended high inside a structure far larger than itself,
 * which is what the fiction says and what the lighting has been implying all along.
 *
 * The towers are plain boxes, deliberately. They sit a hundred and fifty metres out and
 * are drawn almost black, so no amount of surface detail survives — an earlier version
 * cloned the generated pillar out there and spent a quarter of a million triangles on
 * silhouettes nobody can resolve. Lux3D assets earn their cost where the player can
 * actually see them.
 */

/** Far enough to sit behind the fog, near enough to parallax as the camera moves. */
const SKYLINE_RADIUS = 150;
const SKYLINE_COUNT = 14;

export function Backdrop({ arena }: { arena: ArenaDefinition }) {
  const centreZ = useMemo(() => {
    const zs = arena.platforms.map((platform) => platform.position.z);
    return zs.length > 0 ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0;
  }, [arena]);

  return (
    <group position={[0, 0, centreZ]}>
      <SkyDome />
      <Skyline arenaId={arena.id} />
    </group>
  );
}

/**
 * A vertical gradient on the inside of a large sphere.
 *
 * Rendered with depth writing off and at the back of the draw order so it never occludes
 * anything, and unaffected by fog — it *is* the thing the fog fades into.
 */
function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color("#101d2e") },
          uHorizon: { value: new THREE.Color("#07101c") },
          uBottom: { value: new THREE.Color("#02040a") },
        },
        vertexShader: /* glsl */ `
          varying float vHeight;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vHeight = normalize(position).y;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uHorizon;
          uniform vec3 uBottom;
          varying float vHeight;
          void main() {
            // Two ramps meeting at the horizon, so the band near eye level stays darkest
            // and the structure silhouettes against it.
            vec3 colour = vHeight > 0.0
              ? mix(uHorizon, uTop, pow(vHeight, 0.65))
              : mix(uHorizon, uBottom, pow(-vHeight, 0.5));
            gl_FragColor = vec4(colour, 1.0);
          }
        `,
      }),
    [],
  );

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[320, 32, 24]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function Skyline({ arenaId }: { arenaId: string }) {
  const towers = useMemo(() => {
    const rng = new Rng(`${arenaId}-skyline`);
    return Array.from({ length: SKYLINE_COUNT }, () => {
      const angle = rng.range(0, Math.PI * 2);
      const distance = SKYLINE_RADIUS * rng.range(0.8, 1.35);
      return {
        x: Math.cos(angle) * distance,
        z: Math.sin(angle) * distance,
        // Tall and varied: the point is a ragged roofline, not a fence.
        height: rng.range(70, 190),
        width: rng.range(14, 34),
        depth: rng.range(14, 34),
        y: rng.range(-80, -40),
        rotation: rng.range(0, Math.PI * 2),
      };
    });
  }, [arenaId]);

  return (
    <group>
      {towers.map((tower, index) => (
        <mesh
          key={index}
          position={[tower.x, tower.y + tower.height / 2, tower.z]}
          rotation={[0, tower.rotation, 0]}
        >
          <boxGeometry args={[tower.width, tower.height, tower.depth]} />
          <meshBasicMaterial color="#060d16" fog={false} />
        </mesh>
      ))}
    </group>
  );
}
