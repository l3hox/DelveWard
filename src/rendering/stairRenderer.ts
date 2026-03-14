import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT } from './dungeon';
import { getFloorTexture, getWallTexture, getCeilingTexture } from './textures';
import type { DungeonLevel, TextureSet, TextureArea } from '../core/types';
import type { WallTextureName, FloorTextureName, CeilingTextureName } from '../core/textureNames';
import type { Facing } from '../core/grid';

const STEP_COUNT = 4;
const STEP_HEIGHT = 0.25;
const STEP_DEPTH = CELL_SIZE / STEP_COUNT;
const STEP_WIDTH = CELL_SIZE * 0.85;
const SIDE_WALL_THICKNESS = (CELL_SIZE - STEP_WIDTH) / 2; // fills gap from step edge to cell edge

// Pure black unlit material for the back wall (darkness beyond the stairwell)
const backWallMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

// Cached materials by texture name — same pattern as dungeon.ts
const stairStepMats = new Map<string, THREE.MeshLambertMaterial>();
const stairSideMats = new Map<string, THREE.MeshLambertMaterial>();
const stairCeilMats = new Map<string, THREE.MeshLambertMaterial>();

function getStairStepMaterial(name: FloorTextureName): THREE.MeshLambertMaterial {
  let mat = stairStepMats.get(name);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ map: getFloorTexture(name), vertexColors: true });
    stairStepMats.set(name, mat);
  }
  return mat;
}

function getStairSideMaterial(name: WallTextureName): THREE.MeshLambertMaterial {
  let mat = stairSideMats.get(name);
  if (!mat) {
    const tex = getWallTexture(name);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
    stairSideMats.set(name, mat);
  }
  return mat;
}

function getStairCeilingMaterial(name: CeilingTextureName): THREE.MeshLambertMaterial {
  let mat = stairCeilMats.get(name);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ map: getCeilingTexture(name), vertexColors: true });
    stairCeilMats.set(name, mat);
  }
  return mat;
}

/**
 * Add vertex colors that fade to black based on depth.
 * In canonical orientation, Z goes from +CELL_SIZE/2 (approach, bright) to -CELL_SIZE/2 (far, dark).
 * meshZ is the mesh's position in group-local Z so we compute the world-relative fade.
 */
