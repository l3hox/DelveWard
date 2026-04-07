import * as THREE from 'three';
import { buildDungeon, CELL_SIZE, LAYER_HEIGHT } from '../rendering/dungeon';
import type { RampCellInfo } from '../rendering/dungeon';
import { Player } from '../rendering/player';
import { buildWalkableSet, FACING_DELTA } from '../core/grid';
import type { Facing } from '../core/grid';
import { GameState, doorKey, layerDoorKey } from '../core/gameState';
import { buildDoorMeshes, type DoorMeshes, type DoorOrientation } from '../rendering/doorRenderer';
import { buildKeyMeshes } from '../rendering/keyRenderer';
import { buildPlateMeshes } from '../rendering/plateRenderer';
import { buildTripwireMeshes } from '../rendering/tripwireRenderer';
import { buildLeverMeshes } from '../rendering/leverRenderer';
import { buildSconceMeshes } from '../rendering/sconceRenderer';
import { buildStairMeshes } from '../rendering/stairRenderer';
import { buildForestMeshes, type ForestMeshes } from '../rendering/forestRenderer';
import { buildEnemyMeshes } from '../rendering/enemyRenderer';
import { buildItemMeshes, buildConsumableMeshes } from '../rendering/groundItemRenderer';
import { buildEnvZoneMap, buildEnvZoneMapWithExistingZones } from '../rendering/environment';
import { createSkyboxMesh } from '../rendering/skybox';
import { buildTrapLauncherMeshes } from '../rendering/trapLauncherRenderer';
import { createProjectileMeshes, type ProjectileMeshes } from '../rendering/projectileRenderer';
import { buildWallEntityMeshes, type WallEntityMeshes } from '../rendering/wallEntityRenderer';
import { buildBlockMeshes, type BlockMeshes } from '../rendering/blockRenderer';
import { buildChestMeshes, type ChestMeshes } from '../rendering/chestRenderer';
import { buildSignMeshes, type SignMeshes } from '../rendering/signRenderer';
import { buildFountainMeshes } from '../rendering/fountainRenderer';
import { buildBookshelfMeshes } from '../rendering/bookshelfRenderer';
import { buildAltarMeshes } from '../rendering/altarRenderer';
import { buildBarrelMeshes } from '../rendering/barrelRenderer';
import { buildThinWallMeshes } from '../rendering/thinWallRenderer';
import { buildRampMeshes } from '../rendering/rampRenderer';
import { buildNpcMeshes, type NpcMeshes } from '../rendering/npcRenderer';
import { EnemyAnimator } from '../rendering/enemyAnimator';
import { LeverAnimator } from '../rendering/leverAnimator';
import { DoorAnimator } from '../rendering/doorAnimator';
import { EnemyHealthBarManager } from '../rendering/enemyHealthBar';
import { enemyDatabase, DEFAULT_SPRITE_SIZE } from '../enemies/enemyDatabase';
import type { DungeonLevel, Environment, LayerDef } from '../core/types';

export interface LevelScene {
  level: DungeonLevel;
  walkable: Set<string>;
  dungeonGroup: THREE.Group;
  doorMeshes: DoorMeshes;
  doorAnimator: DoorAnimator;
  keyMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Mesh> };
  plateMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Mesh> };
  tripwireMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Mesh> };
  leverMeshes: { group: THREE.Group; handleMap: Map<string, THREE.Group> };
  leverAnimator: LeverAnimator;
  sconceMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Group>; lightMap: Map<string, THREE.PointLight> };
  stairMeshes: { group: THREE.Group };
  enemyMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Mesh> };
  enemyAnimator: EnemyAnimator;
  healthBarManager: EnemyHealthBarManager;
  itemMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Mesh> };
  consumableMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Mesh> };
  forestMeshes: ForestMeshes;
  trapLauncherMeshes: { group: THREE.Group };
  projectileMeshes: ProjectileMeshes;
  wallEntityMeshes: WallEntityMeshes;
  blockMeshes: BlockMeshes;
  chestMeshes: ChestMeshes;
  signMeshes: SignMeshes;
  fountainMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Group> };
  bookshelfMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Group> };
  altarMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Group> };
  barrelMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Group> };
  thinWallMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Group> };
  rampMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Group> };
  npcMeshes: NpcMeshes;
  skyboxMesh?: THREE.Mesh;
  player: Player;
  // Multi-pass environment rendering
  multiZone: boolean;
  zones: Environment[];
  zoneMap: Map<string, number>;
  // Multi-layer support
  layerGrids: string[][];
  // All point lights for distance culling
  pointLights: THREE.PointLight[];
}

