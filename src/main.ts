import * as THREE from 'three';
import { buildDungeon, CELL_SIZE, LAYER_HEIGHT } from './rendering/dungeon';
import { Player } from './rendering/player';
import { loadDungeon, getAllLevelEntities, findEntityLayerIndex, resolveLayerCoord } from './level/levelLoader';
import { buildWalkableSet, getFacingCell, FACING_DELTA } from './core/grid';
import { GameState, doorKey, meshKey, layerDoorKey } from './core/gameState';
import { ProjectileManager } from './core/projectileManager';
import type { TrapLauncherInstance } from './core/gameState';
import { interact } from './level/interaction';
import { buildDoorMeshes, updateDoorMesh, type DoorMeshes, type DoorOrientation } from './rendering/doorRenderer';
import { buildKeyMeshes, hideKeyMesh } from './rendering/keyRenderer';
import { buildPlateMeshes, pressPlate, releasePlate } from './rendering/plateRenderer';
import { buildTripwireMeshes, hideTripwire } from './rendering/tripwireRenderer';
import { buildLeverMeshes } from './rendering/leverRenderer';
import { buildSconceMeshes, extinguishSconce, updateSconceFlicker } from './rendering/sconceRenderer';
import { buildStairMeshes } from './rendering/stairRenderer';
import { buildForestMeshes, updateForestBillboards, type ForestMeshes } from './rendering/forestRenderer';
import { buildEnemyMeshes, updateEnemyBillboards, hideEnemyMesh, updateEnemyMeshPosition, preloadEnemyTextures } from './rendering/enemyRenderer';
import { buildItemMeshes, hideItemMesh, addSingleItemMesh } from './rendering/itemRenderer';
import { buildConsumableMeshes, hideConsumableMesh, addSingleConsumableMesh } from './rendering/consumableRenderer';
import { preloadItemSprites } from './rendering/itemSprites';
import { loadLootTables, rollLoot } from './core/lootTable';
import { EnemyAnimator } from './rendering/enemyAnimator';
import { updateEnemies } from './enemies/enemyAI';
import { enemyDatabase, DEFAULT_SPRITE_SIZE } from './enemies/enemyDatabase';
import type { EnemyInstance } from './enemies/enemyTypes';
import { playerAttack, enemyAttackPlayer } from './core/combat';
import type { CombatResult } from './core/combat';
import { LeverAnimator } from './rendering/leverAnimator';
import { DoorAnimator } from './rendering/doorAnimator';
import { HudOverlay } from './hud/hudCanvas';
import { TransitionOverlay } from './rendering/transitionOverlay';
import { CharacterCreationScreen } from './hud/characterCreation';
import { LevelUpNotification } from './hud/levelUpNotification';
import { DamageNumberManager } from './rendering/damageNumbers';
import { EnemyHealthBarManager } from './rendering/enemyHealthBar';
import { SwordSwingAnimator } from './rendering/swordSwing';
import { DustMotes, SconceEmbers, WaterDrips, Fireflies } from './rendering/particles';
import type { DungeonLevel, Dungeon, Entity, Environment, LayerDef } from './core/types';
import type { MultiLayerSnapshot } from './core/gameState';
import type { Facing } from './core/grid';
import { itemDatabase } from './core/itemDatabase';
import type { InventoryAction } from './hud/inventoryOverlay';
import { checkAssets } from './core/assetCheck';
import { applyEnvironment, getEnvironmentConfig, lerpEnvironment, resolveEnvironmentAtCell, buildEnvZoneMap, buildEnvZoneMapWithExistingZones } from './rendering/environment';
import { createSkyboxMesh } from './rendering/skybox';
import { buildTrapLauncherMeshes } from './rendering/trapLauncherRenderer';
import { createProjectileMeshes, updateProjectileMeshes, clearProjectileMeshes, warmUpGPUShaders, FireballExplosions, type ProjectileMeshes } from './rendering/projectileRenderer';
import { tickEffects, applyEffect, getSlowMultiplier, hasEffect } from './core/statusEffects';
import type { StatusEffectType } from './core/statusEffects';
import { buildWallEntityMeshes, type WallEntityMeshes } from './rendering/wallEntityRenderer';
import { buildBlockMeshes, animateBlockPush, type BlockMeshes } from './rendering/blockRenderer';
import { buildChestMeshes, openChestMesh, closeChestMesh, type ChestMeshes } from './rendering/chestRenderer';
import { buildSignMeshes, type SignMeshes } from './rendering/signRenderer';
import { buildFountainMeshes, markFountainUsed } from './rendering/fountainRenderer';
import { buildBookshelfMeshes } from './rendering/bookshelfRenderer';
import { buildAltarMeshes, markAltarUsed } from './rendering/altarRenderer';
import { buildBarrelMeshes } from './rendering/barrelRenderer';
import { SignOverlay } from './hud/signOverlay';
import { DialogOverlay } from './hud/dialogOverlay';
import { npcDatabase } from './npcs/npcDatabase';
import {
  loadDialog, startDialog, getCurrentNode, getAvailableChoices,
  selectChoice, advanceDialog, setDialogHooks, executeEffects,
} from './core/dialogManager';
import type { DialogSession } from './core/dialogManager';
import { buildNpcMeshes, updateNpcBillboards, preloadNpcTextures, type NpcMeshes } from './rendering/npcRenderer';
import { SaveLoadOverlay } from './hud/saveLoadOverlay';
import { questManager } from './core/questManager';
import { QuestLogOverlay } from './hud/questLogOverlay';
import { TradingOverlay } from './hud/tradingOverlay';
import {
  buildSaveData, applySaveData, saveToSlot, loadFromSlot, deleteSlot,
  exportSaveFile, importSaveFile, getAllSlotMetadata,
  SAVE_SLOT_KEYS, AUTOSAVE_KEY,
} from './core/saveSystem';
import type { SaveData } from './core/saveSystem';

// Camera viewport tuning — asymmetric frustum crop via setViewOffset.
// Positive = cut pixels, negative = expand view beyond default frustum.
// CAMERA_CROP_SIDE is derived to keep the aspect ratio square.
const CAMERA_FOV = 75;
const CAMERA_CROP_TOP = 0.15;     // cut 15% from top — hides ceiling for claustrophobic feel
const CAMERA_CROP_BOTTOM = -0.2;  // expand 20% downward — reveals more floor
const CAMERA_CROP_SIDE = (CAMERA_CROP_TOP + CAMERA_CROP_BOTTOM) / 2; // auto: preserves 1:1 aspect ratio

// Cap delta to prevent physics jumps when tab is backgrounded
const MAX_FRAME_DELTA = 0.1;

// Combat feedback
const PLAYER_DAMAGE_FLASH_DURATION = 0.15;
const ENEMY_DAMAGE_FLASH_DURATION = 0.12;

// Light culling — disable point lights beyond this distance from camera
const LIGHT_CULL_DISTANCE = 14; // ~7 cells
const _lightCullVec = new THREE.Vector3();

// Torch flicker parameters
const TORCH_OFFSET_Y = 0.3;
const FLICKER_RANGE = 1.2;
const FLICKER_MIN_INTERVAL = 0.04;
const FLICKER_INTERVAL_RANGE = 0.15;
const FLICKER_LERP = 0.2;

// ---

