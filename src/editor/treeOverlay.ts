// Cached 64x64 tree overlay canvas for see-through forest cells in the editor.
// Transparent background with a simple pine tree icon.

let cache: HTMLCanvasElement | null = null;

export function getTreeOverlayCanvas(): HTMLCanvasElement {
  if (cache) return cache;

  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // Pine tree — brown trunk + green triangular canopy
  const cx = SIZE / 2;

  // Trunk
  ctx.fillStyle = 'rgba(70, 45, 18, 0.85)';
  ctx.fillRect(cx - 3, 40, 6, 22);

  // Three canopy layers
  const layers = [
    { baseY: 44, topY: 30, halfW: 16 },
    { baseY: 34, topY: 18, halfW: 13 },
    { baseY: 24, topY: 6,  halfW: 9 },
  ];
  for (const { baseY, topY, halfW } of layers) {
    ctx.fillStyle = 'rgba(35, 80, 28, 0.85)';
    ctx.beginPath();
    ctx.moveTo(cx - halfW, baseY);
    ctx.lineTo(cx + halfW, baseY);
    ctx.lineTo(cx, topY);
    ctx.closePath();
    ctx.fill();
  }

  cache = canvas;
  return canvas;
}
