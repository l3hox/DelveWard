/**
 * Shared scene-building utilities used by both the game (levelSceneBuilder)
 * and the editor 3D preview (EditorPreview).
 */

import * as THREE from 'three';
import type { DungeonLevel, LayerDef } from '../core/types';
import type { Facing } from '../core/grid';
import { GameState, doorKey } from '../core/gameState';
import { buildDungeon, LAYER_HEIGHT } from './dungeon';
import type { RampCellInfo } from './dungeon';
import { buildWalkableSet, FACING_DELTA } from '../core/grid';
import { buildDoorMeshes } from './doorRenderer';
import { buildSconceMeshes } from './sconceRenderer';
import { buildPropMeshes } from './propRenderer';
import { buildBarrelMeshes } from './barrelRenderer';
import { buildBlockMeshes } from './blockRenderer';
import { buildStairMeshes } from './stairRenderer';
import { buildWallEntityMeshes } from './wallEntityRenderer';
import { buildThinWallMeshes } from './thinWallRenderer';
import { buildRampMeshes } from './rampRenderer';
import { buildKeyMeshes } from './keyRenderer';
import { buildPlateMeshes } from './plateRenderer';
import { buildLeverMeshes } from './leverRenderer';
import { buildTripwireMeshes } from './tripwireRenderer';
import { buildTrapLauncherMeshes } from './trapLauncherRenderer';
import { buildChestMeshes } from './chestRenderer';
import { buildSignMeshes } from './signRenderer';
import { buildFountainMeshes } from './fountainRenderer';
import { buildBookshelfMeshes } from './bookshelfRenderer';
import { buildAltarMeshes } from './altarRenderer';
import { buildForestMeshes, type ForestMeshes } from './forestRenderer';
import { buildNpcMeshes } from './npcRenderer';
import { buildEnemyMeshes } from './enemyRenderer';
import { buildItemMeshes, buildConsumableMeshes } from './groundItemRenderer';

// ---------------------------------------------------------------------------
// Ramp info computation
// ---------------------------------------------------------------------------

const OPPOSITE: Record<string, Facing> = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** Compute ramp open-cell and half-wall maps for a single layer. */
export function buildRampInfo(
  gs: GameState,
  li: number,
): { rampOpenCells: Map<string, RampCellInfo>; rampHalfWalls: Map<string, Facing> } {
  const rampOpenCells = new Map<string, RampCellInfo>();

  function mergeRampCell(key: string, info: RampCellInfo): void {
    const existing = rampOpenCells.get(key);
    if (!existing) {
      rampOpenCells.set(key, info);
      return;
    }
    for (const d of info.wallDirs) {
      if (!existing.wallDirs.includes(d)) existing.wallDirs.push(d);
    }
    existing.skipCeiling = existing.skipCeiling || info.skipCeiling;
    existing.skipFloor = existing.skipFloor || info.skipFloor;
    if (info.keepHalf !== undefined && existing.keepHalf === undefined) existing.keepHalf = info.keepHalf;
    if (info.floorKeepHalf !== undefined && existing.floorKeepHalf === undefined) existing.floorKeepHalf = info.floorKeepHalf;
  }

  for (const ramp of gs.ramps.values()) {
    mergeRampCell(doorKey(ramp.col, ramp.row), {
      wallDirs: [ramp.facing],
      skipCeiling: true,
      skipFloor: false,
    });
    const [dx, dz] = FACING_DELTA[ramp.facing];
    const topCol = ramp.col + dx;
    const topRow = ramp.row + dz;
    mergeRampCell(doorKey(topCol, topRow), {
      wallDirs: [OPPOSITE[ramp.facing]],
      skipCeiling: false,
      skipFloor: false,
      keepHalf: ramp.facing,
    });
  }

  if (li > 0) {
    const savedIdx = gs.activeLayerIndex;
    gs.activeLayerIndex = li - 1;
    for (const ramp of gs.ramps.values()) {
      const [dx, dz] = FACING_DELTA[ramp.facing];
      const topCol = ramp.col + dx;
      const topRow = ramp.row + dz;
      mergeRampCell(doorKey(topCol, topRow), {
        wallDirs: [OPPOSITE[ramp.facing]],
        skipCeiling: false,
        skipFloor: false,
        floorKeepHalf: ramp.facing,
      });
    }
    gs.activeLayerIndex = savedIdx;
  }

  const rampHalfWalls = new Map<string, Facing>();
  for (const ramp of gs.ramps.values()) {
    const [dx, dz] = FACING_DELTA[ramp.facing];
    const topCol = ramp.col + dx;
    const topRow = ramp.row + dz;
    if (ramp.facing === 'N' || ramp.facing === 'S') {
      rampHalfWalls.set(`${doorKey(topCol + 1, topRow)}:W`, ramp.facing);
      rampHalfWalls.set(`${doorKey(topCol - 1, topRow)}:E`, ramp.facing);
    } else {
      rampHalfWalls.set(`${doorKey(topCol, topRow + 1)}:N`, ramp.facing);
      rampHalfWalls.set(`${doorKey(topCol, topRow - 1)}:S`, ramp.facing);
    }
  }

  return { rampOpenCells, rampHalfWalls };
}

