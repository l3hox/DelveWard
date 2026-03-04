import { HEALTH_BAR } from './hudLayout';
import { HUD_COLORS } from './hudColors';
import { drawPixelText } from './hudFont';

const LOW_HP_THRESHOLD = 0.25;

export function drawHealthBar(
  ctx: CanvasRenderingContext2D,
  hp: number,
  maxHp: number,
  time: number,
): void {
  const { x, y, w, h } = HEALTH_BAR;
  const ratio = Math.max(0, Math.min(1, hp / maxHp));

  // Background
  ctx.fillStyle = HUD_COLORS.panelBg;
  ctx.fillRect(x, y, w, h);

  // Bar background
  const barX = x + 20;
  const barY = y + 4;
  const barW = w - 24;
  const barH = h - 8;
  ctx.fillStyle = HUD_COLORS.hpBg;
  ctx.fillRect(barX, barY, barW, barH);

  // Fill
  let fillColor: string = HUD_COLORS.hpFill;
  if (ratio <= LOW_HP_THRESHOLD) {
    // Pulse effect when low HP
    const pulse = Math.sin(time * 6) * 0.5 + 0.5;
    fillColor = pulse > 0.5 ? HUD_COLORS.hpLow : HUD_COLORS.hpFill;
  }
  ctx.fillStyle = fillColor;
  ctx.fillRect(barX, barY, barW * ratio, barH);

  // Heart icon (simple 7x6 pixel heart)
  drawHeart(ctx, x + 4, y + 6, HUD_COLORS.hpFill);

  // Text: HP/maxHP
  const text = `${hp}/${maxHp}`;
  drawPixelText(ctx, text, barX + 2, barY + 2, HUD_COLORS.textPrimary, 1);

  // Border
  ctx.strokeStyle = HUD_COLORS.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  // Row 0: .##.##.
  ctx.fillRect(x + 1, y, 2, 1);
  ctx.fillRect(x + 4, y, 2, 1);
  // Row 1: #######
  ctx.fillRect(x, y + 1, 7, 1);
  // Row 2: #######
  ctx.fillRect(x, y + 2, 7, 1);
  // Row 3: .#####.
  ctx.fillRect(x + 1, y + 3, 5, 1);
  // Row 4: ..###..
  ctx.fillRect(x + 2, y + 4, 3, 1);
  // Row 5: ...#...
  ctx.fillRect(x + 3, y + 5, 1, 1);
}
