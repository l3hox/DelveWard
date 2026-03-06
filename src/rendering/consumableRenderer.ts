import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { doorKey, type GameState } from '../core/gameState';

const ITEM_SIZE = 0.3;
const ITEM_HEIGHT = 0.15;

function generateConsumableTexture(consumableType: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 16, 16);

  if (consumableType === 'health_potion') {
    // Red flask
    ctx.fillStyle = '#CC3333';
    ctx.fillRect(6, 5, 4, 8);
    ctx.fillRect(5, 7, 6, 4);
    // Neck
    ctx.fillStyle = '#AA2222';
    ctx.fillRect(7, 3, 2, 3);
    // Cork
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(7, 2, 2, 2);
    // Highlight
    ctx.fillStyle = '#FF6666';
    ctx.fillRect(6, 7, 1, 2);
  } else {
    // Yellow flask (torch oil)
    ctx.fillStyle = '#CC9900';
    ctx.fillRect(6, 5, 4, 8);
    ctx.fillRect(5, 7, 6, 4);
    // Neck
    ctx.fillStyle = '#AA8800';
    ctx.fillRect(7, 3, 2, 3);
    // Cork
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(7, 2, 2, 2);
    // Highlight
    ctx.fillStyle = '#FFCC44';
    ctx.fillRect(6, 7, 1, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

export function buildConsumableMeshes(
  gameState: GameState,
): { group: THREE.Group; meshMap: Map<string, THREE.Mesh> } {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();
  const geo = new THREE.PlaneGeometry(ITEM_SIZE, ITEM_SIZE);

  // Cache textures per consumable type
  const textures = new Map<string, THREE.CanvasTexture>();

  for (const [mapKey, item] of gameState.groundConsumables) {
    if (!textures.has(item.consumableType)) {
      textures.set(item.consumableType, generateConsumableTexture(item.consumableType));
    }

    const mat = new THREE.MeshLambertMaterial({
      map: textures.get(item.consumableType)!,
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

export function hideConsumableMesh(
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
