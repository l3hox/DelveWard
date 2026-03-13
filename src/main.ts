import * as THREE from 'three';
import { buildDungeon } from './rendering/dungeon';
import { Player } from './rendering/player';
import { loadDungeon } from './level/levelLoader';
import { buildWalkableSet, getFacingCell } from './core/grid';
import { GameState, doorKey, parseDoorKey } from './core/gameState';
import { interact } from './level/interaction';
import { buildDoorMeshes, updateDoorMesh } from './rendering/doorRenderer';
import { buildKeyMeshes, hideKeyMesh } from './rendering/keyRenderer';
import { buildPlateMeshes, pressPlate } from './rendering/plateRenderer';
import { buildLeverMeshes } from './rendering/leverRenderer';
import { buildSconceMeshes, extinguishSconce, updateSconceFlicker } from './rendering/sconceRenderer';
import { buildStairMeshes } from './rendering/stairRenderer';
import { buildEnemyMeshes, updateEnemyBillboards, hideEnemyMesh, updateEnemyMeshPosition, preloadEnemyTextures } from './rendering/enemyRenderer';
import { buildItemMeshes, hideItemMesh, addSingleItemMesh } from './rendering/itemRenderer';
import { buildConsumableMeshes, hideConsumableMesh, addSingleConsumableMesh } from './rendering/consumableRenderer';
import { loadLootTables, rollLoot } from './core/lootTable';
import { EnemyAnimator } from './rendering/enemyAnimator';
import { updateEnemies } from './enemies/enemyAI';
import { ENEMY_DEFS } from './enemies/enemyTypes';
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
import { DustMotes, SconceEmbers, WaterDrips } from './rendering/particles';
import type { DungeonLevel, Dungeon, Entity } from './core/types';
import type { LevelSnapshot } from './core/gameState';
import type { Facing } from './core/grid';
import { itemDatabase } from './core/itemDatabase';
import type { InventoryAction } from './hud/inventoryOverlay';

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
  leverMeshes: { group: THREE.Group; handleMap: Map<string, THREE.Group> };
  leverAnimator: LeverAnimator;
  sconceMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Group>; lightMap: Map<string, THREE.PointLight> };
  stairMeshes: { group: THREE.Group };
  enemyMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Mesh> };
  enemyAnimator: EnemyAnimator;
  healthBarManager: EnemyHealthBarManager;
  itemMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Mesh> };
  consumableMeshes: { group: THREE.Group; meshMap: Map<string, THREE.Mesh> };
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

  const dungeonGroup = buildDungeon(level.grid, level.defaults, level.areas, level.charDefs);
  scene.add(dungeonGroup);

  const doorMeshes = buildDoorMeshes(level.grid, gameState, walkable);
  scene.add(doorMeshes.group);

  const doorAnimator = new DoorAnimator();
  for (const [key, panel] of doorMeshes.panelMap) {
    const door = gameState.doors.get(key);
    doorAnimator.register(key, panel, door ? door.state === 'open' : false);
  }

  const keyMeshes = buildKeyMeshes(gameState);
  scene.add(keyMeshes.group);

  const plateMeshes = buildPlateMeshes(gameState);
  scene.add(plateMeshes.group);

  const leverMeshes = buildLeverMeshes(gameState);
  scene.add(leverMeshes.group);

  const leverAnimator = new LeverAnimator();
  for (const [key, pivot] of leverMeshes.handleMap) {
    const lever = gameState.levers.get(key);
    leverAnimator.register(key, pivot, lever ? lever.state : 'up');
  }

  const sconceMeshes = buildSconceMeshes(gameState);
  scene.add(sconceMeshes.group);

  const stairMeshes = buildStairMeshes(level, walkable);
  scene.add(stairMeshes.group);

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
    if (mesh) healthBarManager.create(key, mesh, enemy.maxHp);
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
  );

  return {
    level,
    walkable,
    dungeonGroup,
    doorMeshes,
    doorAnimator,
    keyMeshes,
    plateMeshes,
    leverMeshes,
    leverAnimator,
    sconceMeshes,
    stairMeshes,
    enemyMeshes,
    enemyAnimator,
    healthBarManager,
    itemMeshes,
    consumableMeshes,
    player,
  };
}

