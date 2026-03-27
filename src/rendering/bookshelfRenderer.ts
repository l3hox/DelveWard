import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { doorKey, type GameState, type BookshelfInstance } from '../core/gameState';

const WALL_DIR: Record<string, { dx: number; dz: number; rotY: number }> = {
  N: { dx: 0, dz: -1, rotY: Math.PI },
  S: { dx: 0, dz: 1, rotY: 0 },
  E: { dx: 1, dz: 0, rotY: Math.PI / 2 },
  W: { dx: -1, dz: 0, rotY: -Math.PI / 2 },
};

const BOOK_COLORS = [0xcc3333, 0x3366cc, 0x339933];
const BOOK_Y_OFFSETS = [-0.3, 0, 0.3];

export interface BookshelfMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Group>;
}

export function buildBookshelfMeshes(gameState: GameState): BookshelfMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Group>();

  const bodyGeo = new THREE.BoxGeometry(1.2, 1.8, 0.2);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4a3020 });

  const spineGeo = new THREE.BoxGeometry(1.0, 0.1, 0.02);

  for (const [key, shelf] of gameState.bookshelves as Map<string, BookshelfInstance>) {
    const cx = shelf.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = shelf.row * CELL_SIZE + CELL_SIZE / 2;

    const dir = WALL_DIR[shelf.wall];
    const offsetDist = CELL_SIZE / 2 - 0.1;

    const shelfGroup = new THREE.Group();

    const body = new THREE.Mesh(bodyGeo, bodyMat);
    shelfGroup.add(body);

    for (let i = 0; i < 3; i++) {
      const spineMat = new THREE.MeshLambertMaterial({ color: BOOK_COLORS[i] });
      const spine = new THREE.Mesh(spineGeo, spineMat);
      spine.position.set(0, BOOK_Y_OFFSETS[i], 0.11);
      shelfGroup.add(spine);
    }

    shelfGroup.position.set(
      cx + dir.dx * offsetDist,
      0.9,
      cz + dir.dz * offsetDist,
    );
    shelfGroup.rotation.y = dir.rotY;

    group.add(shelfGroup);
    meshMap.set(key, shelfGroup);
  }

  return { group, meshMap };
}