export function buildLevelScene(
  level: DungeonLevel,
  gameState: GameState,
  camera: THREE.PerspectiveCamera,
  scene: THREE.Scene,
  startCol: number,
  startRow: number,
  startFacing: Facing,
): LevelScene {
  const layerDefs: LayerDef[] = level.layers;
  const activeLayerIdx = gameState.activeLayerIndex;
  const activeLayerDef = layerDefs[activeLayerIdx];

  const walkable = buildWalkableSet(level.charDefs);

  // Multi-pass environment zone map — derived from the active layer
  const { zoneMap, zones, multiZone } = buildEnvZoneMap(
    activeLayerDef.grid,
    level.environment ?? 'dungeon',
    activeLayerDef.areas ?? level.areas,
  );

  // Shared structures — all layers' meshes merged with layer-prefixed keys
  const allDungeonGroup = new THREE.Group();
  scene.add(allDungeonGroup);

  const sharedDoorGroup = new THREE.Group();
  scene.add(sharedDoorGroup);
  const sharedDoorPanelMap = new Map<string, THREE.Object3D>();
  const sharedDoorOrientationMap = new Map<string, DoorOrientation>();
  const sharedDoorBoundaryLights = new Map<string, THREE.PointLight>();

  const sharedKeyGroup = new THREE.Group();
  scene.add(sharedKeyGroup);
  const sharedKeyMeshMap = new Map<string, THREE.Mesh>();

  const sharedPlateGroup = new THREE.Group();
  scene.add(sharedPlateGroup);
  const sharedPlateMeshMap = new Map<string, THREE.Mesh>();

  const sharedTripwireGroup = new THREE.Group();
  scene.add(sharedTripwireGroup);
  const sharedTripwireMeshMap = new Map<string, THREE.Mesh>();

  const sharedLeverGroup = new THREE.Group();
  scene.add(sharedLeverGroup);
  const sharedLeverHandleMap = new Map<string, THREE.Group>();

  const sharedSconceGroup = new THREE.Group();
  scene.add(sharedSconceGroup);
  const sharedSconceMeshMap = new Map<string, THREE.Group>();
  const sharedSconceLightMap = new Map<string, THREE.PointLight>();

  const sharedStairGroup = new THREE.Group();
  scene.add(sharedStairGroup);

  const sharedForestGroup = new THREE.Group();
  scene.add(sharedForestGroup);
  const sharedForestInstances: THREE.InstancedMesh[] = [];

  const sharedTrapLauncherGroup = new THREE.Group();
  scene.add(sharedTrapLauncherGroup);

  const sharedWallEntityGroup = new THREE.Group();
  scene.add(sharedWallEntityGroup);
  const sharedWallEntityMeshMap = new Map<string, { wallGroup: THREE.Group; floorCeilGroup: THREE.Group }>();

  const sharedBlockGroup = new THREE.Group();
  scene.add(sharedBlockGroup);
  const sharedBlockMeshMap = new Map<string, THREE.Mesh>();

  const sharedChestGroup = new THREE.Group();
  scene.add(sharedChestGroup);
  const sharedChestMeshMap = new Map<string, THREE.Group>();

  const sharedSignGroup = new THREE.Group();
  scene.add(sharedSignGroup);
  const sharedSignMeshMap = new Map<string, THREE.Mesh>();

  const sharedFountainGroup = new THREE.Group();
  scene.add(sharedFountainGroup);
  const sharedFountainMeshMap = new Map<string, THREE.Group>();

  const sharedBookshelfGroup = new THREE.Group();
  scene.add(sharedBookshelfGroup);
  const sharedBookshelfMeshMap = new Map<string, THREE.Group>();

  const sharedAltarGroup = new THREE.Group();
  scene.add(sharedAltarGroup);
  const sharedAltarMeshMap = new Map<string, THREE.Group>();

  const sharedBarrelGroup = new THREE.Group();
  scene.add(sharedBarrelGroup);
  const sharedBarrelMeshMap = new Map<string, THREE.Group>();

  const sharedThinWallGroup = new THREE.Group();
  scene.add(sharedThinWallGroup);
  const sharedThinWallMeshMap = new Map<string, THREE.Group>();

  const sharedRampGroup = new THREE.Group();
  scene.add(sharedRampGroup);
  const sharedRampMeshMap = new Map<string, THREE.Group>();

  const sharedNpcGroup = new THREE.Group();
  scene.add(sharedNpcGroup);
  const sharedNpcMeshMap = new Map<string, THREE.Mesh>();

  const sharedEnemyGroup = new THREE.Group();
  scene.add(sharedEnemyGroup);
  const sharedEnemyMeshMap = new Map<string, THREE.Mesh>();

  const sharedItemGroup = new THREE.Group();
  scene.add(sharedItemGroup);
  const sharedItemMeshMap = new Map<string, THREE.Mesh>();

  const sharedConsumableGroup = new THREE.Group();
  scene.add(sharedConsumableGroup);
  const sharedConsumableMeshMap = new Map<string, THREE.Mesh>();

  const doorAnimator = new DoorAnimator();
  const leverAnimator = new LeverAnimator();
  const enemyAnimator = new EnemyAnimator();
  const healthBarManager = new EnemyHealthBarManager();

  const charDefMap = new Map<string, import('../core/types').CharDef>();
  if (level.charDefs) for (const def of level.charDefs) charDefMap.set(def.char, def);

  // Helper: merge a Map into a shared Map, prefixing all keys with "li:"
  function mergeMap<T>(target: Map<string, T>, source: Map<string, T>, li: number): void {
    for (const [key, value] of source) {
      target.set(layerDoorKey(li, key), value);
    }
  }

  // Single loop over ALL layers
  for (let li = 0; li < layerDefs.length; li++) {
    gameState.activeLayerIndex = li;
    const ld = layerDefs[li];
    const yOffset = ld.yOffset ?? (li * LAYER_HEIGHT);
    const ldDefaults = ld.defaults ?? level.defaults;
    const ldAreas = ld.areas ?? level.areas;
    // No-ceiling only applies to the topmost layer; lower layers always render ceilings
    const isTopLayer = li === layerDefs.length - 1;
    const ldCeiling = isTopLayer ? (ld.ceiling ?? level.ceiling) !== false : true;
    const ldWalkable = buildWalkableSet(level.charDefs);

    const ldStairPositions = new Set(gameState.stairs.keys());
    const ldWallEntityCells = new Set<string>();
    for (const key of gameState.breakableWalls.keys()) ldWallEntityCells.add(key);
    for (const key of gameState.secretWalls.keys()) ldWallEntityCells.add(key);

    // Zone map for this layer — active layer uses the primary zone map, others reuse its zone assignments
    const ldZoneMap = li === activeLayerIdx
      ? (multiZone ? zoneMap : undefined)
      : (multiZone ? buildEnvZoneMapWithExistingZones(ld.grid, level.environment ?? 'dungeon', ldAreas, zones) : undefined);

    // Ramp cells that need ceiling/wall/floor suppression on this layer
    const ldRampOpenCells = new Map<string, RampCellInfo>();
    // Bottom cells on this layer: skip ceiling + wall in facing direction
    const OPPOSITE: Record<string, Facing> = { N: 'S', S: 'N', E: 'W', W: 'E' };
    for (const ramp of gameState.ramps.values()) {
      ldRampOpenCells.set(doorKey(ramp.col, ramp.row), {
        wallDir: ramp.facing,
        skipCeiling: true,
        skipFloor: false,
      });
      // Top cell (wall) on this same layer: split side walls, keep only the far half
      const [dx, dz] = FACING_DELTA[ramp.facing];
      const topCol = ramp.col + dx;
      const topRow = ramp.row + dz;
      ldRampOpenCells.set(doorKey(topCol, topRow), {
        wallDir: OPPOSITE[ramp.facing],
        skipCeiling: false,
        skipFloor: false,
        keepHalf: ramp.facing,
      });
    }
    // Top cells from ramps on the layer below: skip floor + wall opposite to facing
    if (li > 0) {
      const savedIdx = gameState.activeLayerIndex;
      gameState.activeLayerIndex = li - 1;
      for (const ramp of gameState.ramps.values()) {
        const [dx, dz] = FACING_DELTA[ramp.facing];
        const topCol = ramp.col + dx;
        const topRow = ramp.row + dz;
        ldRampOpenCells.set(doorKey(topCol, topRow), {
          wallDir: OPPOSITE[ramp.facing],
          skipCeiling: false,
          skipFloor: false,
          keepHalf: ramp.facing,
          floorKeepHalf: ramp.facing,  // keep floor on the far half, open where ramp comes through
        });
      }
      gameState.activeLayerIndex = savedIdx;
    }

    // Per-wall half-wall overrides: walkable cells adjacent to ramp top cells
    // need their walls TOWARD the top cell halved (keep only the half away from ramp entrance).
    const ldRampHalfWalls = new Map<string, Facing>();
    for (const ramp of gameState.ramps.values()) {
      const [dx, dz] = FACING_DELTA[ramp.facing];
      const topCol = ramp.col + dx;
      const topRow = ramp.row + dz;
      // Perpendicular directions to the ramp facing
      if (ramp.facing === 'N' || ramp.facing === 'S') {
        // E/W cells adjacent to top cell draw walls toward it
        // Cell to the east: its WEST wall faces the top cell
        ldRampHalfWalls.set(`${doorKey(topCol + 1, topRow)}:W`, ramp.facing);
        // Cell to the west: its EAST wall faces the top cell
        ldRampHalfWalls.set(`${doorKey(topCol - 1, topRow)}:E`, ramp.facing);
      } else {
        // N/S cells adjacent to top cell draw walls toward it
        ldRampHalfWalls.set(`${doorKey(topCol, topRow + 1)}:N`, ramp.facing);
        ldRampHalfWalls.set(`${doorKey(topCol, topRow - 1)}:S`, ramp.facing);
      }
    }

    // Dungeon geometry
    const ldAboveGrid = layerDefs[li + 1]?.grid;
    const ldBelowGrid = layerDefs[li - 1]?.grid;
    const ldDoorCells = new Set(gameState.doors.keys());
    const ldDungeonGroup = buildDungeon(
      ld.grid, ldDefaults, ldAreas, level.charDefs, ldCeiling,
      ldStairPositions, ldWallEntityCells,
      ldZoneMap,
      (li === activeLayerIdx && multiZone) ? ldDoorCells : undefined,
      ldAboveGrid, ldBelowGrid,
      ldRampOpenCells,
      ldRampHalfWalls,
    );
    ldDungeonGroup.position.y = yOffset;
    allDungeonGroup.add(ldDungeonGroup);

    // Door meshes
    const ldDoorMeshes = buildDoorMeshes(ld.grid, gameState, ldWalkable, ldZoneMap);
    ldDoorMeshes.group.position.y = yOffset;
    sharedDoorGroup.add(ldDoorMeshes.group);
    mergeMap(sharedDoorPanelMap, ldDoorMeshes.panelMap, li);
    mergeMap(sharedDoorOrientationMap, ldDoorMeshes.orientationMap, li);
    mergeMap(sharedDoorBoundaryLights, ldDoorMeshes.boundaryLights, li);

    // Register doors with animator using prefixed keys
    const ldHasCeiling = ldCeiling;
    for (const [key, panel] of ldDoorMeshes.panelMap) {
      const door = gameState.doors.get(key);
      let slideAxis: 'y' | 'x' | 'z' = 'y';
      let ceilingOpenAbove = !ldHasCeiling;
      if (!ceilingOpenAbove && ldAboveGrid && door) {
        const { col, row } = door;
        if (row < ldAboveGrid.length && col < ldAboveGrid[0].length) {
          const aboveChar = ldAboveGrid[row][col];
          const aboveDef = charDefMap.get(aboveChar);
          const isSolidWall = aboveChar === '#' || (aboveDef !== undefined && aboveDef.solid && !aboveDef.seeThrough);
          if (!isSolidWall) ceilingOpenAbove = true;
        }
      }
      if (ceilingOpenAbove) {
        const orient = ldDoorMeshes.orientationMap.get(key);
        slideAxis = orient === 'NS' ? 'z' : 'x';
      }
      doorAnimator.register(layerDoorKey(li, key), panel, door ? door.state === 'open' : false, slideAxis);
    }

    // Key meshes
    const ldKeyMeshes = buildKeyMeshes(gameState);
    ldKeyMeshes.group.position.y = yOffset;
    sharedKeyGroup.add(ldKeyMeshes.group);
    mergeMap(sharedKeyMeshMap, ldKeyMeshes.meshMap, li);

    // Plate meshes
    const ldPlateMeshes = buildPlateMeshes(gameState);
    ldPlateMeshes.group.position.y = yOffset;
    sharedPlateGroup.add(ldPlateMeshes.group);
    mergeMap(sharedPlateMeshMap, ldPlateMeshes.meshMap, li);

    // Tripwire meshes
    const ldTripwireMeshes = buildTripwireMeshes(gameState);
    ldTripwireMeshes.group.position.y = yOffset;
    sharedTripwireGroup.add(ldTripwireMeshes.group);
    mergeMap(sharedTripwireMeshMap, ldTripwireMeshes.meshMap, li);

    // Lever meshes
    const ldLeverMeshes = buildLeverMeshes(gameState);
    ldLeverMeshes.group.position.y = yOffset;
    sharedLeverGroup.add(ldLeverMeshes.group);
    mergeMap(sharedLeverHandleMap, ldLeverMeshes.handleMap, li);
    for (const [key, pivot] of ldLeverMeshes.handleMap) {
      const lever = gameState.levers.get(key);
      leverAnimator.register(layerDoorKey(li, key), pivot, lever ? lever.state : 'up');
    }

    // Sconce meshes
    const ldSconceMeshes = buildSconceMeshes(gameState);
    ldSconceMeshes.group.position.y = yOffset;
    sharedSconceGroup.add(ldSconceMeshes.group);
    mergeMap(sharedSconceMeshMap, ldSconceMeshes.meshMap, li);
    mergeMap(sharedSconceLightMap, ldSconceMeshes.lightMap, li);

    // Stair meshes
    const ldStairMeshes = buildStairMeshes(gameState.stairs, ldDefaults, ldAreas, ld.grid, level.charDefs, ldWalkable);
    ldStairMeshes.group.position.y = yOffset;
    sharedStairGroup.add(ldStairMeshes.group);

    // Forest meshes — only build if this layer's grid contains forest chars
    const ldForestMeshes = buildForestMeshes(ld.grid, level.charDefs);
    if (ldForestMeshes.instances.length > 0) {
      ldForestMeshes.group.position.y = yOffset;
      sharedForestGroup.add(ldForestMeshes.group);
      for (const inst of ldForestMeshes.instances) sharedForestInstances.push(inst);
    }

    // Trap launcher meshes
    const ldTrapLauncherMeshes = buildTrapLauncherMeshes(gameState);
    ldTrapLauncherMeshes.group.position.y = yOffset;
    sharedTrapLauncherGroup.add(ldTrapLauncherMeshes.group);

    // Wall entity meshes (breakable + secret walls)
    const ldAllWallEntities = new Map<string, { col: number; row: number }>();
    for (const [k, v] of gameState.breakableWalls) ldAllWallEntities.set(k, v);
    for (const [k, v] of gameState.secretWalls) ldAllWallEntities.set(k, v);
    const ldWallEntityMeshes = buildWallEntityMeshes(ldAllWallEntities, ld.grid, ldDefaults, ldAreas, level.charDefs);
    ldWallEntityMeshes.group.position.y = yOffset;
    sharedWallEntityGroup.add(ldWallEntityMeshes.group);
    mergeMap(sharedWallEntityMeshMap, ldWallEntityMeshes.meshMap, li);

    // Block meshes
    const ldBlockMeshes = buildBlockMeshes(gameState);
    ldBlockMeshes.group.position.y = yOffset;
    sharedBlockGroup.add(ldBlockMeshes.group);
    mergeMap(sharedBlockMeshMap, ldBlockMeshes.meshMap, li);

    // Chest meshes
    const ldChestMeshes = buildChestMeshes(gameState);
    ldChestMeshes.group.position.y = yOffset;
    sharedChestGroup.add(ldChestMeshes.group);
    mergeMap(sharedChestMeshMap, ldChestMeshes.meshMap, li);

    // Sign meshes
    const ldSignMeshes = buildSignMeshes(gameState);
    ldSignMeshes.group.position.y = yOffset;
    sharedSignGroup.add(ldSignMeshes.group);
    mergeMap(sharedSignMeshMap, ldSignMeshes.meshMap, li);

    // Fountain meshes
    const ldFountainMeshes = buildFountainMeshes(gameState);
    ldFountainMeshes.group.position.y = yOffset;
    sharedFountainGroup.add(ldFountainMeshes.group);
    mergeMap(sharedFountainMeshMap, ldFountainMeshes.meshMap, li);

    // Bookshelf meshes
    const ldBookshelfMeshes = buildBookshelfMeshes(gameState);
    ldBookshelfMeshes.group.position.y = yOffset;
    sharedBookshelfGroup.add(ldBookshelfMeshes.group);
    mergeMap(sharedBookshelfMeshMap, ldBookshelfMeshes.meshMap, li);

    // Altar meshes
    const ldAltarMeshes = buildAltarMeshes(gameState);
    ldAltarMeshes.group.position.y = yOffset;
    sharedAltarGroup.add(ldAltarMeshes.group);
    mergeMap(sharedAltarMeshMap, ldAltarMeshes.meshMap, li);

    // Barrel meshes
    const ldBarrelMeshes = buildBarrelMeshes(gameState);
    ldBarrelMeshes.group.position.y = yOffset;
    sharedBarrelGroup.add(ldBarrelMeshes.group);
    mergeMap(sharedBarrelMeshMap, ldBarrelMeshes.meshMap, li);

    // Thin wall meshes
    const ldThinWallMeshes = buildThinWallMeshes(gameState);
    ldThinWallMeshes.group.position.y = yOffset;
    sharedThinWallGroup.add(ldThinWallMeshes.group);
    mergeMap(sharedThinWallMeshMap, ldThinWallMeshes.meshMap, li);

    // Ramp meshes
    const ldRampMeshes = buildRampMeshes(gameState, ld.grid, ldDefaults, level.charDefs, ldAreas, ldWalkable);
    ldRampMeshes.group.position.y = yOffset;
    sharedRampGroup.add(ldRampMeshes.group);
    mergeMap(sharedRampMeshMap, ldRampMeshes.meshMap, li);

    // NPC meshes
    const ldNpcMeshes = buildNpcMeshes(gameState.npcs);
    ldNpcMeshes.group.position.y = yOffset;
    sharedNpcGroup.add(ldNpcMeshes.group);
    mergeMap(sharedNpcMeshMap, ldNpcMeshes.meshMap, li);

    // Enemy meshes
    const ldEnemyMeshes = buildEnemyMeshes(gameState);
    ldEnemyMeshes.group.position.y = yOffset;
    sharedEnemyGroup.add(ldEnemyMeshes.group);
    mergeMap(sharedEnemyMeshMap, ldEnemyMeshes.meshMap, li);
    for (const [key, mesh] of ldEnemyMeshes.meshMap) {
      const enemy = gameState.enemies.get(key);
      if (enemy) enemyAnimator.register(layerDoorKey(li, key), mesh, enemy.col, enemy.row);
    }
    for (const [key, enemy] of gameState.enemies) {
      const mesh = ldEnemyMeshes.meshMap.get(key);
      if (mesh) {
        const spriteHeight = enemyDatabase.getEnemy(enemy.type)?.sprite.size ?? DEFAULT_SPRITE_SIZE;
        healthBarManager.create(layerDoorKey(li, key), mesh, enemy.maxHp, spriteHeight);
      }
    }

    // Item meshes
    const ldItemMeshes = buildItemMeshes(gameState);
    ldItemMeshes.group.position.y = yOffset;
    sharedItemGroup.add(ldItemMeshes.group);
    mergeMap(sharedItemMeshMap, ldItemMeshes.meshMap, li);

    // Consumable meshes
    const ldConsumableMeshes = buildConsumableMeshes(gameState);
    ldConsumableMeshes.group.position.y = yOffset;
    sharedConsumableGroup.add(ldConsumableMeshes.group);
    mergeMap(sharedConsumableMeshMap, ldConsumableMeshes.meshMap, li);

    // Zone tagging for multi-pass rendering
    if (ldZoneMap) {
      const tagByKey = (obj: THREE.Object3D, key: string) => {
        const zone = ldZoneMap.get(key);
        if (zone !== undefined) obj.traverse(child => { child.layers.set(zone); });
      };
      // (Door frames + panels tagged at build time in buildDoorMeshes)
      for (const [key, mesh] of ldKeyMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldPlateMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldTripwireMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, handle] of ldLeverMeshes.handleMap) tagByKey(handle, key);
      for (const [key, mesh] of ldSconceMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldEnemyMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldNpcMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldItemMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldConsumableMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldBlockMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldChestMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldSignMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldFountainMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldBookshelfMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldAltarMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldBarrelMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldRampMeshes.meshMap) tagByKey(mesh, key);
      for (const [key, mesh] of ldThinWallMeshes.meshMap) {
        // Thin wall keys are "col,row:S" or "col,row:E" — strip the direction suffix for zone lookup
        const cellKey = key.split(':')[0];
        tagByKey(mesh, cellKey);
      }
      for (const [key, entry] of ldWallEntityMeshes.meshMap) {
        tagByKey(entry.wallGroup, key);
        tagByKey(entry.floorCeilGroup, key);
      }
      // Groups without per-cell zone keys — show in all zones
      ldStairMeshes.group.traverse(child => { child.layers.enableAll(); });
      ldTrapLauncherMeshes.group.traverse(child => { child.layers.enableAll(); });
      // Tag forest instances to the zone matching the level's default environment
      // (forest cells are in the outdoor/forest zone, not dungeon)
      const levelEnv = level.environment ?? 'dungeon';
      const forestZone = zones.indexOf(levelEnv) + 1 || 1; // 1-based zone index
      ldForestMeshes.group.traverse(child => { child.layers.set(forestZone); });
      for (const [, light] of ldSconceMeshes.lightMap) light.layers.enableAll();
    }
  }

  // Apply opened secret wall state — hide meshes for already-opened walls
  // (needed when returning to a previously visited level)
  for (let li = 0; li < layerDefs.length; li++) {
    gameState.activeLayerIndex = li;
    for (const [key, sw] of gameState.secretWalls) {
      if (!sw.opened) continue;
      const entry = sharedWallEntityMeshMap.get(layerDoorKey(li, key));
      if (!entry) continue;
      if (!sw.persistent) entry.wallGroup.visible = false;
      entry.floorCeilGroup.visible = true;
    }
  }

  // Restore active layer index
  gameState.activeLayerIndex = activeLayerIdx;

  scene.add(healthBarManager.getGroup());
  // Health bars visible in all zones
  if (multiZone) healthBarManager.getGroup().traverse(child => { child.layers.enableAll(); });

  // Projectiles are shared (single layer — always active layer)
  const projectileMeshes = createProjectileMeshes();
  projectileMeshes.group.position.y = activeLayerIdx * LAYER_HEIGHT;
  scene.add(projectileMeshes.group);
  if (multiZone) projectileMeshes.group.traverse(child => { child.layers.enableAll(); });

  let skyboxMesh: THREE.Mesh | undefined;
  if (level.skybox) {
    skyboxMesh = createSkyboxMesh(level.skybox);
    scene.add(skyboxMesh);
    // Skybox renders only in the first zone (typically outdoor)
    if (multiZone) skyboxMesh.layers.set(1);
  }

  // Player uses the grid of its starting layer
  const playerLayerGrid = layerDefs[activeLayerIdx]?.grid ?? activeLayerDef.grid;
  const playerWalkable = buildWalkableSet(level.charDefs);
  const player = new Player(
    camera,
    playerLayerGrid,
    startCol,
    startRow,
    startFacing,
    playerWalkable,
    gameState.isDoorOpen.bind(gameState),
    (col, row) => {
      if (gameState.isBlockedByEnemy(col, row) || gameState.isBlockAt(col, row) || gameState.isNpcAt(col, row) || gameState.isBarrelAt(col, row)) return true;
      // Holes (no floor) are handled by the falling system, not blocked here
      return false;
    },
    gameState.stairs,
    (fromCol: number, fromRow: number, toCol: number, toRow: number) => gameState.isEdgeBlocked(fromCol, fromRow, toCol, toRow),
    (fromCol: number, fromRow: number, toCol: number, toRow: number) => {
      const dc = toCol - fromCol;
      const dr = toRow - fromRow;
      // Going UP: source cell has a ramp, movement matches ramp facing
      const rampAtSrc = gameState.ramps.get(doorKey(fromCol, fromRow));
      if (rampAtSrc) {
        const [rdx, rdy] = FACING_DELTA[rampAtSrc.facing];
        if (dc === rdx && dr === rdy) return true;
      }
      // Going DOWN: check if there's a ramp on the layer below whose top cell is the source
      if (gameState.activeLayerIndex > 0) {
        const savedIdx = gameState.activeLayerIndex;
        gameState.activeLayerIndex = savedIdx - 1;
        // The ramp's top cell = (ramp.col + facing_dx, ramp.row + facing_dy)
        // We're moving FROM that top cell, so check ramps whose top cell matches fromCol,fromRow
        for (const ramp of gameState.ramps.values()) {
          const [rdx, rdy] = FACING_DELTA[ramp.facing];
          if (ramp.col + rdx === fromCol && ramp.row + rdy === fromRow &&
              dc === -rdx && dr === -rdy) {
            gameState.activeLayerIndex = savedIdx;
            return true;
          }
        }
        gameState.activeLayerIndex = savedIdx;
      }
      return false;
    },
  );
  player.yOffset = activeLayerIdx * LAYER_HEIGHT;
  player.targetYOffset = player.yOffset;

  return {
    level,
    walkable,
    dungeonGroup: allDungeonGroup,
    doorMeshes: {
      group: sharedDoorGroup,
      panelMap: sharedDoorPanelMap,
      orientationMap: sharedDoorOrientationMap,
      boundaryLights: sharedDoorBoundaryLights,
    },
    doorAnimator,
    keyMeshes: { group: sharedKeyGroup, meshMap: sharedKeyMeshMap },
    plateMeshes: { group: sharedPlateGroup, meshMap: sharedPlateMeshMap },
    tripwireMeshes: { group: sharedTripwireGroup, meshMap: sharedTripwireMeshMap },
    leverMeshes: { group: sharedLeverGroup, handleMap: sharedLeverHandleMap },
    leverAnimator,
    sconceMeshes: { group: sharedSconceGroup, meshMap: sharedSconceMeshMap, lightMap: sharedSconceLightMap },
    stairMeshes: { group: sharedStairGroup },
    forestMeshes: { group: sharedForestGroup, instances: sharedForestInstances },
    trapLauncherMeshes: { group: sharedTrapLauncherGroup },
    projectileMeshes,
    wallEntityMeshes: { group: sharedWallEntityGroup, meshMap: sharedWallEntityMeshMap },
    blockMeshes: { group: sharedBlockGroup, meshMap: sharedBlockMeshMap },
    chestMeshes: { group: sharedChestGroup, meshMap: sharedChestMeshMap },
    signMeshes: { group: sharedSignGroup, meshMap: sharedSignMeshMap },
    fountainMeshes: { group: sharedFountainGroup, meshMap: sharedFountainMeshMap },
    bookshelfMeshes: { group: sharedBookshelfGroup, meshMap: sharedBookshelfMeshMap },
    altarMeshes: { group: sharedAltarGroup, meshMap: sharedAltarMeshMap },
    barrelMeshes: { group: sharedBarrelGroup, meshMap: sharedBarrelMeshMap },
    thinWallMeshes: { group: sharedThinWallGroup, meshMap: sharedThinWallMeshMap },
    rampMeshes: { group: sharedRampGroup, meshMap: sharedRampMeshMap },
    npcMeshes: { group: sharedNpcGroup, meshMap: sharedNpcMeshMap },
    enemyMeshes: { group: sharedEnemyGroup, meshMap: sharedEnemyMeshMap },
    enemyAnimator,
    healthBarManager,
    itemMeshes: { group: sharedItemGroup, meshMap: sharedItemMeshMap },
    consumableMeshes: { group: sharedConsumableGroup, meshMap: sharedConsumableMeshMap },
    skyboxMesh,
    player,
    multiZone,
    zones,
    zoneMap,
    layerGrids: layerDefs.map(ld => ld.grid),
    pointLights: (() => {
      const lights: THREE.PointLight[] = [];
      scene.traverse(child => { if (child instanceof THREE.PointLight) lights.push(child); });
      return lights;
    })(),
  };
}

