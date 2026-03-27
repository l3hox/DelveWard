import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT } from './dungeon';
import { getDoorTexture, getLockedDoorTexture, getDoorFrameTexture } from './textures';
import { doorKey, type GameState } from '../core/gameState';
import type { DoorAnimator } from './doorAnimator';

export type DoorOrientation = 'NS' | 'EW'; // NS = door faces N-S (blocks E-W passage), EW = door faces E-W (blocks N-S passage)

const FRAME_DEPTH = 0.15;
const FRAME_WIDTH = 0.15;

/**
 * Scale BoxGeometry UVs so each face samples proportional texture,
 * preventing squeeze on thin dimensions.
 * refSize = the size the texture looks correct at (CELL_SIZE).
 */
function fixBoxUVs(geo: THREE.BoxGeometry, w: number, h: number, d: number, refSize: number): void {
  const uv = geo.getAttribute('uv');
  const sw = w / refSize;
  const sh = h / refSize;
  const sd = d / refSize;

  // Face order: +x(0-3), -x(4-7), +y(8-11), -y(12-15), +z(16-19), -z(20-23)
  // ±x: U across depth, V across height
  for (const s of [0, 4]) {
    for (let j = 0; j < 4; j++) {
      uv.setX(s + j, uv.getX(s + j) * sd);
      uv.setY(s + j, uv.getY(s + j) * sh);
    }
  }
  // ±y: U across width, V across depth
  for (const s of [8, 12]) {
    for (let j = 0; j < 4; j++) {
      uv.setX(s + j, uv.getX(s + j) * sw);
      uv.setY(s + j, uv.getY(s + j) * sd);
    }
  }
  // ±z: U across width, V across height
  for (const s of [16, 20]) {
    for (let j = 0; j < 4; j++) {
      uv.setX(s + j, uv.getX(s + j) * sw);
      uv.setY(s + j, uv.getY(s + j) * sh);
    }
  }
  uv.needsUpdate = true;
}

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
  panelMap: Map<string, THREE.Object3D>;
  orientationMap: Map<string, DoorOrientation>;
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