interface LevelScene {
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

function buildLevelScene(
  level: DungeonLevel,
  gameState: GameState,
  camera: THREE.PerspectiveCamera,
  scene: THREE.Scene,
  startCol: number,
  startRow: number,
  startFacing: Facing,
): LevelScene {
  // Resolve layer definitions — backward compat: wrap flat level as single-layer list
  const layerDefs: LayerDef[] = level.layers ?? [{
    grid: level.grid,
    entities: level.entities,
    defaults: level.defaults,
    areas: level.areas,
    ceiling: level.ceiling,
  }];
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

  const charDefMap = new Map<string, import('./core/types').CharDef>();
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
    const ldCeiling = (ld.ceiling ?? level.ceiling) !== false;
    const ldWalkable = buildWalkableSet(level.charDefs);

    const ldStairPositions = new Set(gameState.stairs.keys());
    const ldWallEntityCells = new Set<string>();
    for (const key of gameState.breakableWalls.keys()) ldWallEntityCells.add(key);
    for (const key of gameState.secretWalls.keys()) ldWallEntityCells.add(key);

    // Zone map for this layer — active layer uses the primary zone map, others reuse its zone assignments
    const ldZoneMap = li === activeLayerIdx
      ? (multiZone ? zoneMap : undefined)
      : (multiZone ? buildEnvZoneMapWithExistingZones(ld.grid, level.environment ?? 'dungeon', ldAreas, zones) : undefined);

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
    const ldStairMeshes = buildStairMeshes(gameState.stairs, ldDefaults, ldAreas, ld.grid, level.charDefs);
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
      for (const [key, entry] of ldWallEntityMeshes.meshMap) {
        tagByKey(entry.wallGroup, key);
        tagByKey(entry.floorCeilGroup, key);
      }
      // Groups without per-cell zone keys — show in all zones
      ldStairMeshes.group.traverse(child => { child.layers.enableAll(); });
      ldTrapLauncherMeshes.group.traverse(child => { child.layers.enableAll(); });
      ldForestMeshes.group.traverse(child => { child.layers.enableAll(); });
      for (const [, light] of ldSconceMeshes.lightMap) light.layers.enableAll();
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
    (col, row) => gameState.isBlockedByEnemy(col, row) || gameState.isBlockAt(col, row) || gameState.isNpcAt(col, row) || gameState.isBarrelAt(col, row),
    gameState.stairs,
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

function teardownLevelScene(ls: LevelScene, scene: THREE.Scene): void {
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

// ---

async function init(): Promise<void> {
  // --- Scene ---
  const scene = new THREE.Scene();

  // --- Camera ---
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );

  function applyCameraViewCrop(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cropTop = Math.floor(h * CAMERA_CROP_TOP);
    const cropBottom = Math.floor(h * CAMERA_CROP_BOTTOM);
    const cropX = Math.floor(w * CAMERA_CROP_SIDE);
    camera.setViewOffset(w, h, cropX, cropTop, w - cropX * 2, h - cropTop - cropBottom);
  }
  applyCameraViewCrop();

  // --- Renderer ---
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  // --- Lighting ---
  const ambient = new THREE.AmbientLight(0x000000); // color set by applyEnvironment
  scene.add(ambient);

  const torchLight = new THREE.PointLight(0xff994d, 6, 14, 2);      // ~7 cells radius
  const torchFillLight = new THREE.PointLight(0xff994d, 3, 10, 2);  // ~5 cells radius
  let flickerTarget = 3.5;
  let flickerTimer = 0;
  let hungerDrainAccumulator = 0;
  const HUNGER_DRAIN_INTERVAL = 10; // seconds per 1 hunger
  let starvationAccumulator = 0;
  const STARVATION_INTERVAL = 3; // seconds per 1 HP starvation damage
  scene.add(torchLight);
  scene.add(torchFillLight);

  // Lights must be visible in all multi-pass environment zones
  ambient.layers.enableAll();
  torchLight.layers.enableAll();
  torchFillLight.layers.enableAll();

  // Debug: fullbright toggle + layer flying
  let debugFullbright = false;
  const debugLight = new THREE.AmbientLight(0xffffff, 2);
  debugLight.layers.enableAll();
  let debugLayerIndex = 0; // current debug layer (may differ from gameState.activeLayerIndex)

  // --- Databases + textures (preload before scene build so sprites appear immediately) ---
  await Promise.all([enemyDatabase.load(), npcDatabase.load()]);
  await Promise.all([itemDatabase.load(), preloadEnemyTextures(), preloadNpcTextures(), loadLootTables()]);
  // Preload item sprites (needs item DB loaded first for icon names)
  const allIcons = itemDatabase.getAllItems().map((item) => item.icon);
  await preloadItemSprites(allIcons);

  // Load quest definitions + wire condition evaluator
  await Promise.all([
    questManager.loadQuest('fetch_amulet'),
    questManager.loadQuest('kill_spider_queen'),
    questManager.loadQuest('collect_lore'),
  ]);
  questManager.installConditionEvaluator();

  // Verify all referenced PNG assets exist (non-blocking, logs errors)
  checkAssets();

  // --- Dungeon ---
  const dungeon: Dungeon = await loadDungeon('/levels/ruins.json');  
//  const dungeon: Dungeon = await loadDungeon('/levels/dungeon_m1-layered.json');
//  const dungeon: Dungeon = await loadDungeon('/levels/test_m3.json');
  const startLevelId = dungeon.playerStart.levelId;
  const firstLevel = dungeon.levels.find(l => l.id === startLevelId) ?? dungeon.levels[0];

  let currentLevelId = firstLevel.id!;
  const levelSnapshots = new Map<string, MultiLayerSnapshot>();
  // Preserve original grids for restart (grids are mutated by breakable/secret wall opening)
  const originalGrids = new Map<string, string[]>();
  for (const level of dungeon.levels) {
    originalGrids.set(level.id ?? level.name, [...level.grid]);
  }
  applyEnvironment(firstLevel.environment, scene, ambient);

  const gameState = new GameState(firstLevel.entities, firstLevel.grid, firstLevel.id ?? firstLevel.name);
  // Re-init for multi-layer levels (constructor only handles single layer)
  if (firstLevel.layers) {
    gameState.loadNewLevel(firstLevel.entities, firstLevel.grid, firstLevel.id ?? firstLevel.name, firstLevel.layers);
  }
  // Set starting layer from playerStart
  const startLayerIndex = resolveLayerCoord(firstLevel, dungeon.playerStart.layerIndex ?? 0);
  gameState.activeLayerIndex = startLayerIndex;

  const projectileManager = new ProjectileManager();

  // --- HUD + Transition ---
  const hud = new HudOverlay();
  hud.attach();

  const transition = new TransitionOverlay();
  transition.attach();

  const signOverlay = new SignOverlay();
  signOverlay.attach();

  // --- Dialog overlay ---
  const dialogOverlay = new DialogOverlay();
  dialogOverlay.attach();
  let activeDialogSession: DialogSession | null = null;

  // --- Quest log overlay ---
  const questLogOverlay = new QuestLogOverlay();
  questLogOverlay.attach();

  // --- Trading overlay ---
  const tradingOverlay = new TradingOverlay();
  tradingOverlay.attach();
  tradingOverlay.setOnClose(() => {});

  function showDialogNode(): void {
    if (!activeDialogSession) return;
    const node = getCurrentNode(activeDialogSession);
    if (!node) {
      dialogOverlay.hide();
      activeDialogSession = null;
      return;
    }
    const choices = getAvailableChoices(activeDialogSession, gameState);
    dialogOverlay.show(node, choices);
  }

  dialogOverlay.setOnChoiceSelected((index) => {
    if (!activeDialogSession) return;
    const nextId = selectChoice(activeDialogSession, index, gameState);
    if (nextId === null) {
      dialogOverlay.hide();
      activeDialogSession = null;
    } else {
      showDialogNode();
    }
  });

  dialogOverlay.setOnAdvance(() => {
    if (!activeDialogSession) return;
    const nextId = advanceDialog(activeDialogSession, gameState);
    if (nextId === null) {
      dialogOverlay.hide();
      activeDialogSession = null;
    } else {
      showDialogNode();
    }
  });

  dialogOverlay.setOnDismiss(() => {
    dialogOverlay.hide();
    activeDialogSession = null;
  });

  // Wire dialog effect hooks
  setDialogHooks({
    onStartQuest: (questId) => {
      questManager.startQuest(questId);
      const def = questManager.getQuestDef(questId);
      hud.showMessage(`Quest started: ${def?.name ?? questId}`);
    },
    onAdvanceQuest: (questId) => {
      questManager.advanceQuest(questId, gameState);
      const status = questManager.getStatus(questId);
      const def = questManager.getQuestDef(questId);
      const name = def?.name ?? questId;
      if (status === 'complete') {
        hud.showMessage(`Quest complete: ${name}`);
      } else {
        hud.showMessage(`Quest updated: ${name}`);
      }
    },
    onOpenShop: (npcId) => {
      const def = npcDatabase.getNpc(npcId);
      if (!def || !def.stock) return;
      dialogOverlay.hide();
      activeDialogSession = null;
      tradingOverlay.show(npcId, def, gameState, hud);
    },
  });

  // --- Level-up notification ---
  const levelUpNotification = new LevelUpNotification();

  // --- Combat state ---
  let playerDamageFlashTimer = 0;
  const damageNumbers = new DamageNumberManager();
  scene.add(damageNumbers.getGroup());
  const swordSwing = new SwordSwingAnimator();

  // Particle effects
  const dustMotes = new DustMotes();
  scene.add(dustMotes.getObject());
  const sconceEmbers = new SconceEmbers();
  scene.add(sconceEmbers.getObject());
  const waterDrips = new WaterDrips();
  scene.add(waterDrips.getObject());
  const fireflies = new Fireflies();
  scene.add(fireflies.getObject());
  const fireballExplosions = new FireballExplosions();
  scene.add(fireballExplosions.getObject());

  function enemyDamageFlash(
    meshMap: Map<string, THREE.Mesh>,
    key: string,
  ): void {
    const mesh = meshMap.get(key);
    if (!mesh) return;
    const mat = mesh.material as THREE.ShaderMaterial;
    const tint = mat.uniforms.tint;
    if (!tint) return;
    tint.value.set(0xff0000);
    setTimeout(() => {
      tint.value.set(0xffffff);
    }, ENEMY_DAMAGE_FLASH_DURATION * 1000);
  }

  function handleEnemyKill(key: string, col: number, row: number, enemy: EnemyInstance): void {
    ls.healthBarManager.remove(lk(key));
    hideEnemyMesh(ls.enemyMeshes.meshMap, lk(doorKey(col, row)));
    ls.enemyAnimator.remove(lk(key));
    gameState.enemies.delete(key);
    const enemyDef = enemyDatabase.getEnemy(enemy.type);
    if (enemyDef) {
      const levelled = gameState.addXp(enemyDef.xp);
      if (levelled) levelUpNotification.trigger(gameState.level);
    }
    const lootResult = rollLoot(enemy.type, enemy.drops);
    gameState.gold += lootResult.gold;
    for (const drop of lootResult.items) {
      const entity = gameState.entityRegistry.createItem(
        drop.itemId, drop.quality,
        { kind: 'world', levelId: gameState.currentLevelId, col, row, layerIndex: gameState.activeLayerIndex },
        drop.modifiers,
      );
      const itemDef = itemDatabase.getItem(drop.itemId);
      if (itemDef && itemDef.type === 'consumable') {
        addSingleConsumableMesh(entity, ls.consumableMeshes.group, ls.consumableMeshes.meshMap, gameState.activeLayerIndex);
      } else if (itemDef) {
        addSingleItemMesh(entity, gameState, ls.itemMeshes.group, ls.itemMeshes.meshMap, gameState.activeLayerIndex);
      }
    }
  }

  function restartLevel(): void {
    transition.startTransition(() => {
      teardownLevelScene(ls, scene);

      // Restart always goes back to the dungeon start level and position
      const startLevel = dungeon.levels.find((l) => l.id === dungeon.playerStart.levelId) ?? dungeon.levels[0];
      currentLevelId = startLevel.id ?? startLevel.name;
      // Restore original grid (may have been mutated by breakable/secret wall openings)
      const origGrid = originalGrids.get(currentLevelId);
      if (origGrid) startLevel.grid = [...origGrid];
      levelSnapshots.clear();
      gameState.loadNewLevel(startLevel.entities, startLevel.grid, startLevel.id ?? startLevel.name, startLevel.layers);
      gameState.activeLayerIndex = resolveLayerCoord(startLevel, dungeon.playerStart.layerIndex ?? 0);
      projectileManager.clear();
      fireballExplosions.clear();
      gameState.hp = gameState.maxHp;
      gameState.torchFuel = gameState.maxTorchFuel;
      gameState.attackCooldown = 0;
      gameState.gold = 0;
      gameState.playerStatusEffects = [];
      applyEnvironment(startLevel.environment, scene, ambient);

      ls = buildLevelScene(
        startLevel, gameState, camera, scene,
        dungeon.playerStart.col,
        dungeon.playerStart.row,
        dungeon.playerStart.facing,
      );
      wireCallbacks();
      sconceEmbers.setSources(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap);
      dustMotes.setVisible(startLevel.dustMotes !== false);
      waterDrips.setLevel(startLevel.grid, startLevel.charDefs);
      waterDrips.setVisible(startLevel.waterDrips === true);
      fireflies.setVisible(startLevel.fireflies === true);
      gameState.revealAround(
        dungeon.playerStart.col,
        dungeon.playerStart.row,
        dungeon.playerStart.facing,
        startLevel.grid,
      );
    });
  }

  // --- Save / Load ---

  function saveGame(slotKey: string): void {
    const ps = ls.player.getState();
    const data = buildSaveData({
      gameState,
      playerCol: ps.col,
      playerRow: ps.row,
      playerFacing: ps.facing,
      currentLevelId,
      levelSnapshots,
      dungeon,
      questState: questManager.getSerializableState(),
    });
    const ok = saveToSlot(slotKey, data);
    if (!ok) {
      hud.showMessage('Save failed — storage full!');
    }
  }

  function loadGame(data: SaveData): void {
    transition.startTransition(() => {
      teardownLevelScene(ls, scene);

      // Restore all grids to original before applying saved grids
      for (const level of dungeon.levels) {
        const id = level.id ?? level.name;
        const orig = originalGrids.get(id);
        if (orig) level.grid = [...orig];
      }

      const result = applySaveData(data, gameState, dungeon);
      questManager.restoreState(result.questState);

      // Replace level snapshots with the ones from the save
      levelSnapshots.clear();
      for (const [id, snapshot] of result.levelSnapshots) {
        levelSnapshots.set(id, snapshot);
      }

      currentLevelId = result.targetLevelId;

      // Find the target level and rebuild the scene
      const targetLevel = dungeon.levels.find(l => (l.id ?? l.name) === currentLevelId) ?? dungeon.levels[0];
      applyEnvironment(targetLevel.environment, scene, ambient);

      projectileManager.clear();
      fireballExplosions.clear();
      blockedDoors.clear();
      gameState.attackCooldown = 0;
      hungerDrainAccumulator = 0;
      starvationAccumulator = 0;

      ls = buildLevelScene(
        targetLevel, gameState, camera, scene,
        result.playerCol, result.playerRow, result.playerFacing,
      );
      wireCallbacks();
      sconceEmbers.setSources(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap);
      dustMotes.setVisible(targetLevel.dustMotes !== false);
      waterDrips.setLevel(activeGrid(), targetLevel.charDefs);
      waterDrips.setVisible(targetLevel.waterDrips === true);
      fireflies.setVisible(targetLevel.fireflies === true);

      gameState.revealAround(result.playerCol, result.playerRow, result.playerFacing, activeGrid());
    });
  }

  function hasSaves(): boolean {
    const meta = getAllSlotMetadata();
    return Object.values(meta).some(m => m !== null);
  }

  const saveLoadOverlay = new SaveLoadOverlay({
    onSave(slotKey) {
      saveGame(slotKey);
      saveLoadOverlay.hide();
      hud.showMessage('Game saved.');
    },
    onLoad(slotKey) {
      const data = loadFromSlot(slotKey);
      if (!data) {
        saveLoadOverlay.hide();
        hud.showMessage('Failed to load save.');
        return;
      }
      if (data.dungeonName !== dungeon.name) {
        saveLoadOverlay.hide();
        hud.showMessage('Save is from a different dungeon.');
        return;
      }
      saveLoadOverlay.hide();
      loadGame(data);
    },
    onDelete(slotKey) {
      deleteSlot(slotKey);
      saveLoadOverlay.refreshSlots();
    },
    onExport() {
      const ps = ls.player.getState();
      const data = buildSaveData({
        gameState,
        playerCol: ps.col,
        playerRow: ps.row,
        playerFacing: ps.facing,
        currentLevelId,
        levelSnapshots,
        dungeon,
        questState: questManager.getSerializableState(),
      });
      exportSaveFile(data);
    },
    onImport() {
      importSaveFile().then((data) => {
        if (data.dungeonName !== dungeon.name) {
          saveLoadOverlay.hide();
          hud.showMessage('Save is from a different dungeon.');
          return;
        }
        saveLoadOverlay.hide();
        loadGame(data);
      }).catch(() => {
        // User cancelled or invalid file — do nothing
      });
    },
    onRestart() {
      saveLoadOverlay.hide();
      restartLevel();
    },
  });
  saveLoadOverlay.attach();

  // --- First level scene ---
  let ls = buildLevelScene(
    firstLevel,
    gameState,
    camera,
    scene,
    dungeon.playerStart.col,
    dungeon.playerStart.row,
    dungeon.playerStart.facing,
  );

  // --- Helpers ---

  /** Get the active layer's grid (follows gameState.activeLayerIndex). */
  function activeGrid(): string[] {
    return ls.layerGrids[gameState.activeLayerIndex] ?? ls.level.grid;
  }

  /** Prefix a doorKey-format string with the active layer index for mesh lookup. */
  function lk(key: string): string {
    return `${gameState.activeLayerIndex}:${key}`;
  }

  // --- Callbacks ---

  let lastPlayerCol = dungeon.playerStart.col;
  let lastPlayerRow = dungeon.playerStart.row;

  // Blocked doors: doors that tried to close while occupied. Retry every 2s.
  const DOOR_RETRY_INTERVAL = 1.5;
  const blockedDoors = new Map<string, { col: number; row: number; timer: number }>();

  function isDoorCellOccupied(col: number, row: number): 'player' | 'enemy' | null {
    if (lastPlayerCol === col && lastPlayerRow === row) return 'player';
    if (gameState.isEnemyAt(col, row)) return 'enemy';
    return null;
  }

  function tickBlockedDoors(delta: number): void {
    for (const [key, entry] of blockedDoors) {
      entry.timer -= delta;
      if (entry.timer > 0) continue;

      const occupant = isDoorCellOccupied(entry.col, entry.row);
      if (!occupant) {
        // Cell is clear — close the door for real
        blockedDoors.delete(key);
        const door = gameState.getDoor(entry.col, entry.row);
        if (door) door.state = 'closed';
        updateDoorMesh(ls.doorMeshes.panelMap, lk(doorKey(entry.col, entry.row)), false, ls.doorAnimator, ls.doorMeshes.boundaryLights);
      } else {
        // Still blocked — bounce animation and retry
        entry.timer = DOOR_RETRY_INTERVAL;
        const dk = doorKey(entry.col, entry.row);
        ls.doorAnimator.bounce(lk(dk));
      }
    }
  }

  function wireCallbacks(): void {
    ls.player.setOnMove((col, row) => {
      const prevCol = lastPlayerCol;
      const prevRow = lastPlayerRow;
      // Update position BEFORE deactivating sources so that
      // isDoorCellOccupied sees the player at their new cell
      lastPlayerCol = col;
      lastPlayerRow = row;

      // Deactivate momentary sources at the cell we just left
      if (col !== prevCol || row !== prevRow) {
        gameState.deactivatePressurePlate(prevCol, prevRow);
        gameState.deactivateTrigger(prevCol, prevRow);
      }

      // Safety: if player ended up on a closed door, force it open and block it
      const doorAtPlayer = gameState.getDoor(col, row);
      if (doorAtPlayer && doorAtPlayer.state === 'closed') {
        doorAtPlayer.state = 'open';
        const dk = doorKey(col, row);
        updateDoorMesh(ls.doorMeshes.panelMap, lk(dk), true, ls.doorAnimator, ls.doorMeshes.boundaryLights);
        blockedDoors.set(dk, { col, row, timer: DOOR_RETRY_INTERVAL });
      }

      // Reveal explored cells on move
      gameState.revealAround(col, row, ls.player.getState().facing, activeGrid());

      // Key pickup
      const pickedUpKeyId = gameState.pickupKeyAt(col, row);
      if (pickedUpKeyId) {
        console.log(`Picked up key: ${pickedUpKeyId}`);
        hideKeyMesh(ls.keyMeshes.meshMap, lk(doorKey(col, row)));
      }

      // Equipment pickup
      const equipResult = gameState.pickupEquipmentAt(col, row);
      if (equipResult.denied) {
        hud.showMessage(equipResult.denied);
      } else if (equipResult.item) {
        hud.showMessage(`Equipped: ${equipResult.item.name}`);
        hideItemMesh(ls.itemMeshes.meshMap, ls.itemMeshes.group, lk(doorKey(col, row)));
        // Show mesh for next remaining equipment at this cell
        const remainingEquip = gameState.entityRegistry.getGroundItems(gameState.currentLevelId, col, row)
          .find(e => { const d = itemDatabase.getItem(e.itemId); return d && d.type !== 'consumable'; });
        if (remainingEquip) {
          addSingleItemMesh(remainingEquip, gameState, ls.itemMeshes.group, ls.itemMeshes.meshMap, gameState.activeLayerIndex);
        }
      }

      // Consumable pickup
      const pickedUpConsumable = gameState.pickupConsumableAt(col, row);
      if (pickedUpConsumable) {
        console.log(`Picked up: ${pickedUpConsumable.name}`);
        hideConsumableMesh(ls.consumableMeshes.meshMap, ls.consumableMeshes.group, lk(doorKey(col, row)));
        // Show mesh for next remaining consumable at this cell
        const remainingCons = gameState.entityRegistry.getGroundItems(gameState.currentLevelId, col, row)
          .find(e => { const d = itemDatabase.getItem(e.itemId); return d && d.type === 'consumable'; });
        if (remainingCons) {
          addSingleConsumableMesh(remainingCons, ls.consumableMeshes.group, ls.consumableMeshes.meshMap, gameState.activeLayerIndex);
        }
      }

      // Trigger / tripwire activation
      gameState.activateTrigger(col, row);
      if (gameState.activateTripwire(col, row)) {
        hideTripwire(ls.tripwireMeshes.meshMap, lk(doorKey(col, row)));
      }

      // Pressure plate activation
      const plateTargets = gameState.activatePressurePlate(col, row);
      if (plateTargets) {
        const plate = gameState.plates.get(doorKey(col, row));
        if (plate?.activated) {
          pressPlate(ls.plateMeshes.meshMap, lk(doorKey(col, row)));
        }
      }

      // Torch fuel drain — skip in bright environments (outdoor, mist)
      {
        const playerEnv = resolveEnvironmentAtCell(col, row, ls.level.environment ?? 'dungeon', ls.level.areas);
        if (playerEnv !== 'outdoor' && playerEnv !== 'mist') {
          gameState.drainTorchFuel(1);
        }
      }

      // Stair detection — entity-based lookup
      if (gameState.getStair(col, row)) {
        const stairInstance = gameState.getStair(col, row)!;
        if (stairInstance.id) {
          // Find the full Entity object from the active layer's entities
          const allEntities = getAllLevelEntities(ls.level);
          const stairEntity = allEntities.find(e => e.id === stairInstance.id);
          if (stairEntity) {
            triggerLevelTransition(stairEntity);
          }
        }
      }
    });

    ls.player.setOnTurn(() => {
      const s = ls.player.getState();
      gameState.revealAround(s.col, s.row, s.facing, activeGrid());
    });

    // Signal-driven door state changes → animate door mesh
    gameState.onDoorSignalChanged = (col, row, open) => {
      const dk = doorKey(col, row);
      if (open) {
        // Opening — clear any blocked retry and open normally
        blockedDoors.delete(dk);
        updateDoorMesh(ls.doorMeshes.panelMap, lk(dk), true, ls.doorAnimator, ls.doorMeshes.boundaryLights);
      } else {
        // Closing — check if cell is occupied
        const occupant = isDoorCellOccupied(col, row);
        if (occupant) {
          // Keep door open in game state, start retry cycle
          const door = gameState.getDoor(col, row);
          if (door) door.state = 'open';
          blockedDoors.set(dk, { col, row, timer: DOOR_RETRY_INTERVAL });
          ls.doorAnimator.bounce(lk(dk));
        } else {
          blockedDoors.delete(dk);
          updateDoorMesh(ls.doorMeshes.panelMap, lk(dk), false, ls.doorAnimator, ls.doorMeshes.boundaryLights);
        }
      }
    };

    // Timed source deactivation → animate lever reset
    gameState.onLeverReset = (col, row) => {
      const leverKey = doorKey(col, row);
      ls.leverAnimator.setState(lk(leverKey), 'up');
    };

    // Plate reset (momentary step-off or timed expiry) → animate plate release
    gameState.onPlateReset = (col, row) => {
      releasePlate(ls.plateMeshes.meshMap, lk(doorKey(col, row)));
    };

    // Secret wall detection — walking into a wall cell with a secret wall entity
    ls.player.setOnMoveBlocked((col, row) => {
      const sw = gameState.getSecretWall(col, row);
      if (sw && !sw.opened) {
        const result = gameState.openSecretWall(col, row, activeGrid());
        if (result.opened) {
          const entry = ls.wallEntityMeshes.meshMap.get(lk(doorKey(col, row)));
          if (entry) {
            // Persistent (illusionary): keep wall visible, just make cell walkable
            if (!result.persistent) {
              entry.wallGroup.visible = false;
            }
            entry.floorCeilGroup.visible = true;
          }
          hud.showMessage(result.persistent ? 'An illusionary wall!' : 'A secret passage!');
          // Re-attempt the move now that the cell is walkable
          ls.player.moveForward();
        }
      }
    });

    // Signal-driven chest state changes → animate chest mesh
    gameState.onChestSignalChanged = (col, row, open) => {
      if (open) {
        openChestMesh(ls.chestMeshes.meshMap, lk(doorKey(col, row)));
      } else {
        closeChestMesh(ls.chestMeshes.meshMap, lk(doorKey(col, row)));
      }
    };

    // Trap launcher → spawn projectile from the launcher's own cell
    gameState.onLauncherFire = (launcher: TrapLauncherInstance) => {
      projectileManager.spawn({
        col: launcher.col,
        row: launcher.row,
        direction: launcher.facing,
        projectileType: launcher.projectileType,
        source: 'trap',
        maxRange: launcher.maxRange,
      });
    };

    // Projectile hit → apply damage and visual effects
    projectileManager.setHitCallback((projectile, col, row, hitType) => {
      if (hitType === 'player') {
        gameState.hp -= projectile.damage;
        playerDamageFlashTimer = PLAYER_DAMAGE_FLASH_DURATION;
        if (projectile.statusEffect) {
          applyEffect(gameState.playerStatusEffects, projectile.statusEffect as StatusEffectType, 6);
        }
      }
      if (hitType === 'enemy') {
        const key = doorKey(col, row);
        const enemy = gameState.getEnemy(col, row);
        if (enemy) {
          enemy.hp -= projectile.damage;
          if (projectile.statusEffect) {
            applyEffect(enemy.statusEffects, projectile.statusEffect as StatusEffectType, 6);
          }
          enemyDamageFlash(ls.enemyMeshes.meshMap, lk(doorKey(col, row)));
          ls.enemyAnimator.triggerHit(lk(key));
          damageNumbers.spawn(col, row, projectile.damage);
          if (enemy.hp <= 0) {
            handleEnemyKill(key, col, row, enemy);
          } else {
            ls.healthBarManager.update(lk(key), enemy.hp, enemy.maxHp);
          }
        }
      }
      if (projectile.projectileType === 'fireball') {
        fireballExplosions.spawn(
          projectile.col * CELL_SIZE,
          projectile.row * CELL_SIZE,
        );
      }
    });
  }

  function triggerLevelTransition(stairEntity: Entity): void {
    const targetStairId = stairEntity.target as string;

    // Save current level state
    blockedDoors.clear();
    projectileManager.clear();
    levelSnapshots.set(currentLevelId, gameState.saveLevelState());

    // Auto-save on every stair transition
    saveGame(AUTOSAVE_KEY);

    transition.startTransition(() => {
      // --- Midpoint: swap level ---
      teardownLevelScene(ls, scene);

      // Find target stair across all dungeon levels (search all layers)
      let targetLevel: DungeonLevel | undefined;
      let targetStair: Entity | undefined;
      let targetLayerIndex = 0;
      for (const level of dungeon.levels) {
        const allEntities = getAllLevelEntities(level);
        targetStair = allEntities.find(e => e.type === 'stairs' && e.id === targetStairId);
        if (targetStair) {
          targetLevel = level;
          targetLayerIndex = findEntityLayerIndex(level, targetStairId);
          break;
        }
      }
      if (!targetLevel || !targetStair) return; // shouldn't happen if validated

      const targetLevelId = targetLevel.id ?? targetLevel.name;
      const snapshot = levelSnapshots.get(targetLevelId);
      if (snapshot) {
        gameState.loadLevelState(snapshot);
      } else {
        gameState.loadNewLevel(targetLevel.entities, targetLevel.grid, targetLevelId, targetLevel.layers);
      }
      gameState.activeLayerIndex = targetLayerIndex;

      // Compute spawn position: one cell in front of target stair, facing away from stairs
      const targetFacing = targetStair.facing as Facing;
      const FACING_OFFSETS: Record<Facing, [number, number]> = {
        N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
      };
      const [dc, dr] = FACING_OFFSETS[targetFacing];
      const spawnCol = (targetStair.col as number) + dc;
      const spawnRow = (targetStair.row as number) + dr;

      currentLevelId = targetLevelId;
      applyEnvironment(targetLevel.environment, scene, ambient);
      ls = buildLevelScene(targetLevel, gameState, camera, scene, spawnCol, spawnRow, targetFacing);
      wireCallbacks();
      sconceEmbers.setSources(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap);
      dustMotes.setVisible(targetLevel.dustMotes !== false);
      waterDrips.setLevel(activeGrid(), targetLevel.charDefs);
      waterDrips.setVisible(targetLevel.waterDrips === true);
      fireflies.setVisible(targetLevel.fireflies === true);

      gameState.revealAround(spawnCol, spawnRow, targetFacing, activeGrid());
    });
  }

  // Wire up initial level
  wireCallbacks();
  sconceEmbers.setSources(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap);
  dustMotes.setVisible(ls.level.dustMotes !== false);
  waterDrips.setLevel(activeGrid(), ls.level.charDefs);
  waterDrips.setVisible(ls.level.waterDrips === true);
  fireflies.setVisible(ls.level.fireflies === true);

  // Reveal initial position
  const ps = ls.player.getState();
  gameState.revealAround(ps.col, ps.row, ps.facing, activeGrid());

  // --- Character creation + GPU warmup (concurrent) ---
  // Show character creation FIRST so the browser can paint it,
  // then start shader compilation in the background.
  const hudCanvas = hud.getCanvas();
  const charCreationDone = new Promise<void>((resolve) => {
    const charCreation = new CharacterCreationScreen(hudCanvas, (setup) => {
      gameState.applyCharacterSetup(setup.str, setup.dex, setup.vit, setup.wis, setup.name);
      resolve();
    });
    charCreation.show();
  });

  const loadingEl = document.createElement('div');
  loadingEl.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);font-family:monospace;font-size:13px;z-index:1000;color:#666;';
  loadingEl.innerHTML = 'Loading<span style="display:inline-block;overflow:hidden;vertical-align:bottom;width:0;animation:dw-dots 1.5s steps(3,end) infinite">...</span>';
  const dotStyle = document.createElement('style');
  dotStyle.textContent = '@keyframes dw-dots{to{width:1.2em}}';
  document.head.appendChild(dotStyle);
  document.body.appendChild(loadingEl);

  // Double-RAF: the outer fires before paint, the inner fires after paint.
  // This guarantees the character creation screen is actually drawn to the
  // display before shader compilation starts (important for Firefox where
  // compileAsync falls back to synchronous compilation).
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const warmupDone = warmUpGPUShaders(renderer, scene, camera).then(() => {
    loadingEl.textContent = 'Loaded';
  });

  await Promise.all([charCreationDone, warmupDone]);

  loadingEl.remove();
  dotStyle.remove();

  // --- Input ---
  const pressedKeys = new Set<string>();

  function processInventoryAction(action: InventoryAction): void {
    switch (action.type) {
      case 'equip':
        gameState.equipFromBackpack(action.backpackSlot);
        break;
      case 'unequip':
        gameState.unequipToBackpack(action.equipSlot);
        break;
      case 'use':
        {
          const backpackItems = gameState.entityRegistry.getBackpackItems();
          if (action.backpackSlot < backpackItems.length) {
            gameState.useConsumableFromRegistry(backpackItems[action.backpackSlot].instanceId);
          }
        }
        break;
      case 'drop':
        {
          const entity = gameState.entityRegistry.getItem(action.instanceId);
          if (entity) {
            gameState.dropItem(action.instanceId, action.col, action.row);
            const def = itemDatabase.getItem(entity.itemId);
            if (def) {
              const updatedEntity = gameState.entityRegistry.getItem(action.instanceId);
              if (updatedEntity) {
                if (def.type === 'consumable') {
                  addSingleConsumableMesh(updatedEntity, ls.consumableMeshes.group, ls.consumableMeshes.meshMap, gameState.activeLayerIndex);
                } else {
                  addSingleItemMesh(updatedEntity, gameState, ls.itemMeshes.group, ls.itemMeshes.meshMap, gameState.activeLayerIndex);
                }
              }
            }
          }
        }
        break;
      case 'message':
        hud.showMessage(action.text);
        break;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (transition.isActive) return;
    if (signOverlay.isOpen()) return; // sign overlay handles its own dismissal
    if (dialogOverlay.isOpen()) return; // dialog overlay handles its own keys
    if (saveLoadOverlay.isOpen()) return; // save/load overlay handles its own keys
    if (questLogOverlay.isOpen()) return; // quest log overlay handles its own keys
    if (tradingOverlay.isOpen()) return; // trading overlay handles its own keys
    if (pressedKeys.has(e.code)) return;
    pressedKeys.add(e.code);

    // Inventory overlay gets input priority (except KeyI/Escape which closes it)
    const inventoryOverlay = hud.getInventoryOverlay();
    if (inventoryOverlay.isOpen()) {
      if (e.code === 'KeyI' || e.code === 'Escape') {
        inventoryOverlay.toggle();
        return;
      }
      const ps = ls.player.getState();
      const action = inventoryOverlay.handleKey(e.code, gameState, ps.col, ps.row);
      if (action) {
        processInventoryAction(action);
      }
      return;
    }

    // Attribute panel routing — L/Escape closes (with tryClose guard), other keys consumed by panel
    const attributePanel = hud.getAttributePanel();
    if (attributePanel.isOpen()) {
      if (e.code === 'KeyL' || e.code === 'Escape') {
        attributePanel.tryClose(gameState);
        return;
      }
      attributePanel.handleKey(e.code, gameState);
      return;
    }

    // Stats panel blocks all input except T/Escape (to close)
    if (hud.getStatsPanel().isOpen()) {
      if (e.code === 'KeyT' || e.code === 'Escape') {
        hud.getStatsPanel().toggle();
      }
      return;
    }

    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW': ls.player.moveForward(); break;
      case 'ArrowDown':
      case 'KeyS': ls.player.moveBack(); break;
      case 'KeyA': ls.player.strafeLeft(); break;
      case 'KeyD': ls.player.strafeRight(); break;
      case 'ArrowLeft':
      case 'KeyQ': ls.player.turnLeft(); break;
      case 'ArrowRight':
      case 'KeyE': ls.player.turnRight(); break;
      case 'Space':
        {
          const result = interact(ls.player.getState(), activeGrid(), gameState);
          if (result.type === 'nothing' && result.message) {
            hud.showMessage(result.message);
          }
          if (result.type === 'door_opened') {
            const facing = getFacingCell(ls.player.getState());
            updateDoorMesh(ls.doorMeshes.panelMap, lk(doorKey(facing.col, facing.row)), true, ls.doorAnimator, ls.doorMeshes.boundaryLights);
          }
          if (result.type === 'door_closed') {
            const facing = getFacingCell(ls.player.getState());
            updateDoorMesh(ls.doorMeshes.panelMap, lk(doorKey(facing.col, facing.row)), false, ls.doorAnimator, ls.doorMeshes.boundaryLights);
          }
          if (result.type === 'door_blocked') {
            const facing = getFacingCell(ls.player.getState());
            const bk = doorKey(facing.col, facing.row);
            ls.doorAnimator.bounce(lk(bk));
          }
          if (result.type === 'lever_activated' && result.targets) {
            for (const t of result.targets) {
              const targetPos = gameState.resolveEntityPosition(t);
              if (targetPos) {
                updateDoorMesh(ls.doorMeshes.panelMap, lk(doorKey(targetPos.col, targetPos.row)), gameState.isDoorOpen(targetPos.col, targetPos.row), ls.doorAnimator, ls.doorMeshes.boundaryLights);
              }
            }
            const leverKey = doorKey(ls.player.getState().col, ls.player.getState().row);
            const lever = gameState.levers.get(leverKey);
            if (lever) ls.leverAnimator.setState(lk(leverKey), lever.state);
          }
          if (result.type === 'sconce_taken') {
            const ps = ls.player.getState();
            extinguishSconce(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap, lk(doorKey(ps.col, ps.row)));
            sconceEmbers.setSources(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap);
          }
          if (result.type === 'block_pushed' && result.targetCol !== undefined && result.targetRow !== undefined) {
            const facing = getFacingCell(ls.player.getState());
            const fromBlockKey = lk(doorKey(facing.col, facing.row));
            const toBlockKey = lk(doorKey(result.targetCol, result.targetRow));
            animateBlockPush(ls.blockMeshes.meshMap, fromBlockKey, facing.col, facing.row, toBlockKey, result.targetCol, result.targetRow);
            // Pressure plate at destination already activated by gameState.pushBlock()
            // Just animate the visual press
            const destPlate = gameState.plates.get(doorKey(result.targetCol, result.targetRow));
            if (destPlate?.activated) {
              pressPlate(ls.plateMeshes.meshMap, toBlockKey);
            }
            // Deactivate plate at origin if block was on one
            gameState.deactivatePressurePlate(facing.col, facing.row);
            const originPlate = gameState.plates.get(doorKey(facing.col, facing.row));
            if (originPlate && !originPlate.activated) {
              releasePlate(ls.plateMeshes.meshMap, fromBlockKey);
            }
          }
          if (result.type === 'chest_opened' && result.targetCol !== undefined && result.targetRow !== undefined) {
            openChestMesh(ls.chestMeshes.meshMap, lk(doorKey(result.targetCol, result.targetRow)));
            // Roll loot from chest drops
            const chest = gameState.getChest(result.targetCol, result.targetRow);
            if (chest?.drops) {
              const lootResult = rollLoot('', chest.drops);
              gameState.gold += lootResult.gold;
              for (const drop of lootResult.items) {
                const entity = gameState.entityRegistry.createItem(
                  drop.itemId, drop.quality,
                  { kind: 'world', levelId: gameState.currentLevelId, col: result.targetCol, row: result.targetRow, layerIndex: gameState.activeLayerIndex },
                  drop.modifiers,
                );
                const itemDef = itemDatabase.getItem(drop.itemId);
                if (itemDef && itemDef.type === 'consumable') {
                  addSingleConsumableMesh(entity, ls.consumableMeshes.group, ls.consumableMeshes.meshMap, gameState.activeLayerIndex);
                } else if (itemDef) {
                  addSingleItemMesh(entity, gameState, ls.itemMeshes.group, ls.itemMeshes.meshMap, gameState.activeLayerIndex);
                }
              }
            }
          }
          if (result.type === 'chest_locked') {
            hud.showMessage('This chest is locked.');
          }
          if (result.type === 'sign_read' && result.message) {
            signOverlay.show(result.message);
          }
          if (result.type === 'bookshelf_read' && result.message) {
            signOverlay.show(result.message);
          }
          if (result.type === 'fountain_used' && result.message) {
            hud.showMessage(result.message);
            if (result.targetCol !== undefined && result.targetRow !== undefined) {
              markFountainUsed(ls.fountainMeshes.meshMap, lk(doorKey(result.targetCol, result.targetRow)));
            }
          }
          if (result.type === 'altar_activated' && result.message) {
            hud.showMessage(result.message);
            if (result.targetCol !== undefined && result.targetRow !== undefined) {
              markAltarUsed(ls.altarMeshes.meshMap, lk(doorKey(result.targetCol, result.targetRow)));
            }
          }
          if (result.type === 'npc_interacted' && result.message) {
            const npcId = result.message;
            const npcDef = npcDatabase.getNpc(npcId);
            if (npcDef) {
              loadDialog(npcDef.dialog).then((tree) => {
                activeDialogSession = startDialog(npcId, tree);
                // Execute entry effects for the start node
                const startNode = getCurrentNode(activeDialogSession);
                if (startNode?.effects) {
                  executeEffects(startNode.effects, gameState);
                }
                showDialogNode();
              }).catch((err) => {
                console.warn('Failed to load dialog:', err);
                hud.showMessage(`${npcDef.name}: "..."`);
              });
            }
          }
        }
        break;
      case 'KeyF':
        {
          const results = playerAttack(ls.player.getState(), gameState);
          if (results[0]?.type !== 'cooldown') {
            swordSwing.trigger();
          }
          for (const result of results) {
            if (result.type === 'hit' || result.type === 'kill') {
              if (result.targetCol !== undefined && result.targetRow !== undefined) {
                enemyDamageFlash(ls.enemyMeshes.meshMap, lk(doorKey(result.targetCol, result.targetRow)));
                ls.enemyAnimator.triggerHit(lk(doorKey(result.targetCol, result.targetRow)));
                if (result.damage !== undefined) {
                  damageNumbers.spawn(result.targetCol, result.targetRow, result.damage);
                }
              }
              if (result.type === 'hit' && result.targetCol !== undefined && result.targetRow !== undefined) {
                const hitEnemy = gameState.getEnemy(result.targetCol, result.targetRow);
                if (hitEnemy) {
                  ls.healthBarManager.update(lk(doorKey(result.targetCol, result.targetRow)), hitEnemy.hp, hitEnemy.maxHp);
                }
              }
              if (result.type === 'kill' && result.targetCol !== undefined && result.targetRow !== undefined && result.enemyType) {
                // Enemy already removed from map by damageEnemy(); use result data for XP/loot
                const killKey = lk(doorKey(result.targetCol, result.targetRow));
                ls.healthBarManager.remove(killKey);
                hideEnemyMesh(ls.enemyMeshes.meshMap, killKey);
                ls.enemyAnimator.remove(killKey);
                const enemyDef = enemyDatabase.getEnemy(result.enemyType);
                if (enemyDef) {
                  const levelled = gameState.addXp(enemyDef.xp);
                  if (levelled) levelUpNotification.trigger(gameState.level);
                }
                const lootResult = rollLoot(result.enemyType, result.dropsOverride);
                gameState.gold += lootResult.gold;
                for (const drop of lootResult.items) {
                  const entity = gameState.entityRegistry.createItem(
                    drop.itemId, drop.quality,
                    { kind: 'world', levelId: gameState.currentLevelId, col: result.targetCol, row: result.targetRow, layerIndex: gameState.activeLayerIndex },
                    drop.modifiers,
                  );
                  const itemDef = itemDatabase.getItem(drop.itemId);
                  if (itemDef && itemDef.type === 'consumable') {
                    addSingleConsumableMesh(entity, ls.consumableMeshes.group, ls.consumableMeshes.meshMap, gameState.activeLayerIndex);
                  } else if (itemDef) {
                    addSingleItemMesh(entity, gameState, ls.itemMeshes.group, ls.itemMeshes.meshMap, gameState.activeLayerIndex);
                  }
                }
              }
            }
            if (result.type === 'wall_hit' && result.targetCol !== undefined && result.targetRow !== undefined && result.damage !== undefined) {
              // Apply damage to breakable wall and handle destruction
              const wallResult = gameState.damageBreakableWall(result.targetCol, result.targetRow, result.damage, activeGrid());
              damageNumbers.spawn(result.targetCol, result.targetRow, result.damage);
              if (wallResult.destroyed) {
                // Hide wall faces, show floor/ceiling
                const entry = ls.wallEntityMeshes.meshMap.get(lk(doorKey(result.targetCol, result.targetRow)));
                if (entry) {
                  entry.wallGroup.visible = false;
                  entry.floorCeilGroup.visible = true;
                }
                // Roll loot from wall drops
                if (wallResult.drops) {
                  const lootResult = rollLoot('', wallResult.drops);
                  gameState.gold += lootResult.gold;
                  for (const drop of lootResult.items) {
                    const entity = gameState.entityRegistry.createItem(
                      drop.itemId, drop.quality,
                      { kind: 'world', levelId: gameState.currentLevelId, col: result.targetCol, row: result.targetRow, layerIndex: gameState.activeLayerIndex },
                      drop.modifiers,
                    );
                    const itemDef = itemDatabase.getItem(drop.itemId);
                    if (itemDef && itemDef.type === 'consumable') {
                      addSingleConsumableMesh(entity, ls.consumableMeshes.group, ls.consumableMeshes.meshMap, gameState.activeLayerIndex);
                    } else if (itemDef) {
                      addSingleItemMesh(entity, gameState, ls.itemMeshes.group, ls.itemMeshes.meshMap, gameState.activeLayerIndex);
                    }
                  }
                }
              }
            }
            if ((result.type === 'barrel_hit' || result.type === 'barrel_destroy') && result.targetCol !== undefined && result.targetRow !== undefined && result.damage !== undefined) {
              damageNumbers.spawn(result.targetCol, result.targetRow, result.damage);
              if (result.type === 'barrel_destroy') {
                const barrelKey = lk(doorKey(result.targetCol, result.targetRow));
                const barrelMesh = ls.barrelMeshes.meshMap.get(barrelKey);
                if (barrelMesh) {
                  ls.barrelMeshes.group.remove(barrelMesh);
                  ls.barrelMeshes.meshMap.delete(barrelKey);
                }
                // Roll loot from barrel drops
                if (result.dropsOverride) {
                  const lootResult = rollLoot('', result.dropsOverride);
                  gameState.gold += lootResult.gold;
                  for (const drop of lootResult.items) {
                    const entity = gameState.entityRegistry.createItem(
                      drop.itemId, drop.quality,
                      { kind: 'world', levelId: gameState.currentLevelId, col: result.targetCol, row: result.targetRow, layerIndex: gameState.activeLayerIndex },
                      drop.modifiers,
                    );
                    const itemDef = itemDatabase.getItem(drop.itemId);
                    if (itemDef && itemDef.type === 'consumable') {
                      addSingleConsumableMesh(entity, ls.consumableMeshes.group, ls.consumableMeshes.meshMap, gameState.activeLayerIndex);
                    } else if (itemDef) {
                      addSingleItemMesh(entity, gameState, ls.itemMeshes.group, ls.itemMeshes.meshMap, gameState.activeLayerIndex);
                    }
                  }
                }
              }
            }
          }
        }
        break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8':
        {
          const slotIndex = parseInt(e.code.charAt(5)) - 1;
          const used = gameState.useConsumable(slotIndex);
          if (used) {
            console.log('Used consumable');
          }
        }
        break;
      case 'KeyT':
        hud.getStatsPanel().toggle();
        break;
      case 'KeyI':
        // Close stats panel if open, then open inventory overlay
        if (hud.getStatsPanel().isOpen()) hud.getStatsPanel().toggle();
        hud.getInventoryOverlay().toggle();
        break;
      case 'KeyJ':
        questLogOverlay.show(questManager);
        break;
      case 'KeyL':
        if (hud.getStatsPanel().isOpen()) hud.getStatsPanel().toggle();
        if (hud.getInventoryOverlay().isOpen()) hud.getInventoryOverlay().toggle();
        hud.getAttributePanel().open(gameState);
        break;
      case 'Escape':
        // Open save/load overlay when no other overlay is active
        saveLoadOverlay.show('save');
        break;
      case 'KeyM':
        debugFullbright = !debugFullbright;
        if (debugFullbright) {
          scene.add(debugLight);
          scene.fog = null;
          debugLayerIndex = gameState.activeLayerIndex;
        } else {
          scene.remove(debugLight);
          const cfg = getEnvironmentConfig();
          scene.fog = new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar);
          // Return to the player's starting layer when exiting debug mode
          const homeLayer = resolveLayerCoord(ls.level, dungeon.playerStart.layerIndex ?? 0);
          debugLayerIndex = homeLayer;
          gameState.activeLayerIndex = homeLayer;
          ls.player.targetYOffset = homeLayer * LAYER_HEIGHT;
          ls.player.switchGrid(ls.layerGrids[homeLayer], buildWalkableSet(ls.level.charDefs), gameState.stairs);
        }
        console.log(`Debug fullbright: ${debugFullbright ? 'ON' : 'OFF'}`);
        break;
      case 'KeyY':
        // Debug fly up a layer
        if (debugFullbright && ls.layerGrids.length > 1) {
          const maxLayer = ls.layerGrids.length - 1;
          if (debugLayerIndex < maxLayer) {
            debugLayerIndex++;
            gameState.activeLayerIndex = debugLayerIndex;
            ls.player.targetYOffset = debugLayerIndex * LAYER_HEIGHT;
            ls.player.switchGrid(ls.layerGrids[debugLayerIndex], buildWalkableSet(ls.level.charDefs), gameState.stairs);
            console.log(`Debug fly: layer ${debugLayerIndex}`);
          }
        }
        break;
      case 'KeyH':
        // Debug fly down a layer
        if (debugFullbright && ls.layerGrids.length > 1) {
          if (debugLayerIndex > 0) {
            debugLayerIndex--;
            gameState.activeLayerIndex = debugLayerIndex;
            ls.player.targetYOffset = debugLayerIndex * LAYER_HEIGHT;
            ls.player.switchGrid(ls.layerGrids[debugLayerIndex], buildWalkableSet(ls.level.charDefs), gameState.stairs);
            console.log(`Debug fly: layer ${debugLayerIndex}`);
          }
        }
        break;
    }
  });

  window.addEventListener('keyup', (e) => pressedKeys.delete(e.code));

  // --- Resize ---
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applyCameraViewCrop();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- Loop ---
  let lastTime = 0;

  function animate(time: number): void {
    const delta = Math.min((time - lastTime) / 1000, MAX_FRAME_DELTA);
    lastTime = time;

    const anyOverlayOpen = hud.getInventoryOverlay().isOpen() || hud.getStatsPanel().isOpen() || hud.getAttributePanel().isOpen() || signOverlay.isOpen() || dialogOverlay.isOpen() || saveLoadOverlay.isOpen() || questLogOverlay.isOpen() || tradingOverlay.isOpen();

    ls.player.slowMultiplier = getSlowMultiplier(gameState.playerStatusEffects);
    ls.player.update(delta);
    if (ls.skyboxMesh) {
      ls.skyboxMesh.position.copy(camera.position);
    }
    ls.doorAnimator.update(delta);

    // Boundary door lights: intensity follows door open animation
    for (const [key, light] of ls.doorMeshes.boundaryLights) {
      const fraction = ls.doorAnimator.getOpenFraction(key);
      light.intensity = fraction * 2; // max intensity when fully open
      light.visible = fraction > 0.01;
    }

    ls.leverAnimator.update(delta);
    ls.enemyAnimator.update(delta);
    transition.update(delta);
    damageNumbers.update(delta);
    swordSwing.update(delta);

    // Billboard enemy sprites toward camera (always — static visual)
    updateEnemyBillboards(ls.enemyMeshes.meshMap, camera);
    updateNpcBillboards(ls.npcMeshes.meshMap, camera);
    updateForestBillboards(ls.forestMeshes, camera);

    // Sync health bar positions (enemies animate with hit shake and lunge)
    ls.healthBarManager.updatePositions(ls.enemyMeshes.meshMap);
    ls.healthBarManager.updateBillboards(camera);

    // Status effect tint on enemies (always — static visual)
    for (const [key, enemy] of gameState.enemies) {
      const mesh = ls.enemyMeshes.meshMap.get(key);
      if (!mesh) continue;
      const mat = mesh.material as THREE.ShaderMaterial;
      const tint = mat.uniforms.tint;
      if (!tint) continue;
      if (hasEffect(enemy.statusEffects, 'burning')) {
        tint.value.set(0xFF8844);
      } else if (hasEffect(enemy.statusEffects, 'poison')) {
        tint.value.set(0x66FF66);
      } else {
        tint.value.set(0xFFFFFF);
      }
    }

    // --- Everything below pauses when an overlay is open ---
    if (!anyOverlayOpen) {
      gameState.signalManager.tick(delta);
      // Tick trap launchers on all layers
      {
        const saved = gameState.activeLayerIndex;
        for (let li = 0; li < gameState.layers.length; li++) {
          gameState.activeLayerIndex = li;
          gameState.tickTrapLaunchers();
        }
        gameState.activeLayerIndex = saved;
      }
      projectileManager.update(
        delta,
        (col, row) => ls.walkable.has(activeGrid()[row]?.[col]),
        gameState.isDoorOpen.bind(gameState),
        lastPlayerCol, lastPlayerRow,
        gameState.isEnemyAt.bind(gameState),
        gameState.isBlockAt.bind(gameState),
      );
      tickBlockedDoors(delta);

      // Sync projectile meshes with active projectiles
      updateProjectileMeshes(ls.projectileMeshes.group, ls.projectileMeshes.meshMap, projectileManager.getAll(), camera);

      // Sconce torch flicker
      updateSconceFlicker(ls.sconceMeshes.lightMap, delta);

      // Particle effects
      const camPos2 = torchFillLight.position;
      dustMotes.update(delta, camPos2.x, camPos2.y, camPos2.z);
      sconceEmbers.update(delta);
      waterDrips.update(delta, camPos2.x, camPos2.z);
      fireflies.update(delta, camPos2.x, camPos2.z);
      fireballExplosions.update(delta);
    }

    // Attack cooldown tick — paused when overlays are open
    if (gameState.attackCooldown > 0 && !anyOverlayOpen) {
      gameState.attackCooldown = Math.max(0, gameState.attackCooldown - delta);
    }

    // Player status effect tick — paused when overlays are open
    if (!anyOverlayOpen) {
      const effectResult = tickEffects(gameState.playerStatusEffects, delta);
      if (effectResult.damage > 0) {
        gameState.hp = Math.max(0, gameState.hp - effectResult.damage);
        playerDamageFlashTimer = PLAYER_DAMAGE_FLASH_DURATION;
      }
      gameState.playerStatusEffects = gameState.playerStatusEffects.filter(e => e.remaining > 0);

      // Temp buff tick
      gameState.tickTempBuffs(delta);

      // Environment area blending (only for single-zone levels; multi-zone uses multi-pass rendering)
      if (!ls.multiZone) {
        const ps = ls.player.getState();
        const playerEnv = resolveEnvironmentAtCell(ps.col, ps.row, ls.level.environment ?? 'dungeon', ls.level.areas);
        const targetCfg = getEnvironmentConfig(playerEnv);
        lerpEnvironment(scene, ambient, targetCfg, delta * 2);
      }

      // Hunger drain (real-time, paused during overlays)
      hungerDrainAccumulator += delta;
      while (hungerDrainAccumulator >= HUNGER_DRAIN_INTERVAL) {
        hungerDrainAccumulator -= HUNGER_DRAIN_INTERVAL;
        gameState.drainHunger(1);
      }

      // Starvation damage when starving
      if (gameState.hunger <= 0) {
        starvationAccumulator += delta;
        while (starvationAccumulator >= STARVATION_INTERVAL) {
          starvationAccumulator -= STARVATION_INTERVAL;
          gameState.hp = Math.max(0, gameState.hp - 1);
          playerDamageFlashTimer = PLAYER_DAMAGE_FLASH_DURATION;
        }
      } else {
        starvationAccumulator = 0;
      }
    }

    // Player damage flash tick
    if (playerDamageFlashTimer > 0) {
      playerDamageFlashTimer = Math.max(0, playerDamageFlashTimer - delta);
    }

    // Real-time enemy AI tick — all layers, paused when overlays are open
    if (!transition.isActive && !anyOverlayOpen) {
      const ps = ls.player.getState();
      const savedLayer = gameState.activeLayerIndex;
      for (let li = 0; li < gameState.layers.length; li++) {
        gameState.activeLayerIndex = li;
        const layerGrid = ls.layerGrids[li] ?? activeGrid();
        const actions = updateEnemies(
          gameState, ps.col, ps.row, layerGrid, ls.walkable,
          gameState.isDoorOpen.bind(gameState), delta,
        );
        for (const action of actions) {
          if (action.type === 'move' && action.toCol !== undefined && action.toRow !== undefined) {
            const newKey = doorKey(action.toCol, action.toRow);
            updateEnemyMeshPosition(ls.enemyMeshes.meshMap, lk(action.enemyKey), lk(newKey));
            ls.enemyAnimator.moveTo(lk(action.enemyKey), action.toCol, action.toRow, lk(newKey));
            ls.healthBarManager.rekey(lk(action.enemyKey), lk(newKey));
          } else if (action.type === 'attack') {
            // Only attack if enemy is on the player's layer
            if (li === savedLayer) {
              const enemy = gameState.enemies.get(action.enemyKey);
              if (enemy) {
                enemyAttackPlayer(gameState, enemy.atk);
                playerDamageFlashTimer = PLAYER_DAMAGE_FLASH_DURATION;
                ls.enemyAnimator.triggerLunge(lk(action.enemyKey), ps.col, ps.row);
                const onHitBehavior = enemyDatabase.getBehavior(enemy.type, 'onHit');
                if (onHitBehavior && Math.random() < (onHitBehavior.params.chance as number)) {
                  applyEffect(gameState.playerStatusEffects, onHitBehavior.params.statusEffect as StatusEffectType, onHitBehavior.params.duration as number);
                }
              }
            }
          } else if (action.type === 'regen') {
            const enemy = gameState.enemies.get(action.enemyKey);
            if (enemy) {
              ls.healthBarManager.update(lk(action.enemyKey), enemy.hp, enemy.maxHp);
            }
          } else if (action.type === 'status_damage') {
            const enemy = gameState.enemies.get(action.enemyKey);
            if (enemy) {
              enemyDamageFlash(ls.enemyMeshes.meshMap, lk(doorKey(action.fromCol, action.fromRow)));
              ls.healthBarManager.update(lk(action.enemyKey), enemy.hp, enemy.maxHp);
            }
          } else if (action.type === 'status_kill') {
            const enemy = gameState.enemies.get(action.enemyKey);
            if (enemy) {
              enemyDamageFlash(ls.enemyMeshes.meshMap, lk(doorKey(action.fromCol, action.fromRow)));
              handleEnemyKill(action.enemyKey, action.fromCol, action.fromRow, enemy);
            }
          }
        }
      }
      gameState.activeLayerIndex = savedLayer;

      // Death — show save/load overlay if saves exist, else restart
      if (gameState.hp <= 0) {
        if (hasSaves()) {
          saveLoadOverlay.show('load', true);
        } else {
          restartLevel();
        }
      }
    }

    // Torch follows player with variable flicker, scaled by fuel
    const camPos = camera.position;
    torchLight.position.set(camPos.x, camPos.y + TORCH_OFFSET_Y, camPos.z);

    // Fill light pushed forward from cell center (opposite of camera back offset)
    const angle = camera.rotation.y;
    const fillX = camPos.x - Math.sin(angle) * 0.7 * 2;
    const fillZ = camPos.z - Math.cos(angle) * 0.7 * 2;
    torchFillLight.position.set(fillX, camPos.y + TORCH_OFFSET_Y, fillZ);

    const fuelRatio = gameState.torchFuel / gameState.maxTorchFuel;
    // Light stays full above 35%, then fades linearly to dim below that
    const lightScale = fuelRatio >= 0.35 ? 1 : fuelRatio / 0.35;
    torchLight.distance = 4.5 + lightScale * 7.5;
    torchFillLight.distance = 3 + lightScale * 6;

    if (!anyOverlayOpen) {
      flickerTimer -= delta;
      if (flickerTimer <= 0) {
        const baseIntensity = 1.2 + lightScale * 4.2;
        flickerTarget = baseIntensity + Math.random() * FLICKER_RANGE * lightScale;
        flickerTimer = FLICKER_MIN_INTERVAL + Math.random() * FLICKER_INTERVAL_RANGE;
      }
      torchLight.intensity += (flickerTarget - torchLight.intensity) * FLICKER_LERP;
      torchFillLight.intensity = torchLight.intensity * 0.6;
    }

    levelUpNotification.update(delta);

    const damageFlashAlpha = playerDamageFlashTimer / PLAYER_DAMAGE_FLASH_DURATION;
    hud.draw(gameState, ls.player.getState(), activeGrid(), delta, damageFlashAlpha, swordSwing, levelUpNotification);

    // Light distance culling — disable point lights far from camera
    {
      const camPos = camera.position;
      const cullDistSq = LIGHT_CULL_DISTANCE * LIGHT_CULL_DISTANCE;
      for (const light of ls.pointLights) {
        if (light === torchLight || light === torchFillLight) continue; // player lights always on
        light.getWorldPosition(_lightCullVec);
        const dx = _lightCullVec.x - camPos.x;
        const dy = _lightCullVec.y - camPos.y;
        const dz = _lightCullVec.z - camPos.z;
        light.visible = (dx * dx + dy * dy + dz * dz) < cullDistSq;
      }
    }

    // Multi-pass environment rendering: each zone gets its own fog/background
    if (!ls.multiZone) {
      renderer.render(scene, camera);
    } else {
      renderer.autoClear = false;
      renderer.clear(true, true, true);
      for (let i = 0; i < ls.zones.length; i++) {
        const zoneLayer = i + 1;
        camera.layers.disableAll();
        camera.layers.enable(zoneLayer);
        if (!debugFullbright) {
          const cfg = getEnvironmentConfig(ls.zones[i]);
          scene.fog = new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar);
          scene.background = i === 0 ? new THREE.Color(cfg.fogColor) : null;
          ambient.color.setHex(cfg.ambientColor);
        }
        renderer.render(scene, camera);
      }
      renderer.autoClear = true;
      camera.layers.enableAll();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

init().catch((err) => {
  console.error('Failed to initialize:', err);
  document.body.textContent = `Error: ${err.message}`;
});
