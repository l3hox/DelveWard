import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState } from '../core/gameState';
import { createNeutralLitMaterial } from './billboardMaterial';

const KEY_SIZE = 0.4;
const KEY_HEIGHT = KEY_SIZE / 2 + 0.02; // center of billboard just above ground

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
  const keyMat = createNeutralLitMaterial(keyTex);

  for (const [mapKey, keyInstance] of gameState.keys) {
    if (keyInstance.pickedUp) continue;

    const cx = keyInstance.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = keyInstance.row * CELL_SIZE + CELL_SIZE / 2;

    const mesh = new THREE.Mesh(keyGeo, keyMat);
    mesh.position.set(cx, KEY_HEIGHT, cz);

    group.add(mesh);
    meshMap.set(mapKey, mesh);
  }

  return { group, meshMap };
}

export function hideKeyMesh(
  meshMap: Map<string, THREE.Mesh>,
  key: string,
): void {
  const mesh = meshMap.get(key);
  if (mesh) {
    mesh.removeFromParent();
    meshMap.delete(key);
  }
}

export function updateKeyBillboards(meshMap: Map<string, THREE.Mesh>, camera: THREE.Camera): void {
  const facing = camera.rotation.y;
  for (const mesh of meshMap.values()) {
    mesh.rotation.y = facing;
  }
}
