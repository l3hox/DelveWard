import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { doorKey, type GameState } from '../core/gameState';
import { createNeutralLitMaterial } from './billboardMaterial';

export const SPRITE_SIZES: Record<string, number> = {
  rat: 1.2,
  skeleton: 2.0,
  orc: 2.0,
  giant_bat: 1.4,
  goblin: 1.6,
  spider: 1.8,
  kobold: 1.6,
  zombie: 2.0,
  troll: 2.4,
};
export const DEFAULT_SPRITE_SIZE = 1.2;

/** Extra vertical offset — lifts sprite above the default floor-anchored position. */
const SPRITE_Y_OFFSETS: Record<string, number> = {
  giant_bat: 1.0,
};

const SPRITE_PATHS: Record<string, string> = {
  rat: '/sprites/rat.png',
  skeleton: '/sprites/skeleton.png',
  orc: '/sprites/orc.png',
  goblin: '/sprites/goblin.png',
  giant_bat: '/sprites/giant_bat.png',
  spider: '/sprites/spider.png',
  kobold: '/sprites/kobold.png',
  zombie: '/sprites/zombie.png',
  troll: '/sprites/troll.png',
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

/** Preload all known enemy textures so sprites appear immediately on scene build. */
export async function preloadEnemyTextures(): Promise<void> {
  await Promise.all(
    Object.entries(SPRITE_PATHS).map(async ([type, path]) => {
      if (textureCache.has(type)) return;
      const tex = await loader.loadAsync(path);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      textureCache.set(type, tex);
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
    const size = SPRITE_SIZES[enemy.type] ?? DEFAULT_SPRITE_SIZE;
    const geo = new THREE.PlaneGeometry(size, size);
    const tex = getEnemyTexture(enemy.type);
    const mat = createNeutralLitMaterial(tex);

    const mesh = new THREE.Mesh(geo, mat);
    const cx = enemy.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = enemy.row * CELL_SIZE + CELL_SIZE / 2;
    // Place sprite so bottom edge sits at floor level (PlaneGeometry is center-anchored)
    const yOffset = SPRITE_Y_OFFSETS[enemy.type] ?? 0;
    mesh.position.set(cx, size * 0.5 + yOffset, cz);

    group.add(mesh);
    meshMap.set(mapKey, mesh);
  }

  return { group, meshMap };
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
