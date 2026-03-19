import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT } from './dungeon';
import { doorKey, type GameState } from '../core/gameState';

const BLOCK_SIZE = CELL_SIZE * 0.85;
const BLOCK_HEIGHT = WALL_HEIGHT * 0.7;

export interface BlockMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
}

function generateBlockTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;

  // Stone-like noise
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const v = 80 + Math.floor(Math.random() * 30);
      ctx.fillStyle = `rgb(${v},${v - 5},${v - 8})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Edge bevels — light on top-left, dark on bottom-right
  ctx.fillStyle = 'rgba(140, 135, 130, 0.4)';
  ctx.fillRect(0, 0, 32, 2);
  ctx.fillRect(0, 0, 2, 32);
  ctx.fillStyle = 'rgba(30, 28, 26, 0.4)';
  ctx.fillRect(0, 30, 32, 2);
  ctx.fillRect(30, 0, 2, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let blockMat: THREE.MeshLambertMaterial | null = null;

export function buildBlockMeshes(gameState: GameState): BlockMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  if (!blockMat) blockMat = new THREE.MeshLambertMaterial({ map: generateBlockTexture() });
  const geo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_HEIGHT, BLOCK_SIZE);

  for (const [key, block] of gameState.blocks) {
    const cx = block.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = block.row * CELL_SIZE + CELL_SIZE / 2;
    const mesh = new THREE.Mesh(geo, blockMat);
    mesh.position.set(cx, BLOCK_HEIGHT / 2, cz);
    group.add(mesh);
    meshMap.set(key, mesh);
  }

  return { group, meshMap };
}

export function animateBlockPush(
  meshMap: Map<string, THREE.Mesh>,
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): void {
  const fromKey = doorKey(fromCol, fromRow);
  const found = meshMap.get(fromKey);
  if (!found) return;
  const mesh: THREE.Mesh = found;

  meshMap.delete(fromKey);
  const toKey = doorKey(toCol, toRow);
  meshMap.set(toKey, mesh);

  const targetX = toCol * CELL_SIZE + CELL_SIZE / 2;
  const targetZ = toRow * CELL_SIZE + CELL_SIZE / 2;

  const startX = mesh.position.x;
  const startZ = mesh.position.z;
  const duration = 300; // ms
  const startTime = performance.now();

  function animate(): void {
    const elapsed = performance.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = t * (2 - t); // ease-out quadratic
    mesh.position.x = startX + (targetX - startX) * eased;
    mesh.position.z = startZ + (targetZ - startZ) * eased;
    if (t < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
