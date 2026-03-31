import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { buildWalkableSet } from '../core/grid';
import { createNeutralLitMaterial } from './billboardMaterial';
import type { CharDef } from '../core/types';

export interface ForestMeshes {
  group: THREE.Group;
  /** InstancedMesh objects (one per variant) — need billboard rotation update each frame. */
  instances: THREE.InstancedMesh[];
}

// --- Seeded PRNG ---

function mulberry32(seed: number) {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Sprite-based tree textures loaded from PNGs ---

interface VariantSpec {
  path: string;
  width: number;    // world units
  height: number;   // world units
}

const VARIANT_SPECS: VariantSpec[] = [
  { path: '/sprites/props/oak-thin.png', width: 2.85, height: 2.85 },  // slot 0: thin tree
  { path: '/sprites/props/oak.png',      width: 3.0,  height: 3.0 },   // slot 1: oak
  { path: '/sprites/props/birch.png',    width: 2.7,  height: 2.7 },   // slot 2: birch
  { path: '/sprites/props/bushes.png',   width: 2.1,  height: 2.1 },   // slot 3: bush
];

const treeTextureCache: THREE.Texture[] = [];

function getTreeTextures(): THREE.Texture[] {
  if (treeTextureCache.length === VARIANT_SPECS.length) return treeTextureCache;

  const loader = new THREE.TextureLoader();
  for (const spec of VARIANT_SPECS) {
    const tex = loader.load(spec.path);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    treeTextureCache.push(tex);
  }

  return treeTextureCache;
}

// --- Neighbor face descriptors (kept for future border pass) ---

// const NEIGHBORS: Array<{ dc: number; dr: number; faceIndex: number; axis: 'x' | 'z'; wallSign: number }> = [
//   { dc: 0,  dr: -1, faceIndex: 0, axis: 'z', wallSign: -1 }, // N
//   { dc: 0,  dr:  1, faceIndex: 1, axis: 'z', wallSign:  1 }, // S
//   { dc:  1, dr:  0, faceIndex: 2, axis: 'x', wallSign:  1 }, // E
//   { dc: -1, dr:  0, faceIndex: 3, axis: 'x', wallSign: -1 }, // W
// ];

// --- Main build function ---

export function buildForestMeshes(grid: string[], charDefs?: CharDef[]): ForestMeshes {
  const group = new THREE.Group();
  const instances: THREE.InstancedMesh[] = [];

  if (!grid || grid.length === 0) return { group, instances };

  const numRows = grid.length;
  const numCols = grid[0].length;

  // Identify forest chars: solid === true && wallTexture === 'forest'
  const forestChars = new Set<string>();
  // See-through forest chars: seeThrough solid cells filled with tree sprites
  const forestFillChars = new Set<string>();
  if (charDefs) {
    for (const def of charDefs) {
      if (def.solid && def.wallTexture === 'forest') {
        if (def.seeThrough) {
          forestFillChars.add(def.char);
        } else {
          forestChars.add(def.char);
        }
      }
    }
  }

  // If no forest chars defined, nothing to render
  if (forestChars.size === 0 && forestFillChars.size === 0) return { group, instances };

  const textures = getTreeTextures();

  // TODO: Border pass disabled — generates trees on walkable cells adjacent to forest cells.
  // Will be reintroduced once smaller bush/tree sprites are provided for border vegetation.
  // The fill pass below handles dense tree sprites inside see-through forest cells.

  // --- Fill pass: dense tree sprites inside see-through forest cells ---
  // First pass: collect positions per variant
  const FILL_PADDING = 0.15;
  const FILL_TREE_COUNT_MIN = 1;
  const FILL_TREE_COUNT_MAX = 3;

  const variantPositions: Array<{ x: number; y: number; z: number }>[] =
    VARIANT_SPECS.map(() => []);

  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      if (!forestFillChars.has(grid[row][col])) continue;

      const cx = col * CELL_SIZE + CELL_SIZE / 2;
      const cz = row * CELL_SIZE + CELL_SIZE / 2;
      const halfCell = CELL_SIZE / 2 - FILL_PADDING;

      const seed = col * 9173 + row * 5381;
      const rng = mulberry32(seed);

      const treeCount = FILL_TREE_COUNT_MIN + Math.floor(rng() * (FILL_TREE_COUNT_MAX - FILL_TREE_COUNT_MIN + 1));

      for (let t = 0; t < treeCount; t++) {
        const variantIndex = Math.floor(rng() * 4);
        const spec = VARIANT_SPECS[variantIndex];

        const wx = cx + (rng() * 2 - 1) * halfCell;
        const wz = cz + (rng() * 2 - 1) * halfCell;
        const wy = spec.height / 2;

        variantPositions[variantIndex].push({ x: wx, y: wy, z: wz });
      }
    }
  }

  // Second pass: create one InstancedMesh per variant
  const dummy = new THREE.Object3D();
  for (let vi = 0; vi < VARIANT_SPECS.length; vi++) {
    const positions = variantPositions[vi];
    if (positions.length === 0) continue;

    const spec = VARIANT_SPECS[vi];
    const geo = new THREE.PlaneGeometry(spec.width, spec.height);
    const mat = createNeutralLitMaterial(textures[vi]);
    const instMesh = new THREE.InstancedMesh(geo, mat, positions.length);

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      instMesh.setMatrixAt(i, dummy.matrix);
    }
    instMesh.instanceMatrix.needsUpdate = true;

    group.add(instMesh);
    instances.push(instMesh);
  }

  return { group, instances };
}

// Reusable objects for billboard rotation updates (zero allocations per frame)
// Reusable objects for billboard rotation updates (zero allocations per frame)
const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _rotQuat = new THREE.Quaternion();
const _tmpQuat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);

export function updateForestBillboards(meshes: ForestMeshes, camera: THREE.Camera): void {
  const facing = camera.rotation.y;
  _rotQuat.setFromAxisAngle(_yAxis, facing);
  for (const instMesh of meshes.instances) {
    const count = instMesh.count;
    for (let i = 0; i < count; i++) {
      instMesh.getMatrixAt(i, _mat);
      _mat.decompose(_pos, _tmpQuat, _scale);
      _mat.compose(_pos, _rotQuat, _scale);
      instMesh.setMatrixAt(i, _mat);
    }
    instMesh.instanceMatrix.needsUpdate = true;
  }
}
