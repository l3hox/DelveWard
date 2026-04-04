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
// Side wall extensions for the far half of the top cell
// ---------------------------------------------------------------------------

/**
 * The ramp geometry spans from center of bottom cell to center of top cell.
 * The far half of the top cell (beyond the ramp end) has no geometry from the
 * dungeon builder (it's a # wall cell). Add full-height side walls covering
 * that gap: from Z = -CELL_SIZE/2 to Z = -CELL_SIZE in canonical orientation.
 */
function buildTopCellSideWalls(
  material: THREE.MeshLambertMaterial,
): THREE.Group {
  const group = new THREE.Group();
  const half = CELL_SIZE / 2;
  const zNear = -half;         // where the ramp geometry ends
  const zFar = -CELL_SIZE;     // far edge of the top cell

  const uD = half / CELL_SIZE; // UV depth for half a cell
  const vH = WALL_HEIGHT / WALL_HEIGHT; // 1.0

  for (const side of [-1, 1]) {
    const x = half * side;
    const nx = side;
    const sv: number[] = [];
    const su: number[] = [];
    const sn: number[] = [];

    if (side < 0) {
      pushQuad(sv, su, sn,
        [x, 0, zNear], [x, WALL_HEIGHT, zNear],
        [x, WALL_HEIGHT, zFar], [x, 0, zFar],
        [0, 0], [0, vH], [uD, vH], [uD, 0],
        nx, 0, 0,
      );
    } else {
      pushQuad(sv, su, sn,
        [x, 0, zNear], [x, 0, zFar],
        [x, WALL_HEIGHT, zFar], [x, WALL_HEIGHT, zNear],
        [0, 0], [uD, 0], [uD, vH], [0, vH],
        nx, 0, 0,
      );
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(sn, 3));
    group.add(new THREE.Mesh(geo, material));
  }

  return group;
}

// ---------------------------------------------------------------------------
// Ramp geometry (style: 'ramp') — smooth slope
// ---------------------------------------------------------------------------

function buildSmoothRamp(
  slopeMaterial: THREE.MeshLambertMaterial,
  sideMaterial: THREE.MeshLambertMaterial,
): THREE.Group {
  const group = new THREE.Group();
  const half = CELL_SIZE / 2;

  // Slope surface — a quad with exact vertex positions matching the side triangles.
  // Bottom edge at (±half, 0, +half), top edge at (±half, LAYER_HEIGHT, -half).
  const vScale = SLOPE_LENGTH / CELL_SIZE;
  const slopeVerts = new Float32Array([
    // Triangle 1: bottom-left, bottom-right, top-right
    -half, 0, half,   half, 0, half,   half, LAYER_HEIGHT, -half,
    // Triangle 2: bottom-left, top-right, top-left
    -half, 0, half,   half, LAYER_HEIGHT, -half,   -half, LAYER_HEIGHT, -half,
  ]);
  const slopeUVs = new Float32Array([
    0, 0,  1, 0,  1, vScale,
    0, 0,  1, vScale,  0, vScale,
  ]);
  // Normal: cross product of (right-left) x (top-bottom) edges
  const nx = 0;
  const ny = CELL_SIZE / SLOPE_LENGTH;
  const nz = LAYER_HEIGHT / SLOPE_LENGTH;
  const slopeNorms = new Float32Array([
    nx, ny, nz,  nx, ny, nz,  nx, ny, nz,
    nx, ny, nz,  nx, ny, nz,  nx, ny, nz,
  ]);
  const slopeGeo = new THREE.BufferGeometry();
  slopeGeo.setAttribute('position', new THREE.BufferAttribute(slopeVerts, 3));
  slopeGeo.setAttribute('uv', new THREE.BufferAttribute(slopeUVs, 2));
  slopeGeo.setAttribute('normal', new THREE.BufferAttribute(slopeNorms, 3));
  const slope = new THREE.Mesh(slopeGeo, slopeMaterial);
  group.add(slope);

  // Triangular side fills
  group.add(buildTriangularSide(-half, sideMaterial));
  group.add(buildTriangularSide(half, sideMaterial));

  // Side walls for the far half of the top cell (beyond ramp geometry)
  group.add(buildTopCellSideWalls(sideMaterial));

  return group;
}

// ---------------------------------------------------------------------------
// Stairs geometry (style: 'stairs') — stepped
// ---------------------------------------------------------------------------

/**
 * Push a quad (two triangles) into the vertex/uv/normal arrays.
 * Vertices in CCW winding order when viewed from the front.
 */
function pushQuad(
  verts: number[], uvs: number[], normals: number[],
  a: [number, number, number], b: [number, number, number],
  c: [number, number, number], d: [number, number, number],
  uva: [number, number], uvb: [number, number],
  uvc: [number, number], uvd: [number, number],
  nx: number, ny: number, nz: number,
): void {
  // Triangle 1: a, b, c
  verts.push(...a, ...b, ...c);
  uvs.push(...uva, ...uvb, ...uvc);
  normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  // Triangle 2: a, c, d
  verts.push(...a, ...c, ...d);
  uvs.push(...uva, ...uvc, ...uvd);
  normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
}

