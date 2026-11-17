import { useCallback, useMemo, useRef } from "react";
import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ArenaDefinition, DecorDef, PlatformDef } from "../../game/arena/types.ts";

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

/** Scenery assets, all Lux3D-generated, keyed by their manifest name. */
const DECOR_URLS: Record<string, string> = {
  "exit-obelisk": "/assets/generated/exit-obelisk.glb",
  "arena-pillar": "/assets/generated/arena-pillar.glb",
};

interface ArenaViewProps {
  arena: ArenaDefinition;
  /**
   * Ids of platforms with no collision right now, updated every frame.
   *
   * A bare list rather than the whole snapshot: this component only cares which platforms
   * are currently unmade, and taking the narrow dependency keeps it working whatever the
   * simulation wraps itself in next.
   */
  phantomRef: React.RefObject<string[]>;
}

export function ArenaView({ arena, phantomRef }: ArenaViewProps) {
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

  const registerLip = useCallback((id: string, object: THREE.Object3D | null) => {
    if (object) lipRefs.current.set(id, object);
    else lipRefs.current.delete(id);
  }, []);

  const registerGhostFill = useCallback((id: string, object: THREE.Object3D | null) => {
    if (object) ghostFillRefs.current.set(id, object);
    else ghostFillRefs.current.delete(id);
  }, []);

  /** 0 = fully there, 1 = fully unmade. Eased per platform so the change reads. */
  const dissolve = useRef(new Map<string, number>());
  const lipRefs = useRef(new Map<string, THREE.Object3D>());
  const ghostFillRefs = useRef(new Map<string, THREE.Object3D>());
  const clock = useRef(0);

  useFrame((_, delta) => {
    clock.current += delta;
    const phantom = phantomRef.current;
    if (!phantom) return;

    for (const [id, object] of solidRefs.current) {
      const target = phantom.includes(id) ? 1 : 0;
      const current = dissolve.current.get(id) ?? target;

      // Framerate-independent easing. Unmaking is quicker than remaking: the floor should
      // drop away the instant you look at it, but return with enough weight that you can
      // see it is safe before you commit to the jump.
      const halfLife = target > current ? 0.028 : 0.05;
      const next =
        Math.abs(target - current) < 0.002
          ? target
          : target + (current - target) * Math.pow(2, -delta / halfLife);
      dissolve.current.set(id, next);

      // Collapse rather than fade: the slab's material is shared across every platform
      // that uses it, so changing opacity here would dissolve the whole arena at once.
      const scale = Math.max(0.0001, 1 - next);
      object.scale.setScalar(scale);
      object.visible = next < 0.995;

      // Conditional platforms pulse gently while solid. Without it the player cannot
      // tell which ground answers to the rule until it vanishes under them, which is a
      // lesson learned one death at a time rather than by looking.
      const lip = lipRefs.current.get(id);
      if (lip) {
        const material = (lip as THREE.LineSegments).material;
        if (material instanceof THREE.LineBasicMaterial) {
          const pulse = 0.78 + Math.sin(clock.current * 2.1) * 0.22;
          material.opacity = next > 0.01 ? 0.25 : pulse;
        }
      }

      const ghost = ghostRefs.current.get(id);
      if (ghost) {
        ghost.visible = next > 0.005;
        ghost.scale.setScalar(0.93 + next * 0.07);
        const material = (ghost as THREE.LineSegments).material;
        if (material instanceof THREE.LineBasicMaterial) {
          material.opacity = 0.62 * next;
        }
      }

      // The footprint fill. A one-pixel wireframe is the first thing video compression
      // destroys, and the unmade platform is the shot the whole demo rests on — so the
      // outline is backed by an area, which survives both compression and a small screen.
      // It breathes slowly to read as *actively* unmade rather than as a pink floor, and
      // it is kept faint on purpose: the mechanic fails the moment this looks solid.
      const fill = ghostFillRefs.current.get(id);
      if (fill) {
        fill.visible = next > 0.005;
        const material = (fill as THREE.Mesh).material;
        if (material instanceof THREE.MeshBasicMaterial) {
          const breath = 0.78 + Math.sin(clock.current * 1.7) * 0.22;
          material.opacity = 0.17 * next * breath;
        }
      }
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
          registerLip={registerLip}
          registerGhostFill={registerGhostFill}
        />
      ))}
      <Decor arena={arena} />
      <ExitMarker arena={arena} />
    </group>
  );
}

