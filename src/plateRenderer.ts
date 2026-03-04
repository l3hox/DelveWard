import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState } from './gameState';

const PLATE_SIZE = 0.8;
const PLATE_HEIGHT = 0.02;
const PLATE_Y = 0.01; // just above floor
const PLATE_Y_PRESSED = -0.005; // sunk into floor

function generatePlateTexture(pressed: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;

  const base = pressed ? 40 : 60;
  const range = pressed ? 10 : 20;

  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const v = base + Math.floor(Math.random() * range);
      ctx.fillStyle = `rgb(${v},${v - 5},${v - 10})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Beveled edge
  if (!pressed) {
    ctx.fillStyle = 'rgba(120, 115, 110, 0.5)';
    ctx.fillRect(0, 0, 32, 2);
    ctx.fillRect(0, 0, 2, 32);
    ctx.fillStyle = 'rgba(20, 18, 16, 0.5)';
    ctx.fillRect(0, 30, 32, 2);
    ctx.fillRect(30, 0, 2, 32);
  } else {
    // Pressed: flat, no bevel, slight crack lines
    ctx.strokeStyle = 'rgba(20, 18, 16, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, 0); ctx.lineTo(10, 32);
    ctx.moveTo(22, 0); ctx.lineTo(20, 32);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface PlateMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
}

let normalMat: THREE.MeshLambertMaterial | null = null;
let pressedMat: THREE.MeshLambertMaterial | null = null;

export function buildPlateMeshes(gameState: GameState): PlateMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  const geo = new THREE.BoxGeometry(PLATE_SIZE, PLATE_HEIGHT, PLATE_SIZE);
  if (!normalMat) normalMat = new THREE.MeshLambertMaterial({ map: generatePlateTexture(false) });
  if (!pressedMat) pressedMat = new THREE.MeshLambertMaterial({ map: generatePlateTexture(true) });

  for (const [key, plate] of gameState.plates) {
    const cx = plate.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = plate.row * CELL_SIZE + CELL_SIZE / 2;

    const mat = plate.activated ? pressedMat : normalMat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, plate.activated ? PLATE_Y_PRESSED : PLATE_Y, cz);
    group.add(mesh);
    meshMap.set(key, mesh);
  }

  return { group, meshMap };
}

export function pressPlate(
  meshMap: Map<string, THREE.Mesh>,
  col: number,
  row: number,
): void {
  const key = `${col},${row}`;
  const mesh = meshMap.get(key);
  if (!mesh) return;
  if (!pressedMat) pressedMat = new THREE.MeshLambertMaterial({ map: generatePlateTexture(true) });
  mesh.material = pressedMat;
  mesh.position.y = PLATE_Y_PRESSED;
}
