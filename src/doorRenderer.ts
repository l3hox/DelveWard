import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT } from './dungeon';
import { getDoorTexture, getLockedDoorTexture } from './textures';
import type { GameState } from './gameState';

export type DoorOrientation = 'NS' | 'EW'; // NS = door faces N-S (blocks E-W passage), EW = door faces E-W (blocks N-S passage)

export function detectDoorOrientation(
  grid: string[],
  col: number,
  row: number,
  walkable: Set<string>,
): DoorOrientation {
  const rows = grid.length;
  const cols = grid[0].length;

  const northSolid = row - 1 < 0 || !walkable.has(grid[row - 1][col]);
  const southSolid = row + 1 >= rows || !walkable.has(grid[row + 1][col]);
  const eastSolid = col + 1 >= cols || !walkable.has(grid[row][col + 1]);
  const westSolid = col - 1 < 0 || !walkable.has(grid[row][col - 1]);

  // If walls on E and W -> passage runs N-S -> door faces E-W to block N-S passage
  if (eastSolid && westSolid) return 'EW';
  // If walls on N and S -> passage runs E-W -> door faces N-S to block E-W passage
  if (northSolid && southSolid) return 'NS';

  // Default: N-S facing (door blocks E-W passage)
  return 'NS';
}

export interface DoorMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
}

export function buildDoorMeshes(
  grid: string[],
  gameState: GameState,
  walkable: Set<string>,
): DoorMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  const doorGeo = new THREE.PlaneGeometry(CELL_SIZE, WALL_HEIGHT);
  const doorMat = new THREE.MeshLambertMaterial({
    map: getDoorTexture(),
    side: THREE.DoubleSide,
  });
  const lockedDoorMat = new THREE.MeshLambertMaterial({
    map: getLockedDoorTexture(),
    side: THREE.DoubleSide,
  });

  for (const [key, door] of gameState.doors) {
    const { col, row } = door;
    const cx = col * CELL_SIZE + CELL_SIZE / 2;
    const cz = row * CELL_SIZE + CELL_SIZE / 2;

    const orientation = detectDoorOrientation(grid, col, row, walkable);
    const mat = door.state === 'locked' ? lockedDoorMat : doorMat;

    const mesh = new THREE.Mesh(doorGeo, mat);
    mesh.position.set(cx, WALL_HEIGHT / 2, cz);

    if (orientation === 'EW') {
      // Door faces east-west (blocks N-S passage) -- no rotation needed
      // PlaneGeometry faces +Z by default
      mesh.rotation.y = 0;
    } else {
      // Door faces north-south (blocks E-W passage) -- rotate 90 degrees
      mesh.rotation.y = Math.PI / 2;
    }

    mesh.visible = door.state !== 'open';

    group.add(mesh);
    meshMap.set(key, mesh);
  }

  return { group, meshMap };
}

export function updateDoorMesh(
  meshMap: Map<string, THREE.Mesh>,
  col: number,
  row: number,
  isOpen: boolean,
): void {
  const key = `${col},${row}`;
  const mesh = meshMap.get(key);
  if (mesh) {
    mesh.visible = !isOpen;
  }
}
