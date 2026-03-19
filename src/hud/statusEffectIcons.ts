import type { StatusEffect } from '../core/statusEffects';
import { STATUS_ICONS } from './hudLayout';

/** Draw active status effect icons above the health bar. */
export function drawStatusIcons(ctx: CanvasRenderingContext2D, effects: StatusEffect[], time: number): void {
  if (effects.length === 0) return;

  // Deduplicate by type (should already be unique, but guard)
  const activeTypes = [...new Set(effects.map(e => e.type))];
  let offsetX = 0;

  for (const type of activeTypes) {
    const x = STATUS_ICONS.x + offsetX;
    const y = STATUS_ICONS.y;
    const s = STATUS_ICONS.iconSize;

    // Gentle pulse: scale alpha between 0.7–1.0
    const pulse = 0.85 + 0.15 * Math.sin(time * 3);

    ctx.save();
    ctx.globalAlpha = pulse;

    if (type === 'poison') {
      drawPoisonIcon(ctx, x, y, s);
    } else if (type === 'slow') {
      drawSlowIcon(ctx, x, y, s);
    } else if (type === 'burning') {
      drawBurningIcon(ctx, x, y, s);
    }

    ctx.restore();
    offsetX += s + STATUS_ICONS.gap;
  }
}

/** Green droplet icon for poison. */
function drawPoisonIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const cx = x + s / 2;
  const px = Math.floor(s / 7); // pixel unit

  ctx.fillStyle = '#22aa22';
  // Droplet shape: narrow top, wider bottom, rounded
  ctx.fillRect(cx - px, y + px, px * 2, px);         // top narrow
  ctx.fillRect(cx - px * 2, y + px * 2, px * 4, px); // middle
  ctx.fillRect(cx - px * 3, y + px * 3, px * 6, px * 2); // wide
  ctx.fillRect(cx - px * 2, y + px * 5, px * 4, px); // bottom narrow

  // Highlight
  ctx.fillStyle = '#66ff66';
  ctx.fillRect(cx - px, y + px * 3, px, px);
}

/** Blue snowflake icon for slow. */
function drawSlowIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const px = Math.floor(s / 7);

  ctx.fillStyle = '#5588ff';
  // Cross shape
  ctx.fillRect(cx - px, cy - px * 3, px * 2, px * 6); // vertical
  ctx.fillRect(cx - px * 3, cy - px, px * 6, px * 2); // horizontal
  // Diagonal dots
  ctx.fillRect(cx - px * 2, cy - px * 2, px, px);
  ctx.fillRect(cx + px, cy - px * 2, px, px);
  ctx.fillRect(cx - px * 2, cy + px, px, px);
  ctx.fillRect(cx + px, cy + px, px, px);

  // Center bright
  ctx.fillStyle = '#aaccff';
  ctx.fillRect(cx - px / 2, cy - px / 2, px, px);
}

/** Orange flame icon for burning. */
function drawBurningIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const cx = x + s / 2;
  const px = Math.floor(s / 7);

  // Outer flame (orange)
  ctx.fillStyle = '#ff8844';
  ctx.fillRect(cx - px, y + px, px * 2, px);           // tip
  ctx.fillRect(cx - px * 2, y + px * 2, px * 4, px);   // upper
  ctx.fillRect(cx - px * 2, y + px * 3, px * 4, px * 2); // middle
  ctx.fillRect(cx - px * 3, y + px * 5, px * 6, px);   // base wide

  // Inner flame (yellow)
  ctx.fillStyle = '#ffcc44';
  ctx.fillRect(cx - px, y + px * 3, px * 2, px * 2);

  // Core (bright)
  ctx.fillStyle = '#ffeeaa';
  ctx.fillRect(cx - px / 2, y + px * 4, px, px);
}
