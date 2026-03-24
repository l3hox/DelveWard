import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { doorKey } from '../core/gameState';
import type { NPCInstance } from '../core/gameState';
import { createNeutralLitMaterial } from './billboardMaterial';
import { npcDatabase, DEFAULT_NPC_SPRITE_SIZE } from '../npcs/npcDatabase';

const loader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();

function getNpcTexture(npcId: string): THREE.Texture {
  let tex = textureCache.get(npcId);
  if (!tex) {
    const path = npcDatabase.getNpc(npcId)?.sprite.path ?? '/sprites/merchant.png';
    tex = loader.load(path);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    textureCache.set(npcId, tex);
  }
  return tex;
}

/** Preload all known NPC textures so sprites appear immediately on scene build. */
export async function preloadNpcTextures(): Promise<void> {
  await Promise.all(
    npcDatabase.getAllNpcs().map(async (def) => {
      if (textureCache.has(def.id)) return;
      const tex = await loader.loadAsync(def.sprite.path);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      textureCache.set(def.id, tex);
    })
  );
}

export interface NpcMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
}

export function buildNpcMeshes(npcs: Map<string, NPCInstance>): NpcMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  for (const [mapKey, npc] of npcs) {
    const def = npcDatabase.getNpc(npc.npcId);
    const size = def?.sprite.size ?? DEFAULT_NPC_SPRITE_SIZE;
    const geo = new THREE.PlaneGeometry(size, size);
    const tex = getNpcTexture(npc.npcId);
    const mat = createNeutralLitMaterial(tex);

    const mesh = new THREE.Mesh(geo, mat);
    const cx = npc.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = npc.row * CELL_SIZE + CELL_SIZE / 2;
    // Place sprite so bottom edge sits at floor level (PlaneGeometry is center-anchored)
    const yOffset = def?.sprite.yOffset ?? 0;
    mesh.position.set(cx, size * 0.5 + yOffset, cz);

    group.add(mesh);
    meshMap.set(mapKey, mesh);
  }

  return { group, meshMap };
}

export function updateNpcBillboards(
  meshMap: Map<string, THREE.Mesh>,
  camera: THREE.Camera,
): void {
  // All sprites face the camera's view plane (not the camera point)
  const facing = camera.rotation.y;
  for (const mesh of meshMap.values()) {
    if (!mesh.visible) continue;
    mesh.rotation.y = facing;
  }
}

export function hideNpcMesh(
  meshMap: Map<string, THREE.Mesh>,
  col: number,
  row: number,
): void {
  const key = doorKey(col, row);
  const mesh = meshMap.get(key);
  if (mesh) mesh.visible = false;
}

export function showNpcMesh(
  meshMap: Map<string, THREE.Mesh>,
  col: number,
  row: number,
): void {
  const key = doorKey(col, row);
  const mesh = meshMap.get(key);
  if (mesh) mesh.visible = true;
}

export function updateNpcMeshPosition(
  meshMap: Map<string, THREE.Mesh>,
  oldKey: string,
  newCol: number,
  newRow: number,
): void {
  const mesh = meshMap.get(oldKey);
  if (!mesh) return;
  meshMap.delete(oldKey);
  const newKey = doorKey(newCol, newRow);
  meshMap.set(newKey, mesh);
}