// ---------------------------------------------------------------------------
// Entity mesh building for a single layer
// ---------------------------------------------------------------------------

export interface LayerEntityMeshes {
  group: THREE.Group;
  /** Billboard meshes that need rotation.y = camera.rotation.y each frame. */
  billboardMeshes: THREE.Mesh[];
  /** Forest InstancedMesh instances that need updateForestBillboards() each frame. */
  forestInstances: THREE.InstancedMesh[];
}

/**
 * Build ALL entity meshes for a single layer. This is the shared core that
 * both the game and editor preview use. The caller handles zone tagging,
 * mesh map merging, and animator registration.
 */
export function buildLayerEntityMeshes(
  gs: GameState,
  ld: LayerDef,
  level: DungeonLevel,
  walkable: Set<string>,
  yOffset: number,
): LayerEntityMeshes {
  const group = new THREE.Group();
  const billboardMeshes: THREE.Mesh[] = [];
  const forestInstances: THREE.InstancedMesh[] = [];
  const defaults = ld.defaults ?? level.defaults;
  const areas = ld.areas ?? level.areas;

  // Wall entities (breakable + secret walls)
  const wallEntityCells = new Map<string, { col: number; row: number }>();
  for (const [k, v] of gs.breakableWalls) wallEntityCells.set(k, v);
  for (const [k, v] of gs.secretWalls) wallEntityCells.set(k, v);
  if (wallEntityCells.size > 0) {
    const wem = buildWallEntityMeshes(wallEntityCells, ld.grid, defaults, areas, level.charDefs);
    wem.group.position.y = yOffset;
    group.add(wem.group);
  }

  const doorMeshes = buildDoorMeshes(ld.grid, gs, walkable);
  doorMeshes.group.position.y = yOffset;
  group.add(doorMeshes.group);

  const sconceMeshes = buildSconceMeshes(gs);
  sconceMeshes.group.position.y = yOffset;
  group.add(sconceMeshes.group);

  const stairMeshes = buildStairMeshes(gs.stairs, defaults, areas, ld.grid, level.charDefs, walkable);
  stairMeshes.group.position.y = yOffset;
  group.add(stairMeshes.group);

  const blockMeshes = buildBlockMeshes(gs);
  blockMeshes.group.position.y = yOffset;
  group.add(blockMeshes.group);

  const barrelMeshes = buildBarrelMeshes(gs);
  barrelMeshes.group.position.y = yOffset;
  group.add(barrelMeshes.group);

  const propMeshes = buildPropMeshes(gs);
  propMeshes.group.position.y = yOffset;
  group.add(propMeshes.group);

  const thinWallMeshes = buildThinWallMeshes(gs);
  thinWallMeshes.group.position.y = yOffset;
  group.add(thinWallMeshes.group);

  const rampMeshes = buildRampMeshes(gs, ld.grid, defaults, level.charDefs, areas, walkable);
  rampMeshes.group.position.y = yOffset;
  group.add(rampMeshes.group);

  const keyMeshes = buildKeyMeshes(gs);
  keyMeshes.group.position.y = yOffset;
  group.add(keyMeshes.group);
  for (const m of keyMeshes.meshMap.values()) billboardMeshes.push(m);

  const plateMeshes = buildPlateMeshes(gs);
  plateMeshes.group.position.y = yOffset;
  group.add(plateMeshes.group);

  const leverMeshes = buildLeverMeshes(gs);
  leverMeshes.group.position.y = yOffset;
  group.add(leverMeshes.group);

  const tripwireMeshes = buildTripwireMeshes(gs);
  tripwireMeshes.group.position.y = yOffset;
  group.add(tripwireMeshes.group);

  const trapLauncherMeshes = buildTrapLauncherMeshes(gs);
  trapLauncherMeshes.group.position.y = yOffset;
  group.add(trapLauncherMeshes.group);

  const chestMeshes = buildChestMeshes(gs);
  chestMeshes.group.position.y = yOffset;
  group.add(chestMeshes.group);

  const signMeshes = buildSignMeshes(gs);
  signMeshes.group.position.y = yOffset;
  group.add(signMeshes.group);

  const fountainMeshes = buildFountainMeshes(gs);
  fountainMeshes.group.position.y = yOffset;
  group.add(fountainMeshes.group);

  const bookshelfMeshes = buildBookshelfMeshes(gs);
  bookshelfMeshes.group.position.y = yOffset;
  group.add(bookshelfMeshes.group);

  const altarMeshes = buildAltarMeshes(gs);
  altarMeshes.group.position.y = yOffset;
  group.add(altarMeshes.group);

  const forestMeshes = buildForestMeshes(ld.grid, level.charDefs);
  if (forestMeshes.instances.length > 0) {
    forestMeshes.group.position.y = yOffset;
    group.add(forestMeshes.group);
    forestInstances.push(...forestMeshes.instances);
  }

  const npcMeshes = buildNpcMeshes(gs.npcs);
  npcMeshes.group.position.y = yOffset;
  group.add(npcMeshes.group);
  for (const m of npcMeshes.meshMap.values()) billboardMeshes.push(m);

  const enemyMeshes = buildEnemyMeshes(gs);
  enemyMeshes.group.position.y = yOffset;
  group.add(enemyMeshes.group);
  for (const m of enemyMeshes.meshMap.values()) billboardMeshes.push(m);

  const itemMeshes = buildItemMeshes(gs);
  itemMeshes.group.position.y = yOffset;
  group.add(itemMeshes.group);
  for (const m of itemMeshes.meshMap.values()) billboardMeshes.push(m);

  const consumableMeshes = buildConsumableMeshes(gs);
  consumableMeshes.group.position.y = yOffset;
  group.add(consumableMeshes.group);
  for (const m of consumableMeshes.meshMap.values()) billboardMeshes.push(m);

  return { group, billboardMeshes, forestInstances };
}

