import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState } from './gameState';

const KEY_SIZE = 0.4;
const KEY_HEIGHT = 0.15; // just above the floor

function generateKeyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;

  // Transparent background
  ctx.clearRect(0, 0, 32, 32);

  // Gold key shape
  ctx.fillStyle = '#DAA520';
  // Key ring (circle)
  ctx.beginPath();
  ctx.arc(10, 16, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(10, 16, 3, 0, Math.PI * 2);
  ctx.fill();

  // Key shaft
  ctx.fillStyle = '#DAA520';
  ctx.fillRect(16, 14, 12, 4);

  // Key teeth
  ctx.fillRect(24, 18, 4, 4);
  ctx.fillRect(20, 18, 3, 3);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

export interface KeyMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
}

export function buildKeyMeshes(gameState: GameState): KeyMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  const keyGeo = new THREE.PlaneGeometry(KEY_SIZE, KEY_SIZE);
  const keyTex = generateKeyTexture();
  const keyMat = new THREE.MeshBasicMaterial({
    map: keyTex,
    transparent: true,
    side: THREE.DoubleSide,
  });

  for (const [mapKey, keyInstance] of gameState.keys) {
    if (keyInstance.pickedUp) continue;

    const cx = keyInstance.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = keyInstance.row * CELL_SIZE + CELL_SIZE / 2;

    const mesh = new THREE.Mesh(keyGeo, keyMat);
    mesh.rotation.x = -Math.PI / 2; // flat on floor
    mesh.position.set(cx, KEY_HEIGHT, cz);

    group.add(mesh);
    meshMap.set(mapKey, mesh);
  }

  return { group, meshMap };
}

export function hideKeyMesh(
  meshMap: Map<string, THREE.Mesh>,
  col: number,
  row: number,
): void {
  const key = `${col},${row}`;
  const mesh = meshMap.get(key);
  if (mesh) {
    mesh.visible = false;
  }
}
