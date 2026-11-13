import { useMemo } from "react";
import { Clone, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { ArenaDefinition, PlatformDef } from "../../game/arena/types.ts";

/**
 * Draws the arena.
 *
 * The visible platforms are Lux3D-generated geometry; the colliders behind them are
 * plain cuboids defined in the arena data. That separation is deliberate — a generated
 * mesh is far too dense to collide against and its exact shape is not under our control.
 */

const SLAB_URL = "/assets/generated/platform-slab.glb";

interface ArenaViewProps {
  arena: ArenaDefinition;
}

export function ArenaView({ arena }: ArenaViewProps) {
  const { scene: slab } = useGLTF(SLAB_URL);

  /**
   * The generated slab arrives at whatever scale Lux3D predicted (0.30 units for this
   * one — D-008), so normalise it to a unit cube once and scale per platform from there.
   */
  const unitSlab = useMemo(() => {
    const source = slab.clone(true);
    const box = new THREE.Box3().setFromObject(source);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const wrapper = new THREE.Group();
    source.position.set(-center.x, -center.y, -center.z);
    const inner = new THREE.Group();
    inner.add(source);
    inner.scale.set(1 / (size.x || 1), 1 / (size.y || 1), 1 / (size.z || 1));
    wrapper.add(inner);

    wrapper.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = true;
      }
    });
    return wrapper;
  }, [slab]);

  return (
    <group>
      {arena.platforms.map((platform) => (
        <Platform key={platform.id} platform={platform} slab={unitSlab} />
      ))}
      <ExitMarker arena={arena} />
    </group>
  );
}

function Platform({ platform, slab }: { platform: PlatformDef; slab: THREE.Group }) {
  const { position, size } = platform;
  const conditional = platform.surface === "conditional";

  return (
    <group position={[position.x, position.y, position.z]}>
      {platform.visual ? (
        <Clone object={slab} scale={[size.x, size.y, size.z]} />
      ) : (
        <mesh receiveShadow>
          <boxGeometry args={[size.x, size.y, size.z]} />
          <meshStandardMaterial color="#1a1f2e" roughness={0.85} metalness={0.1} />
        </mesh>
      )}

      {/* A bright lip on the top edge. Without it, dark platforms read as holes and you
          cannot judge a jump. */}
      <lineSegments position={[0, size.y / 2 + 0.01, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(size.x, 0.02, size.z)]} />
        <lineBasicMaterial
          color={conditional ? "#5ef2c4" : "#44506b"}
          transparent
          opacity={conditional ? 0.9 : 0.55}
        />
      </lineSegments>
    </group>
  );
}

function ExitMarker({ arena }: { arena: ArenaDefinition }) {
  const { position, radius } = arena.exit;
  return (
    <group position={[position.x, position.y, position.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.38, 0]}>
        <ringGeometry args={[radius * 0.72, radius, 48]} />
        <meshBasicMaterial color="#5ef2c4" transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
      {/* A tall beam so the objective is visible from the start pad. */}
      <mesh position={[0, 11, 0]}>
        <cylinderGeometry args={[radius * 0.42, radius * 0.42, 22, 20, 1, true]} />
        <meshBasicMaterial
          color="#5ef2c4"
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <pointLight color="#5ef2c4" intensity={14} distance={14} position={[0, 1.4, 0]} />
    </group>
  );
}
