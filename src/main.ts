import * as THREE from 'three';
import { buildDungeon } from './rendering/dungeon';
import { Player } from './rendering/player';
import { loadLevel } from './core/levelLoader';
import { buildWalkableSet, getFacingCell } from './core/grid';
import { GameState, doorKey, parseDoorKey } from './core/gameState';
import { interact } from './core/interaction';
import { buildDoorMeshes, updateDoorMesh } from './rendering/doorRenderer';
import { buildKeyMeshes, hideKeyMesh } from './rendering/keyRenderer';
import { buildPlateMeshes, pressPlate } from './rendering/plateRenderer';
import { buildLeverMeshes } from './rendering/leverRenderer';
import { LeverAnimator } from './rendering/leverAnimator';
import { DoorAnimator } from './rendering/doorAnimator';
import { HudOverlay } from './hud/hudCanvas';

// Cap delta to prevent physics jumps when tab is backgrounded
const MAX_FRAME_DELTA = 0.1;

// Torch flicker parameters
const TORCH_OFFSET_Y = 0.3;
const FLICKER_BASE = 2.6;
const FLICKER_RANGE = 0.6;
const FLICKER_MIN_INTERVAL = 0.08;
const FLICKER_INTERVAL_RANGE = 0.25;
const FLICKER_LERP = 0.15;

async function init(): Promise<void> {
  // --- Scene ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 4, 20);

  // --- Camera ---
  const camera = new THREE.PerspectiveCamera(
    75,
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

  // --- Level ---
  const level = await loadLevel('/levels/level7.json');
  const walkable = buildWalkableSet(level.charDefs);

  const dungeonGroup = buildDungeon(level.grid, level.defaults, level.areas, level.charDefs);
  scene.add(dungeonGroup);

  const gameState = new GameState(level.entities, level.grid);

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

  const player = new Player(
    camera,
    level.grid,
    level.playerStart.col,
    level.playerStart.row,
    level.playerStart.facing,
    walkable,
    gameState.isDoorOpen.bind(gameState),
  );

  // --- HUD ---
  const hud = new HudOverlay();
  hud.attach();

  // Reveal initial position
  const ps = player.getState();
  gameState.revealAround(ps.col, ps.row, ps.facing, level.grid);

  player.setOnMove((col, row) => {
    // Reveal explored cells on move
    gameState.revealAround(col, row, player.getState().facing, level.grid);
    // Key pickup
    const pickedUpKeyId = gameState.pickupKeyAt(col, row);
    if (pickedUpKeyId) {
      console.log(`Picked up key: ${pickedUpKeyId}`);
      hideKeyMesh(keyMeshes.meshMap, col, row);
    }

    // Pressure plate activation
    const plateTarget = gameState.activatePressurePlate(col, row);
    if (plateTarget) {
      console.log('Pressure plate activated.');
      const [dc, dr] = parseDoorKey(plateTarget);
      updateDoorMesh(doorMeshes.panelMap, dc, dr, true, doorAnimator);
      pressPlate(plateMeshes.meshMap, col, row);
    }
  });

  player.setOnTurn(() => {
    const s = player.getState();
    gameState.revealAround(s.col, s.row, s.facing, level.grid);
  });

  // --- Input ---
  const pressedKeys = new Set<string>();

  window.addEventListener('keydown', (e) => {
    if (pressedKeys.has(e.code)) return; // ignore key repeat
    pressedKeys.add(e.code);

    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW': player.moveForward(); break;
      case 'ArrowDown':
      case 'KeyS': player.moveBack(); break;
      case 'KeyA': player.strafeLeft(); break;
      case 'KeyD': player.strafeRight(); break;
      case 'ArrowLeft':
      case 'KeyQ': player.turnLeft(); break;
      case 'ArrowRight':
      case 'KeyE': player.turnRight(); break;
      case 'Space':
        {
          const result = interact(player.getState(), level.grid, gameState);
          if (result.message) {
            console.log(result.message);
          }
          if (result.type === 'door_opened' || result.type === 'door_unlocked') {
            const facing = getFacingCell(player.getState());
            updateDoorMesh(doorMeshes.panelMap, facing.col, facing.row, true, doorAnimator);
          }
          if (result.type === 'door_closed') {
            const facing = getFacingCell(player.getState());
            updateDoorMesh(doorMeshes.panelMap, facing.col, facing.row, false, doorAnimator);
          }
          if (result.type === 'lever_activated' && result.targetDoor) {
            const [dc, dr] = parseDoorKey(result.targetDoor);
            updateDoorMesh(doorMeshes.panelMap, dc, dr, gameState.isDoorOpen(dc, dr), doorAnimator);
            // Animate lever handle
            const leverKey = doorKey(player.getState().col, player.getState().row);
            const lever = gameState.levers.get(leverKey);
            if (lever) leverAnimator.setState(leverKey, lever.state);
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
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- Loop ---
  let lastTime = 0;

  function animate(time: number): void {
    const delta = Math.min((time - lastTime) / 1000, MAX_FRAME_DELTA);
    lastTime = time;

    player.update(delta);
    doorAnimator.update(delta);
    leverAnimator.update(delta);

    // Torch follows player with variable flicker
    const pos = player.getWorldPosition();
    torchLight.position.set(pos.x, pos.y + TORCH_OFFSET_Y, pos.z);
    flickerTimer -= delta;
    if (flickerTimer <= 0) {
      flickerTarget = FLICKER_BASE + Math.random() * FLICKER_RANGE;
      flickerTimer = FLICKER_MIN_INTERVAL + Math.random() * FLICKER_INTERVAL_RANGE;
    }
    torchLight.intensity += (flickerTarget - torchLight.intensity) * FLICKER_LERP;

    hud.draw(gameState, player.getState(), level.grid, delta);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

init().catch((err) => {
  console.error('Failed to initialize:', err);
  document.body.textContent = `Error: ${err.message}`;
});