function teardownLevelScene(ls: LevelScene, scene: THREE.Scene): void {
  const groups = [
    ls.dungeonGroup,
    ls.doorMeshes.group,
    ls.keyMeshes.group,
    ls.plateMeshes.group,
    ls.leverMeshes.group,
    ls.sconceMeshes.group,
    ls.stairMeshes.group,
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
}

// ---

async function init(): Promise<void> {
  // --- Scene ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 6, 26);

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
  const ambient = new THREE.AmbientLight(0x111111);
  scene.add(ambient);

  const torchLight = new THREE.PointLight(0xff994d, 4, 10);
  const torchFillLight = new THREE.PointLight(0xff994d, 2, 8);
  let flickerTarget = 3.5;
  let flickerTimer = 0;
  scene.add(torchLight);
  scene.add(torchFillLight);

  // Debug: fullbright toggle
  let debugFullbright = false;
  const debugLight = new THREE.AmbientLight(0xffffff, 2);

  // --- Item database + enemy textures (preload before scene build so sprites appear immediately) ---
  await Promise.all([itemDatabase.load(), preloadEnemyTextures(), loadLootTables()]);

  // --- Dungeon ---
  const dungeon: Dungeon = await loadDungeon('/levels/dungeon3.json');
  const firstLevel = dungeon.levels[0];
  let currentLevelId = firstLevel.id!;
  const levelSnapshots = new Map<string, LevelSnapshot>();

  const gameState = new GameState(firstLevel.entities, firstLevel.grid, firstLevel.id ?? firstLevel.name);

  // --- HUD + Transition ---
  const hud = new HudOverlay();
  hud.attach();

  const transition = new TransitionOverlay();
  transition.attach();

  // --- Character creation screen ---
  // Shown before the game loop starts. The 3D scene is already loaded beneath it.
  const hudCanvas = hud.getCanvas();
  await new Promise<void>((resolve) => {
    const charCreation = new CharacterCreationScreen(hudCanvas, (setup) => {
      gameState.applyCharacterSetup(setup.str, setup.dex, setup.vit, setup.wis, setup.name);
      resolve();
    });
    charCreation.show();
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

  function restartLevel(): void {
    transition.startTransition(() => {
      teardownLevelScene(ls, scene);

      // Reset GameState for current level
      const currentLevel = dungeon.levels.find((l) => l.id === currentLevelId)!;
      gameState.loadNewLevel(currentLevel.entities, currentLevel.grid, currentLevel.id ?? currentLevel.name);
      gameState.hp = gameState.maxHp;
      gameState.torchFuel = gameState.maxTorchFuel;
      gameState.attackCooldown = 0;
      gameState.gold = 0;

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

  function wireCallbacks(): void {
    ls.player.setOnMove((col, row) => {
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

      // Pressure plate activation
      const plateTarget = gameState.activatePressurePlate(col, row);
      if (plateTarget) {
        console.log('Pressure plate activated.');
        const [dc, dr] = parseDoorKey(plateTarget);
        updateDoorMesh(ls.doorMeshes.panelMap, dc, dr, true, ls.doorAnimator);
        pressPlate(ls.plateMeshes.meshMap, col, row);
      }

      // Torch fuel drain
      gameState.drainTorchFuel(1);

      // Stair detection
      const cell = ls.level.grid[row]?.[col];
      if (cell === 'S' || cell === 'U') {
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
  }

  function triggerLevelTransition(stairEntity: Entity): void {
    const targetId = stairEntity.targetLevel as string;
    const targetCol = stairEntity.targetCol as number;
    const targetRow = stairEntity.targetRow as number;
    const targetFacing: Facing = ls.player.getState().facing;

    // Save current level state
    levelSnapshots.set(currentLevelId, gameState.saveLevelState());

    transition.startTransition(() => {
      // --- Midpoint: swap level ---
      teardownLevelScene(ls, scene);

      const targetLevel = dungeon.levels.find((l) => l.id === targetId)!;
      const snapshot = levelSnapshots.get(targetId);
      if (snapshot) {
        gameState.loadLevelState(snapshot);
      } else {
        gameState.loadNewLevel(targetLevel.entities, targetLevel.grid, targetLevel.id ?? targetLevel.name);
      }

      currentLevelId = targetId;
      ls = buildLevelScene(targetLevel, gameState, camera, scene, targetCol, targetRow, targetFacing);
      wireCallbacks();
      sconceEmbers.setSources(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap);
      dustMotes.setVisible(targetLevel.dustMotes !== false);
      waterDrips.setLevel(targetLevel.grid, targetLevel.charDefs);
      waterDrips.setVisible(targetLevel.waterDrips === true);

      gameState.revealAround(targetCol, targetRow, targetFacing, targetLevel.grid);
    });
  }

  // Wire up initial level
  wireCallbacks();
  sconceEmbers.setSources(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap);
  dustMotes.setVisible(ls.level.dustMotes !== false);
  waterDrips.setLevel(ls.level.grid, ls.level.charDefs);
  waterDrips.setVisible(ls.level.waterDrips === true);

  // Reveal initial position
  const ps = ls.player.getState();
  gameState.revealAround(ps.col, ps.row, ps.facing, ls.level.grid);

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

    // Inventory overlay gets input priority (except KeyI which closes it)
    const inventoryOverlay = hud.getInventoryOverlay();
    if (inventoryOverlay.isOpen()) {
      if (e.code === 'KeyI') {
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

    // Attribute panel routing — Tab closes, other keys are consumed by the panel
    const attributePanel = hud.getAttributePanel();
    if (attributePanel.isOpen()) {
      if (e.code === 'Tab') {
        e.preventDefault();
        attributePanel.toggle();
        return;
      }
      attributePanel.handleKey(e.code, gameState);
      return;
    }

    // Stats panel blocks all input except T (to close)
    if (hud.getStatsPanel().isOpen() && e.code !== 'KeyT') return;

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
          if (result.type === 'door_opened' || result.type === 'door_unlocked') {
            const facing = getFacingCell(ls.player.getState());
            updateDoorMesh(ls.doorMeshes.panelMap, facing.col, facing.row, true, ls.doorAnimator);
          }
          if (result.type === 'door_closed') {
            const facing = getFacingCell(ls.player.getState());
            updateDoorMesh(ls.doorMeshes.panelMap, facing.col, facing.row, false, ls.doorAnimator);
          }
          if (result.type === 'lever_activated' && result.targetDoor) {
            const [dc, dr] = parseDoorKey(result.targetDoor);
            updateDoorMesh(ls.doorMeshes.panelMap, dc, dr, gameState.isDoorOpen(dc, dr), ls.doorAnimator);
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
              if (result.type === 'kill' && result.targetCol !== undefined && result.targetRow !== undefined) {
                ls.healthBarManager.remove(doorKey(result.targetCol, result.targetRow));
                hideEnemyMesh(ls.enemyMeshes.meshMap, result.targetCol, result.targetRow);
                ls.enemyAnimator.remove(doorKey(result.targetCol, result.targetRow));
                // Award XP for the kill
                if (result.enemyType) {
                  const enemyDef = ENEMY_DEFS[result.enemyType];
                  if (enemyDef) {
                    const levelled = gameState.addXp(enemyDef.xp);
                    if (levelled) {
                      levelUpNotification.trigger(gameState.level);
                    }
                  }
                }
                // Loot roll
                if (result.enemyType) {
                  const lootResult = rollLoot(result.enemyType, result.dropsOverride);

                  // Add gold
                  gameState.gold += lootResult.gold;

                  // Spawn dropped items on the ground
                  for (const drop of lootResult.items) {
                    const entity = gameState.entityRegistry.createItem(
                      drop.itemId,
                      drop.quality,
                      {
                        kind: 'world',
                        levelId: gameState.currentLevelId,
                        col: result.targetCol!,
                        row: result.targetRow!,
                      },
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
      case 'Tab':
        e.preventDefault(); // prevent browser tab focus
        if (hud.getStatsPanel().isOpen()) hud.getStatsPanel().toggle();
        if (hud.getInventoryOverlay().isOpen()) hud.getInventoryOverlay().toggle();
        hud.getAttributePanel().toggle();
        break;
      case 'KeyT':
        hud.getStatsPanel().toggle();
        break;
      case 'KeyI':
        // Close stats panel and attribute panel if open, then open inventory overlay
        if (hud.getStatsPanel().isOpen()) hud.getStatsPanel().toggle();
        if (hud.getAttributePanel().isOpen()) hud.getAttributePanel().toggle();
        hud.getInventoryOverlay().toggle();
        break;
      case 'KeyL':
        debugFullbright = !debugFullbright;
        if (debugFullbright) {
          scene.add(debugLight);
          scene.fog = null;
        } else {
          scene.remove(debugLight);
          scene.fog = new THREE.Fog(0x000000, 6, 26);
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

    ls.player.update(delta);
    ls.doorAnimator.update(delta);
    ls.leverAnimator.update(delta);
    ls.enemyAnimator.update(delta);
    transition.update(delta);
    damageNumbers.update(delta);
    swordSwing.update(delta);

    // Billboard enemy sprites toward camera
    updateEnemyBillboards(ls.enemyMeshes.meshMap, camera);

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

    const anyOverlayOpen = hud.getInventoryOverlay().isOpen() || hud.getStatsPanel().isOpen() || hud.getAttributePanel().isOpen();

    // Attack cooldown tick — paused when overlays are open
    if (gameState.attackCooldown > 0 && !anyOverlayOpen) {
      gameState.attackCooldown = Math.max(0, gameState.attackCooldown - delta);
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
        } else if (action.type === 'attack') {
          const enemy = gameState.enemies.get(action.enemyKey);
          if (enemy) {
            enemyAttackPlayer(gameState, enemy.atk);
            playerDamageFlashTimer = PLAYER_DAMAGE_FLASH_DURATION;
            ls.enemyAnimator.triggerLunge(action.enemyKey, ps.col, ps.row);
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
    torchLight.distance = 3 + fuelRatio * 5;
    torchFillLight.distance = 2 + fuelRatio * 4;

    flickerTimer -= delta;
    if (flickerTimer <= 0) {
      const baseIntensity = 0.8 + fuelRatio * 2.8;
      flickerTarget = baseIntensity + Math.random() * FLICKER_RANGE * fuelRatio;
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
