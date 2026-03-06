import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { doorKey, type GameState } from '../core/gameState';

const SPRITE_SIZES: Record<string, number> = {
  rat: 1.2,
  skeleton: 2.4,
  orc: 2.4,
};
const DEFAULT_SPRITE_SIZE = 1.2;

const SPRITE_PATHS: Record<string, string> = {
  rat: '/sprites/rat.png',
  skeleton: '/sprites/skeleton.png',
  orc: '/sprites/orc.png',
};

const loader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();

function getEnemyTexture(type: string): THREE.Texture {
  let tex = textureCache.get(type);
  if (!tex) {
    const path = SPRITE_PATHS[type] ?? SPRITE_PATHS['skeleton'];
    tex = loader.load(path);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
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

  for (const [mapKey, enemy] of gameState.enemies) {
    const size = SPRITE_SIZES[enemy.type] ?? DEFAULT_SPRITE_SIZE;
    const geo = new THREE.PlaneGeometry(size, size);
    const tex = getEnemyTexture(enemy.type);
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
    mesh.position.set(cx, size * 0.4, cz);

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
