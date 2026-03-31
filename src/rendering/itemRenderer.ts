import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { doorKey, type GameState } from '../core/gameState';
import { itemDatabase } from '../core/itemDatabase';
import type { ItemEntity } from '../core/entities';
import { getItemTexture } from './itemSprites';
import { createNeutralLitMaterial } from './billboardMaterial';

const ITEM_SIZE = 0.4;
const ITEM_HEIGHT = ITEM_SIZE / 2 + 0.02; // center of billboard just above ground
const SPREAD_RADIUS = 0.3; // max offset from cell center for multi-item spread

// Seeded PRNG for stable item offsets
function mulberry32(seed: number) {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createItemBillboardMaterial(icon: string): THREE.ShaderMaterial {
  return createNeutralLitMaterial(getItemTexture(icon));
}

/** Compute a seeded random offset for item index within a cell. */
function itemOffset(col: number, row: number, index: number): { dx: number; dz: number } {
  if (index === 0) return { dx: 0, dz: 0 }; // first item at center
  const rng = mulberry32(col * 7919 + row * 6271 + index * 3037);
  const angle = rng() * Math.PI * 2;
  const dist = SPREAD_RADIUS * (0.4 + rng() * 0.6);
  return { dx: Math.cos(angle) * dist, dz: Math.sin(angle) * dist };
}

export function addSingleItemMesh(
  entity: ItemEntity,
  gameState: GameState,
  group: THREE.Group,
  meshMap: Map<string, THREE.Mesh>,
  layerIndex?: number,
): void {
  const def = itemDatabase.getItem(entity.itemId);
  if (!def) return;
  if (def.type === 'consumable') return;

  const mat = createItemBillboardMaterial(def.icon);

  const loc = entity.location;
  const col = (loc as { kind: 'world'; levelId: string; col: number; row: number }).col;
  const row = (loc as { kind: 'world'; levelId: string; col: number; row: number }).row;
  const cx = col * CELL_SIZE + CELL_SIZE / 2;
  const cz = row * CELL_SIZE + CELL_SIZE / 2;

  const mapKey = layerIndex !== undefined ? `${layerIndex}:${doorKey(col, row)}` : doorKey(col, row);

  // Count existing items at this cell for spread offset
  let itemIndex = 0;
  for (const key of meshMap.keys()) {
    if (key === mapKey || key.endsWith(':' + doorKey(col, row))) itemIndex++;
  }

  const { dx, dz } = itemOffset(col, row, itemIndex);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ITEM_SIZE, ITEM_SIZE), mat);
  mesh.position.set(cx + dx, ITEM_HEIGHT, cz + dz);

  // For first item, use the standard map key. Additional items use suffixed keys.
  const storeKey = itemIndex === 0 ? mapKey : `${mapKey}#${itemIndex}`;
  group.add(mesh);
  meshMap.set(storeKey, mesh);
}

export function buildItemMeshes(
  gameState: GameState,
): { group: THREE.Group; meshMap: Map<string, THREE.Mesh> } {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  const groundEntities = gameState.entityRegistry.getAllGroundItemsForLevel(gameState.currentLevelId, gameState.activeLayerIndex);

  // Group by cell for spread offset
  const byCell = new Map<string, ItemEntity[]>();
  for (const entity of groundEntities) {
    const def = itemDatabase.getItem(entity.itemId);
    if (!def || def.type === 'consumable') continue;
    const loc = entity.location;
    if (loc.kind !== 'world') continue;
    const key = doorKey(loc.col, loc.row);
    let arr = byCell.get(key);
    if (!arr) { arr = []; byCell.set(key, arr); }
    arr.push(entity);
  }

  for (const [key, entities] of byCell) {
    const loc = entities[0].location as { kind: 'world'; col: number; row: number };
    const cx = loc.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = loc.row * CELL_SIZE + CELL_SIZE / 2;

    for (let i = 0; i < entities.length; i++) {
      const def = itemDatabase.getItem(entities[i].itemId);
      if (!def) continue;

      const mat = createItemBillboardMaterial(def.icon);
      const { dx, dz } = itemOffset(loc.col, loc.row, i);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ITEM_SIZE, ITEM_SIZE), mat);
      mesh.position.set(cx + dx, ITEM_HEIGHT, cz + dz);

      group.add(mesh);
      const storeKey = i === 0 ? key : `${key}#${i}`;
      meshMap.set(storeKey, mesh);
    }
  }

  return { group, meshMap };
}

export function hideItemMesh(
  meshMap: Map<string, THREE.Mesh>,
  group: THREE.Group,
  key: string,
): void {
  const mesh = meshMap.get(key);
  if (mesh) {
    group.remove(mesh);
    meshMap.delete(key);
  }
}

export function updateItemBillboards(meshMap: Map<string, THREE.Mesh>, camera: THREE.Camera): void {
  const facing = camera.rotation.y;
  for (const mesh of meshMap.values()) {
    mesh.rotation.y = facing;
  }
}
