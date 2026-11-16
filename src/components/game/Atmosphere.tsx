import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Rng } from "../../game/core/rng.ts";
import type { ArenaDefinition } from "../../game/arena/types.ts";

/**
 * Depth for the void.
 *
 * The arenas are islands in empty black, and empty black has no scale — a platform six
 * metres away and one sixty metres away look identical against it. Motes drifting through
 * the space give the eye something to measure distance by, and the haze planes keep the
 * drop below reading as *deep* rather than as the edge of the render.
 *
 * Seeded, so two runs of the same arena look the same and a recorded trailer can be
 * re-shot frame for frame.
 */

const MOTE_COUNT = 900;

export function Atmosphere({ arena }: { arena: ArenaDefinition }) {
  const points = useRef<THREE.Points>(null);

  const { geometry, bounds } = useMemo(() => {
    const rng = new Rng(`${arena.id}-atmosphere`);

    // Fit the field to the arena rather than a fixed box, so a short arena is not mostly
    // empty sky and a long one is not bare at the far end.
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const platform of arena.platforms) {
      minZ = Math.min(minZ, platform.position.z - platform.size.z);
      maxZ = Math.max(maxZ, platform.position.z + platform.size.z);
    }
    const span = { minZ: minZ - 10, maxZ: maxZ + 10 };

    const positions = new Float32Array(MOTE_COUNT * 3);
    const speeds = new Float32Array(MOTE_COUNT);

    for (let i = 0; i < MOTE_COUNT; i++) {
      positions[i * 3] = rng.range(-26, 26);
      positions[i * 3 + 1] = rng.range(-14, 24);
      positions[i * 3 + 2] = rng.range(span.minZ, span.maxZ);
      speeds[i] = rng.range(0.1, 0.5);
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    return { geometry: buffer, bounds: span };
  }, [arena]);

  useFrame((_, delta) => {
    const object = points.current;
    if (!object) return;

    const position = object.geometry.getAttribute("position") as THREE.BufferAttribute;
    const speed = object.geometry.getAttribute("aSpeed") as THREE.BufferAttribute;

    // Drift upward slowly and wrap, which reads as dust in a draught rather than snow.
    for (let i = 0; i < position.count; i++) {
      let y = position.getY(i) + speed.getX(i) * delta;
      if (y > 24) y = -14;
      position.setY(i, y);
    }
    position.needsUpdate = true;
  });

  return (
    <group>
      <points ref={points} geometry={geometry} frustumCulled={false}>
        <pointsMaterial
          size={0.075}
          sizeAttenuation
          color="#9fd8ff"
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Two faint planes below the course. They catch the rim light and give the fall a
          floor to read against, without ever being something you can land on. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, arena.killPlaneY + 2, (bounds.minZ + bounds.maxZ) / 2]}
      >
        <planeGeometry args={[120, Math.abs(bounds.maxZ - bounds.minZ) + 60]} />
        <meshBasicMaterial color="#0b1f2e" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, arena.killPlaneY - 6, (bounds.minZ + bounds.maxZ) / 2]}
      >
        <planeGeometry args={[160, Math.abs(bounds.maxZ - bounds.minZ) + 90]} />
        <meshBasicMaterial color="#071726" transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  );
}