export function teardownLevelScene(ls: LevelScene, scene: THREE.Scene): void {
  const groups = [
    ls.dungeonGroup,
    ls.doorMeshes.group,
    ls.keyMeshes.group,
    ls.plateMeshes.group,
    ls.tripwireMeshes.group,
    ls.leverMeshes.group,
    ls.sconceMeshes.group,
    ls.stairMeshes.group,
    ls.forestMeshes.group,
    ls.trapLauncherMeshes.group,
    ls.projectileMeshes.group,
    ls.wallEntityMeshes.group,
    ls.blockMeshes.group,
    ls.chestMeshes.group,
    ls.signMeshes.group,
    ls.fountainMeshes.group,
    ls.bookshelfMeshes.group,
    ls.altarMeshes.group,
    ls.barrelMeshes.group,
    ls.thinWallMeshes.group,
    ls.rampMeshes.group,
    ls.npcMeshes.group,
    ls.enemyMeshes.group,
    ls.healthBarManager.getGroup(),
    ls.itemMeshes.group,
    ls.consumableMeshes.group,
  ];
  for (const group of groups) {
    scene.remove(group);
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        // Don't dispose materials — they're shared/cached
      }
    });
  }
  if (ls.skyboxMesh) {
    scene.remove(ls.skyboxMesh);
    ls.skyboxMesh.geometry.dispose();
  }
}
