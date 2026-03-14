import * as THREE from 'three';
import { WALKABLE_CELLS, buildWalkableSet } from '../core/grid';
import { getWallTexture, getFloorTexture, getCeilingTexture } from './textures';
import { resolveTextures } from '../core/textureResolver';
import type { TextureSet, TextureArea, CharDef } from '../core/types';
import type { WallTextureName, FloorTextureName, CeilingTextureName } from '../core/textureNames';

export const CELL_SIZE = 2;
export const WALL_HEIGHT = 2.5;
export const EYE_HEIGHT = WALL_HEIGHT * 0.65;

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
function isSolid(grid: string[], col: number, row: number, walkable: Set<string> = WALKABLE_CELLS): boolean {
  if (row < 0 || row >= grid.length) return true;
  if (col < 0 || col >= grid[0].length) return true;
  return !walkable.has(grid[row][col]);
}

// Resolve wall material for a face against a solid neighbor.
// If the solid neighbor has a charDef with wallTexture, use that instead.
function resolveWallMat(
  grid: string[],
  neighborCol: number,
  neighborRow: number,
  fallbackMat: THREE.MeshLambertMaterial,
  charDefMap?: Map<string, CharDef>,
): THREE.MeshLambertMaterial {
  if (!charDefMap) return fallbackMat;
  if (neighborRow < 0 || neighborRow >= grid.length) return fallbackMat;
  if (neighborCol < 0 || neighborCol >= grid[0].length) return fallbackMat;
  const neighborChar = grid[neighborRow][neighborCol];
  const def = charDefMap.get(neighborChar);
  if (def && def.solid && def.wallTexture) {
    return getWallMaterial(def.wallTexture as WallTextureName);
  }
  return fallbackMat;
}

export function buildDungeon(grid: string[], defaults?: TextureSet, areas?: TextureArea[], charDefs?: CharDef[], ceiling = true): THREE.Group {
  const group = new THREE.Group();
  const rows = grid.length;
  const cols = grid[0].length;

  // Build charDef lookup map and walkable set
  const charDefMap = new Map<string, CharDef>();
  if (charDefs) {
    for (const def of charDefs) charDefMap.set(def.char, def);
  }
  const walkable = buildWalkableSet(charDefs);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!walkable.has(grid[row][col])) continue;

      const cx = col * CELL_SIZE + CELL_SIZE / 2;
      const cz = row * CELL_SIZE + CELL_SIZE / 2;

      const char = grid[row][col];
      const tex = resolveTextures(col, row, char, defaults, charDefMap, areas);
      const cellWallMat = getWallMaterial(tex.wall);
      const cellFloorMat = getFloorMaterial(tex.floor);
      const cellCeilMat = getCeilingMaterial(tex.ceiling);

      // Floor (skip for stair cells — stairRenderer provides the geometry)
      if (char !== 'S' && char !== 'U') {
        const floor = new THREE.Mesh(tileGeo, cellFloorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(cx, 0, cz);
        group.add(floor);
      }

      // Ceiling (skip for stair cells — stairRenderer provides the geometry)
      if (ceiling && char !== 'S' && char !== 'U') {
        const ceil = new THREE.Mesh(tileGeo, cellCeilMat);
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(cx, WALL_HEIGHT, cz);
        group.add(ceil);
      }

      // Walls (skip for stair cells — stairRenderer owns the entire cell)
      const isStair = char === 'S' || char === 'U';

      // North wall
      if (!isStair && isSolid(grid, col, row - 1, walkable)) {
        const wallMat = resolveWallMat(grid, col, row - 1, cellWallMat, charDefMap);
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(cx, WALL_HEIGHT / 2, cz - CELL_SIZE / 2);
        group.add(wall);
      }

      // South wall
      if (!isStair && isSolid(grid, col, row + 1, walkable)) {
        const wallMat = resolveWallMat(grid, col, row + 1, cellWallMat, charDefMap);
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.rotation.y = Math.PI;
        wall.position.set(cx, WALL_HEIGHT / 2, cz + CELL_SIZE / 2);
        group.add(wall);
      }

      // East wall
      if (!isStair && isSolid(grid, col + 1, row, walkable)) {
        const wallMat = resolveWallMat(grid, col + 1, row, cellWallMat, charDefMap);
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.rotation.y = -Math.PI / 2;
        wall.position.set(cx + CELL_SIZE / 2, WALL_HEIGHT / 2, cz);
        group.add(wall);
      }

      // West wall
      if (!isStair && isSolid(grid, col - 1, row, walkable)) {
        const wallMat = resolveWallMat(grid, col - 1, row, cellWallMat, charDefMap);
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.rotation.y = Math.PI / 2;
        wall.position.set(cx - CELL_SIZE / 2, WALL_HEIGHT / 2, cz);
        group.add(wall);
      }
    }
  }

  return group;
}
