import * as THREE from 'three';
import { WALKABLE_CELLS } from './grid';

export const CELL_SIZE = 2;
export const WALL_HEIGHT = 2.5;
export const EYE_HEIGHT = 1.0;

const wallMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
const floorMat = new THREE.MeshLambertMaterial({ color: 0x2a2218 });
const ceilMat = new THREE.MeshLambertMaterial({ color: 0x1a1510 });

const wallGeo = new THREE.PlaneGeometry(CELL_SIZE, WALL_HEIGHT);
const tileGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);

function isSolid(grid: string[], col: number, row: number): boolean {
  if (row < 0 || row >= grid.length) return true;
  if (col < 0 || col >= grid[0].length) return true;
  return !WALKABLE_CELLS.has(grid[row][col]);
}

export function buildDungeon(grid: string[]): THREE.Group {
  const group = new THREE.Group();
  const rows = grid.length;
  const cols = grid[0].length;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!WALKABLE_CELLS.has(grid[row][col])) continue;

      const cx = col * CELL_SIZE + CELL_SIZE / 2;
      const cz = row * CELL_SIZE + CELL_SIZE / 2;

      // Floor
      const floor = new THREE.Mesh(tileGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, 0, cz);
      group.add(floor);

      // Ceiling
      const ceil = new THREE.Mesh(tileGeo, ceilMat);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(cx, WALL_HEIGHT, cz);
      group.add(ceil);

      // North wall
      if (isSolid(grid, col, row - 1)) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(cx, WALL_HEIGHT / 2, cz - CELL_SIZE / 2);
        group.add(wall);
      }

      // South wall
      if (isSolid(grid, col, row + 1)) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.rotation.y = Math.PI;
        wall.position.set(cx, WALL_HEIGHT / 2, cz + CELL_SIZE / 2);
        group.add(wall);
      }

      // East wall
      if (isSolid(grid, col + 1, row)) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.rotation.y = -Math.PI / 2;
        wall.position.set(cx + CELL_SIZE / 2, WALL_HEIGHT / 2, cz);
        group.add(wall);
      }

      // West wall
      if (isSolid(grid, col - 1, row)) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.rotation.y = Math.PI / 2;
        wall.position.set(cx - CELL_SIZE / 2, WALL_HEIGHT / 2, cz);
        group.add(wall);
      }
    }
  }

  return group;
}
