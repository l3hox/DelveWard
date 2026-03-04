import * as THREE from 'three';
import { buildDungeon } from './dungeon';
import { Player } from './player';
import { loadLevel } from './levelLoader';
import { buildWalkableSet, getFacingCell } from './grid';
import { GameState } from './gameState';
import { interact } from './interaction';
import { buildDoorMeshes, updateDoorMesh } from './doorRenderer';
import { buildKeyMeshes, hideKeyMesh } from './keyRenderer';
import { buildPlateMeshes, pressPlate } from './plateRenderer';
import { buildLeverMeshes, LeverAnimator } from './leverRenderer';
import { DoorAnimator } from './doorAnimator';

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

  const torchLight = new THREE.PointLight(0xff8844, 3, 8);
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

  player.setOnMove((col, row) => {
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
      const [dc, dr] = plateTarget.split(',').map(Number);
      updateDoorMesh(doorMeshes.panelMap, dc, dr, true, doorAnimator);
      pressPlate(plateMeshes.meshMap, col, row);
    }
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
            const [dc, dr] = result.targetDoor.split(',').map(Number);
            updateDoorMesh(doorMeshes.panelMap, dc, dr, gameState.isDoorOpen(dc, dr), doorAnimator);
            // Animate lever handle
            const leverKey = `${player.getState().gridX},${player.getState().gridZ}`;
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

  // --- Controls hint ---
  const hint = document.createElement('div');
  hint.style.cssText =
    'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);' +
    'color:#555;font:12px monospace;text-align:center;pointer-events:none;white-space:nowrap';
  hint.textContent = 'W/↑ Forward   S/↓ Back   A Strafe Left   D Strafe Right   Q/← Turn Left   E/→ Turn Right   Space Interact';
  document.body.appendChild(hint);

  // --- Loop ---
  let lastTime = 0;

  function animate(time: number): void {
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    player.update(delta);
    doorAnimator.update(delta);
    leverAnimator.update(delta);

    // Torch follows player with subtle flicker
    const pos = player.getWorldPosition();
    torchLight.position.set(pos.x, pos.y + 0.3, pos.z);
    torchLight.intensity = 2.8 + Math.random() * 0.4;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

init().catch((err) => {
  console.error('Failed to initialize:', err);
  document.body.textContent = `Error: ${err.message}`;
});
