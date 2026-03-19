import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState } from '../core/gameState';
import type { Facing } from '../core/grid';

const SIGN_WIDTH = 0.4;
const SIGN_HEIGHT = 0.3;
const SIGN_Y = 1.1; // slightly below eye level

const WALL_DIR: Record<Facing, { dx: number; dz: number; rotY: number }> = {
  N: { dx: 0, dz: -1, rotY: 0 },
  S: { dx: 0, dz: 1, rotY: Math.PI },
  E: { dx: 1, dz: 0, rotY: -Math.PI / 2 },
  W: { dx: -1, dz: 0, rotY: Math.PI / 2 },
};

export interface SignMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
}

function generateSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  // Parchment base
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const v = Math.floor(Math.random() * 15);
      ctx.fillStyle = `rgb(${200 + v},${180 + v},${140 + v})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Dark border
  ctx.strokeStyle = 'rgba(80, 60, 30, 0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 30, 30);
  // Text lines hint
  ctx.fillStyle = 'rgba(60, 40, 20, 0.3)';
  for (let y = 8; y < 28; y += 5) {
    ctx.fillRect(5, y, 22, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let signMat: THREE.MeshLambertMaterial | null = null;

export function buildSignMeshes(gameState: GameState): SignMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  if (!signMat) signMat = new THREE.MeshLambertMaterial({ map: generateSignTexture() });
  const geo = new THREE.PlaneGeometry(SIGN_WIDTH, SIGN_HEIGHT);

  for (const [key, sign] of gameState.signs) {
    const cx = sign.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = sign.row * CELL_SIZE + CELL_SIZE / 2;

    const dir = WALL_DIR[sign.wall];
    const offsetDist = CELL_SIZE / 2 - 0.01; // just off the wall surface

    const mesh = new THREE.Mesh(geo, signMat);
    mesh.position.set(
      cx + dir.dx * offsetDist,
      SIGN_Y,
      cz + dir.dz * offsetDist,
    );
    mesh.rotation.y = dir.rotY;

    group.add(mesh);
    meshMap.set(key, mesh);
  }

  return { group, meshMap };
}
