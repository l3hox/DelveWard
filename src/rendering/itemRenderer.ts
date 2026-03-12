import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { doorKey, type GameState } from '../core/gameState';
import { itemDatabase } from '../core/itemDatabase';
import type { ItemEntity } from '../core/entities';

const ITEM_SIZE = 0.35;
const ITEM_HEIGHT = 0.15;

// Visual category used for texture generation — derived from item subtype.
type ItemVisualCategory = 'weapon' | 'armor' | 'ring';

function subtypeToVisualCategory(subtype: string): ItemVisualCategory {
  const weapons = new Set(['sword', 'axe', 'dagger', 'mace', 'spear', 'staff']);
  const armors = new Set(['head', 'chest', 'legs', 'hands', 'feet', 'shield']);
  if (weapons.has(subtype)) return 'weapon';
  if (armors.has(subtype)) return 'armor';
  return 'ring';
}

function generateItemTexture(category: ItemVisualCategory): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 16, 16);

  if (category === 'weapon') {
    // Sword blade
    ctx.fillStyle = '#C0C0C0';
    ctx.fillRect(7, 1, 2, 10);
    // Guard
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(5, 11, 6, 2);
    // Grip
    ctx.fillStyle = '#5C3317';
    ctx.fillRect(7, 13, 2, 3);
  } else if (category === 'armor') {
    // Shield shape
    ctx.fillStyle = '#4682B4';
    ctx.fillRect(4, 2, 8, 10);
    ctx.fillRect(5, 12, 6, 2);
    ctx.fillRect(6, 14, 4, 1);
    // Center cross
    ctx.fillStyle = '#DAA520';
    ctx.fillRect(7, 4, 2, 8);
    ctx.fillRect(5, 6, 6, 2);
  } else {
    // Ring
    ctx.fillStyle = '#DAA520';
    ctx.beginPath();
    ctx.arc(8, 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(8, 8, 3, 0, Math.PI * 2);
    ctx.fill();
    // Gem
    ctx.fillStyle = '#FF4444';
    ctx.fillRect(6, 2, 4, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// Module-level texture cache — shared between buildItemMeshes and addSingleItemMesh.
const textureCache = new Map<ItemVisualCategory, THREE.CanvasTexture>();

export function addSingleItemMesh(
  entity: ItemEntity,
  gameState: GameState,
  group: THREE.Group,
  meshMap: Map<string, THREE.Mesh>,
): void {
  const def = itemDatabase.getItem(entity.itemId);
  if (!def) return;
  if (def.type === 'consumable') return; // consumables handled by consumableRenderer

  const category = subtypeToVisualCategory(def.subtype as string);

  if (!textureCache.has(category)) {
    textureCache.set(category, generateItemTexture(category));
  }

  const mat = new THREE.MeshLambertMaterial({
    map: textureCache.get(category)!,
    transparent: true,
    side: THREE.DoubleSide,
  });

  const loc = entity.location;
  // Caller guarantees this is a world item.
  const col = (loc as { kind: 'world'; levelId: string; col: number; row: number }).col;
  const row = (loc as { kind: 'world'; levelId: string; col: number; row: number }).row;
  const cx = col * CELL_SIZE + CELL_SIZE / 2;
  const cz = row * CELL_SIZE + CELL_SIZE / 2;

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ITEM_SIZE, ITEM_SIZE), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, ITEM_HEIGHT, cz);

  group.add(mesh);
  meshMap.set(doorKey(col, row), mesh);
}

export function buildItemMeshes(
  gameState: GameState,
): { group: THREE.Group; meshMap: Map<string, THREE.Mesh> } {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();
  const geo = new THREE.PlaneGeometry(ITEM_SIZE, ITEM_SIZE);

  const groundEntities = gameState.entityRegistry.getAllGroundItemsForLevel(gameState.currentLevelId);

  for (const entity of groundEntities) {
    // Determine visual category — use DB if loaded, else fall back to legacy slot field.
    let category: ItemVisualCategory = 'ring';
    if (itemDatabase.isLoaded()) {
      const def = itemDatabase.getItem(entity.itemId);
      if (def && def.type !== 'consumable') {
        category = subtypeToVisualCategory(def.subtype as string);
      } else if (def?.type === 'consumable') {
        // Consumables are handled by consumableRenderer — skip here.
        continue;
      } else {
        // itemId not found in DB — fall back to legacy groundItems slot field.
        const loc = entity.location;
        if (loc.kind !== 'world') continue;
        const legacyItem = gameState.groundItems.get(doorKey(loc.col, loc.row));
        if (!legacyItem) continue; // not in legacy map either — skip (likely a consumable)
        const slotStr = legacyItem.slot as string;
        if (slotStr === 'weapon') category = 'weapon';
        else if (['chest', 'head', 'legs', 'hands', 'feet', 'shield', 'armor'].includes(slotStr)) category = 'armor';
        else category = 'ring';
      }
    }

    if (!textureCache.has(category)) {
      textureCache.set(category, generateItemTexture(category));
    }

    const mat = new THREE.MeshLambertMaterial({
      map: textureCache.get(category)!,
      transparent: true,
      side: THREE.DoubleSide,
    });

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

  // Fallback: if DB is not loaded, render items from legacy groundItems map so the
  // scene is not empty when running without the item database (e.g., local dev).
  if (!itemDatabase.isLoaded()) {
    for (const [mapKey, item] of gameState.groundItems) {
      // Map legacy slot string to visual category.
      // Cast to string to handle both new EquipSlot values and legacy 'armor'/'ring'
      // values that may still appear in older dungeon JSON.
      let category: ItemVisualCategory = 'ring';
      const slotStr = item.slot as string;
      if (slotStr === 'weapon') category = 'weapon';
      else if (slotStr === 'armor' || slotStr === 'chest' || slotStr === 'head' ||
               slotStr === 'legs' || slotStr === 'hands' || slotStr === 'feet' ||
               slotStr === 'shield') category = 'armor';

      if (!textureCache.has(category)) {
        textureCache.set(category, generateItemTexture(category));
      }

      const mat = new THREE.MeshLambertMaterial({
        map: textureCache.get(category)!,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const [colStr, rowStr] = mapKey.split(',');
      const col = Number(colStr);
      const row = Number(rowStr);
      const cx = col * CELL_SIZE + CELL_SIZE / 2;
      const cz = row * CELL_SIZE + CELL_SIZE / 2;

      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(cx, ITEM_HEIGHT, cz);

      group.add(mesh);
      meshMap.set(mapKey, mesh);
    }
  }

  return { group, meshMap };
}

export function hideItemMesh(
  meshMap: Map<string, THREE.Mesh>,
  col: number,
  row: number,
): void {
  const key = doorKey(col, row);
  const mesh = meshMap.get(key);
  if (mesh) {
    mesh.visible = false;
  }
}
