import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { doorKey, type GameState } from '../core/gameState';
import type { Facing } from '../core/grid';

const FACING_ROT: Record<Facing, number> = {
  S: 0,
  W: Math.PI / 2,
  N: Math.PI,
  E: -Math.PI / 2,
};

const CHEST_WIDTH = 0.6;
const CHEST_DEPTH = 0.4;
const CHEST_BODY_HEIGHT = 0.3;
const CHEST_LID_HEIGHT = 0.12;
const CHEST_Y = 0.01; // just above floor

export interface ChestMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Group>; // keyed by "col,row", each contains body + lid pivot
}

function generateChestTexture(isLid: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const baseR = isLid ? 100 : 80;
  const baseG = isLid ? 60 : 45;
  const baseB = isLid ? 30 : 20;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const v = Math.floor(Math.random() * 20);
      ctx.fillStyle = `rgb(${baseR + v},${baseG + v},${baseB + v})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Wood grain lines
  ctx.strokeStyle = `rgba(${baseR - 20},${baseG - 15},${baseB - 10},0.3)`;
  ctx.lineWidth = 1;
  for (let y = 4; y < 32; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.random() * 2);
    ctx.lineTo(32, y + Math.random() * 2);
    ctx.stroke();
  }
  // Metal band
  if (!isLid) {
    ctx.fillStyle = 'rgba(60, 60, 65, 0.5)';
    ctx.fillRect(0, 14, 32, 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let bodyMat: THREE.MeshLambertMaterial | null = null;
let lidMat: THREE.MeshLambertMaterial | null = null;
const claspMat = new THREE.MeshLambertMaterial({ color: 0xccaa33 });

export function buildChestMeshes(gameState: GameState): ChestMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Group>();

  if (!bodyMat) bodyMat = new THREE.MeshLambertMaterial({ map: generateChestTexture(false) });
  if (!lidMat) lidMat = new THREE.MeshLambertMaterial({ map: generateChestTexture(true) });

  const bodyGeo = new THREE.BoxGeometry(CHEST_WIDTH, CHEST_BODY_HEIGHT, CHEST_DEPTH);
  const lidGeo = new THREE.BoxGeometry(CHEST_WIDTH, CHEST_LID_HEIGHT, CHEST_DEPTH);
  const claspGeo = new THREE.BoxGeometry(0.08, 0.06, 0.02);

  for (const [key, chest] of gameState.chests) {
    const cx = chest.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = chest.row * CELL_SIZE + CELL_SIZE / 2;

    const chestGroup = new THREE.Group();

    // Body
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, CHEST_BODY_HEIGHT / 2, 0);
    chestGroup.add(body);

    // Clasp on front
    const clasp = new THREE.Mesh(claspGeo, claspMat);
    clasp.position.set(0, CHEST_BODY_HEIGHT / 2, CHEST_DEPTH / 2 + 0.01);
    chestGroup.add(clasp);

    // Lid pivot — positioned at back top edge of body
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, CHEST_BODY_HEIGHT, -CHEST_DEPTH / 2);

    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.set(0, CHEST_LID_HEIGHT / 2, CHEST_DEPTH / 2);
    lidPivot.add(lid);

    // Set initial state
    if (chest.state === 'open') {
      lidPivot.rotation.x = -Math.PI / 4; // open upward
    }

    chestGroup.add(lidPivot);
    chestGroup.position.set(cx, CHEST_Y, cz);
    chestGroup.rotation.y = FACING_ROT[chest.facing ?? 'S'];

    group.add(chestGroup);
    meshMap.set(key, chestGroup);
  }

  return { group, meshMap };
}

export function openChestMesh(
  meshMap: Map<string, THREE.Group>,
  col: number,
  row: number,
): void {
  const key = doorKey(col, row);
  const chestGroup = meshMap.get(key);
  if (!chestGroup) return;

  // Find the lid pivot (last child of the chest group that is a Group)
  const lidPivot = chestGroup.children.find(
    c => c instanceof THREE.Group,
  ) as THREE.Group | undefined;
  if (!lidPivot) return;

  // Animate lid opening (negative = upward)
  const targetAngle = -Math.PI / 4;
  const duration = 400; // ms
  const startAngle = lidPivot.rotation.x;
  const startTime = performance.now();

  function animate(): void {
    const elapsed = performance.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = t * (2 - t); // ease-out
    lidPivot!.rotation.x = startAngle + (targetAngle - startAngle) * eased;
    if (t < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

export function closeChestMesh(
  meshMap: Map<string, THREE.Group>,
  col: number,
  row: number,
): void {
  const key = doorKey(col, row);
  const chestGroup = meshMap.get(key);
  if (!chestGroup) return;

  const lidPivot = chestGroup.children.find(
    c => c instanceof THREE.Group,
  ) as THREE.Group | undefined;
  if (!lidPivot) return;

  // Animate lid closing
  const duration = 400;
  const startAngle = lidPivot.rotation.x;
  const startTime = performance.now();

  function animate(): void {
    const elapsed = performance.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = t * (2 - t);
    lidPivot!.rotation.x = startAngle * (1 - eased);
    if (t < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
