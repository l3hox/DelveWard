import * as THREE from 'three';
import { buildDungeon } from './rendering/dungeon';
import { Player } from './rendering/player';
import { loadDungeon } from './core/levelLoader';
import { buildWalkableSet, getFacingCell } from './core/grid';
import { GameState, doorKey, parseDoorKey } from './core/gameState';
import { interact } from './core/interaction';
import { buildDoorMeshes, updateDoorMesh } from './rendering/doorRenderer';
import { buildKeyMeshes, hideKeyMesh } from './rendering/keyRenderer';
import { buildPlateMeshes, pressPlate } from './rendering/plateRenderer';
import { buildLeverMeshes } from './rendering/leverRenderer';
import { buildStairMeshes } from './rendering/stairRenderer';
import { LeverAnimator } from './rendering/leverAnimator';
import { DoorAnimator } from './rendering/doorAnimator';
import { HudOverlay } from './hud/hudCanvas';
import { TransitionOverlay } from './rendering/transitionOverlay';
import type { DungeonLevel, Dungeon, Entity } from './core/types';
import type { LevelSnapshot } from './core/gameState';
import type { Facing } from './core/grid';

const CAMERA_FOV = 80;

// Cap delta to prevent physics jumps when tab is backgrounded
const MAX_FRAME_DELTA = 0.1;

// Torch flicker parameters
const TORCH_OFFSET_Y = 0.3;
const FLICKER_RANGE = 0.6;
const FLICKER_MIN_INTERVAL = 0.08;
const FLICKER_INTERVAL_RANGE = 0.25;
const FLICKER_LERP = 0.15;

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
  stairMeshes: { group: THREE.Group };
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

  const stairMeshes = buildStairMeshes(level, walkable);
  scene.add(stairMeshes.group);

  const player = new Player(
    camera,
    level.grid,
    startCol,
    startRow,
    startFacing,
    walkable,
    gameState.isDoorOpen.bind(gameState),
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
    stairMeshes,
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
    ls.stairMeshes.group,
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
  scene.fog = new THREE.Fog(0x000000, 4, 20);

  // --- Camera ---
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );

  // --- Renderer ---
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  // --- Lighting ---
  const ambient = new THREE.AmbientLight(0x111111);
  scene.add(ambient);

  const torchLight = new THREE.PointLight(0xffaa66, 3, 8);
  let flickerTarget = 2.8;
  let flickerTimer = 0;
  scene.add(torchLight);

  // Debug: fullbright toggle
  let debugFullbright = false;
  const debugLight = new THREE.AmbientLight(0xffffff, 2);

  // --- Dungeon ---
  const dungeon: Dungeon = await loadDungeon('/levels/dungeon1.json');
  const firstLevel = dungeon.levels[0];
  let currentLevelId = firstLevel.id!;
  const levelSnapshots = new Map<string, LevelSnapshot>();

  const gameState = new GameState(firstLevel.entities, firstLevel.grid);

  // --- HUD + Transition ---
  const hud = new HudOverlay();
  hud.attach();

  const transition = new TransitionOverlay();
  transition.attach();

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
        gameState.loadNewLevel(targetLevel.entities, targetLevel.grid);
      }

      currentLevelId = targetId;
      ls = buildLevelScene(targetLevel, gameState, camera, scene, targetCol, targetRow, targetFacing);
      wireCallbacks();

      gameState.revealAround(targetCol, targetRow, targetFacing, targetLevel.grid);
    });
  }

  // Wire up initial level
  wireCallbacks();

  // Reveal initial position
  const ps = ls.player.getState();
  gameState.revealAround(ps.col, ps.row, ps.facing, ls.level.grid);

  // --- Input ---
  const pressedKeys = new Set<string>();

  window.addEventListener('keydown', (e) => {
    if (transition.isActive) return;
    if (pressedKeys.has(e.code)) return;
    pressedKeys.add(e.code);

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
        }
        break;
      case 'KeyL':
        debugFullbright = !debugFullbright;
        if (debugFullbright) {
          scene.add(debugLight);
          scene.fog = null;
        } else {
          scene.remove(debugLight);
          scene.fog = new THREE.Fog(0x000000, 4, 20);
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
    transition.update(delta);

    // Torch follows player with variable flicker, scaled by fuel
    const pos = ls.player.getWorldPosition();
    torchLight.position.set(pos.x, pos.y + TORCH_OFFSET_Y, pos.z);

    const fuelRatio = gameState.torchFuel / gameState.maxTorchFuel;
    torchLight.distance = 3 + fuelRatio * 5;

    flickerTimer -= delta;
    if (flickerTimer <= 0) {
      const baseIntensity = 0.5 + fuelRatio * 2.1;
      flickerTarget = baseIntensity + Math.random() * FLICKER_RANGE * fuelRatio;
      flickerTimer = FLICKER_MIN_INTERVAL + Math.random() * FLICKER_INTERVAL_RANGE;
    }
    torchLight.intensity += (flickerTarget - torchLight.intensity) * FLICKER_LERP;

    hud.draw(gameState, ls.player.getState(), ls.level.grid, delta);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

init().catch((err) => {
  console.error('Failed to initialize:', err);
  document.body.textContent = `Error: ${err.message}`;
});
