import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT, LAYER_HEIGHT } from './dungeon';
import { getFloorTexture, getWallTexture } from './textures';
import type { WallTextureName, FloorTextureName } from '../core/textureNames';
import type { Facing } from '../core/grid';
import type { GameState, RampInstance } from '../core/gameState';
import type { TextureSet, TextureArea, CharDef } from '../core/types';
import { resolveTextures } from '../core/textureResolver';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RAMP_STEP_COUNT = 8;
const RAMP_STEP_HEIGHT = LAYER_HEIGHT / RAMP_STEP_COUNT;  // 0.3125
const RAMP_STEP_DEPTH = CELL_SIZE / RAMP_STEP_COUNT;      // 0.25

const SLOPE_LENGTH = Math.sqrt(CELL_SIZE * CELL_SIZE + LAYER_HEIGHT * LAYER_HEIGHT);
const SLOPE_ANGLE = Math.atan2(LAYER_HEIGHT, CELL_SIZE);

// Canonical orientation: bottom at +Z (south), top at -Z (north).
// facing = direction from bottom to top. 'N' = top is north = canonical, no rotation.
const FACING_ROTATION: Record<Facing, number> = {
  N: 0,
  E: -Math.PI / 2,
  S: Math.PI,
  W: Math.PI / 2,
};

// ---------------------------------------------------------------------------
// Material caches — same pattern as stairRenderer.ts
// ---------------------------------------------------------------------------

const rampSlopeMats = new Map<string, THREE.MeshLambertMaterial>();
const rampSideMats = new Map<string, THREE.MeshLambertMaterial>();
const rampStepMats = new Map<string, THREE.MeshLambertMaterial>();

function getRampSlopeMaterial(name: FloorTextureName): THREE.MeshLambertMaterial {
  let mat = rampSlopeMats.get(name);
  if (!mat) {
    const tex = getFloorTexture(name);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    rampSlopeMats.set(name, mat);
  }
  return mat;
}

function getRampSideMaterial(name: WallTextureName): THREE.MeshLambertMaterial {
  let mat = rampSideMats.get(name);
  if (!mat) {
    const tex = getWallTexture(name);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    rampSideMats.set(name, mat);
  }
  return mat;
}

function getRampStepMaterial(name: FloorTextureName): THREE.MeshLambertMaterial {
  let mat = rampStepMats.get(name);
  if (!mat) {
    const tex = getFloorTexture(name);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    mat = new THREE.MeshLambertMaterial({ map: tex });
    rampStepMats.set(name, mat);
  }
  return mat;
}

// ---------------------------------------------------------------------------
// UV helpers
// ---------------------------------------------------------------------------

/**
 * Scale UVs of a BoxGeometry face set so the texture tiles proportionally.
 * BoxGeometry vertex order: +x(0-3), -x(4-7), +y(8-11), -y(12-15), +z(16-19), -z(20-23)
 */
