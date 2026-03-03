import * as THREE from 'three';

const SIZE = 64;

function makeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Vary a base colour component by ±amount, clamped 0-255. */
function vary(base: number, amount: number): number {
  return Math.max(0, Math.min(255, base + Math.floor(Math.random() * amount * 2 - amount)));
}

export function createWallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

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
  // Vertical mortar — offset every other row
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

export function createFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

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

export function createCeilingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

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

  // Subtle cracks — a few dark lines
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
