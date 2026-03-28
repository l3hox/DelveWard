import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { doorKey, type GameState } from '../core/gameState';
import { itemDatabase } from '../core/itemDatabase';
import type { ItemEntity } from '../core/entities';
import { getItemTexture } from './itemSprites';

const ITEM_SIZE = 0.3;
const ITEM_HEIGHT = 0.15;

function createConsumableMaterial(icon: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    map: getItemTexture(icon),
    transparent: true,
    side: THREE.DoubleSide,
  });
}

export function addSingleConsumableMesh(
  entity: ItemEntity,
  group: THREE.Group,
  meshMap: Map<string, THREE.Mesh>,
  layerIndex?: number,
): void {
  const def = itemDatabase.getItem(entity.itemId);
  if (!def || def.type !== 'consumable') return;

  const mat = createConsumableMaterial(def.icon);

  const loc = entity.location;
  // Caller guarantees this is a world item.
  const col = (loc as { kind: 'world'; levelId: string; col: number; row: number }).col;
  const row = (loc as { kind: 'world'; levelId: string; col: number; row: number }).row;
  const cx = col * CELL_SIZE + CELL_SIZE / 2;
  const cz = row * CELL_SIZE + CELL_SIZE / 2;

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ITEM_SIZE, ITEM_SIZE), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, ITEM_HEIGHT, cz);

  // Keep first mesh at this cell — matches pickup order (first item picked up first)
  const mapKey = layerIndex !== undefined ? `${layerIndex}:${doorKey(col, row)}` : doorKey(col, row);
  if (meshMap.has(mapKey)) {
    return;
  }

  group.add(mesh);
  meshMap.set(mapKey, mesh);
}

export function buildConsumableMeshes(
  gameState: GameState,
): { group: THREE.Group; meshMap: Map<string, THREE.Mesh> } {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();
  const geo = new THREE.PlaneGeometry(ITEM_SIZE, ITEM_SIZE);

  const groundEntities = gameState.entityRegistry.getAllGroundItemsForLevel(gameState.currentLevelId, gameState.activeLayerIndex);

  for (const entity of groundEntities) {
    const def = itemDatabase.getItem(entity.itemId);
    if (!def || def.type !== 'consumable') continue;

    const mat = createConsumableMaterial(def.icon);

    const loc = entity.location;
    if (loc.kind !== 'world') continue;
    const col = loc.col;
    const row = loc.row;
    const mapKey = doorKey(col, row);
    const cx = col * CELL_SIZE + CELL_SIZE / 2;
    const cz = row * CELL_SIZE + CELL_SIZE / 2;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, ITEM_HEIGHT, cz);

    group.add(mesh);
    meshMap.set(mapKey, mesh);
  }

  return { group, meshMap };
}

export function hideConsumableMesh(
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
