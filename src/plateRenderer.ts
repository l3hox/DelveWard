import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState } from './gameState';

const PLATE_SIZE = 0.8;
const PLATE_HEIGHT = 0.02;
const PLATE_Y = 0.01; // just above floor

function generatePlateTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;

  // Dark stone slab
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const v = 60 + Math.floor(Math.random() * 20);
      ctx.fillStyle = `rgb(${v},${v - 5},${v - 10})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Beveled edge — lighter top/left, darker bottom/right
  ctx.fillStyle = 'rgba(120, 115, 110, 0.5)';
  ctx.fillRect(0, 0, 32, 2);
  ctx.fillRect(0, 0, 2, 32);
  ctx.fillStyle = 'rgba(20, 18, 16, 0.5)';
  ctx.fillRect(0, 30, 32, 2);
  ctx.fillRect(30, 0, 2, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface PlateMeshes {
  group: THREE.Group;
}

export function buildPlateMeshes(gameState: GameState): PlateMeshes {
  const group = new THREE.Group();

  const geo = new THREE.BoxGeometry(PLATE_SIZE, PLATE_HEIGHT, PLATE_SIZE);
  const mat = new THREE.MeshLambertMaterial({ map: generatePlateTexture() });

  for (const plate of gameState.plates.values()) {
    const cx = plate.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = plate.row * CELL_SIZE + CELL_SIZE / 2;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, PLATE_Y, cz);
    group.add(mesh);
  }

  return { group };
}
