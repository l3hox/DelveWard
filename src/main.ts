import * as THREE from 'three';
import { buildDungeon } from './dungeon';
import { Player } from './player';
import { loadLevel } from './levelLoader';

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
  const level = await loadLevel('/levels/level3.json');

  buildDungeon(scene, level.grid);

  const player = new Player(
    camera,
    level.grid,
    level.playerStart.col,
    level.playerStart.row,
    level.playerStart.facing,
  );

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
      case 'ArrowLeft': player.turnLeft(); break;
      case 'ArrowRight': player.turnRight(); break;
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
  hint.textContent = 'W/↑ Forward   S/↓ Back   A Strafe Left   D Strafe Right   ←/→ Turn';
  document.body.appendChild(hint);

  // --- Loop ---
  let lastTime = 0;

  function animate(time: number): void {
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    player.update(delta);

    // Torch follows player with subtle flicker
    const pos = player.getWorldPosition();
    torchLight.position.set(pos.x, pos.y + 0.3, pos.z);
    torchLight.intensity = 2.8 + Math.random() * 0.4;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

init();
