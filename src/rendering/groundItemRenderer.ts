import * as THREE from 'three';
import { CELL_SIZE, LAYER_HEIGHT } from './dungeon';
import { doorKey, type GameState } from '../core/gameState';
import { itemDatabase } from '../core/itemDatabase';
import type { ItemEntity } from '../core/entities';
import { getItemTexture } from './itemSprites';
import { createNeutralLitMaterial } from './billboardMaterial';
import { mulberry32 } from '../core/random';

// Equipment and consumables render at slightly different sizes for visual distinction.
const EQUIPMENT_SIZE = 0.4;
const CONSUMABLE_SIZE = 0.35;
const SPREAD_RADIUS = 0.3;

type ItemKind = 'equipment' | 'consumable';

function itemSize(kind: ItemKind): number {
  return kind === 'equipment' ? EQUIPMENT_SIZE : CONSUMABLE_SIZE;
}

function itemHeight(kind: ItemKind): number {
  const size = itemSize(kind);
  return size / 2 + 0.02;
}

function itemFilter(kind: ItemKind, itemType: string): boolean {
  return kind === 'consumable' ? itemType === 'consumable' : itemType !== 'consumable';
}

function createBillboardMaterial(icon: string): THREE.ShaderMaterial {
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

export function addSingleGroundItemMesh(
  kind: ItemKind,
  entity: ItemEntity,
  group: THREE.Group,
  meshMap: Map<string, THREE.Mesh>,
  layerIndex?: number,
): void {
  const def = itemDatabase.getItem(entity.itemId);
  if (!def || !itemFilter(kind, def.type)) return;

  const mat = createBillboardMaterial(def.icon);
  const size = itemSize(kind);
  const height = itemHeight(kind);

  const loc = entity.location;
  const col = (loc as { kind: 'world'; levelId: string; col: number; row: number }).col;
  const row = (loc as { kind: 'world'; levelId: string; col: number; row: number }).row;
  const cx = col * CELL_SIZE + CELL_SIZE / 2;
  const cz = row * CELL_SIZE + CELL_SIZE / 2;

  const mapKey = layerIndex !== undefined ? `${layerIndex}:${doorKey(col, row)}` : doorKey(col, row);

  // Find a unique storeKey for this cell. The spread suffixes are #1, #2, ...
  // so the count of existing meshes at this cell IS the next index. Walk
  // forward until we find a free slot — guarantees no map overwrites that
  // would orphan the previous mesh (still in the scene, not in the map, so
  // it would never be billboarded or removed on pickup).
  let itemIndex = 0;
  let storeKey = mapKey;
  while (meshMap.has(storeKey)) {
    itemIndex++;
    storeKey = `${mapKey}#${itemIndex}`;
  }

  const { dx, dz } = itemOffset(col, row, itemIndex);
  const yOffset = (layerIndex ?? 0) * LAYER_HEIGHT;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.position.set(cx + dx, height + yOffset, cz + dz);
  // Enable all rendering layers so dynamically added items are visible in all zone passes.
  mesh.layers.enableAll();
  group.add(mesh);
  meshMap.set(storeKey, mesh);
}

export function buildGroundItemMeshes(
  kind: ItemKind,
  gameState: GameState,
): { group: THREE.Group; meshMap: Map<string, THREE.Mesh> } {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  const groundEntities = gameState.entityRegistry.getAllGroundItemsForLevel(
    gameState.currentLevelId,
    gameState.activeLayerIndex,
  );

  const size = itemSize(kind);
  const height = itemHeight(kind);

  // Group by cell for spread offset calculation.
  const byCell = new Map<string, ItemEntity[]>();
  for (const entity of groundEntities) {
    const def = itemDatabase.getItem(entity.itemId);
    if (!def || !itemFilter(kind, def.type)) continue;
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

      const mat = createBillboardMaterial(def.icon);
      const { dx, dz } = itemOffset(loc.col, loc.row, i);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      mesh.position.set(cx + dx, height, cz + dz);

      group.add(mesh);
      const storeKey = i === 0 ? key : `${key}#${i}`;
      meshMap.set(storeKey, mesh);
    }
  }

  return { group, meshMap };
}

export function hideGroundItemMesh(
  meshMap: Map<string, THREE.Mesh>,
  _group: THREE.Group,
  key: string,
): void {
  // Remove the primary mesh and any multi-item spread entries (key#1, key#2, ...).
  for (const [k, mesh] of [...meshMap]) {
    if (k === key || k.startsWith(key + '#')) {
      mesh.removeFromParent();
      meshMap.delete(k);
    }
  }
}

export function updateGroundItemBillboards(meshMap: Map<string, THREE.Mesh>, camera: THREE.Camera): void {
  const facing = camera.rotation.y;
  for (const mesh of meshMap.values()) {
    mesh.rotation.y = facing;
  }
}

// ---------------------------------------------------------------------------
// Compatibility aliases — keep old call-site names working without renaming
// every call in main.ts. These are thin wrappers, not re-exports of the old
// files, so they can be removed once callers migrate to the generic API.
// ---------------------------------------------------------------------------

export function buildItemMeshes(gameState: GameState) {
  return buildGroundItemMeshes('equipment', gameState);
}

export function buildConsumableMeshes(gameState: GameState) {
  return buildGroundItemMeshes('consumable', gameState);
}

export function addSingleItemMesh(
  entity: ItemEntity,
  _gameState: GameState, // retained for call-site compatibility; unused
  group: THREE.Group,
  meshMap: Map<string, THREE.Mesh>,
  layerIndex?: number,
): void {
  addSingleGroundItemMesh('equipment', entity, group, meshMap, layerIndex);
}

export function addSingleConsumableMesh(
  entity: ItemEntity,
  group: THREE.Group,
  meshMap: Map<string, THREE.Mesh>,
  layerIndex?: number,
): void {
  addSingleGroundItemMesh('consumable', entity, group, meshMap, layerIndex);
}

export function hideItemMesh(
  meshMap: Map<string, THREE.Mesh>,
  group: THREE.Group,
  key: string,
): void {
  hideGroundItemMesh(meshMap, group, key);
}

export function hideConsumableMesh(
  meshMap: Map<string, THREE.Mesh>,
  group: THREE.Group,
  key: string,
): void {
  hideGroundItemMesh(meshMap, group, key);
}

export function updateItemBillboards(meshMap: Map<string, THREE.Mesh>, camera: THREE.Camera): void {
  updateGroundItemBillboards(meshMap, camera);
}

export function updateConsumableBillboards(meshMap: Map<string, THREE.Mesh>, camera: THREE.Camera): void {
  updateGroundItemBillboards(meshMap, camera);
}
