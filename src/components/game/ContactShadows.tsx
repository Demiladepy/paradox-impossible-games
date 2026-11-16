import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec3 } from "../../game/core/math.ts";
import { surfaceY } from "../../game/arena/reach.ts";
import type { ArenaDefinition } from "../../game/arena/types.ts";

/**
 * A soft shadow under each contestant.
 *
 * The key light casts real shadows, but at this scale and angle they land well away from
 * the feet, so a character reads as hovering a few centimetres above the platform. A blob
 * directly beneath fixes that for almost nothing — it is the oldest trick in real-time
 * rendering and still the most effective per cycle spent.
 *
 * It fades with height, which doubles as useful information: while airborne you can see
 * exactly where you are about to land, which matters a great deal in a game whose whole
 * mechanic is about not looking at the thing you are jumping to.
 */

export interface ShadowTarget {
  position: Vec3;
  upSign: number;
}

/** Beyond this height above the ground the blob has faded out entirely. */
const MAX_DROP = 7;

function createBlobTexture(): THREE.Texture {
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(0,0,0,0.85)");
    gradient.addColorStop(0.55, "rgba(0,0,0,0.35)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * Highest surface directly beneath a point.
 *
 * Geometric rather than a physics raycast: there are a dozen platforms, this runs for two
 * or three characters a frame, and it keeps the view layer from reaching into the
 * simulation for something purely cosmetic.
 */
function groundBelow(arena: ArenaDefinition, position: Vec3, upSign: number): number | null {
  let best: number | null = null;

  for (const platform of arena.platforms) {
    const withinX = Math.abs(position.x - platform.position.x) <= platform.size.x / 2;
    const withinZ = Math.abs(position.z - platform.position.z) <= platform.size.z / 2;
    if (!withinX || !withinZ) continue;

    // Under inverted gravity the relevant surface is the underside of the slab above.
    const surface =
      upSign >= 0 ? surfaceY(platform) : platform.position.y - platform.size.y / 2;
    const below = upSign >= 0 ? surface <= position.y : surface >= position.y;
    if (!below) continue;

    if (best === null || (upSign >= 0 ? surface > best : surface < best)) best = surface;
  }
  return best;
}

interface ContactShadowsProps {
  arena: ArenaDefinition;
  targetsRef: React.RefObject<ShadowTarget[]>;
}

export function ContactShadows({ arena, targetsRef }: ContactShadowsProps) {
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(() => createBlobTexture(), []);

  // One mesh per possible contestant: the player plus the most rivals a challenge allows.
  const blobs = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    return Array.from({ length: 4 }, () => {
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      return mesh;
    });
  }, [texture]);

  useFrame(() => {
    const container = group.current;
    if (!container) return;
    if (container.children.length === 0) {
      for (const blob of blobs) container.add(blob);
    }

    const targets = targetsRef.current ?? [];

    blobs.forEach((blob, index) => {
      const target = targets[index];
      if (!target) {
        blob.visible = false;
        return;
      }

      const ground = groundBelow(arena, target.position, target.upSign);
      if (ground === null) {
        blob.visible = false;
        return;
      }

      const drop = Math.abs(target.position.y - ground);
      if (drop > MAX_DROP) {
        blob.visible = false;
        return;
      }

      const t = drop / MAX_DROP;
      blob.visible = true;
      blob.position.set(target.position.x, ground + 0.025 * target.upSign, target.position.z);
      blob.rotation.x = (-Math.PI / 2) * target.upSign;
      // Higher up: larger and fainter, the way a real soft shadow spreads.
      blob.scale.setScalar(1.25 + t * 1.5);
      (blob.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t);
    });
  });

  return <group ref={group} />;
}
