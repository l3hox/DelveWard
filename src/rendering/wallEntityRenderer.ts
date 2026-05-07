import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT } from './dungeon';
import { doorKey } from '../core/gameState';
import { getWallTexture, getFloorTexture, getCeilingTexture } from './textures';
import { resolveTextures } from '../core/textureResolver';
import { buildWalkableSet } from '../core/grid';
import type { TextureSet, TextureArea, CharDef } from '../core/types';
import type { WallTextureName, FloorTextureName, CeilingTextureName } from '../core/textureNames';

export interface WallEntityMeshes {
  group: THREE.Group;
  meshMap: Map<string, { wallGroup: THREE.Group; floorCeilGroup: THREE.Group }>;
}

// Direction table: dc/dr = neighbor offset, ox/oz = wall face offset from cell center.
// rotY faces the wall toward the neighbor (walkable cell), matching what buildDungeon()
// would produce from the walkable side: North neighbor → face north (Math.PI), etc.
const DIRS = [
  { dc: 0,  dr: -1, rotY: Math.PI,       ox: 0,              oz: -CELL_SIZE / 2 }, // North neighbor
  { dc: 0,  dr:  1, rotY: 0,              ox: 0,              oz:  CELL_SIZE / 2 }, // South neighbor
  { dc:  1, dr:  0, rotY: Math.PI / 2,    ox:  CELL_SIZE / 2, oz: 0 },              // East neighbor
  { dc: -1, dr:  0, rotY: -Math.PI / 2,   ox: -CELL_SIZE / 2, oz: 0 },              // West neighbor
];

export function buildWallEntityMeshes(
  entities: Map<string, { col: number; row: number }>,
  grid: string[],
  defaults?: TextureSet,
  areas?: TextureArea[],
  charDefs?: CharDef[],
  textureOverride?: WallTextureName,
  layerAboveGrid?: string[],
  layerBelowGrid?: string[],
): WallEntityMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, { wallGroup: THREE.Group; floorCeilGroup: THREE.Group }>();

  const charDefMap = new Map<string, CharDef>();
  if (charDefs) {
    for (const def of charDefs) charDefMap.set(def.char, def);
  }
  const walkable = buildWalkableSet(charDefs);

  const wallGeo = new THREE.PlaneGeometry(CELL_SIZE, WALL_HEIGHT);
  const tileGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);

  // Material caches — keyed with prefix to avoid cross-type collisions
  const matCache = new Map<string, THREE.MeshLambertMaterial>();

  function getWallMat(name: WallTextureName): THREE.MeshLambertMaterial {
    const cacheKey = 'w_' + name;
    let m = matCache.get(cacheKey);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ map: getWallTexture(name) });
      matCache.set(cacheKey, m);
    }
    return m;
  }

  function getFloorMat(name: FloorTextureName): THREE.MeshLambertMaterial {
    const cacheKey = 'f_' + name;
    let m = matCache.get(cacheKey);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ map: getFloorTexture(name) });
      matCache.set(cacheKey, m);
    }
    return m;
  }

  function getCeilMat(name: CeilingTextureName): THREE.MeshLambertMaterial {
    const cacheKey = 'c_' + name;
    let m = matCache.get(cacheKey);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ map: getCeilingTexture(name) });
      matCache.set(cacheKey, m);
    }
    return m;
  }

  for (const [key, entity] of entities) {
    const { col, row } = entity;
    const cx = col * CELL_SIZE + CELL_SIZE / 2;
    const cz = row * CELL_SIZE + CELL_SIZE / 2;

    const wallGroup = new THREE.Group();
    const floorCeilGroup = new THREE.Group();
    floorCeilGroup.visible = false;

    // Resolve texture fallback from first adjacent walkable cell
    let fallbackTex = resolveTextures(col, row, grid[row][col], defaults, charDefMap, areas);
    for (const dir of DIRS) {
      const nc = col + dir.dc;
      const nr = row + dir.dr;
      if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length && walkable.has(grid[nr][nc])) {
        fallbackTex = resolveTextures(nc, nr, grid[nr][nc], defaults, charDefMap, areas);
        break;
      }
    }

    for (const dir of DIRS) {
      const nc = col + dir.dc;
      const nr = row + dir.dr;
      const inBounds = nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length;
      const neighborWalkable = inBounds && walkable.has(grid[nr][nc]);
      const neighborIsEntity = entities.has(doorKey(nc, nr));

      if (neighborWalkable) {
        // Wall face visible from the walkable cell — owned by this entity until opened
        const neighborTex = resolveTextures(nc, nr, grid[nr][nc], defaults, charDefMap, areas);
        const wallTexName = textureOverride ?? neighborTex.wall;
        const wall = new THREE.Mesh(wallGeo, getWallMat(wallTexName));
        wall.position.set(cx + dir.ox, WALL_HEIGHT / 2, cz + dir.oz);
        wall.rotation.y = dir.rotY;
        wallGroup.add(wall);
      } else if (!neighborIsEntity) {
        // Solid neighbor that isn't another entity — wall shown after opening.
        // Faces inward (into the opened cell), opposite of the walkable-neighbor rotation.
        const wall = new THREE.Mesh(wallGeo, getWallMat(fallbackTex.wall));
        wall.position.set(cx + dir.ox, WALL_HEIGHT / 2, cz + dir.oz);
        wall.rotation.y = dir.rotY + Math.PI;
        floorCeilGroup.add(wall);
      }
    }

    // Floor and ceiling revealed when this entity cell is opened — but skip
    // the surface that's vertically open (mirrors buildDungeon's
    // isOpenTop/isOpenBottom logic so an opened secret wall under a
    // walkable layer above doesn't render an unwanted ceiling).
    let isOpenBottom = false;
    let isOpenTop = false;
    if (layerBelowGrid && row < layerBelowGrid.length && col < layerBelowGrid[0].length) {
      const belowChar = layerBelowGrid[row][col];
      const belowDef = charDefMap.get(belowChar);
      const belowIsSolidWall = belowChar === '#' || (belowDef !== undefined && belowDef.solid && !belowDef.seeThrough);
      if (!belowIsSolidWall) isOpenBottom = true;
    }
    if (layerAboveGrid && row < layerAboveGrid.length && col < layerAboveGrid[0].length) {
      const aboveChar = layerAboveGrid[row][col];
      const aboveDef = charDefMap.get(aboveChar);
      const aboveIsSolidWall = aboveChar === '#' || (aboveDef !== undefined && aboveDef.solid && !aboveDef.seeThrough);
      if (!aboveIsSolidWall) isOpenTop = true;
    }
    if (areas) {
      for (const area of areas) {
        if (col >= area.fromCol && col <= area.toCol && row >= area.fromRow && row <= area.toRow) {
          if (area.openBottom !== undefined) isOpenBottom = area.openBottom;
          if (area.openTop !== undefined) isOpenTop = area.openTop;
        }
      }
    }

    if (!isOpenBottom) {
      const floor = new THREE.Mesh(tileGeo, getFloorMat(fallbackTex.floor));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, 0, cz);
      floorCeilGroup.add(floor);
    }

    if (!isOpenTop) {
      const ceil = new THREE.Mesh(tileGeo, getCeilMat(fallbackTex.ceiling));
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(cx, WALL_HEIGHT, cz);
      floorCeilGroup.add(ceil);
    }

    group.add(wallGroup);
    group.add(floorCeilGroup);
    meshMap.set(key, { wallGroup, floorCeilGroup });
  }

  return { group, meshMap };
}
