import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { doorKey, type GameState } from '../core/gameState';

const SPRITE_SIZE = 1.2;
const SPRITE_Y = 0.6;

type EnemyTextureGenerator = () => THREE.CanvasTexture;

function generateRatTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 32, 32);

  // Body
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(8, 16, 16, 10);
  // Head
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(20, 14, 8, 8);
  // Eyes
  ctx.fillStyle = '#ff3333';
  ctx.fillRect(24, 16, 2, 2);
  // Ears
  ctx.fillStyle = '#7a5533';
  ctx.fillRect(22, 12, 3, 3);
  ctx.fillRect(26, 12, 3, 3);
  // Tail
  ctx.fillStyle = '#4a2a0a';
  ctx.fillRect(4, 20, 5, 2);
  ctx.fillRect(2, 18, 3, 2);
  // Legs
  ctx.fillStyle = '#4a2a0a';
  ctx.fillRect(10, 26, 3, 4);
  ctx.fillRect(18, 26, 3, 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function generateSkeletonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 32, 32);

  // Skull
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(11, 2, 10, 10);
  // Eye sockets
  ctx.fillStyle = '#000';
  ctx.fillRect(13, 5, 3, 3);
  ctx.fillRect(18, 5, 3, 3);
  // Jaw
  ctx.fillStyle = '#d8d0c0';
  ctx.fillRect(13, 10, 6, 2);
  // Spine
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(14, 12, 4, 8);
  // Ribs
  ctx.fillStyle = '#d8d0c0';
  ctx.fillRect(10, 14, 12, 2);
  ctx.fillRect(10, 17, 12, 2);
  // Arms
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(6, 14, 4, 2);
  ctx.fillRect(22, 14, 4, 2);
  ctx.fillRect(5, 16, 2, 6);
  ctx.fillRect(25, 16, 2, 6);
  // Legs
  ctx.fillRect(12, 20, 3, 10);
  ctx.fillRect(17, 20, 3, 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function generateOrcTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 32, 32);

  // Body
  ctx.fillStyle = '#2d5a1e';
  ctx.fillRect(8, 10, 16, 14);
  // Head
  ctx.fillStyle = '#3a7228';
  ctx.fillRect(10, 1, 12, 10);
  // Eyes
  ctx.fillStyle = '#ff6600';
  ctx.fillRect(12, 4, 3, 3);
  ctx.fillRect(18, 4, 3, 3);
  // Tusks
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(12, 9, 2, 3);
  ctx.fillRect(19, 9, 2, 3);
  // Arms
  ctx.fillStyle = '#2d5a1e';
  ctx.fillRect(4, 12, 4, 10);
  ctx.fillRect(24, 12, 4, 10);
  // Fists
  ctx.fillStyle = '#3a7228';
  ctx.fillRect(4, 22, 4, 3);
  ctx.fillRect(24, 22, 4, 3);
  // Legs
  ctx.fillRect(10, 24, 4, 8);
  ctx.fillRect(18, 24, 4, 8);
  // Belt
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(8, 22, 16, 3);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

const TEXTURE_GENERATORS: Record<string, EnemyTextureGenerator> = {
  rat: generateRatTexture,
  skeleton: generateSkeletonTexture,
  orc: generateOrcTexture,
};

const textureCache = new Map<string, THREE.CanvasTexture>();

function getEnemyTexture(type: string): THREE.CanvasTexture {
  let tex = textureCache.get(type);
  if (!tex) {
    const gen = TEXTURE_GENERATORS[type];
    tex = gen ? gen() : generateSkeletonTexture(); // fallback
    textureCache.set(type, tex);
  }
  return tex;
}

export interface EnemyMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
}

export function buildEnemyMeshes(gameState: GameState): EnemyMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  const geo = new THREE.PlaneGeometry(SPRITE_SIZE, SPRITE_SIZE);

  for (const [mapKey, enemy] of gameState.enemies) {
    const tex = getEnemyTexture(enemy.type);
    // Phong with shininess 0: slightly brighter than Lambert under torchlight
    // for easier enemy spotting, but still fully dark with no light source
    const mat = new THREE.MeshPhongMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      shininess: 0,
    });

    const mesh = new THREE.Mesh(geo, mat);
    const cx = enemy.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = enemy.row * CELL_SIZE + CELL_SIZE / 2;
    mesh.position.set(cx, SPRITE_Y, cz);

    group.add(mesh);
    meshMap.set(mapKey, mesh);
  }

  return { group, meshMap };
}

export function updateEnemyBillboards(
  meshMap: Map<string, THREE.Mesh>,
  camera: THREE.Camera,
): void {
  for (const mesh of meshMap.values()) {
    if (!mesh.visible) continue;
    // Only rotate around Y axis to face camera (no tilt)
    const dx = camera.position.x - mesh.position.x;
    const dz = camera.position.z - mesh.position.z;
    mesh.rotation.y = Math.atan2(dx, dz);
  }
}

export function hideEnemyMesh(
  meshMap: Map<string, THREE.Mesh>,
  col: number,
  row: number,
): void {
  const key = doorKey(col, row);
  const mesh = meshMap.get(key);
  if (mesh) mesh.visible = false;
}

export function updateEnemyMeshPosition(
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
