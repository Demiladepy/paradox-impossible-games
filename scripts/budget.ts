/**
 * Triangle budget per arena, computed from the real GLBs and the real placements.
 *
 * Frame rate cannot be measured through the throttled preview pane, so measure the thing
 * that drives it: how much geometry each arena actually asks the GPU to draw.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ARENAS } from "../src/game/arena/registry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const GENERATED = resolve(here, "../public/assets/generated");

function trianglesIn(file: string): number {
  const buffer = readFileSync(join(GENERATED, file));
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      const json = JSON.parse(buffer.subarray(start, start + length).toString("utf8")) as {
        meshes?: { primitives?: { indices?: number }[] }[];
        accessors?: { count?: number }[];
      };
      let total = 0;
      for (const mesh of json.meshes ?? []) {
        for (const primitive of mesh.primitives ?? []) {
          const accessor =
            primitive.indices !== undefined ? json.accessors?.[primitive.indices] : undefined;
          total += (accessor?.count ?? 0) / 3;
        }
      }
      return Math.round(total);
    }
    offset = start + length + ((4 - (length % 4)) % 4);
  }
  return 0;
}

const assets = {
  slab: trianglesIn("platform-slab.glb"),
  obelisk: trianglesIn("exit-obelisk.glb"),
  pillar: trianglesIn("arena-pillar.glb"),
  contestant: trianglesIn("contestant-01-anim.glb"),
  rival: trianglesIn("rival-01-anim.glb"),
  lamp: trianglesIn("flood-lamp.glb"),
};

console.log("Per-asset triangles");
for (const [name, count] of Object.entries(assets)) {
  console.log(`  ${name.padEnd(12)} ${count.toLocaleString().padStart(9)}`);
}

for (const arena of ARENAS) {
  const slabs = arena.platforms.filter((p) => p.visual).length;
  const decor = arena.decor ?? [];
  const obelisks = decor.filter((d) => d.asset === "exit-obelisk").length;
  const pillars = decor.filter((d) => d.asset === "arena-pillar").length;
  // Worst case for this arena: the player plus the most rivals any challenge asks for.
  const characters = 3;
  // ArenaLights hangs at most five lamps, spread along the route.
  const lamps = Math.min(5, arena.route.length);

  const total =
    slabs * assets.slab +
    obelisks * assets.obelisk +
    pillars * assets.pillar +
    lamps * assets.lamp +
    characters * assets.contestant;

  console.log(`\n${arena.name} (${arena.id})`);
  console.log(`  ${slabs} slab platforms      ${(slabs * assets.slab).toLocaleString().padStart(9)}`);
  console.log(`  ${obelisks} obelisk            ${(obelisks * assets.obelisk).toLocaleString().padStart(9)}`);
  console.log(`  ${pillars} pillars            ${(pillars * assets.pillar).toLocaleString().padStart(9)}`);
  console.log(`  ${lamps} lamps              ${(lamps * assets.lamp).toLocaleString().padStart(9)}`);
  console.log(`  ${characters} characters         ${(characters * assets.contestant).toLocaleString().padStart(9)}`);
  console.log(`  TOTAL                ${total.toLocaleString().padStart(9)} triangles`);
}
