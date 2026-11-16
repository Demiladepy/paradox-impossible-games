import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec3 } from "../../game/core/math.ts";

/**
 * Landing impacts.
 *
 * Without them a landing is silent to the eye: the character simply stops descending, and
 * jumps across a gap feel weightless however good the physics underneath is. A ring that
 * expands and fades from the feet costs almost nothing and gives every landing a moment of
 * contact.
 *
 * Rings are pooled and reused. Allocating geometry on a gameplay event would stutter at
 * exactly the moment the player is watching most closely.
 */

export interface ImpactEvent {
  position: Vec3;
  /** +1 normal, -1 when the landing happened on a ceiling under inverted gravity. */
  upSign: number;
  /** How hard the landing was, 0–1, for scale and brightness. */
  force: number;
}

const POOL_SIZE = 8;
const LIFETIME = 0.55;

interface Ring {
  mesh: THREE.Mesh;
  age: number;
  force: number;
  active: boolean;
}

export function ImpactField({ eventsRef }: { eventsRef: React.RefObject<ImpactEvent[]> }) {
  const group = useRef<THREE.Group>(null);

  const rings = useMemo<Ring[]>(() => {
    const geometry = new THREE.RingGeometry(0.42, 0.56, 28);
    return Array.from({ length: POOL_SIZE }, () => {
      const material = new THREE.MeshBasicMaterial({
        color: "#bff6ff",
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      return { mesh, age: 0, force: 0, active: false };
    });
  }, []);

  useFrame((_, delta) => {
    const container = group.current;
    if (!container) return;

    // Attach on first frame; doing it in a layout effect would race the pool creation.
    if (container.children.length === 0) {
      for (const ring of rings) container.add(ring.mesh);
    }

    const queued = eventsRef.current;
    if (queued && queued.length > 0) {
      for (const event of queued) {
        const free = rings.find((ring) => !ring.active);
        if (!free) break; // dropping an impact is better than stealing a visible one
        free.active = true;
        free.age = 0;
        free.force = event.force;
        free.mesh.visible = true;
        free.mesh.position.set(event.position.x, event.position.y + 0.04 * event.upSign, event.position.z);
        free.mesh.rotation.x = (-Math.PI / 2) * event.upSign;
      }
      queued.length = 0;
    }

    for (const ring of rings) {
      if (!ring.active) continue;
      ring.age += delta;

      const t = ring.age / LIFETIME;
      if (t >= 1) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }

      // Fast out, slow fade — the shape of an actual impact.
      const eased = 1 - Math.pow(1 - t, 3);
      const scale = 0.6 + eased * (2.4 + ring.force * 2.6);
      ring.mesh.scale.setScalar(scale);
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * (0.3 + ring.force * 0.5);
    }
  });

  return <group ref={group} />;
}
