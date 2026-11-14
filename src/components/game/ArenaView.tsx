import { useCallback, useMemo, useRef } from "react";
import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ArenaDefinition, PlatformDef } from "../../game/arena/types.ts";
import type { GameSnapshot } from "../../game/GameWorld.ts";

/**
 * Draws the arena, and shows what the rules are doing to it.
 *
 * The visible platforms are Lux3D-generated geometry; the colliders behind them are plain
 * cuboids defined in the arena data. A generated mesh is far too dense to collide against
 * and its exact shape is not under our control.
 *
 * Rule state arrives through a ref and is applied in `useFrame`, never through props: a
 * platform can change solidity many times a second, and re-rendering the React tree at
 * that rate to toggle a boolean would be absurd.
 */

const SLAB_URL = "/assets/generated/platform-slab.glb";

interface ArenaViewProps {
  arena: ArenaDefinition;
  snapshotRef: React.RefObject<GameSnapshot | null>;
}

export function ArenaView({ arena, snapshotRef }: ArenaViewProps) {
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

  const solidRefs = useRef(new Map<string, THREE.Object3D>());
  const ghostRefs = useRef(new Map<string, THREE.Object3D>());

  const registerSolid = useCallback((id: string, object: THREE.Object3D | null) => {
    if (object) solidRefs.current.set(id, object);
    else solidRefs.current.delete(id);
  }, []);

  const registerGhost = useCallback((id: string, object: THREE.Object3D | null) => {
    if (object) ghostRefs.current.set(id, object);
    else ghostRefs.current.delete(id);
  }, []);

  useFrame(() => {
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    const phantom = snapshot.rules.phantom;

    for (const [id, object] of solidRefs.current) {
      object.visible = !phantom.includes(id);
    }
    for (const [id, object] of ghostRefs.current) {
      object.visible = phantom.includes(id);
    }
  });

  return (
    <group>
      {arena.platforms.map((platform) => (
        <Platform
          key={platform.id}
          platform={platform}
          slab={unitSlab}
          registerSolid={registerSolid}
          registerGhost={registerGhost}
        />
      ))}
      <ExitMarker arena={arena} />
    </group>
  );
}

interface PlatformProps {
  platform: PlatformDef;
  slab: THREE.Group;
  registerSolid: (id: string, object: THREE.Object3D | null) => void;
  registerGhost: (id: string, object: THREE.Object3D | null) => void;
}

function Platform({ platform, slab, registerSolid, registerGhost }: PlatformProps) {
  const { position, size, id } = platform;
  const conditional = platform.surface === "conditional";

  const boxGeometry = useMemo(
    () => new THREE.BoxGeometry(size.x, size.y, size.z),
    [size.x, size.y, size.z],
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(boxGeometry), [boxGeometry]);
  const lipEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, 0.02, size.z)),
    [size.x, size.z],
  );

  return (
    <group position={[position.x, position.y, position.z]}>
      {/* The platform as it exists when solid. */}
      <group ref={(object) => registerSolid(id, object)}>
        {platform.visual ? (
          <Clone object={slab} scale={[size.x, size.y, size.z]} />
        ) : (
          <mesh receiveShadow geometry={boxGeometry}>
            <meshStandardMaterial color="#1a1f2e" roughness={0.85} metalness={0.1} />
          </mesh>
        )}
      </group>

      {/* What is left when a rule unmakes it: an outline where the floor used to be, so
          the player can see where to aim once they look away. Hidden by default. */}
      <lineSegments ref={(object) => registerGhost(id, object)} geometry={edges} visible={false}>
        <lineBasicMaterial color="#ff5f8f" transparent opacity={0.55} />
      </lineSegments>

      {/* A bright lip on the top edge. Without it, dark platforms read as holes and you
          cannot judge a jump. */}
      <lineSegments position={[0, size.y / 2 + 0.01, 0]} geometry={lipEdges}>
        <lineBasicMaterial
          color={conditional ? "#5ef2c4" : "#7d92bd"}
          transparent
          opacity={conditional ? 0.95 : 0.8}
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