function scaleBoxUVs(
  geo: THREE.BoxGeometry,
  w: number,
  h: number,
  d: number,
): void {
  const uv = geo.getAttribute('uv');
  const sw = w / CELL_SIZE;
  const sh = h / WALL_HEIGHT;
  const sd = d / CELL_SIZE;

  // ±x (side faces): U across depth, V across height
  for (const s of [0, 4]) {
    for (let j = 0; j < 4; j++) {
      uv.setX(s + j, uv.getX(s + j) * sd);
      uv.setY(s + j, uv.getY(s + j) * sh);
    }
  }
  // ±y (top/bottom): U across width, V across depth
  for (const s of [8, 12]) {
    for (let j = 0; j < 4; j++) {
      uv.setX(s + j, uv.getX(s + j) * sw);
      uv.setY(s + j, uv.getY(s + j) * sd);
    }
  }
  // ±z (front/back): U across width, V across height
  for (const s of [16, 20]) {
    for (let j = 0; j < 4; j++) {
      uv.setX(s + j, uv.getX(s + j) * sw);
      uv.setY(s + j, uv.getY(s + j) * sh);
    }
  }
  uv.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Triangular side-fill geometry
// ---------------------------------------------------------------------------

/**
 * Build a single triangular side wall at the given X position.
 * Vertices (in canonical orientation, bottom at +Z, top at -Z):
 *   bottom-front: (x, 0,            +CELL_SIZE/2)
 *   bottom-back:  (x, 0,            -CELL_SIZE/2)
 *   top-back:     (x, LAYER_HEIGHT, -CELL_SIZE/2)
 *
 * Normal faces outward along ±X.
 */
function buildTriangularSide(
  x: number,
  material: THREE.MeshLambertMaterial,
): THREE.Mesh {
  const half = CELL_SIZE / 2;

  // Two winding orders depending on which side — ensures normals face outward.
  // Left side (x < 0): outward normal is -X → winding CCW when viewed from -X
  // Right side (x > 0): outward normal is +X → winding CCW when viewed from +X
  const positions = x < 0
    ? new Float32Array([
        x, 0, half,           // bottom-front
        x, LAYER_HEIGHT, -half, // top-back
        x, 0, -half,          // bottom-back
      ])
    : new Float32Array([
        x, 0, half,           // bottom-front
        x, 0, -half,          // bottom-back
        x, LAYER_HEIGHT, -half, // top-back
      ]);

  // UVs: map the three vertices to a right-triangle portion of the texture.
  // U runs along Z (0 at front, 1 at back), V runs along Y (0 at bottom, 1 at top).
  const uvs = x < 0
    ? new Float32Array([
        0, 0,   // bottom-front
        1, 1,   // top-back
        1, 0,   // bottom-back
      ])
    : new Float32Array([
        0, 0,   // bottom-front
        1, 0,   // bottom-back
        1, 1,   // top-back
      ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();

  return new THREE.Mesh(geo, material);
}

// ---------------------------------------------------------------------------
// Ramp geometry (style: 'ramp') — smooth slope
// ---------------------------------------------------------------------------

function buildSmoothRamp(
  slopeMaterial: THREE.MeshLambertMaterial,
  sideMaterial: THREE.MeshLambertMaterial,
): THREE.Group {
  const group = new THREE.Group();

  // Slope surface — a PlaneGeometry tilted to the ramp angle.
  // PlaneGeometry default normal is +Z; rotating around X by -slopeAngle tilts the
  // top edge upward so it reaches Y=LAYER_HEIGHT at Z=-CELL_SIZE/2.
  const slopeGeo = new THREE.PlaneGeometry(CELL_SIZE, SLOPE_LENGTH);

  // Scale UVs so the texture tiles roughly 1:1 across the surface area.
  {
    const uv = slopeGeo.getAttribute('uv');
    const uScale = CELL_SIZE / CELL_SIZE;          // 1.0 — full width
    const vScale = SLOPE_LENGTH / CELL_SIZE;       // ~1.6 — proportional to length
    for (let i = 0; i < uv.count; i++) {
      uv.setX(i, uv.getX(i) * uScale);
      uv.setY(i, uv.getY(i) * vScale);
    }
    uv.needsUpdate = true;
  }

  slopeGeo.rotateX(-SLOPE_ANGLE);

  // After rotation the plane's center lands at Y=LAYER_HEIGHT/2, Z=0, which is
  // exactly the midpoint between the bottom edge (Y=0, Z=+half) and top edge
  // (Y=LAYER_HEIGHT, Z=-half).
  const slope = new THREE.Mesh(slopeGeo, slopeMaterial);
  slope.position.set(0, LAYER_HEIGHT / 2, 0);
  group.add(slope);

  // Triangular side fills
  const half = CELL_SIZE / 2;
  group.add(buildTriangularSide(-half, sideMaterial));
  group.add(buildTriangularSide(half, sideMaterial));

  return group;
}

// ---------------------------------------------------------------------------
// Stairs geometry (style: 'stairs') — stepped
// ---------------------------------------------------------------------------

function buildStairedRamp(
  stepMaterial: THREE.MeshLambertMaterial,
  sideMaterial: THREE.MeshLambertMaterial,
): THREE.Group {
  const group = new THREE.Group();

  // Stepped side fills — thin boxes on each side forming a staircase silhouette.
  // Built FIRST so we can size the step boxes to fit between them.
  const half = CELL_SIZE / 2;
  const sideThickness = 0.05;

  for (let i = 0; i < RAMP_STEP_COUNT; i++) {
    const stepHeight = RAMP_STEP_HEIGHT * (i + 1);
    const stepDepth = RAMP_STEP_DEPTH;
    const z = CELL_SIZE / 2 - stepDepth / 2 - i * stepDepth;

    for (const x of [-half + sideThickness / 2, half - sideThickness / 2]) {
      const geo = new THREE.BoxGeometry(sideThickness, stepHeight, stepDepth);
      scaleBoxUVs(geo, sideThickness, stepHeight, stepDepth);
      const mesh = new THREE.Mesh(geo, sideMaterial);
      mesh.position.set(x, stepHeight / 2, z);
      group.add(mesh);
    }
  }

  // Step boxes — narrowed to fit between the side fills (avoids Z-fighting).
  const stepWidth = CELL_SIZE - sideThickness * 2;
  for (let i = 0; i < RAMP_STEP_COUNT; i++) {
    const stepHeight = RAMP_STEP_HEIGHT * (i + 1);
    const stepDepth = RAMP_STEP_DEPTH;
    const z = CELL_SIZE / 2 - stepDepth / 2 - i * stepDepth;

    const geo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
    scaleBoxUVs(geo, stepWidth, stepHeight, stepDepth);

    const mesh = new THREE.Mesh(geo, stepMaterial);
    mesh.position.set(0, stepHeight / 2, z);
    group.add(mesh);
  }

  return group;
}

// ---------------------------------------------------------------------------
// Single ramp builder
// ---------------------------------------------------------------------------

function buildSingleRamp(
  ramp: RampInstance,
  grid: string[],
  defaults?: TextureSet,
  charDefs?: CharDef[],
  areas?: TextureArea[],
): THREE.Group {
  // Resolve textures from the ramp's cell context
  const charDefMap = new Map<string, CharDef>();
  if (charDefs) for (const def of charDefs) charDefMap.set(def.char, def);
  const char = (grid[ramp.row] && grid[ramp.row][ramp.col]) || '.';
  const resolved = resolveTextures(ramp.col, ramp.row, char, defaults, charDefMap, areas);
  const floorTex = resolved.floor;
  const wallTex = resolved.wall;

  let rampGroup: THREE.Group;

  if (ramp.style === 'stairs') {
    const stepMat = getRampStepMaterial(floorTex);
    const sideMat = getRampSideMaterial(wallTex);
    rampGroup = buildStairedRamp(stepMat, sideMat);
  } else {
    const slopeMat = getRampSlopeMaterial(floorTex);
    const sideMat = getRampSideMaterial(wallTex);
    rampGroup = buildSmoothRamp(slopeMat, sideMat);
  }

  // Rotate from canonical to the ramp's actual facing direction
  rampGroup.rotation.y = FACING_ROTATION[ramp.facing];

  // Position at the midpoint between bottom and top cell centers.
  // The ramp spans from center of bottom cell to center of top cell,
  // so shift by half a cell in the facing direction.
  const cx = ramp.col * CELL_SIZE + CELL_SIZE / 2;
  const cz = ramp.row * CELL_SIZE + CELL_SIZE / 2;
  // Apply facing offset in world space (before rotation)
  const facingOffsets: Record<Facing, [number, number]> = {
    N: [0, -CELL_SIZE / 2],
    S: [0, CELL_SIZE / 2],
    E: [CELL_SIZE / 2, 0],
    W: [-CELL_SIZE / 2, 0],
  };
  const [ox, oz] = facingOffsets[ramp.facing];
  rampGroup.position.set(cx + ox, 0, cz + oz);

  return rampGroup;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RampMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Group>;
}

export function buildRampMeshes(
  gameState: GameState,
  grid: string[],
  defaults?: TextureSet,
  charDefs?: CharDef[],
  areas?: TextureArea[],
): RampMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Group>();

  for (const [key, ramp] of gameState.ramps) {
    const rampGroup = buildSingleRamp(ramp, grid, defaults, charDefs, areas);
    group.add(rampGroup);
    meshMap.set(key, rampGroup);
  }

  return { group, meshMap };
}
