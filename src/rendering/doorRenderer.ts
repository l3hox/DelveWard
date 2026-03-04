import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT } from './dungeon';
import { getDoorTexture, getLockedDoorTexture, getDoorFrameTexture } from './textures';
import type { GameState } from '../core/gameState';
import type { DoorAnimator } from './doorAnimator';

export type DoorOrientation = 'NS' | 'EW'; // NS = door faces N-S (blocks E-W passage), EW = door faces E-W (blocks N-S passage)

const FRAME_DEPTH = 0.15;
const FRAME_WIDTH = 0.15;

export function detectDoorOrientation(
  grid: string[],
  col: number,
  row: number,
  walkable: Set<string>,
): DoorOrientation {
  const rows = grid.length;
  const cols = grid[0].length;

  const northSolid = row - 1 < 0 || !walkable.has(grid[row - 1][col]);
  const southSolid = row + 1 >= rows || !walkable.has(grid[row + 1][col]);
  const eastSolid = col + 1 >= cols || !walkable.has(grid[row][col + 1]);
  const westSolid = col - 1 < 0 || !walkable.has(grid[row][col - 1]);

  // If walls on E and W -> passage runs N-S -> door faces E-W to block N-S passage
  if (eastSolid && westSolid) return 'EW';
  // If walls on N and S -> passage runs E-W -> door faces N-S to block E-W passage
  if (northSolid && southSolid) return 'NS';

  // Default: N-S facing (door blocks E-W passage)
  return 'NS';
}

export interface DoorMeshes {
  group: THREE.Group;
  panelMap: Map<string, THREE.Mesh>;
}

const BUTTON_SIZE = 0.06;
const BUTTON_DEPTH = 0.03;
const BUTTON_HEIGHT = 1.1; // slightly above center, near eye level

function addFrameButtons(frame: THREE.Group, buttonMat: THREE.Material): void {
  const panelWidth = CELL_SIZE - FRAME_WIDTH * 2;
  const buttonGeo = new THREE.BoxGeometry(BUTTON_SIZE, BUTTON_SIZE, BUTTON_DEPTH);

  // Button on left pillar — facing outward on both sides
  const leftButtonFront = new THREE.Mesh(buttonGeo, buttonMat);
  leftButtonFront.position.set(
    -panelWidth / 2 - FRAME_WIDTH / 2,
    BUTTON_HEIGHT,
    FRAME_DEPTH / 2 + BUTTON_DEPTH / 2,
  );
  frame.add(leftButtonFront);

  const leftButtonBack = new THREE.Mesh(buttonGeo, buttonMat);
  leftButtonBack.position.set(
    -panelWidth / 2 - FRAME_WIDTH / 2,
    BUTTON_HEIGHT,
    -(FRAME_DEPTH / 2 + BUTTON_DEPTH / 2),
  );
  frame.add(leftButtonBack);
}

function buildDoorFrame(orientation: DoorOrientation, cx: number, cz: number, frameMat: THREE.Material): THREE.Group {
  const frame = new THREE.Group();

  const panelWidth = CELL_SIZE - FRAME_WIDTH * 2;

  // Left pillar
  const pillarGeo = new THREE.BoxGeometry(FRAME_WIDTH, WALL_HEIGHT, FRAME_DEPTH);
  const leftPillar = new THREE.Mesh(pillarGeo, frameMat);
  leftPillar.position.set(-panelWidth / 2 - FRAME_WIDTH / 2, WALL_HEIGHT / 2, 0);
  frame.add(leftPillar);

  // Right pillar
  const rightPillar = new THREE.Mesh(pillarGeo, frameMat);
  rightPillar.position.set(panelWidth / 2 + FRAME_WIDTH / 2, WALL_HEIGHT / 2, 0);
  frame.add(rightPillar);

  // Lintel (top beam)
  const lintelGeo = new THREE.BoxGeometry(CELL_SIZE, FRAME_WIDTH, FRAME_DEPTH);
  const lintel = new THREE.Mesh(lintelGeo, frameMat);
  lintel.position.set(0, WALL_HEIGHT - FRAME_WIDTH / 2, 0);
  frame.add(lintel);

  frame.position.set(cx, 0, cz);

  if (orientation === 'NS') {
    frame.rotation.y = Math.PI / 2;
  }

  return frame;
}

export function buildDoorMeshes(
  grid: string[],
  gameState: GameState,
  walkable: Set<string>,
): DoorMeshes {
  const group = new THREE.Group();
  const panelMap = new Map<string, THREE.Mesh>();

  const panelWidth = CELL_SIZE - FRAME_WIDTH * 2;
  const panelHeight = WALL_HEIGHT - FRAME_WIDTH;
  const panelGeo = new THREE.BoxGeometry(panelWidth, panelHeight, 0.08);
  const doorMat = new THREE.MeshLambertMaterial({
    map: getDoorTexture(),
    side: THREE.DoubleSide,
  });
  const lockedDoorMat = new THREE.MeshLambertMaterial({
    map: getLockedDoorTexture(),
    side: THREE.DoubleSide,
  });
  const frameMat = new THREE.MeshLambertMaterial({
    map: getDoorFrameTexture(),
  });
  const buttonMat = new THREE.MeshLambertMaterial({ color: 0xcc8833 });

  for (const [key, door] of gameState.doors) {
    const { col, row } = door;
    const cx = col * CELL_SIZE + CELL_SIZE / 2;
    const cz = row * CELL_SIZE + CELL_SIZE / 2;

    const orientation = detectDoorOrientation(grid, col, row, walkable);

    // Frame (always visible)
    const frame = buildDoorFrame(orientation, cx, cz, frameMat);
    if (!door.mechanical) {
      addFrameButtons(frame, buttonMat);
    }
    group.add(frame);

    // Panel (toggles visibility)
    const mat = door.state === 'locked' ? lockedDoorMat : doorMat;
    const panel = new THREE.Mesh(panelGeo, mat);
    panel.position.set(cx, panelHeight / 2, cz);

    if (orientation === 'NS') {
      panel.rotation.y = Math.PI / 2;
    }

    panel.visible = door.state !== 'open';

    group.add(panel);
    panelMap.set(key, panel);
  }

  return { group, panelMap };
}

export function updateDoorMesh(
  panelMap: Map<string, THREE.Mesh>,
  col: number,
  row: number,
  isOpen: boolean,
  animator?: DoorAnimator,
): void {
  const key = `${col},${row}`;
  if (animator) {
    animator.setOpen(key, isOpen);
  } else {
    const mesh = panelMap.get(key);
    if (mesh) {
      mesh.visible = !isOpen;
    }
  }
}
