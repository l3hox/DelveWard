import * as THREE from 'three';
import { WALKABLE_CELLS } from './grid';
import { getWallTexture, getFloorTexture, getCeilingTexture } from './textures';
import type { CellOverride } from './types';
import type { WallTextureName, FloorTextureName, CeilingTextureName } from './textureNames';

export const CELL_SIZE = 2;
export const WALL_HEIGHT = 2.5;
export const EYE_HEIGHT = 1.0;

const wallGeo = new THREE.PlaneGeometry(CELL_SIZE, WALL_HEIGHT);
const tileGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);

// Cached materials by texture name
const wallMats = new Map<string, THREE.MeshLambertMaterial>();
const floorMats = new Map<string, THREE.MeshLambertMaterial>();
const ceilMats = new Map<string, THREE.MeshLambertMaterial>();

function getWallMaterial(name: WallTextureName = 'stone'): THREE.MeshLambertMaterial {
  let mat = wallMats.get(name);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ map: getWallTexture(name) });
    wallMats.set(name, mat);
  }
  return mat;
}

function getFloorMaterial(name: FloorTextureName = 'stone_tile'): THREE.MeshLambertMaterial {
  let mat = floorMats.get(name);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ map: getFloorTexture(name) });
    floorMats.set(name, mat);
  }
  return mat;
}

function getCeilingMaterial(name: CeilingTextureName = 'dark_rock'): THREE.MeshLambertMaterial {
  let mat = ceilMats.get(name);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ map: getCeilingTexture(name) });
    ceilMats.set(name, mat);
  }
  return mat;
}

// Rendering counterpart to isWalkable in grid.ts.
// OOB cells are treated as solid (boundary walls) rather than non-walkable.
function isSolid(grid: string[], col: number, row: number): boolean {
  if (row < 0 || row >= grid.length) return true;
  if (col < 0 || col >= grid[0].length) return true;
  return !WALKABLE_CELLS.has(grid[row][col]);
}

export function buildDungeon(grid: string[], cellOverrides?: CellOverride[]): THREE.Group {
  const group = new THREE.Group();
  const rows = grid.length;
  const cols = grid[0].length;

  // Build override lookup map
  const overrideMap = new Map<string, CellOverride>();
  if (cellOverrides) {
    for (const ov of cellOverrides) {
      overrideMap.set(`${ov.col},${ov.row}`, ov);
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!WALKABLE_CELLS.has(grid[row][col])) continue;

      const cx = col * CELL_SIZE + CELL_SIZE / 2;
      const cz = row * CELL_SIZE + CELL_SIZE / 2;

      const ov = overrideMap.get(`${col},${row}`);
      const wallName = (ov?.wallTexture ?? 'stone') as WallTextureName;
      const floorName = (ov?.floorTexture ?? 'stone_tile') as FloorTextureName;
      const ceilName = (ov?.ceilingTexture ?? 'dark_rock') as CeilingTextureName;
      const cellWallMat = getWallMaterial(wallName);
      const cellFloorMat = getFloorMaterial(floorName);
      const cellCeilMat = getCeilingMaterial(ceilName);

      // Floor
      const floor = new THREE.Mesh(tileGeo, cellFloorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, 0, cz);
      group.add(floor);

      // Ceiling
      const ceil = new THREE.Mesh(tileGeo, cellCeilMat);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(cx, WALL_HEIGHT, cz);
      group.add(ceil);

      // North wall
      if (isSolid(grid, col, row - 1)) {
        const wall = new THREE.Mesh(wallGeo, cellWallMat);
        wall.position.set(cx, WALL_HEIGHT / 2, cz - CELL_SIZE / 2);
        group.add(wall);
      }

      // South wall
      if (isSolid(grid, col, row + 1)) {
        const wall = new THREE.Mesh(wallGeo, cellWallMat);
        wall.rotation.y = Math.PI;
        wall.position.set(cx, WALL_HEIGHT / 2, cz + CELL_SIZE / 2);
        group.add(wall);
      }

      // East wall
      if (isSolid(grid, col + 1, row)) {
        const wall = new THREE.Mesh(wallGeo, cellWallMat);
        wall.rotation.y = -Math.PI / 2;
        wall.position.set(cx + CELL_SIZE / 2, WALL_HEIGHT / 2, cz);
        group.add(wall);
      }

      // West wall
      if (isSolid(grid, col - 1, row)) {
        const wall = new THREE.Mesh(wallGeo, cellWallMat);
        wall.rotation.y = Math.PI / 2;
        wall.position.set(cx - CELL_SIZE / 2, WALL_HEIGHT / 2, cz);
        group.add(wall);
      }
    }
  }

  return group;
}
