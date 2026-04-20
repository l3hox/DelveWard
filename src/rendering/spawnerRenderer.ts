import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState } from '../core/gameState';

function generateSpawnerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const cx = 32;
  const cy = 32;

  ctx.strokeStyle = '#6b1a3a';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - 28, cy);
  ctx.lineTo(cx + 28, cy);
  ctx.moveTo(cx, cy - 28);
  ctx.lineTo(cx, cy + 28);
  ctx.stroke();

  ctx.fillStyle = '#6b1a3a';
  for (const [dx, dy] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface SpawnerMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
}

export function buildSpawnerMeshes(gameState: GameState): SpawnerMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  const geo = new THREE.CircleGeometry(0.35, 16);
  const mat = new THREE.MeshLambertMaterial({
    map: generateSpawnerTexture(),
    transparent: true,
    opacity: 0.8,
  });

  for (const [key, spawner] of gameState.spawners) {
    if (!spawner.visible) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(
      spawner.col * CELL_SIZE + CELL_SIZE / 2,
      0.01,
      spawner.row * CELL_SIZE + CELL_SIZE / 2,
    );
    group.add(mesh);
    meshMap.set(key, mesh);
  }

  return { group, meshMap };
}
