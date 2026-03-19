import * as THREE from 'three';
import { buildDungeon, CELL_SIZE } from './rendering/dungeon';
import { Player } from './rendering/player';
import { loadDungeon } from './level/levelLoader';
import { buildWalkableSet, getFacingCell, FACING_DELTA } from './core/grid';
import { GameState, doorKey } from './core/gameState';
import { ProjectileManager } from './core/projectileManager';
import type { TrapLauncherInstance } from './core/gameState';
import { interact } from './level/interaction';
import { buildDoorMeshes, updateDoorMesh } from './rendering/doorRenderer';
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
import type { DungeonLevel, Dungeon, Entity } from './core/types';
import type { LevelSnapshot } from './core/gameState';
import type { Facing } from './core/grid';
import { itemDatabase } from './core/itemDatabase';
import type { InventoryAction } from './hud/inventoryOverlay';
import { checkAssets } from './core/assetCheck';
import { applyEnvironment, getEnvironmentConfig } from './rendering/environment';
import { createSkyboxMesh } from './rendering/skybox';
import { buildTrapLauncherMeshes } from './rendering/trapLauncherRenderer';
import { createProjectileMeshes, updateProjectileMeshes, clearProjectileMeshes, warmUpGPUShaders, FireballExplosions, type ProjectileMeshes } from './rendering/projectileRenderer';
import { tickEffects, applyEffect, getSlowMultiplier, hasEffect } from './core/statusEffects';
import type { StatusEffectType } from './core/statusEffects';

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
  doorMeshes: { group: THREE.Group; panelMap: Map<string, THREE.Mesh> };
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
  skyboxMesh?: THREE.Mesh;
  player: Player;
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
  const walkable = buildWalkableSet(level.charDefs);

  const stairPositions = new Set(gameState.stairs.keys());
  const dungeonGroup = buildDungeon(level.grid, level.defaults, level.areas, level.charDefs, level.ceiling !== false, stairPositions);
  scene.add(dungeonGroup);

  const doorMeshes = buildDoorMeshes(level.grid, gameState, walkable);
  scene.add(doorMeshes.group);

  const doorAnimator = new DoorAnimator();
  const hasCeiling = level.ceiling !== false;
  for (const [key, panel] of doorMeshes.panelMap) {
    const door = gameState.doors.get(key);
    let slideAxis: 'y' | 'x' | 'z' = 'y';
    if (!hasCeiling) {
      const orient = doorMeshes.orientationMap.get(key);
      slideAxis = orient === 'NS' ? 'z' : 'x';
    }
    doorAnimator.register(key, panel, door ? door.state === 'open' : false, slideAxis);
  }

  const keyMeshes = buildKeyMeshes(gameState);
  scene.add(keyMeshes.group);

  const plateMeshes = buildPlateMeshes(gameState);
  scene.add(plateMeshes.group);

  const tripwireMeshes = buildTripwireMeshes(gameState);
  scene.add(tripwireMeshes.group);

  const leverMeshes = buildLeverMeshes(gameState);
  scene.add(leverMeshes.group);

  const leverAnimator = new LeverAnimator();
  for (const [key, pivot] of leverMeshes.handleMap) {
    const lever = gameState.levers.get(key);
    leverAnimator.register(key, pivot, lever ? lever.state : 'up');
  }

  const sconceMeshes = buildSconceMeshes(gameState);
  scene.add(sconceMeshes.group);

  const stairMeshes = buildStairMeshes(gameState.stairs, level.defaults, level.areas);
  scene.add(stairMeshes.group);

  const forestMeshes = buildForestMeshes(level.grid, level.charDefs);
  scene.add(forestMeshes.group);

  const trapLauncherMeshes = buildTrapLauncherMeshes(gameState);
  scene.add(trapLauncherMeshes.group);

  const projectileMeshes = createProjectileMeshes();
  scene.add(projectileMeshes.group);

  const enemyMeshes = buildEnemyMeshes(gameState);
  scene.add(enemyMeshes.group);

  const itemMeshes = buildItemMeshes(gameState);
  scene.add(itemMeshes.group);

  const consumableMeshes = buildConsumableMeshes(gameState);
  scene.add(consumableMeshes.group);

  const enemyAnimator = new EnemyAnimator();
  for (const [key, mesh] of enemyMeshes.meshMap) {
    const enemy = gameState.enemies.get(key);
    if (enemy) enemyAnimator.register(key, mesh, enemy.col, enemy.row);
  }

  const healthBarManager = new EnemyHealthBarManager();
  for (const [key, enemy] of gameState.enemies) {
    const mesh = enemyMeshes.meshMap.get(key);
    if (mesh) {
      const spriteHeight = enemyDatabase.getEnemy(enemy.type)?.sprite.size ?? DEFAULT_SPRITE_SIZE;
      healthBarManager.create(key, mesh, enemy.maxHp, spriteHeight);
    }
  }
  scene.add(healthBarManager.getGroup());

  const player = new Player(
    camera,
    level.grid,
    startCol,
    startRow,
    startFacing,
    walkable,
    gameState.isDoorOpen.bind(gameState),
    gameState.isBlockedByEnemy.bind(gameState),
    gameState.stairs,
  );

  let skyboxMesh: THREE.Mesh | undefined;
  if (level.skybox) {
    skyboxMesh = createSkyboxMesh();
    scene.add(skyboxMesh);
  }

  return {
    level,
    walkable,
    dungeonGroup,
    doorMeshes,
    doorAnimator,
    keyMeshes,
    plateMeshes,
    tripwireMeshes,
    leverMeshes,
    leverAnimator,
    sconceMeshes,
    stairMeshes,
    forestMeshes,
    trapLauncherMeshes,
    projectileMeshes,
    enemyMeshes,
    enemyAnimator,
    healthBarManager,
    itemMeshes,
    consumableMeshes,
    skyboxMesh,
    player,
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
    100
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

  const torchLight = new THREE.PointLight(0xff994d, 6, 21);
  const torchFillLight = new THREE.PointLight(0xff994d, 3, 16.5);
  let flickerTarget = 3.5;
  let flickerTimer = 0;
  scene.add(torchLight);
  scene.add(torchFillLight);

  // Debug: fullbright toggle
  let debugFullbright = false;
  const debugLight = new THREE.AmbientLight(0xffffff, 2);

  // --- Databases + enemy textures (preload before scene build so sprites appear immediately) ---
  await enemyDatabase.load();
  await Promise.all([itemDatabase.load(), preloadEnemyTextures(), loadLootTables()]);
  // Preload item sprites (needs item DB loaded first for icon names)
  const allIcons = itemDatabase.getAllItems().map((item) => item.icon);
  await preloadItemSprites(allIcons);

  // Verify all referenced PNG assets exist (non-blocking, logs errors)
  checkAssets();

  // --- Dungeon ---
  const dungeon: Dungeon = await loadDungeon('/levels/test_m2b.json');
//  const dungeon: Dungeon = await loadDungeon('/levels/dungeon_m1.json');
  const firstLevel = dungeon.levels[0];

  let currentLevelId = firstLevel.id!;
  const levelSnapshots = new Map<string, LevelSnapshot>();
  applyEnvironment(firstLevel.environment, scene, ambient);

  const gameState = new GameState(firstLevel.entities, firstLevel.grid, firstLevel.id ?? firstLevel.name);

  const projectileManager = new ProjectileManager();

  // --- HUD + Transition ---
  const hud = new HudOverlay();
  hud.attach();

  const transition = new TransitionOverlay();
  transition.attach();

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
    col: number,
    row: number,
  ): void {
    const key = doorKey(col, row);
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
    ls.healthBarManager.remove(key);
    hideEnemyMesh(ls.enemyMeshes.meshMap, col, row);
    ls.enemyAnimator.remove(key);
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
        { kind: 'world', levelId: gameState.currentLevelId, col, row },
        drop.modifiers,
      );
      const itemDef = itemDatabase.getItem(drop.itemId);
      if (itemDef && itemDef.type === 'consumable') {
        addSingleConsumableMesh(entity, ls.consumableMeshes.group, ls.consumableMeshes.meshMap);
      } else if (itemDef) {
        addSingleItemMesh(entity, gameState, ls.itemMeshes.group, ls.itemMeshes.meshMap);
      }
    }
  }

  function restartLevel(): void {
    transition.startTransition(() => {
      teardownLevelScene(ls, scene);

      // Reset GameState for current level
      const currentLevel = dungeon.levels.find((l) => l.id === currentLevelId)!;
      gameState.loadNewLevel(currentLevel.entities, currentLevel.grid, currentLevel.id ?? currentLevel.name);
      projectileManager.clear();
      fireballExplosions.clear();
      gameState.hp = gameState.maxHp;
      gameState.torchFuel = gameState.maxTorchFuel;
      gameState.attackCooldown = 0;
      gameState.gold = 0;
      gameState.playerStatusEffects = [];
      applyEnvironment(currentLevel.environment, scene, ambient);

      ls = buildLevelScene(
        currentLevel, gameState, camera, scene,
        currentLevel.playerStart.col,
        currentLevel.playerStart.row,
        currentLevel.playerStart.facing,
      );
      wireCallbacks();
      sconceEmbers.setSources(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap);
      dustMotes.setVisible(currentLevel.dustMotes !== false);
      waterDrips.setLevel(currentLevel.grid, currentLevel.charDefs);
      waterDrips.setVisible(currentLevel.waterDrips === true);
      fireflies.setVisible(currentLevel.fireflies === true);
      gameState.revealAround(
        currentLevel.playerStart.col,
        currentLevel.playerStart.row,
        currentLevel.playerStart.facing,
        currentLevel.grid,
      );
    });
  }

  // --- First level scene ---
  let ls = buildLevelScene(
    firstLevel,
    gameState,
    camera,
    scene,
    firstLevel.playerStart.col,
    firstLevel.playerStart.row,
    firstLevel.playerStart.facing,
  );

  // --- Callbacks ---

  let lastPlayerCol = firstLevel.playerStart.col;
  let lastPlayerRow = firstLevel.playerStart.row;

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
        updateDoorMesh(ls.doorMeshes.panelMap, entry.col, entry.row, false, ls.doorAnimator);
      } else {
        // Still blocked — bounce animation and retry
        entry.timer = DOOR_RETRY_INTERVAL;
        const dk = doorKey(entry.col, entry.row);
        ls.doorAnimator.bounce(dk);
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
        updateDoorMesh(ls.doorMeshes.panelMap, col, row, true, ls.doorAnimator);
        blockedDoors.set(dk, { col, row, timer: DOOR_RETRY_INTERVAL });
      }

      // Reveal explored cells on move
      gameState.revealAround(col, row, ls.player.getState().facing, ls.level.grid);

      // Key pickup
      const pickedUpKeyId = gameState.pickupKeyAt(col, row);
      if (pickedUpKeyId) {
        console.log(`Picked up key: ${pickedUpKeyId}`);
        hideKeyMesh(ls.keyMeshes.meshMap, col, row);
      }

      // Equipment pickup
      const equipResult = gameState.pickupEquipmentAt(col, row);
      if (equipResult.denied) {
        hud.showMessage(equipResult.denied);
      } else if (equipResult.item) {
        hud.showMessage(`Equipped: ${equipResult.item.name}`);
        hideItemMesh(ls.itemMeshes.meshMap, col, row);
      }

      // Consumable pickup
      const pickedUpConsumable = gameState.pickupConsumableAt(col, row);
      if (pickedUpConsumable) {
        console.log(`Picked up: ${pickedUpConsumable.name}`);
        hideConsumableMesh(ls.consumableMeshes.meshMap, col, row);
      }

      // Trigger / tripwire activation
      gameState.activateTrigger(col, row);
      if (gameState.activateTripwire(col, row)) {
        hideTripwire(ls.tripwireMeshes.meshMap, col, row);
      }

      // Pressure plate activation
      const plateTargets = gameState.activatePressurePlate(col, row);
      if (plateTargets) {
        const plate = gameState.plates.get(doorKey(col, row));
        if (plate?.activated) {
          pressPlate(ls.plateMeshes.meshMap, col, row);
        }
      }

      // Torch fuel drain (mist environments have ambient light — no torch needed)
      if ((ls.level.environment ?? 'dungeon') !== 'mist') {
        gameState.drainTorchFuel(1);
      }

      // Stair detection — entity-based lookup
      if (gameState.getStair(col, row)) {
        const stair = ls.level.entities.find(
          (e) => e.type === 'stairs' && e.col === col && e.row === row,
        );
        if (stair) {
          triggerLevelTransition(stair);
        }
      }
    });

    ls.player.setOnTurn(() => {
      const s = ls.player.getState();
      gameState.revealAround(s.col, s.row, s.facing, ls.level.grid);
    });

    // Signal-driven door state changes → animate door mesh
    gameState.onDoorSignalChanged = (col, row, open) => {
      const dk = doorKey(col, row);
      if (open) {
        // Opening — clear any blocked retry and open normally
        blockedDoors.delete(dk);
        updateDoorMesh(ls.doorMeshes.panelMap, col, row, true, ls.doorAnimator);
      } else {
        // Closing — check if cell is occupied
        const occupant = isDoorCellOccupied(col, row);
        if (occupant) {
          // Keep door open in game state, start retry cycle
          const door = gameState.getDoor(col, row);
          if (door) door.state = 'open';
          blockedDoors.set(dk, { col, row, timer: DOOR_RETRY_INTERVAL });
          ls.doorAnimator.bounce(dk);
        } else {
          blockedDoors.delete(dk);
          updateDoorMesh(ls.doorMeshes.panelMap, col, row, false, ls.doorAnimator);
        }
      }
    };

    // Timed source deactivation → animate lever reset
    gameState.onLeverReset = (col, row) => {
      const leverKey = doorKey(col, row);
      ls.leverAnimator.setState(leverKey, 'up');
    };

    // Plate reset (momentary step-off or timed expiry) → animate plate release
    gameState.onPlateReset = (col, row) => {
      releasePlate(ls.plateMeshes.meshMap, col, row);
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
          enemyDamageFlash(ls.enemyMeshes.meshMap, col, row);
          ls.enemyAnimator.triggerHit(key);
          damageNumbers.spawn(col, row, projectile.damage);
          if (enemy.hp <= 0) {
            handleEnemyKill(key, col, row, enemy);
          } else {
            ls.healthBarManager.update(key, enemy.hp, enemy.maxHp);
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

    transition.startTransition(() => {
      // --- Midpoint: swap level ---
      teardownLevelScene(ls, scene);

      // Find target stair across all dungeon levels
      let targetLevel: DungeonLevel | undefined;
      let targetStair: Entity | undefined;
      for (const level of dungeon.levels) {
        targetStair = level.entities.find(e => e.type === 'stairs' && e.id === targetStairId);
        if (targetStair) {
          targetLevel = level;
          break;
        }
      }
      if (!targetLevel || !targetStair) return; // shouldn't happen if validated

      const targetLevelId = targetLevel.id ?? targetLevel.name;
      const snapshot = levelSnapshots.get(targetLevelId);
      if (snapshot) {
        gameState.loadLevelState(snapshot);
      } else {
        gameState.loadNewLevel(targetLevel.entities, targetLevel.grid, targetLevelId);
      }

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
      waterDrips.setLevel(targetLevel.grid, targetLevel.charDefs);
      waterDrips.setVisible(targetLevel.waterDrips === true);
      fireflies.setVisible(targetLevel.fireflies === true);

      gameState.revealAround(spawnCol, spawnRow, targetFacing, targetLevel.grid);
    });
  }

  // Wire up initial level
  wireCallbacks();
  sconceEmbers.setSources(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap);
  dustMotes.setVisible(ls.level.dustMotes !== false);
  waterDrips.setLevel(ls.level.grid, ls.level.charDefs);
  waterDrips.setVisible(ls.level.waterDrips === true);
  fireflies.setVisible(ls.level.fireflies === true);

  // Reveal initial position
  const ps = ls.player.getState();
  gameState.revealAround(ps.col, ps.row, ps.facing, ls.level.grid);

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
                  addSingleConsumableMesh(updatedEntity, ls.consumableMeshes.group, ls.consumableMeshes.meshMap);
                } else {
                  addSingleItemMesh(updatedEntity, gameState, ls.itemMeshes.group, ls.itemMeshes.meshMap);
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
          const result = interact(ls.player.getState(), ls.level.grid, gameState);
          if (result.message) {
            console.log(result.message);
          }
          if (result.type === 'door_opened') {
            const facing = getFacingCell(ls.player.getState());
            updateDoorMesh(ls.doorMeshes.panelMap, facing.col, facing.row, true, ls.doorAnimator);
          }
          if (result.type === 'door_closed') {
            const facing = getFacingCell(ls.player.getState());
            updateDoorMesh(ls.doorMeshes.panelMap, facing.col, facing.row, false, ls.doorAnimator);
          }
          if (result.type === 'door_blocked') {
            const facing = getFacingCell(ls.player.getState());
            const bk = doorKey(facing.col, facing.row);
            ls.doorAnimator.bounce(bk);
          }
          if (result.type === 'lever_activated' && result.targets) {
            for (const t of result.targets) {
              const targetPos = gameState.resolveEntityPosition(t);
              if (targetPos) {
                updateDoorMesh(ls.doorMeshes.panelMap, targetPos.col, targetPos.row, gameState.isDoorOpen(targetPos.col, targetPos.row), ls.doorAnimator);
              }
            }
            const leverKey = doorKey(ls.player.getState().col, ls.player.getState().row);
            const lever = gameState.levers.get(leverKey);
            if (lever) ls.leverAnimator.setState(leverKey, lever.state);
          }
          if (result.type === 'sconce_taken') {
            const ps = ls.player.getState();
            extinguishSconce(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap, ps.col, ps.row);
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
                enemyDamageFlash(ls.enemyMeshes.meshMap, result.targetCol, result.targetRow);
                ls.enemyAnimator.triggerHit(doorKey(result.targetCol, result.targetRow));
                if (result.damage !== undefined) {
                  damageNumbers.spawn(result.targetCol, result.targetRow, result.damage);
                }
              }
              if (result.type === 'hit' && result.targetCol !== undefined && result.targetRow !== undefined) {
                const hitEnemy = gameState.getEnemy(result.targetCol, result.targetRow);
                if (hitEnemy) {
                  ls.healthBarManager.update(doorKey(result.targetCol, result.targetRow), hitEnemy.hp, hitEnemy.maxHp);
                }
              }
              if (result.type === 'kill' && result.targetCol !== undefined && result.targetRow !== undefined && result.enemyType) {
                // Enemy already removed from map by damageEnemy(); use result data for XP/loot
                const killKey = doorKey(result.targetCol, result.targetRow);
                ls.healthBarManager.remove(killKey);
                hideEnemyMesh(ls.enemyMeshes.meshMap, result.targetCol, result.targetRow);
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
                    { kind: 'world', levelId: gameState.currentLevelId, col: result.targetCol, row: result.targetRow },
                    drop.modifiers,
                  );
                  const itemDef = itemDatabase.getItem(drop.itemId);
                  if (itemDef && itemDef.type === 'consumable') {
                    addSingleConsumableMesh(entity, ls.consumableMeshes.group, ls.consumableMeshes.meshMap);
                  } else if (itemDef) {
                    addSingleItemMesh(entity, gameState, ls.itemMeshes.group, ls.itemMeshes.meshMap);
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
      case 'KeyL':
        if (hud.getStatsPanel().isOpen()) hud.getStatsPanel().toggle();
        if (hud.getInventoryOverlay().isOpen()) hud.getInventoryOverlay().toggle();
        hud.getAttributePanel().open(gameState);
        break;
      case 'Backquote':
        debugFullbright = !debugFullbright;
        if (debugFullbright) {
          scene.add(debugLight);
          scene.fog = null;
        } else {
          scene.remove(debugLight);
          const cfg = getEnvironmentConfig();
          scene.fog = new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar);
        }
        console.log(`Debug fullbright: ${debugFullbright ? 'ON' : 'OFF'}`);
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

    ls.player.slowMultiplier = getSlowMultiplier(gameState.playerStatusEffects);
    ls.player.update(delta);
    if (ls.skyboxMesh) {
      ls.skyboxMesh.position.copy(camera.position);
    }
    ls.doorAnimator.update(delta);
    ls.leverAnimator.update(delta);
    ls.enemyAnimator.update(delta);
    gameState.signalManager.tick(delta);
    gameState.tickTrapLaunchers();
    projectileManager.update(
      delta,
      (col, row) => ls.walkable.has(ls.level.grid[row]?.[col]),
      gameState.isDoorOpen.bind(gameState),
      lastPlayerCol, lastPlayerRow,
      gameState.isEnemyAt.bind(gameState),
    );
    tickBlockedDoors(delta);
    transition.update(delta);
    damageNumbers.update(delta);
    swordSwing.update(delta);

    // Sync projectile meshes with active projectiles
    updateProjectileMeshes(ls.projectileMeshes.group, ls.projectileMeshes.meshMap, projectileManager.getAll(), camera);

    // Billboard enemy sprites toward camera
    updateEnemyBillboards(ls.enemyMeshes.meshMap, camera);
    updateForestBillboards(ls.forestMeshes, camera);

    // Status effect tint on enemies
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

    // Sync health bar positions (enemies animate with hit shake and lunge)
    ls.healthBarManager.updatePositions(ls.enemyMeshes.meshMap);
    ls.healthBarManager.updateBillboards(camera);

    // Sconce torch flicker
    updateSconceFlicker(ls.sconceMeshes.lightMap, delta);

    // Particle effects
    const camPos2 = torchFillLight.position;
    dustMotes.update(delta, camPos2.x, camPos2.y, camPos2.z);
    sconceEmbers.update(delta);
    waterDrips.update(delta, camPos2.x, camPos2.z);
    fireflies.update(delta, camPos2.x, camPos2.z);
    fireballExplosions.update(delta);

    const anyOverlayOpen = hud.getInventoryOverlay().isOpen() || hud.getStatsPanel().isOpen() || hud.getAttributePanel().isOpen();

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
    }

    // Player damage flash tick
    if (playerDamageFlashTimer > 0) {
      playerDamageFlashTimer = Math.max(0, playerDamageFlashTimer - delta);
    }

    // Real-time enemy AI tick — paused when overlays are open
    if (!transition.isActive && !anyOverlayOpen) {
      const ps = ls.player.getState();
      const actions = updateEnemies(
        gameState, ps.col, ps.row, ls.level.grid, ls.walkable,
        gameState.isDoorOpen.bind(gameState), delta,
      );
      for (const action of actions) {
        if (action.type === 'move' && action.toCol !== undefined && action.toRow !== undefined) {
          const newKey = doorKey(action.toCol, action.toRow);
          updateEnemyMeshPosition(ls.enemyMeshes.meshMap, action.enemyKey, action.toCol, action.toRow);
          ls.enemyAnimator.moveTo(action.enemyKey, action.toCol, action.toRow, newKey);
          ls.healthBarManager.rekey(action.enemyKey, newKey);
        } else if (action.type === 'attack') {
          const enemy = gameState.enemies.get(action.enemyKey);
          if (enemy) {
            enemyAttackPlayer(gameState, enemy.atk);
            playerDamageFlashTimer = PLAYER_DAMAGE_FLASH_DURATION;
            ls.enemyAnimator.triggerLunge(action.enemyKey, ps.col, ps.row);
            const onHitBehavior = enemyDatabase.getBehavior(enemy.type, 'onHit');
            if (onHitBehavior && Math.random() < (onHitBehavior.params.chance as number)) {
              applyEffect(gameState.playerStatusEffects, onHitBehavior.params.statusEffect as StatusEffectType, onHitBehavior.params.duration as number);
            }
          }
        } else if (action.type === 'regen') {
          const enemy = gameState.enemies.get(action.enemyKey);
          if (enemy) {
            ls.healthBarManager.update(action.enemyKey, enemy.hp, enemy.maxHp);
          }
        } else if (action.type === 'status_damage') {
          const enemy = gameState.enemies.get(action.enemyKey);
          if (enemy) {
            enemyDamageFlash(ls.enemyMeshes.meshMap, action.fromCol, action.fromRow);
            ls.healthBarManager.update(action.enemyKey, enemy.hp, enemy.maxHp);
          }
        } else if (action.type === 'status_kill') {
          const enemy = gameState.enemies.get(action.enemyKey);
          if (enemy) {
            enemyDamageFlash(ls.enemyMeshes.meshMap, action.fromCol, action.fromRow);
            handleEnemyKill(action.enemyKey, action.fromCol, action.fromRow, enemy);
          }
        }
      }

      // Death — restart current level
      if (gameState.hp <= 0) {
        restartLevel();
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

    flickerTimer -= delta;
    if (flickerTimer <= 0) {
      const baseIntensity = 1.2 + lightScale * 4.2;
      flickerTarget = baseIntensity + Math.random() * FLICKER_RANGE * lightScale;
      flickerTimer = FLICKER_MIN_INTERVAL + Math.random() * FLICKER_INTERVAL_RANGE;
    }
    torchLight.intensity += (flickerTarget - torchLight.intensity) * FLICKER_LERP;
    torchFillLight.intensity = torchLight.intensity * 0.6;

    levelUpNotification.update(delta);

    const damageFlashAlpha = playerDamageFlashTimer / PLAYER_DAMAGE_FLASH_DURATION;
    hud.draw(gameState, ls.player.getState(), ls.level.grid, delta, damageFlashAlpha, swordSwing, levelUpNotification);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

init().catch((err) => {
  console.error('Failed to initialize:', err);
  document.body.textContent = `Error: ${err.message}`;
});
