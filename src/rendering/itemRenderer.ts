import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { doorKey, type GameState, type EquipSlot } from '../core/gameState';

const ITEM_SIZE = 0.35;
const ITEM_HEIGHT = 0.15;

function generateItemTexture(slot: EquipSlot): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 16, 16);

  if (slot === 'weapon') {
    // Sword blade
    ctx.fillStyle = '#C0C0C0';
    ctx.fillRect(7, 1, 2, 10);
    // Guard
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(5, 11, 6, 2);
    // Grip
    ctx.fillStyle = '#5C3317';
    ctx.fillRect(7, 13, 2, 3);
  } else if (slot === 'armor') {
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

export function buildItemMeshes(
  gameState: GameState,
): { group: THREE.Group; meshMap: Map<string, THREE.Mesh> } {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();
  const geo = new THREE.PlaneGeometry(ITEM_SIZE, ITEM_SIZE);

  // Cache textures per slot type
  const textures = new Map<EquipSlot, THREE.CanvasTexture>();

  for (const [mapKey, item] of gameState.groundItems) {
    if (!textures.has(item.slot)) {
      textures.set(item.slot, generateItemTexture(item.slot));
    }

    const mat = new THREE.MeshLambertMaterial({
      map: textures.get(item.slot)!,
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
