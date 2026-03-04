import * as THREE from 'three';
import type { WallTextureName, FloorTextureName, CeilingTextureName } from '../core/textureNames';

const SIZE = 64;

function makeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Vary a base colour component by +/-amount, clamped 0-255. */
function vary(base: number, amount: number): number {
  return Math.max(0, Math.min(255, base + Math.floor(Math.random() * amount * 2 - amount)));
}

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  return [canvas, canvas.getContext('2d')!];
}

// ---------------------------------------------------------------------------
// Wall generators
// ---------------------------------------------------------------------------

function generateStoneWall(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();

  // Grey-brown stone base with per-pixel noise
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = vary(140, 14);
      const g = vary(120, 12);
      const b = vary(100, 12);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Darker mortar lines — brick pattern
  const mortarRows = [0, 16, 32, 48];
  ctx.fillStyle = 'rgba(40, 34, 28, 0.6)';
  for (const my of mortarRows) {
    ctx.fillRect(0, my, SIZE, 1);
  }
  for (let band = 0; band < mortarRows.length; band++) {
    const offset = band % 2 === 0 ? 0 : 16;
    for (let vx = offset; vx < SIZE; vx += 32) {
      const top = mortarRows[band];
      const bottom = band < mortarRows.length - 1 ? mortarRows[band + 1] : SIZE;
      ctx.fillRect(vx, top, 1, bottom - top);
    }
  }

  return makeTexture(canvas);
}

function generateBrickWall(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();

  // Warm red-brown base
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = vary(160, 16);
      const g = vary(90, 10);
      const b = vary(60, 8);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Wider bricks — mortar every 12 pixels
  const mortarRows = [0, 12, 24, 36, 48, 60];
  ctx.fillStyle = 'rgba(60, 50, 40, 0.7)';
  for (const my of mortarRows) {
    ctx.fillRect(0, my, SIZE, 2);
  }
  for (let band = 0; band < mortarRows.length; band++) {
    const offset = band % 2 === 0 ? 0 : 16;
    for (let vx = offset; vx < SIZE; vx += 32) {
      const top = mortarRows[band];
      const bottom = band < mortarRows.length - 1 ? mortarRows[band + 1] : SIZE;
      ctx.fillRect(vx, top, 2, bottom - top);
    }
  }

  return makeTexture(canvas);
}

function generateMossyWall(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();

  // Stone base (same as stone wall)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = vary(140, 14);
      const g = vary(120, 12);
      const b = vary(100, 12);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Mortar lines
  const mortarRows = [0, 16, 32, 48];
  ctx.fillStyle = 'rgba(40, 34, 28, 0.6)';
  for (const my of mortarRows) {
    ctx.fillRect(0, my, SIZE, 1);
  }
  for (let band = 0; band < mortarRows.length; band++) {
    const offset = band % 2 === 0 ? 0 : 16;
    for (let vx = offset; vx < SIZE; vx += 32) {
      const top = mortarRows[band];
      const bottom = band < mortarRows.length - 1 ? mortarRows[band + 1] : SIZE;
      ctx.fillRect(vx, top, 1, bottom - top);
    }
  }

  // Green moss patches in lower half
  for (let i = 0; i < 80; i++) {
    const mx = Math.floor(Math.random() * SIZE);
    const my = 32 + Math.floor(Math.random() * 32);
    const r = vary(50, 15);
    const g = vary(100, 20);
    const b = vary(40, 10);
    ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
    const size = 1 + Math.floor(Math.random() * 3);
    ctx.fillRect(mx, my, size, size);
  }

  return makeTexture(canvas);
}