function applyDepthFade(geo: THREE.BufferGeometry, meshZ: number): void {
  const pos = geo.getAttribute('position');
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const halfCell = CELL_SIZE / 2;

  for (let i = 0; i < count; i++) {
    const z = meshZ + pos.getZ(i);
    const t = (z + halfCell) / CELL_SIZE; // 0 at far end, 1 at approach
    const brightness = Math.max(0, Math.min(1, t));
    colors[i * 3] = brightness;
    colors[i * 3 + 1] = brightness;
    colors[i * 3 + 2] = brightness;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Resolve which floor and wall textures to use for a stair cell.
 * Layers: hard-coded defaults → level.defaults → level.areas (last match wins).
 * Intentionally omits charDefs — stair cells are built-in chars, not custom ones.
 */
function resolveStairTextures(
  col: number,
  row: number,
  defaults?: TextureSet,
  areas?: TextureArea[],
): { wall: WallTextureName; floor: FloorTextureName; ceiling: CeilingTextureName } {
  let wall: string = 'stone';
  let floor: string = 'stone_tile';
  let ceiling: string = 'dark_rock';

  if (defaults) {
    if (defaults.wallTexture) wall = defaults.wallTexture;
    if (defaults.floorTexture) floor = defaults.floorTexture;
    if (defaults.ceilingTexture) ceiling = defaults.ceilingTexture;
  }

  if (areas) {
    for (const area of areas) {
      if (col >= area.fromCol && col <= area.toCol && row >= area.fromRow && row <= area.toRow) {
        if (area.wallTexture) wall = area.wallTexture;
        if (area.floorTexture) floor = area.floorTexture;
        if (area.ceilingTexture) ceiling = area.ceilingTexture;
      }
    }
  }

  return {
    wall: wall as WallTextureName,
    floor: floor as FloorTextureName,
    ceiling: ceiling as CeilingTextureName,
  };
}

const FACING_ROTATION: Record<Facing, number> = {
  S: 0,           // canonical: approach from south (walk north into stairs)
  W: Math.PI / 2,
  N: Math.PI,
  E: -Math.PI / 2,
};

/**
 * Detect which direction a stair cell faces by finding the adjacent walkable cell.
 * The stairs face toward the walkable neighbor (that's the approach direction).
 */
export function detectStairFacing(
  grid: string[],
  col: number,
  row: number,
  walkable: Set<string>,
): Facing {
  const neighbors: { facing: Facing; dc: number; dr: number }[] = [
    { facing: 'N', dc: 0, dr: -1 },
    { facing: 'S', dc: 0, dr: 1 },
    { facing: 'E', dc: 1, dr: 0 },
    { facing: 'W', dc: -1, dr: 0 },
  ];

  for (const { facing, dc, dr } of neighbors) {
    const nc = col + dc;
    const nr = row + dr;
    if (nr < 0 || nr >= grid.length) continue;
    if (nc < 0 || nc >= grid[nr].length) continue;
    const cell = grid[nr][nc];
    // Walkable neighbor that isn't itself a stair cell
    if (walkable.has(cell) && cell !== 'S' && cell !== 'U') {
      return facing;
    }
  }

  return 'S'; // fallback
}

/**
 * Build a group of stair step meshes for one cell.
 * Built in canonical orientation (approach from south, stairs go north),
 * then rotated by facing.
 *
 * DOWN (S): step 0 at Y=0, each next step 0.25 lower (descending away)
 * UP (U):   step 0 at Y=0.25, each next step 0.25 higher (ascending away)
 */
function buildStairGroup(
  cellChar: string,
  facing: Facing,
  stepMaterial: THREE.MeshLambertMaterial,
  sideMaterial: THREE.MeshLambertMaterial,
  ceilingMaterial: THREE.MeshLambertMaterial,
): THREE.Group {
  const group = new THREE.Group();
  const isDown = cellChar === 'S';

  // Floor steps — each step is a thin slab at the correct Y for its tread
  for (let i = 0; i < STEP_COUNT; i++) {
    const z = CELL_SIZE / 2 - STEP_DEPTH / 2 - i * STEP_DEPTH;

    if (isDown) {
      // Descending: step 0 top at Y=0, step 1 top at Y=-0.25, etc.
      const topY = -i * STEP_HEIGHT;
      const geo = new THREE.BoxGeometry(STEP_WIDTH, STEP_HEIGHT, STEP_DEPTH);
      applyDepthFade(geo, z);
      const mesh = new THREE.Mesh(geo, stepMaterial);
      mesh.position.set(0, topY - STEP_HEIGHT / 2, z);
      group.add(mesh);
    } else {
      // Ascending: step 0 top at Y=0.25, step 1 top at Y=0.50, etc.
      const stepHeight = (i + 1) * STEP_HEIGHT;
      const geo = new THREE.BoxGeometry(STEP_WIDTH, stepHeight, STEP_DEPTH);
      applyDepthFade(geo, z);
      const mesh = new THREE.Mesh(geo, stepMaterial);
      mesh.position.set(0, stepHeight / 2, z);
      group.add(mesh);
    }
  }

  // Ceiling steps — mirror the floor steps on the ceiling
  for (let i = 0; i < STEP_COUNT; i++) {
    const z = CELL_SIZE / 2 - STEP_DEPTH / 2 - i * STEP_DEPTH;
    let bottomY = WALL_HEIGHT;

    if (isDown) {
      // Ceiling descends with the floor: step 0 bottom at WALL_HEIGHT, each next lower
      bottomY -= i * STEP_HEIGHT;
    } else {
      // Ceiling descends with the floor: step 0 bottom at WALL_HEIGHT, each next higher
      bottomY += i * STEP_HEIGHT;
    }

    const geo = new THREE.BoxGeometry(STEP_WIDTH, STEP_HEIGHT, STEP_DEPTH);
    applyDepthFade(geo, z);
    const mesh = new THREE.Mesh(geo, ceilingMaterial);
    mesh.position.set(0, bottomY + STEP_HEIGHT / 2, z);
    group.add(mesh);
  }

  // Side walls — extend one extra floor in the stair direction
  const sideWallHeight = WALL_HEIGHT * 2;
  const sideGeo = new THREE.BoxGeometry(SIDE_WALL_THICKNESS, sideWallHeight, CELL_SIZE);

  // Fix UVs so textures aren't squeezed or stretched.
  // BoxGeometry face order: +x(0-3), -x(4-7), +y(8-11), -y(12-15), +z(16-19), -z(20-23)
  const uRatio = SIDE_WALL_THICKNESS / CELL_SIZE;
  const vRatio = sideWallHeight / WALL_HEIGHT;
  const uv = sideGeo.getAttribute('uv');
  // ±x faces (large inner/outer): V spans sideWallHeight, scale to repeat
  for (const faceStart of [0, 4]) {
    for (let j = 0; j < 4; j++) {
      uv.setY(faceStart + j, uv.getY(faceStart + j) * vRatio);
    }
  }
  // ±y faces (top/bottom): U spans thin width, scale down
  for (const faceStart of [8, 12]) {
    for (let j = 0; j < 4; j++) {
      uv.setX(faceStart + j, uv.getX(faceStart + j) * uRatio);
    }
  }
  // ±z faces (front/back): U spans thin width, V spans tall height
  for (const faceStart of [16, 20]) {
    for (let j = 0; j < 4; j++) {
      uv.setX(faceStart + j, uv.getX(faceStart + j) * uRatio);
      uv.setY(faceStart + j, uv.getY(faceStart + j) * vRatio);
    }
  }
  uv.needsUpdate = true;

  applyDepthFade(sideGeo, 0);

  const leftWall = new THREE.Mesh(sideGeo, sideMaterial);
  leftWall.position.set(
    -STEP_WIDTH / 2 - SIDE_WALL_THICKNESS / 2,
    isDown ? 0 : WALL_HEIGHT,
    0,
  );
  group.add(leftWall);

  const rightWall = new THREE.Mesh(sideGeo, sideMaterial);
  rightWall.position.set(
    STEP_WIDTH / 2 + SIDE_WALL_THICKNESS / 2,
    isDown ? 0 : WALL_HEIGHT,
    0,
  );
  group.add(rightWall);

  // Back wall — pure black at the far end of the stairwell, covers two floors
  const backWallH = WALL_HEIGHT * 2;
  const backWallGeo = new THREE.PlaneGeometry(STEP_WIDTH, backWallH);
  const backWall = new THREE.Mesh(backWallGeo, backWallMat);
  backWall.position.set(0, backWallH / 2 - WALL_HEIGHT / 2, -CELL_SIZE / 2);
  // PlaneGeometry default normal is +Z, which already faces toward the approach
  group.add(backWall);

  // Rotate to match facing direction
  group.rotation.y = FACING_ROTATION[facing];

  return group;
}

export interface StairMeshes {
  group: THREE.Group;
}

export function buildStairMeshes(
  level: DungeonLevel,
  walkable: Set<string>,
): StairMeshes {
  const group = new THREE.Group();

  for (let row = 0; row < level.grid.length; row++) {
    const line = level.grid[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch !== 'S' && ch !== 'U') continue;

      const facing = detectStairFacing(level.grid, col, row, walkable);
      const tex = resolveStairTextures(col, row, level.defaults, level.areas);
      const stepMat = getStairStepMaterial(tex.floor);
      const sideMat = getStairSideMaterial(tex.wall);
      const ceilMat = getStairCeilingMaterial(tex.ceiling);
      const stairGroup = buildStairGroup(ch, facing, stepMat, sideMat, ceilMat);

      // Position at cell center
      const cx = col * CELL_SIZE + CELL_SIZE / 2;
      const cz = row * CELL_SIZE + CELL_SIZE / 2;
      stairGroup.position.set(cx, 0, cz);

      group.add(stairGroup);
    }
  }

  return { group };
}
