import * as THREE from 'three';
import { WALKABLE_CELLS, buildWalkableSet } from '../core/grid';
import { getWallTexture, getFloorTexture, getCeilingTexture } from './textures';
import { resolveTextures } from '../core/textureResolver';
import type { TextureSet, TextureArea, CharDef } from '../core/types';
import type { WallTextureName, FloorTextureName, CeilingTextureName } from '../core/textureNames';
import { doorKey } from '../core/gameState';

export const CELL_SIZE = 2;
export const WALL_HEIGHT = 2.5;
export const EYE_HEIGHT = WALL_HEIGHT * 0.65;

const wallGeo = new THREE.PlaneGeometry(CELL_SIZE, WALL_HEIGHT);
const tileGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
// Half-tile geometries for zone boundary cells (split along N-S or E-W axis)
const halfTileNS = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE / 2); // north/south halves
const halfTileEW = new THREE.PlaneGeometry(CELL_SIZE / 2, CELL_SIZE); // east/west halves
// Half-wall geometries for zone boundary cells (split along passage axis)
const halfWallGeo = new THREE.PlaneGeometry(CELL_SIZE / 2, WALL_HEIGHT);

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

export function buildDungeon(grid: string[], defaults?: TextureSet, areas?: TextureArea[], charDefs?: CharDef[], ceiling = true, stairPositions?: Set<string>, wallEntityCells?: Set<string>, envZoneMap?: Map<string, number>, doorCells?: Set<string>): THREE.Group {
  const group = new THREE.Group();
  const rows = grid.length;
  const cols = grid[0].length;

  // Build charDef lookup map and renderable set (walkable + seeThrough chars)
  const charDefMap = new Map<string, CharDef>();
  if (charDefs) {
    for (const def of charDefs) charDefMap.set(def.char, def);
  }
  const walkable = buildWalkableSet(charDefs);
  // Renderable = walkable + seeThrough: these get floor/ceiling and no walls between each other
  const renderable = new Set(walkable);
  if (charDefs) {
    for (const def of charDefs) {
      if (def.solid && def.seeThrough) renderable.add(def.char);
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!renderable.has(grid[row][col])) continue;

      const cx = col * CELL_SIZE + CELL_SIZE / 2;
      const cz = row * CELL_SIZE + CELL_SIZE / 2;

      const char = grid[row][col];
      const tex = resolveTextures(col, row, char, defaults, charDefMap, areas);
      const cellWallMat = getWallMaterial(tex.wall);
      const cellFloorMat = getFloorMaterial(tex.floor);
      const cellCeilMat = getCeilingMaterial(tex.ceiling);

      // Floor (skip for stair cells — stairRenderer provides the geometry)
      const isStair = stairPositions?.has(doorKey(col, row)) ?? false;
      const zoneLayer = envZoneMap?.get(doorKey(col, row));

      // Detect zone boundary on door cells: split floor/ceiling into halves
      let splitAxis: 'NS' | 'EW' | null = null;
      let neighborZone: number | undefined;
      const isDoorCell = doorCells?.has(doorKey(col, row)) ?? false;
      if (isDoorCell && envZoneMap && zoneLayer !== undefined) {
        const zN = envZoneMap.get(doorKey(col, row - 1));
        const zS = envZoneMap.get(doorKey(col, row + 1));
        const zE = envZoneMap.get(doorKey(col + 1, row));
        const zW = envZoneMap.get(doorKey(col - 1, row));
        if (zN !== undefined && zN !== zoneLayer) { splitAxis = 'NS'; neighborZone = zN; }
        else if (zS !== undefined && zS !== zoneLayer) { splitAxis = 'NS'; neighborZone = zS; }
        else if (zE !== undefined && zE !== zoneLayer) { splitAxis = 'EW'; neighborZone = zE; }
        else if (zW !== undefined && zW !== zoneLayer) { splitAxis = 'EW'; neighborZone = zW; }
      }

      if (!isStair) {
        if (splitAxis && neighborZone !== undefined && zoneLayer !== undefined) {
          // Boundary cell: split floor into two halves, each tagged to its zone
          if (splitAxis === 'NS') {
            const floorN = new THREE.Mesh(halfTileNS, cellFloorMat);
            floorN.rotation.x = -Math.PI / 2;
            floorN.position.set(cx, 0, cz - CELL_SIZE / 4);
            const floorS = new THREE.Mesh(halfTileNS, cellFloorMat);
            floorS.rotation.x = -Math.PI / 2;
            floorS.position.set(cx, 0, cz + CELL_SIZE / 4);
            // North half gets whichever zone is to the north
            const zN = envZoneMap!.get(doorKey(col, row - 1));
            floorN.layers.set(zN !== undefined && zN !== zoneLayer ? zN : zoneLayer);
            floorS.layers.set(zN !== undefined && zN !== zoneLayer ? zoneLayer : neighborZone);
            group.add(floorN);
            group.add(floorS);
          } else {
            const floorW = new THREE.Mesh(halfTileEW, cellFloorMat);
            floorW.rotation.x = -Math.PI / 2;
            floorW.position.set(cx - CELL_SIZE / 4, 0, cz);
            const floorE = new THREE.Mesh(halfTileEW, cellFloorMat);
            floorE.rotation.x = -Math.PI / 2;
            floorE.position.set(cx + CELL_SIZE / 4, 0, cz);
            const zW = envZoneMap!.get(doorKey(col - 1, row));
            floorW.layers.set(zW !== undefined && zW !== zoneLayer ? zW : zoneLayer);
            floorE.layers.set(zW !== undefined && zW !== zoneLayer ? zoneLayer : neighborZone);
            group.add(floorW);
            group.add(floorE);
          }
        } else {
          const floor = new THREE.Mesh(tileGeo, cellFloorMat);
          floor.rotation.x = -Math.PI / 2;
          floor.position.set(cx, 0, cz);
          if (zoneLayer !== undefined) floor.layers.set(zoneLayer);
          group.add(floor);
        }
      }

      // Ceiling (skip for stair cells — stairRenderer provides the geometry)
      if (ceiling && !isStair) {
        if (splitAxis && neighborZone !== undefined && zoneLayer !== undefined) {
          if (splitAxis === 'NS') {
            const ceilN = new THREE.Mesh(halfTileNS, cellCeilMat);
            ceilN.rotation.x = Math.PI / 2;
            ceilN.position.set(cx, WALL_HEIGHT, cz - CELL_SIZE / 4);
            const ceilS = new THREE.Mesh(halfTileNS, cellCeilMat);
            ceilS.rotation.x = Math.PI / 2;
            ceilS.position.set(cx, WALL_HEIGHT, cz + CELL_SIZE / 4);
            const zN = envZoneMap!.get(doorKey(col, row - 1));
            ceilN.layers.set(zN !== undefined && zN !== zoneLayer ? zN : zoneLayer);
            ceilS.layers.set(zN !== undefined && zN !== zoneLayer ? zoneLayer : neighborZone);
            group.add(ceilN);
            group.add(ceilS);
          } else {
            const ceilW = new THREE.Mesh(halfTileEW, cellCeilMat);
            ceilW.rotation.x = Math.PI / 2;
            ceilW.position.set(cx - CELL_SIZE / 4, WALL_HEIGHT, cz);
            const ceilE = new THREE.Mesh(halfTileEW, cellCeilMat);
            ceilE.rotation.x = Math.PI / 2;
            ceilE.position.set(cx + CELL_SIZE / 4, WALL_HEIGHT, cz);
            const zW = envZoneMap!.get(doorKey(col - 1, row));
            ceilW.layers.set(zW !== undefined && zW !== zoneLayer ? zW : zoneLayer);
            ceilE.layers.set(zW !== undefined && zW !== zoneLayer ? zoneLayer : neighborZone);
            group.add(ceilW);
            group.add(ceilE);
          }
        } else {
          const ceil = new THREE.Mesh(tileGeo, cellCeilMat);
          ceil.rotation.x = Math.PI / 2;
          ceil.position.set(cx, WALL_HEIGHT, cz);
          if (zoneLayer !== undefined) ceil.layers.set(zoneLayer);
          group.add(ceil);
        }
      }

      // Walls (skip for stair cells — stairRenderer owns the entire cell)

      // Helper: add a wall, optionally split for boundary door cells
      const addWall = (
        wallMat: THREE.Material,
        rotY: number,
        wx: number, wz: number,
        wallSplitDir: 'along-z' | 'along-x' | null, // which axis the wall runs along
      ) => {
        if (isDoorCell && splitAxis && neighborZone !== undefined && zoneLayer !== undefined && wallSplitDir) {
          // Split wall into two halves along its length
          if (wallSplitDir === 'along-z' && splitAxis === 'NS') {
            // Wall runs along X axis (N or S wall), split into west/east halves
            // Actually: N/S walls face the passage — for NS split these are the side walls
            // The wall runs visually left-right (X). Split along Z means passage axis.
            // For NS split on an E/W wall: the wall runs along Z, split into N half and S half
            const zN = envZoneMap!.get(doorKey(col, row - 1));
            const halfN = new THREE.Mesh(halfWallGeo, wallMat);
            halfN.rotation.y = rotY;
            halfN.position.set(wx, WALL_HEIGHT / 2, wz - CELL_SIZE / 4);
            halfN.layers.set(zN !== undefined && zN !== zoneLayer ? zN : zoneLayer);
            group.add(halfN);
            const halfS = new THREE.Mesh(halfWallGeo, wallMat);
            halfS.rotation.y = rotY;
            halfS.position.set(wx, WALL_HEIGHT / 2, wz + CELL_SIZE / 4);
            halfS.layers.set(zN !== undefined && zN !== zoneLayer ? zoneLayer : neighborZone);
            group.add(halfS);
            return;
          }
          if (wallSplitDir === 'along-x' && splitAxis === 'EW') {
            const zW = envZoneMap!.get(doorKey(col - 1, row));
            const halfW = new THREE.Mesh(halfWallGeo, wallMat);
            halfW.rotation.y = rotY;
            halfW.position.set(wx - CELL_SIZE / 4, WALL_HEIGHT / 2, wz);
            halfW.layers.set(zW !== undefined && zW !== zoneLayer ? zW : zoneLayer);
            group.add(halfW);
            const halfE = new THREE.Mesh(halfWallGeo, wallMat);
            halfE.rotation.y = rotY;
            halfE.position.set(wx + CELL_SIZE / 4, WALL_HEIGHT / 2, wz);
            halfE.layers.set(zW !== undefined && zW !== zoneLayer ? zoneLayer : neighborZone);
            group.add(halfE);
            return;
          }
        }
        // Normal unsplit wall
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.rotation.y = rotY;
        wall.position.set(wx, WALL_HEIGHT / 2, wz);
        if (zoneLayer !== undefined) wall.layers.set(zoneLayer);
        group.add(wall);
      };

      // North wall (faces south, runs along X axis)
      const skipN = wallEntityCells?.has(doorKey(col, row - 1)) ?? false;
      if (!isStair && !skipN && isSolid(grid, col, row - 1, renderable)) {
        const wallMat = resolveWallMat(grid, col, row - 1, cellWallMat, charDefMap);
        addWall(wallMat, 0, cx, cz - CELL_SIZE / 2, 'along-x');
      }

      // South wall (faces north, runs along X axis)
      const skipS = wallEntityCells?.has(doorKey(col, row + 1)) ?? false;
      if (!isStair && !skipS && isSolid(grid, col, row + 1, renderable)) {
        const wallMat = resolveWallMat(grid, col, row + 1, cellWallMat, charDefMap);
        addWall(wallMat, Math.PI, cx, cz + CELL_SIZE / 2, 'along-x');
      }

      // East wall (faces west, runs along Z axis)
      const skipE = wallEntityCells?.has(doorKey(col + 1, row)) ?? false;
      if (!isStair && !skipE && isSolid(grid, col + 1, row, renderable)) {
        const wallMat = resolveWallMat(grid, col + 1, row, cellWallMat, charDefMap);
        addWall(wallMat, -Math.PI / 2, cx + CELL_SIZE / 2, cz, 'along-z');
      }

      // West wall (faces east, runs along Z axis)
      const skipW = wallEntityCells?.has(doorKey(col - 1, row)) ?? false;
      if (!isStair && !skipW && isSolid(grid, col - 1, row, renderable)) {
        const wallMat = resolveWallMat(grid, col - 1, row, cellWallMat, charDefMap);
        addWall(wallMat, Math.PI / 2, cx - CELL_SIZE / 2, cz, 'along-z');
      }
    }
  }

  return group;
}