// splitZones: if provided, [negZ zone layer, posZ zone layer] in local frame space.
// The frame is split along local Z (the through-passage axis) so each half
// belongs to its respective environment zone for multi-pass rendering.
function buildDoorFrame(
  orientation: DoorOrientation, cx: number, cz: number, frameMat: THREE.Material,
  splitZones?: [number, number],
): THREE.Group {
  const frame = new THREE.Group();

  const panelWidth = CELL_SIZE - FRAME_WIDTH * 2;
  const halfDepth = FRAME_DEPTH / 2;

  if (splitZones) {
    // Split each piece in half along Z axis
    const halfPillarGeo = new THREE.BoxGeometry(FRAME_WIDTH, WALL_HEIGHT, halfDepth);
    fixBoxUVs(halfPillarGeo, FRAME_WIDTH, WALL_HEIGHT, halfDepth, CELL_SIZE);
    const halfLintelGeo = new THREE.BoxGeometry(CELL_SIZE, FRAME_WIDTH, halfDepth);
    fixBoxUVs(halfLintelGeo, CELL_SIZE, FRAME_WIDTH, halfDepth, CELL_SIZE);

    const pillarX = [-panelWidth / 2 - FRAME_WIDTH / 2, panelWidth / 2 + FRAME_WIDTH / 2];
    for (const px of pillarX) {
      // Negative Z half
      const pNeg = new THREE.Mesh(halfPillarGeo, frameMat);
      pNeg.position.set(px, WALL_HEIGHT / 2, -halfDepth / 2);
      pNeg.layers.set(splitZones[0]);
      frame.add(pNeg);
      // Positive Z half
      const pPos = new THREE.Mesh(halfPillarGeo, frameMat);
      pPos.position.set(px, WALL_HEIGHT / 2, halfDepth / 2);
      pPos.layers.set(splitZones[1]);
      frame.add(pPos);
    }

    // Lintel halves
    const lNeg = new THREE.Mesh(halfLintelGeo, frameMat);
    lNeg.position.set(0, WALL_HEIGHT - FRAME_WIDTH / 2, -halfDepth / 2);
    lNeg.layers.set(splitZones[0]);
    frame.add(lNeg);
    const lPos = new THREE.Mesh(halfLintelGeo, frameMat);
    lPos.position.set(0, WALL_HEIGHT - FRAME_WIDTH / 2, halfDepth / 2);
    lPos.layers.set(splitZones[1]);
    frame.add(lPos);
  } else {
    // Normal unsplit frame
    const pillarGeo = new THREE.BoxGeometry(FRAME_WIDTH, WALL_HEIGHT, FRAME_DEPTH);
    fixBoxUVs(pillarGeo, FRAME_WIDTH, WALL_HEIGHT, FRAME_DEPTH, CELL_SIZE);
    const leftPillar = new THREE.Mesh(pillarGeo, frameMat);
    leftPillar.position.set(-panelWidth / 2 - FRAME_WIDTH / 2, WALL_HEIGHT / 2, 0);
    frame.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, frameMat);
    rightPillar.position.set(panelWidth / 2 + FRAME_WIDTH / 2, WALL_HEIGHT / 2, 0);
    frame.add(rightPillar);

    const lintelGeo = new THREE.BoxGeometry(CELL_SIZE, FRAME_WIDTH, FRAME_DEPTH);
    fixBoxUVs(lintelGeo, CELL_SIZE, FRAME_WIDTH, FRAME_DEPTH, CELL_SIZE);
    const lintel = new THREE.Mesh(lintelGeo, frameMat);
    lintel.position.set(0, WALL_HEIGHT - FRAME_WIDTH / 2, 0);
    frame.add(lintel);
  }

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
  envZoneMap?: Map<string, number>,
): DoorMeshes {
  const group = new THREE.Group();
  const panelMap = new Map<string, THREE.Object3D>();
  const orientationMap = new Map<string, DoorOrientation>();

  const panelWidth = CELL_SIZE - FRAME_WIDTH * 2;
  const panelHeight = WALL_HEIGHT - FRAME_WIDTH;
  const panelDepth = 0.08;
  const panelGeo = new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth);
  // Fix UVs only on thin edges (sides ±x, top/bottom ±y) — leave front/back ±z as default
  {
    const uv = panelGeo.getAttribute('uv');
    const sd = panelDepth / CELL_SIZE;
    const sh = panelHeight / CELL_SIZE;
    const sw = panelWidth / CELL_SIZE;
    // ±x (side edges): U across depth, V across height
    for (const s of [0, 4]) {
      for (let j = 0; j < 4; j++) {
        uv.setX(s + j, uv.getX(s + j) * sd);
        uv.setY(s + j, uv.getY(s + j) * sh);
      }
    }
    // ±y (top/bottom edges): U across width, V across depth
    for (const s of [8, 12]) {
      for (let j = 0; j < 4; j++) {
        uv.setX(s + j, uv.getX(s + j) * sw);
        uv.setY(s + j, uv.getY(s + j) * sd);
      }
    }
    uv.needsUpdate = true;
  }
  const doorMat = new THREE.MeshLambertMaterial({
    map: getDoorTexture(),
    side: THREE.DoubleSide,
  });
  const lockedDoorMat = new THREE.MeshLambertMaterial({
    map: getLockedDoorTexture(),
    side: THREE.DoubleSide,
  });
  const frameTex = getDoorFrameTexture();
  frameTex.wrapS = THREE.RepeatWrapping;
  frameTex.wrapT = THREE.RepeatWrapping;
  const frameMat = new THREE.MeshLambertMaterial({
    map: frameTex,
  });
  const buttonMat = new THREE.MeshLambertMaterial({ color: 0xcc8833 });

  for (const [key, door] of gameState.doors) {
    const { col, row } = door;
    const cx = col * CELL_SIZE + CELL_SIZE / 2;
    const cz = row * CELL_SIZE + CELL_SIZE / 2;

    const orientation = detectDoorOrientation(grid, col, row, walkable);

    // Compute split zones for boundary doors (multi-pass environment rendering)
    let splitZones: [number, number] | undefined;
    const cellZone = envZoneMap?.get(doorKey(col, row));
    if (envZoneMap && cellZone !== undefined) {
      // In local frame space, -Z is one side and +Z is the other.
      // For EW doors (passage runs N-S): -Z = north neighbor, +Z = south neighbor
      // For NS doors (passage runs E-W, frame rotated 90°): -Z maps to west, +Z to east
      let negZKey: string, posZKey: string;
      if (orientation === 'EW') {
        negZKey = doorKey(col, row - 1); // north
        posZKey = doorKey(col, row + 1); // south
      } else {
        negZKey = doorKey(col - 1, row); // west (after 90° rotation, local -Z = world -X)
        posZKey = doorKey(col + 1, row); // east
      }
      const negZone = envZoneMap.get(negZKey);
      const posZone = envZoneMap.get(posZKey);
      if (negZone !== undefined && posZone !== undefined && negZone !== posZone) {
        splitZones = [negZone, posZone];
      }
    }

    // Frame (always visible)
    const frame = buildDoorFrame(orientation, cx, cz, frameMat, splitZones);
    if (!door.mechanical) {
      const childCountBefore = frame.children.length;
      addFrameButtons(frame, buttonMat);
      // Tag buttons (added after frame pieces) to their side's zone
      if (splitZones) {
        for (let ci = childCountBefore; ci < frame.children.length; ci++) {
          const btn = frame.children[ci];
          if (btn.position.z < 0) btn.layers.set(splitZones[0]);
          else btn.layers.set(splitZones[1]);
        }
      }
    }
    // Tag non-split frame children to cell zone
    if (!splitZones && cellZone !== undefined) {
      frame.traverse(c => { c.layers.set(cellZone); });
    }
    group.add(frame);

    // Panel (toggles visibility via animator)
    const mat = door.keyId ? lockedDoorMat : doorMat;

    let panelObj: THREE.Object3D;
    if (splitZones) {
      // Split panel into two half-depth meshes, each tagged to its side's zone
      const halfPanelGeo = new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth / 2);
      // Fix UVs on half panels (same pattern as full panel but half depth)
      {
        const uv = halfPanelGeo.getAttribute('uv');
        const sd = (panelDepth / 2) / CELL_SIZE;
        const sh = panelHeight / CELL_SIZE;
        const sw = panelWidth / CELL_SIZE;
        for (const s of [0, 4]) {
          for (let j = 0; j < 4; j++) {
            uv.setX(s + j, uv.getX(s + j) * sd);
            uv.setY(s + j, uv.getY(s + j) * sh);
          }
        }
        for (const s of [8, 12]) {
          for (let j = 0; j < 4; j++) {
            uv.setX(s + j, uv.getX(s + j) * sw);
            uv.setY(s + j, uv.getY(s + j) * sd);
          }
        }
        uv.needsUpdate = true;
      }

      const panelGroup = new THREE.Group();
      const panelNeg = new THREE.Mesh(halfPanelGeo, mat);
      panelNeg.position.set(0, 0, -panelDepth / 4);
      panelNeg.layers.set(splitZones[0]);
      panelGroup.add(panelNeg);

      const panelPos = new THREE.Mesh(halfPanelGeo, mat);
      panelPos.position.set(0, 0, panelDepth / 4);
      panelPos.layers.set(splitZones[1]);
      panelGroup.add(panelPos);

      panelGroup.position.set(cx, panelHeight / 2, cz);
      if (orientation === 'NS') {
        panelGroup.rotation.y = Math.PI / 2;
      }
      panelGroup.visible = door.state !== 'open';
      panelObj = panelGroup;
    } else {
      const panel = new THREE.Mesh(panelGeo, mat);
      panel.position.set(cx, panelHeight / 2, cz);
      if (orientation === 'NS') {
        panel.rotation.y = Math.PI / 2;
      }
      panel.visible = door.state !== 'open';
      if (cellZone !== undefined) {
        panel.layers.set(cellZone);
      }
      panelObj = panel;
    }

    group.add(panelObj);
    panelMap.set(key, panelObj);
    orientationMap.set(key, orientation);
  }

  return { group, panelMap, orientationMap };
}

export function updateDoorMesh(
  panelMap: Map<string, THREE.Object3D>,
  col: number,
  row: number,
  isOpen: boolean,
  animator?: DoorAnimator,
): void {
  const key = doorKey(col, row);
  if (animator) {
    animator.setOpen(key, isOpen);
  } else {
    const mesh = panelMap.get(key);
    if (mesh) {
      mesh.visible = !isOpen;
    }
  }
}