// ---------------------------------------------------------------------------
// Dungeon geometry for a single layer
// ---------------------------------------------------------------------------

/**
 * Build dungeon geometry (walls, floors, ceilings) for a single layer,
 * including ramp info and entity cell suppression.
 */
export function buildLayerDungeonGeometry(
  gs: GameState,
  li: number,
  ld: LayerDef,
  level: DungeonLevel,
  layerCount: number,
  options?: {
    envZoneMap?: Map<string, number>;
    doorCells?: Set<string>;
    pitTrapCells?: Set<string>;
  },
): { group: THREE.Group; pitFloorMap: Map<string, THREE.Mesh> } {
  const yOffset = ld.yOffset ?? (li * LAYER_HEIGHT);
  const defaults = ld.defaults ?? level.defaults;
  const areas = ld.areas ?? level.areas;
  const isTopLayer = li === layerCount - 1;
  const ceiling = isTopLayer ? (ld.ceiling ?? level.ceiling) !== false : true;
  const walkable = buildWalkableSet(level.charDefs);

  const stairPositions = new Set(gs.stairs.keys());
  const wallEntityCells = new Set<string>();
  for (const key of gs.breakableWalls.keys()) wallEntityCells.add(key);
  for (const key of gs.secretWalls.keys()) wallEntityCells.add(key);

  const { rampOpenCells, rampHalfWalls } = buildRampInfo(gs, li);

  const aboveGrid = level.layers[li + 1]?.grid;
  const belowGrid = level.layers[li - 1]?.grid;

  const { group, pitFloorMap } = buildDungeon(
    ld.grid, defaults, areas, level.charDefs, ceiling,
    stairPositions, wallEntityCells,
    options?.envZoneMap,
    options?.doorCells,
    aboveGrid, belowGrid,
    rampOpenCells, rampHalfWalls,
    options?.pitTrapCells,
  );
  group.position.y = yOffset;

  return { group, pitFloorMap };
}
