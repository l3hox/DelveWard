import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { buildWalkableSet } from '../core/grid';
import { createNeutralLitMaterial } from './billboardMaterial';
import type { CharDef } from '../core/types';

export interface ForestMeshes {
  group: THREE.Group;
  billboards: THREE.Mesh[];
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

// --- Procedural tree textures ---

interface VariantSpec {
  heightMin: number;
  heightMax: number;
  widthMin: number;
  widthMax: number;
}

const VARIANT_SPECS: VariantSpec[] = [
  { heightMin: 1.8, heightMax: 2.3, widthMin: 0.8, widthMax: 1.0 }, // pine
  { heightMin: 1.8, heightMax: 2.2, widthMin: 1.1, widthMax: 1.4 }, // oak
  { heightMin: 1.6, heightMax: 2.0, widthMin: 0.7, widthMax: 0.9 }, // birch
  { heightMin: 0.8, heightMax: 1.2, widthMin: 0.9, widthMax: 1.2 }, // bush
];

const TEXTURE_SIZE = 64;
const treeTextureCache: THREE.Texture[] = [];

function generatePineTexture(ctx: CanvasRenderingContext2D): void {
  const W = TEXTURE_SIZE;
  const H = TEXTURE_SIZE;
  ctx.clearRect(0, 0, W, H);

  // Brown trunk — centered, lower 40%
  const trunkW = 6;
  const trunkH = Math.floor(H * 0.4);
  const trunkX = Math.floor((W - trunkW) / 2);
  const trunkY = H - trunkH;
  ctx.fillStyle = 'rgb(80, 50, 20)';
  ctx.fillRect(trunkX, trunkY, trunkW, trunkH);

  // Three overlapping triangles for the canopy, narrowing toward the top
  const layers = [
    { baseY: trunkY + 4, topY: trunkY - 10, halfBase: 22 },
    { baseY: trunkY - 4,  topY: trunkY - 24, halfBase: 18 },
    { baseY: trunkY - 14, topY: 2,           halfBase: 12 },
  ];
  for (const layer of layers) {
    const noise = (Math.random() * 10 - 5) | 0;
    const r = 30 + noise;
    const g = 80 + noise;
    const b = 25;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.moveTo(W / 2 - layer.halfBase, layer.baseY);
    ctx.lineTo(W / 2 + layer.halfBase, layer.baseY);
    ctx.lineTo(W / 2, layer.topY);
    ctx.closePath();
    ctx.fill();
  }
}

function generateOakTexture(ctx: CanvasRenderingContext2D): void {
  const W = TEXTURE_SIZE;
  const H = TEXTURE_SIZE;
  ctx.clearRect(0, 0, W, H);

  // Brown trunk — wide, lower 35%
  const trunkW = 10;
  const trunkH = Math.floor(H * 0.35);
  const trunkX = Math.floor((W - trunkW) / 2);
  const trunkY = H - trunkH;
  ctx.fillStyle = 'rgb(75, 45, 15)';
  ctx.fillRect(trunkX, trunkY, trunkW, trunkH);

  // Main canopy ellipse — top 70%
  const cx = W / 2;
  const cy = Math.floor(H * 0.38);
  const rx = Math.floor(W * 0.38);
  const ry = Math.floor(H * 0.32);
  ctx.fillStyle = 'rgb(40, 90, 30)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dappled lighter patches
  for (let i = 0; i < 6; i++) {
    const px = cx + (Math.random() * rx * 1.2 - rx * 0.6);
    const py = cy + (Math.random() * ry * 1.2 - ry * 0.6);
    const pr = 4 + Math.random() * 6;
    ctx.fillStyle = 'rgba(70, 130, 50, 0.55)';
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function generateBirchTexture(ctx: CanvasRenderingContext2D): void {
  const W = TEXTURE_SIZE;
  const H = TEXTURE_SIZE;
  ctx.clearRect(0, 0, W, H);

  // Thin white/light-grey trunk, full height
  const trunkW = 4;
  const trunkX = Math.floor((W - trunkW) / 2);
  ctx.fillStyle = 'rgb(210, 210, 200)';
  ctx.fillRect(trunkX, 4, trunkW, H - 4);

  // Small dark bark marks
  ctx.fillStyle = 'rgba(60, 55, 50, 0.7)';
  for (let i = 0; i < 5; i++) {
    const markY = 8 + i * ((H - 12) / 5) + Math.floor(Math.random() * 6);
    ctx.fillRect(trunkX - 1, markY, trunkW + 2, 2);
  }

  // Sparse leaf clusters in upper 60%
  const clusterColor = 'rgb(80, 110, 40)';
  const clusterY = H * 0.4;
  for (let i = 0; i < 7; i++) {
    const lx = 8 + Math.random() * (W - 16);
    const ly = 4 + Math.random() * (clusterY - 4);
    const lr = 4 + Math.random() * 6;
    ctx.fillStyle = clusterColor;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function generateBushTexture(ctx: CanvasRenderingContext2D): void {
  const W = TEXTURE_SIZE;
  const H = TEXTURE_SIZE;
  ctx.clearRect(0, 0, W, H);

  // Dense green mass in bottom 60%, overlapping circles
  const baseY = H * 0.4;
  ctx.fillStyle = 'rgb(35, 75, 25)';
  for (let i = 0; i < 10; i++) {
    const bx = 6 + Math.random() * (W - 12);
    const by = baseY + Math.random() * (H - baseY - 4);
    const br = 8 + Math.random() * 10;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lighter highlights on top half of the bush mass
  ctx.fillStyle = 'rgb(55, 105, 40)';
  for (let i = 0; i < 5; i++) {
    const bx = 10 + Math.random() * (W - 20);
    const by = baseY + Math.random() * (H * 0.25);
    const br = 5 + Math.random() * 7;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
}

function getTreeTextures(): THREE.Texture[] {
  if (treeTextureCache.length === 4) return treeTextureCache;

  const generators = [
    generatePineTexture,
    generateOakTexture,
    generateBirchTexture,
    generateBushTexture,
  ];

  for (const gen of generators) {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const ctx = canvas.getContext('2d')!;
    gen(ctx);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    treeTextureCache.push(tex);
  }

  return treeTextureCache;
}

// --- Main build function ---

// Neighbor face descriptors: [dcol, drow, faceIndex, wallSign along local axis]
// wallSign: the sign of the offset from cell center to reach the wall face
const NEIGHBORS: Array<{ dc: number; dr: number; faceIndex: number; axis: 'x' | 'z'; wallSign: number }> = [
  { dc: 0,  dr: -1, faceIndex: 0, axis: 'z', wallSign: -1 }, // N
  { dc: 0,  dr:  1, faceIndex: 1, axis: 'z', wallSign:  1 }, // S
  { dc:  1, dr:  0, faceIndex: 2, axis: 'x', wallSign:  1 }, // E
  { dc: -1, dr:  0, faceIndex: 3, axis: 'x', wallSign: -1 }, // W
];

export function buildForestMeshes(grid: string[], charDefs?: CharDef[]): ForestMeshes {
  const group = new THREE.Group();
  const billboards: THREE.Mesh[] = [];

  if (!grid || grid.length === 0) return { group, billboards };

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
  if (forestChars.size === 0 && forestFillChars.size === 0) return { group, billboards };

  // Build walkable set (includes '.' and any non-solid charDef chars)
  const walkable = buildWalkableSet(charDefs);

  const textures = getTreeTextures();

  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const cellChar = grid[row][col];
      if (!walkable.has(cellChar)) continue;

      // World-space center of this walkable cell
      const cx = col * CELL_SIZE + CELL_SIZE / 2;
      const cz = row * CELL_SIZE + CELL_SIZE / 2;

      for (const { dc, dr, faceIndex, axis, wallSign } of NEIGHBORS) {
        const nc = col + dc;
        const nr = row + dr;

        // Bounds check neighbor
        if (nr < 0 || nr >= numRows || nc < 0 || nc >= numCols) continue;
        if (!forestChars.has(grid[nr][nc]) && !forestFillChars.has(grid[nr][nc])) continue;

        // This face borders a forest cell — generate 1-3 trees
        const seed = col * 7919 + row * 6271 + faceIndex * 1013;
        const rng = mulberry32(seed);

        const treeCount = 1 + Math.floor(rng() * 3);

        for (let t = 0; t < treeCount; t++) {
          const variantIndex = Math.floor(rng() * 4);
          const spec = VARIANT_SPECS[variantIndex];
          const tex = textures[variantIndex];

          const treeHeight = spec.heightMin + rng() * (spec.heightMax - spec.heightMin);
          const treeWidth  = spec.widthMin  + rng() * (spec.widthMax  - spec.widthMin);

          // Depth offset: how far into the walkable cell (away from the wall)
          const depthOffset = 0.15 + rng() * 0.30; // 0.15–0.45

          // Lateral offset: along the wall face
          let lateralOffset = (rng() * 1.3 - 0.65); // –0.65 to +0.65

          // Clamp lateral offset near corners if the perpendicular neighbor is also forest
          // The two perpendicular neighbors depend on which axis the wall is on
          const perpDc = axis === 'z' ? (lateralOffset > 0 ? 1 : -1) : 0;
          const perpDr = axis === 'x' ? (lateralOffset > 0 ? 1 : -1) : 0;
          const perpNc = col + perpDc;
          const perpNr = row + perpDr;
          const perpIsForest =
            perpNr >= 0 && perpNr < numRows &&
            perpNc >= 0 && perpNc < numCols &&
            (forestChars.has(grid[perpNr][perpNc]) || forestFillChars.has(grid[perpNr][perpNc]));
          if (perpIsForest) {
            lateralOffset = Math.max(-0.4, Math.min(0.4, lateralOffset));
          }

          // Compute world position
          let wx: number;
          let wz: number;
          if (axis === 'z') {
            // N or S face: wall is at ±CELL_SIZE/2 in Z; lateral spread is along X
            wx = cx + lateralOffset;
            wz = cz + wallSign * (CELL_SIZE / 2 - depthOffset);
          } else {
            // E or W face: wall is at ±CELL_SIZE/2 in X; lateral spread is along Z
            wx = cx + wallSign * (CELL_SIZE / 2 - depthOffset);
            wz = cz + lateralOffset;
          }

          const wy = treeHeight / 2;

          const geo = new THREE.PlaneGeometry(treeWidth, treeHeight);
          const mat = createNeutralLitMaterial(tex);
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(wx, wy, wz);

          group.add(mesh);
          billboards.push(mesh);
        }
      }
    }
  }

  // --- Fill pass: dense tree sprites inside see-through forest cells ---
  const FILL_PADDING = 0.15; // keep sprites away from cell edges
  const FILL_TREE_COUNT_MIN = 3;
  const FILL_TREE_COUNT_MAX = 5;

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
        const tex = textures[variantIndex];

        const treeHeight = spec.heightMin + rng() * (spec.heightMax - spec.heightMin);
        const treeWidth = spec.widthMin + rng() * (spec.widthMax - spec.widthMin);

        const wx = cx + (rng() * 2 - 1) * halfCell;
        const wz = cz + (rng() * 2 - 1) * halfCell;
        const wy = treeHeight / 2;

        const geo = new THREE.PlaneGeometry(treeWidth, treeHeight);
        const mat = createNeutralLitMaterial(tex);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(wx, wy, wz);

        group.add(mesh);
        billboards.push(mesh);
      }
    }
  }

  return { group, billboards };
}

export function updateForestBillboards(meshes: ForestMeshes, camera: THREE.Camera): void {
  const facing = camera.rotation.y;
  for (const mesh of meshes.billboards) {
    mesh.rotation.y = facing;
  }
}
