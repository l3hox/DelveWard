import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState } from '../core/gameState';

export const BOULDER_RADIUS = CELL_SIZE * 0.4;

export interface BoulderMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
}

function generateBoulderTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const v = 70 + Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgb(${v},${v - 8},${v - 12})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  for (let i = 0; i < 10; i++) {
    const cx = Math.random() * 64;
    const cy = Math.random() * 64;
    const r = 2 + Math.random() * 4;
    ctx.fillStyle = `rgba(30,22,18,${0.15 + Math.random() * 0.15})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let boulderMat: THREE.MeshLambertMaterial | null = null;
let boulderGeo: THREE.SphereGeometry | null = null;

export function buildBoulderMeshes(gameState: GameState): BoulderMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  if (!boulderMat) boulderMat = new THREE.MeshLambertMaterial({ map: generateBoulderTexture() });
  if (!boulderGeo) boulderGeo = new THREE.SphereGeometry(BOULDER_RADIUS, 16, 12);

  for (const [key, boulder] of gameState.boulders) {
    const mesh = new THREE.Mesh(boulderGeo, boulderMat);
    mesh.position.set(
      boulder.col * CELL_SIZE + CELL_SIZE / 2,
      BOULDER_RADIUS,
      boulder.row * CELL_SIZE + CELL_SIZE / 2,
    );
    group.add(mesh);
    meshMap.set(key, mesh);
  }

  return { group, meshMap };
}

/** Build a single boulder mesh at runtime (used by boulder spawners). */
export function createSingleBoulderMesh(
  col: number,
  row: number,
  key: string,
  group: THREE.Group,
  meshMap: Map<string, THREE.Mesh>,
  yOffset: number,
): THREE.Mesh {
  if (!boulderMat) boulderMat = new THREE.MeshLambertMaterial({ map: generateBoulderTexture() });
  if (!boulderGeo) boulderGeo = new THREE.SphereGeometry(BOULDER_RADIUS, 16, 12);
  const mesh = new THREE.Mesh(boulderGeo, boulderMat);
  mesh.position.set(
    col * CELL_SIZE + CELL_SIZE / 2,
    BOULDER_RADIUS + yOffset,
    row * CELL_SIZE + CELL_SIZE / 2,
  );
  group.add(mesh);
  meshMap.set(key, mesh);
  return mesh;
}