function buildStairedRamp(
  stepMaterial: THREE.MeshLambertMaterial,
  sideMaterial: THREE.MeshLambertMaterial,
): THREE.Group {
  const group = new THREE.Group();
  const half = CELL_SIZE / 2;

  // Build steps as a single BufferGeometry from face quads — no boxes.
  // Only visible faces: treads (top), risers (front face of each step), and bottom.
  const verts: number[] = [];
  const uvArr: number[] = [];
  const norms: number[] = [];

  for (let i = 0; i < RAMP_STEP_COUNT; i++) {
    const y0 = RAMP_STEP_HEIGHT * i;       // bottom of this step's riser
    const y1 = RAMP_STEP_HEIGHT * (i + 1); // top of this step (tread level)
    const zFront = CELL_SIZE / 2 - i * RAMP_STEP_DEPTH;          // front edge (approach side)
    const zBack = CELL_SIZE / 2 - (i + 1) * RAMP_STEP_DEPTH;     // back edge

    const uW = CELL_SIZE / CELL_SIZE;         // 1.0
    const uD = RAMP_STEP_DEPTH / CELL_SIZE;
    const uH = RAMP_STEP_HEIGHT / WALL_HEIGHT;

    // Tread (top face) — horizontal, normal +Y
    pushQuad(verts, uvArr, norms,
      [-half, y1, zFront], [half, y1, zFront],
      [half, y1, zBack], [-half, y1, zBack],
      [0, 0], [uW, 0], [uW, uD], [0, uD],
      0, 1, 0,
    );

    // Riser (front face) — vertical, normal +Z (faces the approach direction)
    pushQuad(verts, uvArr, norms,
      [-half, y0, zFront], [half, y0, zFront],
      [half, y1, zFront], [-half, y1, zFront],
      [0, 0], [uW, 0], [uW, uH], [0, uH],
      0, 0, 1,
    );
  }

  // Bottom face — the underside visible from below (normal -Y)
  // A single quad at Y=0 spanning the full footprint
  pushQuad(verts, uvArr, norms,
    [-half, 0, half], [half, 0, half],
    [half, 0, -half], [-half, 0, -half],
    [0, 0], [1, 0], [1, 1], [0, 1],
    0, -1, 0,
  );

  // Back wall — the vertical face at the top of the last step (normal -Z)
  pushQuad(verts, uvArr, norms,
    [half, 0, -half], [-half, 0, -half],
    [-half, LAYER_HEIGHT, -half], [half, LAYER_HEIGHT, -half],
    [0, 0], [1, 0], [1, LAYER_HEIGHT / WALL_HEIGHT], [0, LAYER_HEIGHT / WALL_HEIGHT],
    0, 0, -1,
  );

  const stepGeo = new THREE.BufferGeometry();
  stepGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  stepGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
  stepGeo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  group.add(new THREE.Mesh(stepGeo, stepMaterial));

  // Side profiles — full stepped silhouette on left and right.
  // Each step's side quad extends from Y=0 (floor) to Y=stepTop, filling the
  // entire area under the staircase profile.
  for (const side of [-1, 1]) {
    const x = half * side;
    const nx = side;
    const sv: number[] = [];
    const su: number[] = [];
    const sn: number[] = [];

    for (let i = 0; i < RAMP_STEP_COUNT; i++) {
      const y1 = RAMP_STEP_HEIGHT * (i + 1);  // top of this step
      const zFront = CELL_SIZE / 2 - i * RAMP_STEP_DEPTH;
      const zBack = CELL_SIZE / 2 - (i + 1) * RAMP_STEP_DEPTH;

      const uF = (half - zFront + half) / CELL_SIZE;
      const uB = (half - zBack + half) / CELL_SIZE;
      const vTop = y1 / WALL_HEIGHT;

      // Full-height quad from floor to step top
      if (side < 0) {
        pushQuad(sv, su, sn,
          [x, 0, zFront], [x, y1, zFront],
          [x, y1, zBack], [x, 0, zBack],
          [uF, 0], [uF, vTop], [uB, vTop], [uB, 0],
          nx, 0, 0,
        );
      } else {
        pushQuad(sv, su, sn,
          [x, 0, zFront], [x, 0, zBack],
          [x, y1, zBack], [x, y1, zFront],
          [uF, 0], [uB, 0], [uB, vTop], [uF, vTop],
          nx, 0, 0,
        );
      }
    }

    const sideGeo = new THREE.BufferGeometry();
    sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
    sideGeo.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
    sideGeo.setAttribute('normal', new THREE.Float32BufferAttribute(sn, 3));
    group.add(new THREE.Mesh(sideGeo, sideMaterial));
  }

  // Side walls for the far half of the top cell (beyond ramp geometry)
  group.add(buildTopCellSideWalls(sideMaterial));

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
