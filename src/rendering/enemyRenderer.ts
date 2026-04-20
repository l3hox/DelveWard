import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState } from '../core/gameState';
import { createNeutralLitMaterial } from './billboardMaterial';
import { enemyDatabase, DEFAULT_SPRITE_SIZE } from '../enemies/enemyDatabase';

const loader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();

function getEnemyTexture(type: string): THREE.Texture {
  let tex = textureCache.get(type);
  if (!tex) {
    const path = enemyDatabase.getEnemy(type)?.sprite.path ?? '/sprites/skeleton.png';
    tex = loader.load(path);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    textureCache.set(type, tex);
  }
  return tex;
}

/** Preload all known enemy textures so sprites appear immediately on scene build. */
export async function preloadEnemyTextures(): Promise<void> {
  await Promise.all(
    enemyDatabase.getAllEnemies().map(async (def) => {
      if (textureCache.has(def.id)) return;
      const tex = await loader.loadAsync(def.sprite.path);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      textureCache.set(def.id, tex);
    })
  );
}

export interface EnemyMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
}

export function buildEnemyMeshes(gameState: GameState): EnemyMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  for (const [mapKey, enemy] of gameState.enemies) {
    const def = enemyDatabase.getEnemy(enemy.type);
    const size = def?.sprite.size ?? DEFAULT_SPRITE_SIZE;
    const geo = new THREE.PlaneGeometry(size, size);
    const tex = getEnemyTexture(enemy.type);
    const mat = createNeutralLitMaterial(tex);

    const mesh = new THREE.Mesh(geo, mat);
    const cx = enemy.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = enemy.row * CELL_SIZE + CELL_SIZE / 2;
    // Place sprite so bottom edge sits at floor level (PlaneGeometry is center-anchored)
    const yOffset = def?.sprite.yOffset ?? 0;
    mesh.position.set(cx, size * 0.5 + yOffset, cz);

    group.add(mesh);
    meshMap.set(mapKey, mesh);
  }

  return { group, meshMap };
}

export function createSingleEnemyMesh(
  enemyType: string,
  col: number,
  row: number,
  key: string,
  group: THREE.Group,
  meshMap: Map<string, THREE.Mesh>,
  yOffset: number,
): THREE.Mesh | null {
  const def = enemyDatabase.getEnemy(enemyType);
  if (!def) return null;
  const size = def.sprite.size ?? DEFAULT_SPRITE_SIZE;
  const geo = new THREE.PlaneGeometry(size, size);
  const tex = getEnemyTexture(enemyType);
  const mat = createNeutralLitMaterial(tex);
  const mesh = new THREE.Mesh(geo, mat);
  const cx = col * CELL_SIZE + CELL_SIZE / 2;
  const cz = row * CELL_SIZE + CELL_SIZE / 2;
  const spriteYOffset = def.sprite.yOffset ?? 0;
  mesh.position.set(cx, size * 0.5 + spriteYOffset + yOffset, cz);
  group.add(mesh);
  meshMap.set(key, mesh);
  return mesh;
}

export function updateEnemyBillboards(
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

export function hideEnemyMesh(
  meshMap: Map<string, THREE.Mesh>,
  key: string,
): void {
  const mesh = meshMap.get(key);
  if (mesh) mesh.visible = false;
}

export function updateEnemyMeshPosition(
  meshMap: Map<string, THREE.Mesh>,
  oldKey: string,
  newKey: string,
): void {
  const mesh = meshMap.get(oldKey);
  if (!mesh) return;
  meshMap.delete(oldKey);
  meshMap.set(newKey, mesh);
}
