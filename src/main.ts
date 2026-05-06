import * as THREE from 'three';
import { CELL_SIZE, LAYER_HEIGHT } from './rendering/dungeon';
import { loadDungeon, getAllLevelEntities, findEntityLayerIndex, resolveLayerCoord } from './level/levelLoader';
import { buildWalkableSet, getFacingCell, FACING_DELTA, isWalkable, TURN_LEFT, TURN_RIGHT } from './core/grid';
import { GameState, doorKey, meshKey, layerDoorKey } from './core/gameState';
import { ProjectileManager } from './core/projectileManager';
import type { TrapLauncherInstance } from './core/gameState';
import { interact } from './level/interaction';
import { updateDoorMesh } from './rendering/doorRenderer';
import { hideKeyMesh, updateKeyBillboards } from './rendering/keyRenderer';
import { pressPlate, releasePlate } from './rendering/plateRenderer';
import { hideTripwire } from './rendering/tripwireRenderer';
import { extinguishSconce, updateSconceFlicker } from './rendering/sconceRenderer';
import { updateForestBillboards } from './rendering/forestRenderer';
import { updateEnemyBillboards, hideEnemyMesh, updateEnemyMeshPosition, preloadEnemyTextures, createSingleEnemyMesh } from './rendering/enemyRenderer';
import { createSingleBoulderMesh } from './rendering/boulderRenderer';
import { hideItemMesh, addSingleItemMesh, updateItemBillboards, hideConsumableMesh, addSingleConsumableMesh, updateConsumableBillboards } from './rendering/groundItemRenderer';
import { preloadItemSprites } from './rendering/itemSprites';
import { loadLootTables } from './core/lootTable';
import { spawnLoot } from './game/lootSpawner';
import { updateEnemies } from './enemies/enemyAI';
import { enemyDatabase, DEFAULT_SPRITE_SIZE } from './enemies/enemyDatabase';
import { createEnemyInstance } from './enemies/enemyTypes';
import type { EnemyInstance } from './enemies/enemyTypes';
import { playerAttack, enemyAttackPlayer } from './core/combat';
import type { CombatResult } from './core/combat';
import { HudOverlay } from './hud/hudCanvas';
import { TransitionOverlay } from './rendering/transitionOverlay';
import { CharacterCreationScreen } from './hud/characterCreation';
import { LevelUpNotification } from './hud/levelUpNotification';
import { DamageNumberManager } from './rendering/damageNumbers';
import { SwordSwingAnimator } from './rendering/swordSwing';
import { DustMotes, SconceEmbers, WaterDrips, Fireflies } from './rendering/particles';
import type { DungeonLevel, Dungeon, Entity } from './core/types';
import type { MultiLayerSnapshot } from './core/gameState';
import type { Facing } from './core/grid';
import { itemDatabase } from './core/itemDatabase';
import type { InventoryAction } from './hud/inventoryOverlay';
import { checkAssets } from './core/assetCheck';
import { applyEnvironment, getEnvironmentConfig, lerpEnvironment, resolveEnvironmentAtCell } from './rendering/environment';
import { updateProjectileMeshes, warmUpGPUShaders, FireballExplosions } from './rendering/projectileRenderer';
import { tickEffects, applyEffect, getSlowMultiplier, hasEffect } from './core/statusEffects';
import type { StatusEffectType } from './core/statusEffects';
import { animateBlockPush } from './rendering/blockRenderer';
import { openChestMesh, closeChestMesh, destroyChestMesh } from './rendering/chestRenderer';
import { markFountainUsed } from './rendering/fountainRenderer';
import { markAltarUsed } from './rendering/altarRenderer';
import { SignOverlay } from './hud/signOverlay';
import { DialogOverlay } from './hud/dialogOverlay';
import { npcDatabase } from './npcs/npcDatabase';
import {
  loadDialog, startDialog, getCurrentNode, getAvailableChoices,
  selectChoice, advanceDialog, setDialogHooks, executeEffects,
} from './core/dialogManager';
import type { DialogSession } from './core/dialogManager';
import { updateNpcBillboards, preloadNpcTextures } from './rendering/npcRenderer';
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
import { type LevelScene, buildLevelScene, teardownLevelScene } from './game/levelSceneBuilder';
import { buildLayerDungeonGeometry } from './rendering/sceneUtils';

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

  // --- Dungeon (auto-load most recently modified level) ---
  let levelPath = '/levels/ruins.json'; // fallback
  try {
    const resp = await fetch('/api/levels/latest');
    if (resp.ok) {
      const { file } = await resp.json();
      if (file) levelPath = `/levels/${file}`;
    }
  } catch { /* dev server not available — use fallback */ }
  console.log(`Loading level: ${levelPath}`);
  const dungeon: Dungeon = await loadDungeon(levelPath);
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

  const gameState = new GameState(firstLevel.entities, firstLevel.grid, firstLevel.id ?? firstLevel.name, firstLevel.layers);
  // Set starting layer from playerStart
  const startLayerIndex = resolveLayerCoord(firstLevel, dungeon.playerStart.layerIndex ?? 0);
  gameState.activeLayerIndex = startLayerIndex;

  const projectileManager = new ProjectileManager();

  // --- HUD + Transition ---
  const hud = new HudOverlay();
  hud.attach();
  hud.onInventoryAction = (action) => {
    processInventoryAction(action);
  };

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

  // Particle effects — enableAll so they render in all zone passes
  const dustMotes = new DustMotes();
  scene.add(dustMotes.getObject());
  dustMotes.getObject().traverse(c => { c.layers.enableAll(); });
  const sconceEmbers = new SconceEmbers();
  scene.add(sconceEmbers.getObject());
  sconceEmbers.getObject().traverse(c => { c.layers.enableAll(); });
  const waterDrips = new WaterDrips();
  scene.add(waterDrips.getObject());
  waterDrips.getObject().traverse(c => { c.layers.enableAll(); });
  const fireflies = new Fireflies();
  scene.add(fireflies.getObject());
  fireflies.getObject().traverse(c => { c.layers.enableAll(); });
  const fireballExplosions = new FireballExplosions();
  scene.add(fireballExplosions.getObject());
  fireballExplosions.getObject().traverse(c => { c.layers.enableAll(); });

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
    ls.healthBarManager.remove(layerKey(key));
    hideEnemyMesh(ls.enemyMeshes.meshMap, layerKey(doorKey(col, row)));
    ls.enemyAnimator.remove(layerKey(key));
    gameState.enemies.delete(key);
    const enemyDef = enemyDatabase.getEnemy(enemy.type);
    if (enemyDef) {
      const levelled = gameState.addXp(enemyDef.xp);
      if (levelled) levelUpNotification.trigger(gameState.level);
    }
    spawnLoot(enemy.type, enemy.drops, col, row, gameState, ls);
  }

  function tickSpawners(delta: number): void {
    const savedLayer = gameState.activeLayerIndex;
    const charDefMap = new Map<string, import('./core/types').CharDef>();
    if (ls.level.charDefs) for (const def of ls.level.charDefs) charDefMap.set(def.char, def);

    for (let li = 0; li < gameState.layers.length; li++) {
      gameState.activeLayerIndex = li;
      const layerGrid = ls.layerGrids[li];
      if (!layerGrid) continue;
      const yOffset = li * LAYER_HEIGHT;

      // A cell on this layer is a "hole" when the layer below has no solid cell
      // supporting it. Layer 0 has implicit ground. Non-flying enemies can't
      // spawn or traverse onto hole cells.
      const belowGrid = ls.layerGrids[li - 1];
      const isHole = belowGrid ? (col: number, row: number): boolean => {
        if (row < 0 || row >= belowGrid.length || col < 0 || col >= belowGrid[0].length) return true;
        const ch = belowGrid[row][col];
        const def = charDefMap.get(ch);
        return !(ch === '#' || (def !== undefined && def.solid && !def.seeThrough));
      } : null;

      for (const [, spawner] of gameState.spawners) {
        if (!spawner.active) continue;

        spawner.spawnTimer += delta;
        if (spawner.spawnTimer < spawner.interval) continue;
        spawner.spawnTimer -= spawner.interval;

        let aliveCount = 0;
        for (const enemy of gameState.enemies.values()) {
          if (enemy.spawnerId === spawner.id) aliveCount++;
        }
        if (aliveCount >= spawner.maxActive) continue;

        const canFly = enemyDatabase.getEnemy(spawner.enemyType)?.fly === true;

        // BFS from spawner through walkable cells — candidates are reachable
        // within spawnRadius steps, respecting walls. Non-flying enemies also
        // can't traverse or spawn on hole cells (no ground below).
        const ps = ls.player.getState();
        const candidates: Array<[number, number]> = [];
        const visited = new Set<string>([doorKey(spawner.col, spawner.row)]);
        const queue: Array<{ col: number; row: number; dist: number }> = [
          { col: spawner.col, row: spawner.row, dist: 0 },
        ];
        let head = 0;
        while (head < queue.length) {
          const { col: c, row: r, dist: d } = queue[head++];
          if (d > 0) {
            const key = doorKey(c, r);
            const occupied = gameState.enemies.has(key) || gameState.isBlockAt(c, r)
              || (li === savedLayer && c === ps.col && r === ps.row);
            if (!occupied) candidates.push([c, r]);
          }
          if (d >= spawner.spawnRadius) continue;
          for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nc = c + dc;
            const nr = r + dr;
            const nkey = doorKey(nc, nr);
            if (visited.has(nkey)) continue;
            if (nr < 0 || nr >= layerGrid.length || nc < 0 || nc >= layerGrid[0].length) continue;
            if (!ls.walkable.has(layerGrid[nr][nc])) continue;
            if (!canFly && isHole && isHole(nc, nr)) continue;
            visited.add(nkey);
            queue.push({ col: nc, row: nr, dist: d + 1 });
          }
        }
        if (candidates.length === 0) continue;

        const [spawnCol, spawnRow] = candidates[Math.floor(Math.random() * candidates.length)];
        const newEnemy = createEnemyInstance(spawnCol, spawnRow, spawner.enemyType);
        newEnemy.spawnerId = spawner.id;
        const enemyKey = doorKey(spawnCol, spawnRow);
        gameState.enemies.set(enemyKey, newEnemy);

        const prefixedKey = layerDoorKey(li, enemyKey);
        const mesh = createSingleEnemyMesh(
          spawner.enemyType, spawnCol, spawnRow, prefixedKey,
          ls.enemyMeshes.group, ls.enemyMeshes.meshMap, yOffset,
        );
        if (mesh) {
          ls.enemyAnimator.register(prefixedKey, mesh, spawnCol, spawnRow);
          const def = enemyDatabase.getEnemy(spawner.enemyType);
          const spriteHeight = def?.sprite.size ?? DEFAULT_SPRITE_SIZE;
          ls.healthBarManager.create(prefixedKey, mesh, newEnemy.maxHp, spriteHeight);
        }
      }
    }
    gameState.activeLayerIndex = savedLayer;
  }

  function tickBoulders(delta: number): void {
    ls.boulderAnimator.update(delta);

    const savedLayer = gameState.activeLayerIndex;
    const ps = ls.player.getState();
    const charDefMap = new Map<string, import('./core/types').CharDef>();
    if (ls.level.charDefs) for (const def of ls.level.charDefs) charDefMap.set(def.char, def);

    // Check if a specific cell on a given layer has no floor support (a "hole"),
    // matching the engine's floor logic: layer-below solid wall → supported,
    // unless overridden by an `openBottom` area or an open pit trap on this layer.
    function isHoleAt(col: number, row: number, li: number): boolean {
      if (li === 0) return false; // ground layer has implicit support
      let hole = false;
      const belowGrid = ls.layerGrids[li - 1];
      if (belowGrid && row >= 0 && row < belowGrid.length && col >= 0 && col < belowGrid[0].length) {
        const ch = belowGrid[row][col];
        const def = charDefMap.get(ch);
        const solidWall = ch === '#' || (def !== undefined && def.solid && !def.seeThrough);
        if (!solidWall) hole = true;
      } else {
        hole = true; // out-of-bounds below → treat as hole
      }
      // openBottom area flag on current layer overrides auto-detect
      const layer = ls.level.layers[li];
      const areas = layer.areas ?? ls.level.areas;
      if (areas) {
        for (const area of areas) {
          if (col >= area.fromCol && col <= area.toCol && row >= area.fromRow && row <= area.toRow) {
            if (area.openBottom !== undefined) hole = area.openBottom;
          }
        }
      }
      // Open pit trap on this layer's cell forces hole
      const savedIdx = gameState.activeLayerIndex;
      gameState.activeLayerIndex = li;
      const pit = gameState.pitTraps.get(doorKey(col, row));
      gameState.activeLayerIndex = savedIdx;
      if (pit && pit.state === 'open') hole = true;
      // A standing boulder directly below provides solid support — falling boulders
      // stack on top of it rather than falling through.
      if (hole) {
        const sIdx = gameState.activeLayerIndex;
        gameState.activeLayerIndex = li - 1;
        if (gameState.boulders.has(doorKey(col, row))) hole = false;
        gameState.activeLayerIndex = sIdx;
      }
      return hole;
    }

    // Find the layer the boulder lands on when falling from `fromLayer` at (col, row).
    function computeLandingLayer(col: number, row: number, fromLayer: number): number {
      for (let li = fromLayer - 1; li >= 1; li--) {
        if (!isHoleAt(col, row, li)) return li;
      }
      return 0;
    }

    // Can boulder enter (nc, nr) on current layer? Returns the action to take.
    type EnterResult = 'enter' | 'kill_enemy' | 'damage_enemy' | 'damage_player' | 'blocked';
    function canBoulderEnter(nc: number, nr: number, li: number, boulder: import('./core/gameState').BoulderInstance): EnterResult {
      const layerGrid = ls.layerGrids[li];
      if (!layerGrid) return 'blocked';
      if (nr < 0 || nr >= layerGrid.length || nc < 0 || nc >= layerGrid[0].length) return 'blocked';
      if (!ls.walkable.has(layerGrid[nr][nc])) return 'blocked';
      // Closed door on this layer
      const door = gameState.getDoor(nc, nr);
      if (door && !gameState.isDoorOpen(nc, nr)) return 'blocked';
      // Block
      if (gameState.isBlockAt(nc, nr)) return 'blocked';
      // Another boulder — always blocks (chain transfer handled separately in decideNext)
      if (gameState.isBoulderAt(nc, nr)) return 'blocked';
      // Enemy — boulder rolls over (kill if instakill, else damage once)
      const enemy = gameState.enemies.get(doorKey(nc, nr));
      if (enemy) return boulder.instaKillEnemies ? 'kill_enemy' : 'damage_enemy';
      // Player (only on player's layer)
      if (li === savedLayer && ps.col === nc && ps.row === nr) return 'damage_player';
      return 'enter';
    }

    function damageEnemyByBoulder(col: number, row: number, damage: number): void {
      const key = doorKey(col, row);
      const enemy = gameState.enemies.get(key);
      if (!enemy) return;
      enemy.hp -= damage;
      enemyDamageFlash(ls.enemyMeshes.meshMap, layerKey(key));
      damageNumbers.spawn(col, row, damage, gameState.activeLayerIndex * LAYER_HEIGHT);
      if (enemy.hp <= 0) {
        handleEnemyKill(key, col, row, enemy);
      } else {
        ls.healthBarManager.update(layerKey(key), enemy.hp, enemy.maxHp);
      }
    }

    // Check ramp descent: boulder at (col, row) on layer li, rolling in `direction`.
    // Returns the bottom cell position if descent is possible, else null.
    function checkRampDescent(col: number, row: number, li: number, direction: Facing): { bottomCol: number; bottomRow: number } | null {
      if (li === 0) return null;
      const savedIdx = gameState.activeLayerIndex;
      gameState.activeLayerIndex = li - 1;
      let result: { bottomCol: number; bottomRow: number } | null = null;
      for (const ramp of gameState.ramps.values()) {
        const [rdx, rdy] = FACING_DELTA[ramp.facing];
        const topCol = ramp.col + rdx;
        const topRow = ramp.row + rdy;
        if (topCol === col && topRow === row) {
          const [bdx, bdy] = FACING_DELTA[direction];
          if (bdx === -rdx && bdy === -rdy) {
            result = { bottomCol: ramp.col, bottomRow: ramp.row };
            break;
          }
        }
      }
      gameState.activeLayerIndex = savedIdx;
      return result;
    }

    function killEnemyAt(col: number, row: number): void {
      const key = doorKey(col, row);
      const enemy = gameState.enemies.get(key);
      if (enemy) handleEnemyKill(key, col, row, enemy);
    }

    // Transfer a boulder from layer li to a different layer (fall landing or ramp descent).
    function transferBoulderToLayer(boulder: import('./core/gameState').BoulderInstance, oldKey: string, oldLi: number, newCol: number, newRow: number, newLi: number): string {
      const oldPrefKey = layerDoorKey(oldLi, oldKey);
      const newKey = doorKey(newCol, newRow);
      const newPrefKey = layerDoorKey(newLi, newKey);

      gameState.activeLayerIndex = oldLi;
      deactivateBoulderTriggers(boulder.col, boulder.row);
      gameState.boulders.delete(oldKey);
      gameState.activeLayerIndex = newLi;
      boulder.col = newCol;
      boulder.row = newRow;
      gameState.boulders.set(newKey, boulder);
      crashChestIfAny(newCol, newRow);
      activateBoulderTriggers(newCol, newRow);

      const mesh = ls.boulderMeshes.meshMap.get(oldPrefKey);
      if (mesh) {
        ls.boulderMeshes.meshMap.delete(oldPrefKey);
        ls.boulderMeshes.meshMap.set(newPrefKey, mesh);
      }
      ls.boulderAnimator.rekey(oldPrefKey, newPrefKey);
      return newKey;
    }

    // Move boulder within the same layer to a new cell — updates maps + keys.
    function moveBoulderSameLayer(boulder: import('./core/gameState').BoulderInstance, oldKey: string, li: number, newCol: number, newRow: number): string {
      const oldPrefKey = layerDoorKey(li, oldKey);
      const newKey = doorKey(newCol, newRow);
      const newPrefKey = layerDoorKey(li, newKey);
      deactivateBoulderTriggers(boulder.col, boulder.row);
      gameState.boulders.delete(oldKey);
      boulder.col = newCol;
      boulder.row = newRow;
      gameState.boulders.set(newKey, boulder);
      crashChestIfAny(newCol, newRow);
      activateBoulderTriggers(newCol, newRow);
      const mesh = ls.boulderMeshes.meshMap.get(oldPrefKey);
      if (mesh) {
        ls.boulderMeshes.meshMap.delete(oldPrefKey);
        ls.boulderMeshes.meshMap.set(newPrefKey, mesh);
      }
      ls.boulderAnimator.rekey(oldPrefKey, newPrefKey);
      return newKey;
    }

    // Mirror player-on-cell signal handling. Caller must set activeLayerIndex first.
    function activateBoulderTriggers(col: number, row: number): void {
      gameState.activateTrigger(col, row);
      if (gameState.activateTripwire(col, row)) {
        hideTripwire(ls.tripwireMeshes.meshMap, layerKey(doorKey(col, row)));
      }
      const plateTargets = gameState.activatePressurePlate(col, row);
      if (plateTargets) {
        const plate = gameState.plates.get(doorKey(col, row));
        if (plate?.activated) {
          pressPlate(ls.plateMeshes.meshMap, layerKey(doorKey(col, row)));
        }
      }
    }

    function deactivateBoulderTriggers(col: number, row: number): void {
      gameState.deactivatePressurePlate(col, row);
      gameState.deactivateTrigger(col, row);
    }

    // Destroy any chest at (col, row) on the active layer — drops spill onto
    // the cell, mesh is removed. Caller must set activeLayerIndex first.
    function crashChestIfAny(col: number, row: number): void {
      const result = gameState.destroyChest(col, row);
      if (!result) return;
      destroyChestMesh(ls.chestMeshes.meshMap, layerKey(doorKey(col, row)));
      if (result.drops) {
        spawnLoot('', result.drops, col, row, gameState, ls);
      }
    }

    // Decide and execute the next step for a boulder at rest whose game state != idle.
    function decideNext(boulder: import('./core/gameState').BoulderInstance, key: string, li: number): void {
      // Falling just completed → apply landing effects, transition to rolling
      const justLanded = boulder.state === 'falling';
      if (boulder.state === 'falling') {
        if (li === savedLayer && ps.col === boulder.col && ps.row === boulder.row) {
          gameState.hp = Math.max(0, gameState.hp - (debugFullbright ? 0 : boulder.fallDamage));
          playerDamageFlashTimer = PLAYER_DAMAGE_FLASH_DURATION;
        }
        if (boulder.instaKillEnemies) {
          killEnemyAt(boulder.col, boulder.row);
        } else {
          damageEnemyByBoulder(boulder.col, boulder.row, boulder.fallDamage);
        }
        boulder.state = 'rolling';
      }

      // Is the current cell a hole? Then fall before rolling further.
      if (isHoleAt(boulder.col, boulder.row, li)) {
        const landingLi = computeLandingLayer(boulder.col, boulder.row, li);
        const newKey = transferBoulderToLayer(boulder, key, li, boulder.col, boulder.row, landingLi);
        boulder.state = 'falling';
        const newPrefKey = layerDoorKey(landingLi, newKey);
        ls.boulderAnimator.startFall(newPrefKey, landingLi * LAYER_HEIGHT);
        return;
      }

      // Ramp descent
      const descent = checkRampDescent(boulder.col, boulder.row, li, boulder.direction);
      if (descent) {
        const newLi = li - 1;
        const newKey = transferBoulderToLayer(boulder, key, li, descent.bottomCol, descent.bottomRow, newLi);
        const newPrefKey = layerDoorKey(newLi, newKey);
        ls.boulderAnimator.startDescent(newPrefKey, descent.bottomCol, descent.bottomRow, newLi * LAYER_HEIGHT, boulder.direction);
        return;
      }

      // Try to roll in current direction
      const [dc, dr] = FACING_DELTA[boulder.direction];
      const nc = boulder.col + dc;
      const nr = boulder.row + dr;

      // Post-fall: if the boulder just landed and its forward path is blocked,
      // apply two effects simultaneously:
      //   1. If the blocker is another boulder with clear space ahead, chain-
      //      transfer the momentum (other boulder starts rolling in our dir).
      //   2. The landed boulder bounces back — reverses if the reverse cell is
      //      open, otherwise stops.
      if (justLanded && canBoulderEnter(nc, nr, li, boulder) === 'blocked') {
        const blockerBoulder = gameState.boulders.get(doorKey(nc, nr));
        if (blockerBoulder) {
          const beyondResult = canBoulderEnter(nc + dc, nr + dr, li, blockerBoulder);
          if (beyondResult !== 'blocked') {
            blockerBoulder.direction = boulder.direction;
            blockerBoulder.state = 'rolling';
          }
        }
        const reverseDir = TURN_LEFT[TURN_LEFT[boulder.direction]];
        const [vdc, vdr] = FACING_DELTA[reverseDir];
        if (canBoulderEnter(boulder.col + vdc, boulder.row + vdr, li, boulder) !== 'blocked') {
          boulder.direction = reverseDir;
          return;
        }
        boulder.state = 'idle';
        return;
      }

      // Boulder-on-boulder collision: stop before impact; transfer momentum if the
      // next boulder has clear space ahead in our direction (Newton's cradle).
      const nextBoulder = gameState.boulders.get(doorKey(nc, nr));
      if (nextBoulder) {
        const beyondResult = canBoulderEnter(nc + dc, nr + dr, li, nextBoulder);
        if (beyondResult !== 'blocked') {
          nextBoulder.direction = boulder.direction;
          nextBoulder.state = 'rolling';
        }
        boulder.state = 'idle';
        return;
      }

      const result = canBoulderEnter(nc, nr, li, boulder);

      if (result === 'kill_enemy') killEnemyAt(nc, nr);
      if (result === 'damage_enemy') damageEnemyByBoulder(nc, nr, boulder.rollDamage);
      if (result === 'damage_player') {
        gameState.hp = Math.max(0, gameState.hp - (debugFullbright ? 0 : boulder.rollDamage));
        playerDamageFlashTimer = PLAYER_DAMAGE_FLASH_DURATION;
      }

      if (result === 'enter' || result === 'kill_enemy' || result === 'damage_enemy' || result === 'damage_player') {
        const newKey = moveBoulderSameLayer(boulder, key, li, nc, nr);
        const newPrefKey = layerDoorKey(li, newKey);
        ls.boulderAnimator.startRoll(newPrefKey, nc, nr, li * LAYER_HEIGHT, boulder.direction);
        return;
      }

      // Blocked — apply wall turn logic (post-fall bounce-back handled above)
      const leftDir = TURN_LEFT[boulder.direction];
      const rightDir = TURN_RIGHT[boulder.direction];
      const [ldc, ldr] = FACING_DELTA[leftDir];
      const [rdc, rdr] = FACING_DELTA[rightDir];
      const leftResult = canBoulderEnter(boulder.col + ldc, boulder.row + ldr, li, boulder);
      const rightResult = canBoulderEnter(boulder.col + rdc, boulder.row + rdr, li, boulder);
      const leftOpen = leftResult !== 'blocked';
      const rightOpen = rightResult !== 'blocked';

      if (leftOpen && rightOpen) {
        boulder.state = 'idle';
        return;
      }
      if (leftOpen) {
        boulder.direction = leftDir;
        // Let the next tick handle the roll — decideNext will re-run with new direction
        return;
      }
      if (rightOpen) {
        boulder.direction = rightDir;
        return;
      }
      boulder.state = 'idle';
    }

    for (let li = 0; li < gameState.layers.length; li++) {
      gameState.activeLayerIndex = li;
      const boulderKeys = Array.from(gameState.boulders.keys());
      for (const key of boulderKeys) {
        const boulder = gameState.boulders.get(key);
        if (!boulder) continue; // moved to another layer during this tick
        if (boulder.state === 'idle') continue;
        const prefKey = layerDoorKey(li, key);
        if (ls.boulderAnimator.getMode(prefKey) !== 'rest') continue;
        decideNext(boulder, key, li);
      }
    }

    gameState.activeLayerIndex = savedLayer;
  }

  function tickBoulderSpawners(delta: number): void {
    const savedLayer = gameState.activeLayerIndex;
    for (let li = 0; li < gameState.layers.length; li++) {
      gameState.activeLayerIndex = li;
      const yOffset = li * LAYER_HEIGHT;
      for (const [, bs] of gameState.boulderSpawners) {
        if (!bs.active) continue;
        bs.spawnTimer += delta;
        if (bs.spawnTimer < bs.interval) continue;
        bs.spawnTimer -= bs.interval;

        const cellKey = doorKey(bs.col, bs.row);
        // Cell already has a boulder — skip this tick
        if (gameState.boulders.has(cellKey)) continue;

        const newBoulder: import('./core/gameState').BoulderInstance = {
          col: bs.col,
          row: bs.row,
          direction: bs.direction,
          state: 'rolling',
          rollDamage: bs.rollDamage,
          fallDamage: bs.fallDamage,
          instaKillEnemies: bs.instaKillEnemies,
          pushable: bs.pushable,
        };
        gameState.boulders.set(cellKey, newBoulder);

        const prefKey = layerDoorKey(li, cellKey);
        const mesh = createSingleBoulderMesh(
          bs.col, bs.row, prefKey,
          ls.boulderMeshes.group, ls.boulderMeshes.meshMap, yOffset,
        );
        ls.boulderAnimator.register(prefKey, mesh, bs.col, bs.row, yOffset, bs.direction);
      }
    }
    gameState.activeLayerIndex = savedLayer;
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
      gameState.loadNewLevel(startLevel.layers, startLevel.id ?? startLevel.name);
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
  function layerKey(key: string): string {
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
        updateDoorMesh(ls.doorMeshes.panelMap, layerKey(doorKey(entry.col, entry.row)), false, ls.doorAnimator, ls.doorMeshes.boundaryLights);
      } else {
        // Still blocked — bounce animation and retry
        entry.timer = DOOR_RETRY_INTERVAL;
        const dk = doorKey(entry.col, entry.row);
        ls.doorAnimator.bounce(layerKey(dk));
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
        updateDoorMesh(ls.doorMeshes.panelMap, layerKey(dk), true, ls.doorAnimator, ls.doorMeshes.boundaryLights);
        blockedDoors.set(dk, { col, row, timer: DOOR_RETRY_INTERVAL });
      }

      // Reveal explored cells on move
      gameState.revealAround(col, row, ls.player.getState().facing, activeGrid());

      // Key pickup
      const pickedUpKeyId = gameState.pickupKeyAt(col, row);
      if (pickedUpKeyId) {
        console.log(`Picked up key: ${pickedUpKeyId}`);
        hideKeyMesh(ls.keyMeshes.meshMap, layerKey(doorKey(col, row)));
      }

      // Equipment pickup
      const equipResult = gameState.pickupEquipmentAt(col, row);
      if (equipResult.denied) {
        hud.showMessage(equipResult.denied);
      } else if (equipResult.item) {
        hud.showMessage(`Equipped: ${equipResult.item.name}`);
        hideItemMesh(ls.itemMeshes.meshMap, ls.itemMeshes.group, layerKey(doorKey(col, row)));
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
        hideConsumableMesh(ls.consumableMeshes.meshMap, ls.consumableMeshes.group, layerKey(doorKey(col, row)));
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
        hideTripwire(ls.tripwireMeshes.meshMap, layerKey(doorKey(col, row)));
        hud.showMessage('Oops! A tripwire!');
      }

      // Pressure plate activation
      const plateTargets = gameState.activatePressurePlate(col, row);
      if (plateTargets) {
        const plate = gameState.plates.get(doorKey(col, row));
        if (plate?.activated) {
          pressPlate(ls.plateMeshes.meshMap, layerKey(doorKey(col, row)));
        }
      }

      // Torch fuel drain — skip in bright environments (outdoor, mist)
      {
        const playerEnv = resolveEnvironmentAtCell(col, row, ls.level.environment ?? 'dungeon', ls.level.areas);
        if (playerEnv !== 'outdoor' && playerEnv !== 'mist') {
          gameState.drainTorchFuel(1);
        }
      }

      // Ramp detection — check if movement crosses a layer boundary via ramp
      if (col !== prevCol || row !== prevRow) {
        const dc = col - prevCol;
        const dr = row - prevRow;
        // Check ramp at source cell (going UP)
        const rampAtSrc = gameState.ramps.get(doorKey(prevCol, prevRow));
        if (rampAtSrc) {
          const [rdx, rdy] = FACING_DELTA[rampAtSrc.facing];
          if (dc === rdx && dr === rdy && gameState.activeLayerIndex + 1 < ls.layerGrids.length) {
            const destLayer = gameState.activeLayerIndex + 1;
            gameState.activeLayerIndex = destLayer;
            debugLayerIndex = destLayer;
            ls.player.targetYOffset = destLayer * LAYER_HEIGHT;
            ls.player.switchGrid(ls.layerGrids[destLayer], buildWalkableSet(ls.level.charDefs), gameState.stairs);
          }
        }
        // Check ramp at source cell on layer above (going DOWN) — the ramp entity is on the lower layer
        // and we're on the top cell (one layer up), moving opposite to facing
        if (gameState.activeLayerIndex > 0) {
          const lowerLayer = gameState.activeLayerIndex - 1;
          const savedIdx = gameState.activeLayerIndex;
          gameState.activeLayerIndex = lowerLayer;
          const rampBelow = gameState.ramps.get(doorKey(col, row));
          gameState.activeLayerIndex = savedIdx;
          if (rampBelow) {
            const [rdx, rdy] = FACING_DELTA[rampBelow.facing];
            // The top cell of the ramp is at (rampBelow.col + rdx, rampBelow.row + rdy)
            // We're moving FROM the top cell in the opposite direction
            if (prevCol === rampBelow.col + rdx && prevRow === rampBelow.row + rdy &&
                dc === -rdx && dr === -rdy) {
              gameState.activeLayerIndex = lowerLayer;
              debugLayerIndex = lowerLayer;
              ls.player.targetYOffset = lowerLayer * LAYER_HEIGHT;
              ls.player.switchGrid(ls.layerGrids[lowerLayer], buildWalkableSet(ls.level.charDefs), gameState.stairs);
            }
          }
        }
      }

      // Hole detection — falling through open floors or open pit traps
      if (!ls.player.debugNoClip && col !== undefined && row !== undefined) {
        const currentLayer = gameState.activeLayerIndex;
        if (currentLayer > 0) {
          const belowGrid = ls.layerGrids[currentLayer - 1];
          let isHole = false;
          // Check natural hole (layer below is not solid)
          if (belowGrid && row >= 0 && row < belowGrid.length && col >= 0 && col < belowGrid[0].length) {
            const ch = belowGrid[row][col];
            const def = ls.level.charDefs?.find((d: { char: string }) => d.char === ch);
            if (!(ch === '#' || (def && (def as any).solid && !(def as any).seeThrough))) {
              isHole = true;
            }
          }
          // Check open pit trap on current layer
          const pit = gameState.pitTraps.get(doorKey(col, row));
          if (pit && pit.state === 'open') isHole = true;
          if (isHole) {
            // Compute landing layer: scan downward for first layer with a floor
            let landingLayer = 0;
            for (let li = currentLayer - 1; li >= 1; li--) {
              const gridBelow = ls.layerGrids[li - 1];
              if (gridBelow && row < gridBelow.length && col < gridBelow[0].length) {
                const ch = gridBelow[row][col];
                const def = ls.level.charDefs?.find((d: { char: string }) => d.char === ch);
                if (ch === '#' || (def && (def as any).solid && !(def as any).seeThrough)) {
                  landingLayer = li;
                  break;
                }
              }
            }
            const totalDistance = (currentLayer - landingLayer) * LAYER_HEIGHT;
            ls.player.setPendingFall(landingLayer, totalDistance);
          }
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

    ls.player.setOnFallLand((landingLayer: number) => {
      const ps = ls.player.getState();
      gameState.activeLayerIndex = landingLayer;
      debugLayerIndex = landingLayer;
      ls.player.switchGrid(ls.layerGrids[landingLayer], buildWalkableSet(ls.level.charDefs), gameState.stairs);
      gameState.revealAround(ps.col, ps.row, ps.facing, ls.layerGrids[landingLayer]);
    });

    // Signal-driven door state changes → animate door mesh
    gameState.onDoorSignalChanged = (col, row, open) => {
      const dk = doorKey(col, row);
      if (open) {
        // Opening — clear any blocked retry and open normally
        blockedDoors.delete(dk);
        updateDoorMesh(ls.doorMeshes.panelMap, layerKey(dk), true, ls.doorAnimator, ls.doorMeshes.boundaryLights);
      } else {
        // Closing — check if cell is occupied
        const occupant = isDoorCellOccupied(col, row);
        if (occupant) {
          // Keep door open in game state, start retry cycle
          const door = gameState.getDoor(col, row);
          if (door) door.state = 'open';
          blockedDoors.set(dk, { col, row, timer: DOOR_RETRY_INTERVAL });
          ls.doorAnimator.bounce(layerKey(dk));
        } else {
          blockedDoors.delete(dk);
          updateDoorMesh(ls.doorMeshes.panelMap, layerKey(dk), false, ls.doorAnimator, ls.doorMeshes.boundaryLights);
        }
      }
    };

    // Pit trap signal → toggle floor visibility + trigger fall if player is standing on it
    gameState.onPitTrapSignalChanged = (col, row, open) => {
      const key = layerKey(doorKey(col, row));
      const floorMesh = ls.pitFloorMap.get(key);
      if (floorMesh) floorMesh.visible = !open;

      // Toggle ceiling on layer 2 below the pit (tracked via pitCeilingMap)
      const currentLayer = gameState.activeLayerIndex;
      const ceilingLayer = currentLayer - 2;
      if (ceilingLayer >= 0) {
        const ceilKey = layerDoorKey(ceilingLayer, doorKey(col, row));
        const ceilMesh = ls.pitCeilingMap.get(ceilKey);
        if (ceilMesh) ceilMesh.visible = !open;
      }

      // Rebuild the layer below so it shows/hides the pit opening geometry
      const belowLayer = currentLayer - 1;
      if (belowLayer >= 0 && ls.layerDungeonGroups[belowLayer]) {
        const oldGroup = ls.layerDungeonGroups[belowLayer];
        oldGroup.removeFromParent();
        oldGroup.traverse(child => { if (child instanceof THREE.Mesh) child.geometry?.dispose(); });

        const savedIdx = gameState.activeLayerIndex;
        gameState.activeLayerIndex = belowLayer;
        const ld = ls.level.layers[belowLayer];
        const { group: newGroup } = buildLayerDungeonGeometry(
          gameState, belowLayer, ld, ls.level, ls.level.layers.length,
        );
        gameState.activeLayerIndex = savedIdx;
        ls.dungeonGroup.add(newGroup);
        ls.layerDungeonGroups[belowLayer] = newGroup;
      }

      // If the player is standing on this cell and it just opened, trigger immediate fall
      if (open && !ls.player.falling) {
        const ps = ls.player.getState();
        if (ps.col === col && ps.row === row) {
          const currentLayer = gameState.activeLayerIndex;
          if (currentLayer > 0) {
            let landingLayer = 0;
            for (let li = currentLayer - 1; li >= 1; li--) {
              const gridBelow = ls.layerGrids[li - 1];
              if (gridBelow && row < gridBelow.length && col < gridBelow[0].length) {
                const ch = gridBelow[row][col];
                const def = ls.level.charDefs?.find((d: { char: string }) => d.char === ch);
                if (ch === '#' || (def && (def as any).solid && !(def as any).seeThrough)) {
                  landingLayer = li;
                  break;
                }
              }
            }
            const totalDistance = (currentLayer - landingLayer) * LAYER_HEIGHT;
            ls.player.setPendingFall(landingLayer, totalDistance);
          }
        }
      }
    };

    gameState.onSpawnerSignalChanged = (_col, _row, _active) => {
      // Active flag is already set on the SpawnerInstance by gameState.
    };

    gameState.onBoulderSignalChanged = (_col, _row, _active) => {
      // gameState has already transitioned boulder.state idle → rolling on rising edge.
      // tickBoulders will handle movement on next frame.
    };

    gameState.onBoulderSpawnerSignalChanged = (_col, _row, _active) => {
      // active flag is already set on the BoulderSpawnerInstance by gameState.
    };

    // Timed source deactivation → animate lever reset
    gameState.onLeverReset = (col, row) => {
      const leverKey = doorKey(col, row);
      ls.leverAnimator.setState(layerKey(leverKey), 'up');
    };

    // Plate reset (momentary step-off or timed expiry) → animate plate release
    gameState.onPlateReset = (col, row) => {
      releasePlate(ls.plateMeshes.meshMap, layerKey(doorKey(col, row)));
    };

    // Secret wall detection — walking into a wall cell with a secret wall entity
    ls.player.setOnMoveBlocked((col, row) => {
      // Secret wall — walk through
      const sw = gameState.getSecretWall(col, row);
      if (sw && !sw.opened) {
        const result = gameState.openSecretWall(col, row, activeGrid());
        if (result.opened) {
          const entry = ls.wallEntityMeshes.meshMap.get(layerKey(doorKey(col, row)));
          if (entry) {
            if (!result.persistent) {
              entry.wallGroup.visible = false;
            }
            entry.floorCeilGroup.visible = true;
          }
          hud.showMessage(result.persistent ? 'An illusionary wall!' : 'A secret passage!');
          ls.player.moveForward();
          return;
        }
      }

      // Block push — walk into pushable block
      const block = gameState.getBlock(col, row);
      if (block) {
        const ps = ls.player.getState();
        const [dc, dr] = FACING_DELTA[ps.facing];
        const destCol = col + dc;
        const destRow = row + dr;
        if (
          isWalkable(activeGrid(), destCol, destRow, ls.walkable, gameState.isDoorOpen.bind(gameState)) &&
          !gameState.isBlockedByEnemy(destCol, destRow) &&
          !gameState.isBlockAt(destCol, destRow) &&
          !gameState.isBarrelAt(destCol, destRow) &&
          !gameState.isEdgeBlocked(col, row, destCol, destRow)
        ) {
          gameState.pushBlock(col, row, destCol, destRow);
          const fromBlockKey = layerKey(doorKey(col, row));
          const toBlockKey = layerKey(doorKey(destCol, destRow));
          animateBlockPush(ls.blockMeshes.meshMap, fromBlockKey, col, row, toBlockKey, destCol, destRow);
          // Pressure plate at destination
          const destPlate = gameState.plates.get(doorKey(destCol, destRow));
          if (destPlate) {
            gameState.activatePressurePlate(destCol, destRow);
            pressPlate(ls.plateMeshes.meshMap, layerKey(doorKey(destCol, destRow)));
          }
          // Release plate at source
          const srcPlate = gameState.plates.get(doorKey(col, row));
          if (srcPlate && srcPlate.activated) {
            gameState.deactivatePressurePlate(col, row);
            releasePlate(ls.plateMeshes.meshMap, layerKey(doorKey(col, row)));
          }
          // Re-attempt the move now that the block cell is free
          ls.player.moveForward();
        }
      }

      // Boulder push — walk into pushable idle boulder
      const boulder = gameState.boulders.get(doorKey(col, row));
      if (boulder && boulder.pushable && boulder.state === 'idle') {
        boulder.direction = ls.player.getState().facing;
        boulder.state = 'rolling';
      }
    });

    // Signal-driven chest state changes → animate chest mesh
    gameState.onChestSignalChanged = (col, row, open) => {
      if (open) {
        openChestMesh(ls.chestMeshes.meshMap, layerKey(doorKey(col, row)));
      } else {
        closeChestMesh(ls.chestMeshes.meshMap, layerKey(doorKey(col, row)));
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
        layerIndex: gameState.activeLayerIndex,
      });
    };

    // Projectile hit → apply damage and visual effects
    projectileManager.setHitCallback((projectile, col, row, hitType) => {
      if (hitType === 'player' && !debugFullbright) {
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
          enemyDamageFlash(ls.enemyMeshes.meshMap, layerKey(doorKey(col, row)));
          ls.enemyAnimator.triggerHit(layerKey(key));
          damageNumbers.spawn(col, row, projectile.damage, gameState.activeLayerIndex * LAYER_HEIGHT);
          if (enemy.hp <= 0) {
            handleEnemyKill(key, col, row, enemy);
          } else {
            ls.healthBarManager.update(layerKey(key), enemy.hp, enemy.maxHp);
          }
        }
      }
      if (projectile.projectileType === 'fireball') {
        fireballExplosions.spawn(
          projectile.col * CELL_SIZE,
          projectile.row * CELL_SIZE,
          gameState.activeLayerIndex * LAYER_HEIGHT,
        );
      }
    });
  }

  function triggerLevelTransition(stairEntity: Entity): void {
    const targetStairId = stairEntity.target as string;
    // Preserve the player's current facing across the transition
    const playerFacingBeforeTransition = ls.player.getState().facing;

    // Save current level state
    blockedDoors.clear();
    projectileManager.clear();
    levelSnapshots.set(currentLevelId, gameState.saveLevelState());

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
        gameState.loadNewLevel(targetLevel.layers, targetLevelId);
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
      ls = buildLevelScene(targetLevel, gameState, camera, scene, spawnCol, spawnRow, playerFacingBeforeTransition);
      wireCallbacks();
      sconceEmbers.setSources(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap);
      dustMotes.setVisible(targetLevel.dustMotes !== false);
      waterDrips.setLevel(activeGrid(), targetLevel.charDefs);
      waterDrips.setVisible(targetLevel.waterDrips === true);
      fireflies.setVisible(targetLevel.fireflies === true);

      gameState.revealAround(spawnCol, spawnRow, targetFacing, activeGrid());

      // Auto-save after arriving at destination (so loading puts player here, not on the stair)
      saveGame(AUTOSAVE_KEY);
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
        gameState.unequipToBackpack(action.equipSlot, action.backpackSlot);
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
      case 'swap':
        gameState.entityRegistry.swapBackpackSlots(action.indexA, action.indexB);
        break;
      case 'message':
        hud.showMessage(action.text);
        break;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (transition.isActive) return;
    if (ls.player.falling) return; // block all input during fall
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
            updateDoorMesh(ls.doorMeshes.panelMap, layerKey(doorKey(facing.col, facing.row)), true, ls.doorAnimator, ls.doorMeshes.boundaryLights);
          }
          if (result.type === 'door_closed') {
            const facing = getFacingCell(ls.player.getState());
            updateDoorMesh(ls.doorMeshes.panelMap, layerKey(doorKey(facing.col, facing.row)), false, ls.doorAnimator, ls.doorMeshes.boundaryLights);
          }
          if (result.type === 'door_blocked') {
            const facing = getFacingCell(ls.player.getState());
            const bk = doorKey(facing.col, facing.row);
            ls.doorAnimator.bounce(layerKey(bk));
          }
          if (result.type === 'lever_activated' && result.targets) {
            for (const t of result.targets) {
              const targetPos = gameState.resolveEntityPosition(t);
              if (targetPos) {
                updateDoorMesh(ls.doorMeshes.panelMap, layerKey(doorKey(targetPos.col, targetPos.row)), gameState.isDoorOpen(targetPos.col, targetPos.row), ls.doorAnimator, ls.doorMeshes.boundaryLights);
              }
            }
            const leverKey = doorKey(ls.player.getState().col, ls.player.getState().row);
            const lever = gameState.levers.get(leverKey);
            if (lever) ls.leverAnimator.setState(layerKey(leverKey), lever.state);
          }
          if (result.type === 'sconce_taken') {
            const ps = ls.player.getState();
            extinguishSconce(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap, layerKey(doorKey(ps.col, ps.row)));
            sconceEmbers.setSources(ls.sconceMeshes.meshMap, ls.sconceMeshes.lightMap);
          }
          if (result.type === 'block_pushed' && result.targetCol !== undefined && result.targetRow !== undefined) {
            const facing = getFacingCell(ls.player.getState());
            const fromBlockKey = layerKey(doorKey(facing.col, facing.row));
            const toBlockKey = layerKey(doorKey(result.targetCol, result.targetRow));
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
            openChestMesh(ls.chestMeshes.meshMap, layerKey(doorKey(result.targetCol, result.targetRow)));
            // Roll loot from chest drops
            const chest = gameState.getChest(result.targetCol, result.targetRow);
            if (chest?.drops) {
              spawnLoot('', chest.drops, result.targetCol, result.targetRow, gameState, ls);
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
              markFountainUsed(ls.fountainMeshes.meshMap, layerKey(doorKey(result.targetCol, result.targetRow)));
            }
          }
          if (result.type === 'altar_activated' && result.message) {
            hud.showMessage(result.message);
            if (result.targetCol !== undefined && result.targetRow !== undefined) {
              markAltarUsed(ls.altarMeshes.meshMap, layerKey(doorKey(result.targetCol, result.targetRow)));
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
          // Debug mode: set facing enemy HP to 1 for instant kill
          if (debugFullbright) {
            const ps = ls.player.getState();
            const facing = getFacingCell(ps);
            const enemy = gameState.getEnemy(facing.col, facing.row);
            if (enemy) enemy.hp = 1;
          }
          const results = playerAttack(ls.player.getState(), gameState);
          if (results[0]?.type !== 'cooldown') {
            swordSwing.trigger();
          }
          for (const result of results) {
            if (result.type === 'hit' || result.type === 'kill') {
              if (result.targetCol !== undefined && result.targetRow !== undefined) {
                enemyDamageFlash(ls.enemyMeshes.meshMap, layerKey(doorKey(result.targetCol, result.targetRow)));
                ls.enemyAnimator.triggerHit(layerKey(doorKey(result.targetCol, result.targetRow)));
                if (result.damage !== undefined) {
                  damageNumbers.spawn(result.targetCol, result.targetRow, result.damage, gameState.activeLayerIndex * LAYER_HEIGHT);
                }
              }
              if (result.type === 'hit' && result.targetCol !== undefined && result.targetRow !== undefined) {
                const hitEnemy = gameState.getEnemy(result.targetCol, result.targetRow);
                if (hitEnemy) {
                  ls.healthBarManager.update(layerKey(doorKey(result.targetCol, result.targetRow)), hitEnemy.hp, hitEnemy.maxHp);
                }
              }
              if (result.type === 'kill' && result.targetCol !== undefined && result.targetRow !== undefined && result.enemyType) {
                // Enemy already removed from map by damageEnemy(); use result data for XP/loot
                const killKey = layerKey(doorKey(result.targetCol, result.targetRow));
                ls.healthBarManager.remove(killKey);
                hideEnemyMesh(ls.enemyMeshes.meshMap, killKey);
                ls.enemyAnimator.remove(killKey);
                const enemyDef = enemyDatabase.getEnemy(result.enemyType);
                if (enemyDef) {
                  const levelled = gameState.addXp(enemyDef.xp);
                  if (levelled) levelUpNotification.trigger(gameState.level);
                }
                spawnLoot(result.enemyType, result.dropsOverride, result.targetCol, result.targetRow, gameState, ls);
              }
            }
            if (result.type === 'wall_hit' && result.targetCol !== undefined && result.targetRow !== undefined && result.damage !== undefined) {
              // Apply damage to breakable wall and handle destruction
              const wallResult = gameState.damageBreakableWall(result.targetCol, result.targetRow, result.damage, activeGrid());
              damageNumbers.spawn(result.targetCol, result.targetRow, result.damage, gameState.activeLayerIndex * LAYER_HEIGHT);
              if (wallResult.destroyed) {
                // Hide wall faces, show floor/ceiling
                const entry = ls.wallEntityMeshes.meshMap.get(layerKey(doorKey(result.targetCol, result.targetRow)));
                if (entry) {
                  entry.wallGroup.visible = false;
                  entry.floorCeilGroup.visible = true;
                }
                // Roll loot from wall drops
                if (wallResult.drops) {
                  spawnLoot('', wallResult.drops, result.targetCol, result.targetRow, gameState, ls);
                }
              }
            }
            if ((result.type === 'barrel_hit' || result.type === 'barrel_destroy') && result.targetCol !== undefined && result.targetRow !== undefined && result.damage !== undefined) {
              damageNumbers.spawn(result.targetCol, result.targetRow, result.damage, gameState.activeLayerIndex * LAYER_HEIGHT);
              if (result.type === 'barrel_destroy') {
                const barrelKey = layerKey(doorKey(result.targetCol, result.targetRow));
                const barrelMesh = ls.barrelMeshes.meshMap.get(barrelKey);
                if (barrelMesh) {
                  ls.barrelMeshes.group.remove(barrelMesh);
                  ls.barrelMeshes.meshMap.delete(barrelKey);
                }
                // Roll loot from barrel drops
                if (result.dropsOverride) {
                  spawnLoot('', result.dropsOverride, result.targetCol, result.targetRow, gameState, ls);
                }
              }
            }
          }
        }
        break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8':
        {
          // Quick-use consumable by slot number (visual grid position)
          const slotNum = parseInt(e.code.charAt(5)) - 1;
          const entity = gameState.entityRegistry.getBackpackItemAt(slotNum);
          if (entity) {
            gameState.useConsumableFromRegistry(entity.instanceId);
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
        ls.player.debugNoClip = debugFullbright;
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
    updateItemBillboards(ls.itemMeshes.meshMap, camera);
    updateConsumableBillboards(ls.consumableMeshes.meshMap, camera);
    updateKeyBillboards(ls.keyMeshes.meshMap, camera);

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
      // Update projectiles per-layer so collision checks use the correct grid and entities
      {
        const savedLayer = gameState.activeLayerIndex;
        const playerLayer = savedLayer;
        const layers = new Set(projectileManager.getAll().map(p => p.layerIndex));
        for (const li of layers) {
          gameState.activeLayerIndex = li;
          const layerGrid = ls.layerGrids[li] ?? activeGrid();
          // Only check player collision on the player's own layer
          const pCol = li === playerLayer ? lastPlayerCol : -1;
          const pRow = li === playerLayer ? lastPlayerRow : -1;
          projectileManager.update(
            delta,
            (col, row) => ls.walkable.has(layerGrid[row]?.[col]),
            gameState.isDoorOpen.bind(gameState),
            pCol, pRow,
            gameState.isEnemyAt.bind(gameState),
            gameState.isBlockAt.bind(gameState),
            gameState.isSolidEdgeBlocked.bind(gameState),
            li,
          );
        }
        gameState.activeLayerIndex = savedLayer;
      }
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
      if (effectResult.damage > 0 && !debugFullbright) {
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
      if (gameState.hunger <= 0 && !debugFullbright) {
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
        // Hole check: cell has no floor if the layer below has a non-wall cell
        const belowGrid = ls.layerGrids[li - 1];
        const charDefMap = new Map<string, import('./core/types').CharDef>();
        if (ls.level.charDefs) for (const def of ls.level.charDefs) charDefMap.set(def.char, def);
        const isHole = belowGrid ? (col: number, row: number) => {
          if (row < 0 || row >= belowGrid.length || col < 0 || col >= belowGrid[0].length) return true;
          const ch = belowGrid[row][col];
          const def = charDefMap.get(ch);
          return !(ch === '#' || (def !== undefined && def.solid && !def.seeThrough));
        } : undefined;
        const actions = updateEnemies(
          gameState, ps.col, ps.row, layerGrid, ls.walkable,
          gameState.isDoorOpen.bind(gameState), delta, isHole,
          gameState.isEdgeBlocked.bind(gameState),
        );
        for (const action of actions) {
          if (action.type === 'move' && action.toCol !== undefined && action.toRow !== undefined) {
            const newKey = doorKey(action.toCol, action.toRow);
            updateEnemyMeshPosition(ls.enemyMeshes.meshMap, layerKey(action.enemyKey), layerKey(newKey));
            ls.enemyAnimator.moveTo(layerKey(action.enemyKey), action.toCol, action.toRow, layerKey(newKey));
            ls.healthBarManager.rekey(layerKey(action.enemyKey), layerKey(newKey));
          } else if (action.type === 'attack') {
            // Only attack if enemy is on the player's layer
            if (li === savedLayer && !debugFullbright) {
              const enemy = gameState.enemies.get(action.enemyKey);
              if (enemy) {
                enemyAttackPlayer(gameState, enemy.atk);
                playerDamageFlashTimer = PLAYER_DAMAGE_FLASH_DURATION;
                ls.enemyAnimator.triggerLunge(layerKey(action.enemyKey), ps.col, ps.row);
                const onHitBehavior = enemyDatabase.getBehavior(enemy.type, 'onHit');
                if (onHitBehavior && Math.random() < (onHitBehavior.params.chance as number)) {
                  applyEffect(gameState.playerStatusEffects, onHitBehavior.params.statusEffect as StatusEffectType, onHitBehavior.params.duration as number);
                }
              }
            }
          } else if (action.type === 'regen') {
            const enemy = gameState.enemies.get(action.enemyKey);
            if (enemy) {
              ls.healthBarManager.update(layerKey(action.enemyKey), enemy.hp, enemy.maxHp);
            }
          } else if (action.type === 'status_damage') {
            const enemy = gameState.enemies.get(action.enemyKey);
            if (enemy) {
              enemyDamageFlash(ls.enemyMeshes.meshMap, layerKey(doorKey(action.fromCol, action.fromRow)));
              ls.healthBarManager.update(layerKey(action.enemyKey), enemy.hp, enemy.maxHp);
            }
          } else if (action.type === 'status_kill') {
            const enemy = gameState.enemies.get(action.enemyKey);
            if (enemy) {
              enemyDamageFlash(ls.enemyMeshes.meshMap, layerKey(doorKey(action.fromCol, action.fromRow)));
              handleEnemyKill(action.enemyKey, action.fromCol, action.fromRow, enemy);
            }
          }
        }
      }
      gameState.activeLayerIndex = savedLayer;

      tickSpawners(delta);
      tickBoulders(delta);
      tickBoulderSpawners(delta);

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
    const _ps = ls.player.getState();
    hud.setPlayerPosition(_ps.col, _ps.row);
    hud.draw(gameState, _ps, activeGrid(), delta, damageFlashAlpha, swordSwing, levelUpNotification);

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