function generateWoodWall(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();

  // Brown wood base
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = vary(120, 10);
      const g = vary(80, 8);
      const b = vary(45, 6);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Vertical grain lines
  ctx.strokeStyle = 'rgba(80, 55, 30, 0.4)';
  ctx.lineWidth = 1;
  for (let x = 0; x < SIZE; x += 4 + Math.floor(Math.random() * 4)) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + vary(0, 2), SIZE);
    ctx.stroke();
  }

  // Knots — small dark ovals
  for (let i = 0; i < 3; i++) {
    const kx = 8 + Math.floor(Math.random() * (SIZE - 16));
    const ky = 8 + Math.floor(Math.random() * (SIZE - 16));
    ctx.fillStyle = `rgba(60, 40, 20, 0.6)`;
    ctx.beginPath();
    ctx.ellipse(kx, ky, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  return makeTexture(canvas);
}

// ---------------------------------------------------------------------------
// Floor generators
// ---------------------------------------------------------------------------

function generateStoneTileFloor(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();

  // Dark stone tile base
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = vary(70, 10);
      const g = vary(62, 8);
      const b = vary(54, 8);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Grid lines between tiles
  ctx.fillStyle = 'rgba(28, 22, 16, 0.7)';
  ctx.fillRect(0, 0, SIZE, 1);
  ctx.fillRect(0, 32, SIZE, 1);
  ctx.fillRect(0, 0, 1, SIZE);
  ctx.fillRect(32, 0, 1, SIZE);

  return makeTexture(canvas);
}

function generateDirtFloor(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();

  // Earthy brown base — no grid lines
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = vary(95, 18);
      const g = vary(70, 14);
      const b = vary(40, 10);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Pebble spots — small lighter/darker blobs
  for (let i = 0; i < 20; i++) {
    const px = Math.floor(Math.random() * SIZE);
    const py = Math.floor(Math.random() * SIZE);
    const bright = Math.random() > 0.5;
    const r = bright ? vary(120, 10) : vary(60, 8);
    const g = bright ? vary(95, 8) : vary(45, 6);
    const b = bright ? vary(60, 6) : vary(25, 4);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(px, py, 2, 2);
  }

  return makeTexture(canvas);
}

function generateCobblestoneFloor(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();

  // Grey stone base
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = vary(90, 12);
      const g = vary(82, 10);
      const b = vary(74, 10);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Irregular rounded stones with dark outlines
  ctx.strokeStyle = 'rgba(30, 25, 20, 0.6)';
  ctx.lineWidth = 1;
  const stones = [
    [4, 4, 10, 8], [20, 2, 12, 10], [38, 4, 10, 9], [52, 3, 10, 8],
    [2, 16, 11, 9], [16, 15, 13, 10], [34, 16, 10, 8], [48, 14, 12, 10],
    [6, 28, 10, 9], [22, 27, 11, 10], [38, 28, 12, 8], [54, 26, 8, 10],
    [1, 40, 12, 9], [18, 39, 10, 10], [32, 40, 13, 9], [50, 38, 11, 10],
    [4, 52, 11, 10], [20, 50, 12, 11], [36, 52, 10, 9], [50, 51, 12, 10],
  ];
  for (const [sx, sy, sw, sh] of stones) {
    ctx.beginPath();
    ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  return makeTexture(canvas);
}

// ---------------------------------------------------------------------------
// Ceiling generators
// ---------------------------------------------------------------------------

function generateDarkRockCeiling(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();

  // Very dark rock base
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = vary(48, 8);
      const g = vary(42, 6);
      const b = vary(36, 6);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Subtle cracks
  ctx.strokeStyle = 'rgba(16, 12, 8, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(24, 28);
  ctx.lineTo(56, 36);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(40, 4);
  ctx.lineTo(36, 52);
  ctx.lineTo(60, 60);
  ctx.stroke();

  return makeTexture(canvas);
}

function generateWoodenBeamsCeiling(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();

  // Dark wood base
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = vary(55, 8);
      const g = vary(38, 6);
      const b = vary(22, 5);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Thick horizontal beams
  ctx.fillStyle = 'rgba(40, 28, 16, 0.8)';
  ctx.fillRect(0, 10, SIZE, 6);
  ctx.fillRect(0, 48, SIZE, 6);

  // Beam edge highlights
  ctx.fillStyle = 'rgba(80, 60, 35, 0.4)';
  ctx.fillRect(0, 10, SIZE, 1);
  ctx.fillRect(0, 48, SIZE, 1);

  return makeTexture(canvas);
}

// ---------------------------------------------------------------------------
// Registry — cached getters by name
// ---------------------------------------------------------------------------

const wallGenerators: Record<WallTextureName, () => THREE.CanvasTexture> = {
  stone: generateStoneWall,
  brick: generateBrickWall,
  mossy: generateMossyWall,
  wood: generateWoodWall,
};

const floorGenerators: Record<FloorTextureName, () => THREE.CanvasTexture> = {
  stone_tile: generateStoneTileFloor,
  dirt: generateDirtFloor,
  cobblestone: generateCobblestoneFloor,
};

const ceilingGenerators: Record<CeilingTextureName, () => THREE.CanvasTexture> = {
  dark_rock: generateDarkRockCeiling,
  wooden_beams: generateWoodenBeamsCeiling,
};

const wallCache = new Map<string, THREE.CanvasTexture>();
const floorCache = new Map<string, THREE.CanvasTexture>();
const ceilingCache = new Map<string, THREE.CanvasTexture>();

export function getWallTexture(name: WallTextureName = 'stone'): THREE.CanvasTexture {
  let tex = wallCache.get(name);
  if (!tex) {
    tex = wallGenerators[name]();
    wallCache.set(name, tex);
  }
  return tex;
}

export function getFloorTexture(name: FloorTextureName = 'stone_tile'): THREE.CanvasTexture {
  let tex = floorCache.get(name);
  if (!tex) {
    tex = floorGenerators[name]();
    floorCache.set(name, tex);
  }
  return tex;
}

export function getCeilingTexture(name: CeilingTextureName = 'dark_rock'): THREE.CanvasTexture {
  let tex = ceilingCache.get(name);
  if (!tex) {
    tex = ceilingGenerators[name]();
    ceilingCache.set(name, tex);
  }
  return tex;
}

// ---------------------------------------------------------------------------
// Door texture generators (standalone, not in registries)
// ---------------------------------------------------------------------------

function generateDoorTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();

  // Dark wood base for door planks
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = vary(100, 10);
      const g = vary(65, 8);
      const b = vary(35, 6);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Vertical plank separators
  ctx.fillStyle = 'rgba(40, 25, 12, 0.7)';
  ctx.fillRect(0, 0, 2, SIZE);       // left frame
  ctx.fillRect(SIZE - 2, 0, 2, SIZE); // right frame
  ctx.fillRect(21, 0, 1, SIZE);      // plank line
  ctx.fillRect(42, 0, 1, SIZE);      // plank line

  // Horizontal cross-braces
  ctx.fillRect(0, 0, SIZE, 2);       // top frame
  ctx.fillRect(0, SIZE - 2, SIZE, 2); // bottom frame
  ctx.fillRect(0, 20, SIZE, 2);      // upper brace
  ctx.fillRect(0, 42, SIZE, 2);      // lower brace

  return makeTexture(canvas);
}

function generateLockedDoorTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();

  // Darker wood base
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = vary(70, 8);
      const g = vary(45, 6);
      const b = vary(25, 5);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Same plank structure
  ctx.fillStyle = 'rgba(30, 18, 8, 0.8)';
  ctx.fillRect(0, 0, 2, SIZE);
  ctx.fillRect(SIZE - 2, 0, 2, SIZE);
  ctx.fillRect(21, 0, 1, SIZE);
  ctx.fillRect(42, 0, 1, SIZE);
  ctx.fillRect(0, 0, SIZE, 2);
  ctx.fillRect(0, SIZE - 2, SIZE, 2);
  ctx.fillRect(0, 20, SIZE, 2);
  ctx.fillRect(0, 42, SIZE, 2);

  // Iron bands -- horizontal grey bands
  ctx.fillStyle = 'rgba(120, 120, 130, 0.6)';
  ctx.fillRect(0, 10, SIZE, 3);
  ctx.fillRect(0, 50, SIZE, 3);

  // Iron studs -- small bright squares
  ctx.fillStyle = 'rgba(160, 155, 150, 0.8)';
  for (const sx of [6, 30, 54]) {
    for (const sy of [10, 50]) {
      ctx.fillRect(sx, sy, 3, 3);
    }
  }

  // Lock keyhole -- dark circle in center
  ctx.fillStyle = 'rgba(20, 15, 10, 0.9)';
  ctx.beginPath();
  ctx.arc(32, 32, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(31, 32, 3, 8);

  return makeTexture(canvas);
}

function generateDoorFrameTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();

  // Grey stone base
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = vary(110, 12);
      const g = vary(105, 10);
      const b = vary(100, 10);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Chisel marks — short dark scratches
  ctx.strokeStyle = 'rgba(60, 55, 50, 0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 15; i++) {
    const sx = Math.floor(Math.random() * SIZE);
    const sy = Math.floor(Math.random() * SIZE);
    const len = 2 + Math.floor(Math.random() * 4);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + vary(0, 2), sy + len);
    ctx.stroke();
  }

  return makeTexture(canvas);
}

let doorTexCache: THREE.CanvasTexture | null = null;
let lockedDoorTexCache: THREE.CanvasTexture | null = null;
let doorFrameTexCache: THREE.CanvasTexture | null = null;

export function getDoorTexture(): THREE.CanvasTexture {
  if (!doorTexCache) doorTexCache = generateDoorTexture();
  return doorTexCache;
}

export function getLockedDoorTexture(): THREE.CanvasTexture {
  if (!lockedDoorTexCache) lockedDoorTexCache = generateLockedDoorTexture();
  return lockedDoorTexCache;
}

export function getDoorFrameTexture(): THREE.CanvasTexture {
  if (!doorFrameTexCache) doorFrameTexCache = generateDoorFrameTexture();
  return doorFrameTexCache;
}
