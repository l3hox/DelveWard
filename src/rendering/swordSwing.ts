// Sword swing overlay — 2D canvas animation on top of the viewport.
// Draws a simple pixelart sword that sweeps from lower-right to upper-left.

const SWING_DURATION = 0.25; // seconds

// Sword shape points (normalized 0..1 relative to sword canvas)
// Drawn on a 32x32 canvas
function drawSword(ctx: CanvasRenderingContext2D): void {
  // Blade
  ctx.fillStyle = '#c0c8d0';
  ctx.fillRect(12, 2, 6, 20);
  // Edge highlight
  ctx.fillStyle = '#e0e8f0';
  ctx.fillRect(14, 2, 2, 20);
  // Tip
  ctx.fillStyle = '#d0d8e0';
  ctx.fillRect(14, 0, 2, 2);
  // Guard
  ctx.fillStyle = '#aa8833';
  ctx.fillRect(8, 22, 14, 3);
  // Grip
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(13, 25, 4, 6);
  // Pommel
  ctx.fillStyle = '#aa8833';
  ctx.fillRect(13, 31, 4, 1);
}

let swordCanvas: HTMLCanvasElement | null = null;

function getSwordCanvas(): HTMLCanvasElement {
  if (!swordCanvas) {
    swordCanvas = document.createElement('canvas');
    swordCanvas.width = 32;
    swordCanvas.height = 32;
    const ctx = swordCanvas.getContext('2d')!;
    drawSword(ctx);
  }
  return swordCanvas;
}

export class SwordSwingAnimator {
  private timer = 0;
  private active = false;

  trigger(): void {
    this.timer = SWING_DURATION;
    this.active = true;
  }

  get isActive(): boolean {
    return this.active;
  }

  update(delta: number): void {
    if (!this.active) return;
    this.timer -= delta;
    if (this.timer <= 0) {
      this.timer = 0;
      this.active = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D, hudWidth: number, hudHeight: number): void {
    if (!this.active) return;

    const t = 1 - this.timer / SWING_DURATION; // 0 → 1

    // Swing arc: sword rotates from bottom-right (start) to upper-left (end)
    const startAngle = 0.6;   // radians — sword pointing up-right
    const endAngle = -1.2;    // radians — sword swept to upper-left
    const angle = startAngle + (endAngle - startAngle) * easeOutQuad(t);

    // Pivot point at bottom-center-right of screen
    const pivotX = hudWidth * 0.65;
    const pivotY = hudHeight * 0.95;

    // Sword size
    const swordScale = 4; // 32px * 4 = 128px sword
    const sw = 32 * swordScale;
    const sh = 32 * swordScale;

    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(angle);

    // Slight fade at the end of the swing
    ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;

    // Draw the sword image offset so the grip is at the pivot
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(getSwordCanvas(), -sw / 2, -sh, sw, sh);

    ctx.restore();
  }
}

function easeOutQuad(t: number): number {
  return t * (2 - t);
}