interface PlatformProps {
  platform: PlatformDef;
  slab: THREE.Group;
  registerSolid: (id: string, object: THREE.Object3D | null) => void;
  registerGhost: (id: string, object: THREE.Object3D | null) => void;
  registerLip: (id: string, object: THREE.Object3D | null) => void;
  registerGhostFill: (id: string, object: THREE.Object3D | null) => void;
}

function Platform({
  platform,
  slab,
  registerSolid,
  registerGhost,
  registerLip,
  registerGhostFill,
}: PlatformProps) {
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
        <lineBasicMaterial color="#ff8fb4" transparent opacity={0.9} />
      </lineSegments>

      {/* The area the outline encloses, drawn on the plane the surface used to occupy.
          Additive and depth-write-off so it reads as light rather than material, and so
          it never occludes the player falling through the hole it marks. */}
      <mesh
        ref={(object) => registerGhostFill(id, object)}
        position={[0, size.y / 2 + 0.012, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      >
        <planeGeometry args={[size.x, size.z]} />
        <meshBasicMaterial
          color="#ff8fb4"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* A bright lip on the top edge. Without it, dark platforms read as holes and you
          cannot judge a jump. */}
      <lineSegments
        ref={(object) => registerLip(id, object)}
        position={[0, size.y / 2 + 0.01, 0]}
        geometry={lipEdges}
      >
        {/* Line colours are emissive by nature — whatever is set here is what the bloom
            pass sees, so these sit deliberately above its luminance threshold. */}
        <lineBasicMaterial
          color={conditional ? "#8dffe4" : "#9fb4e0"}
          transparent
          opacity={conditional ? 1 : 0.9}
        />
      </lineSegments>
    </group>
  );
}

/**
 * Lux3D scenery.
 *
 * Each asset is loaded once and cloned per placement, then normalised to the height the
 * arena asked for — generated models arrive at whatever scale Lux3D predicted (D-008), so
 * nothing here can assume a unit size.
 */
function Decor({ arena }: { arena: ArenaDefinition }) {
  const items = arena.decor ?? [];
  const names = [...new Set(items.map((item) => item.asset))];

  return (
    <group>
      {names.map((name) => (
        <DecorGroup
          key={name}
          url={DECOR_URLS[name] ?? ""}
          placements={items.filter((item) => item.asset === name)}
        />
      ))}
    </group>
  );
}

function DecorGroup({ url, placements }: { url: string; placements: DecorDef[] }) {
  const { scene } = useGLTF(url);

  const normalised = useMemo(() => {
    const source = scene.clone(true);
    const box = new THREE.Box3().setFromObject(source);
    const size = new THREE.Vector3();
    box.getSize(size);
    const height = size.y || 1;

    const wrapper = new THREE.Group();
    // Sit the model on its own base, so a placement's y is where it stands.
    source.position.set(0, -box.min.y, 0);
    const inner = new THREE.Group();
    inner.add(source);
    inner.scale.setScalar(1 / height);
    wrapper.add(inner);

    wrapper.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return wrapper;
  }, [scene]);

  return (
    <group>
      {placements.map((item, index) => (
        <Clone
          key={`${item.asset}-${index}`}
          object={normalised}
          position={[item.position.x, item.position.y, item.position.z]}
          rotation={[0, item.rotationY ?? 0, 0]}
          scale={item.height}
        />
      ))}
    </group>
  );
}

function ExitMarker({ arena }: { arena: ArenaDefinition }) {
  const { position, radius } = arena.exit;
  return (
    <group position={[position.x, position.y, position.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.38, 0]}>
        <ringGeometry args={[radius * 0.72, radius, 48]} />
        <meshBasicMaterial color="#9bffe8" transparent opacity={1} side={THREE.DoubleSide} />
      </mesh>
      {/* A tall beam so the objective is visible from the start pad. */}
      <mesh position={[0, 11, 0]}>
        <cylinderGeometry args={[radius * 0.42, radius * 0.42, 22, 20, 1, true]} />
        <meshBasicMaterial
          color="#7dffdc"
          transparent
          opacity={0.16}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <pointLight color="#5ef2c4" intensity={22} distance={18} position={[0, 1.4, 0]} />
    </group>
  );
}
