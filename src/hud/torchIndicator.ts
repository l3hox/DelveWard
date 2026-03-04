import { TORCH_BAR } from './hudLayout';
import { HUD_COLORS } from './hudColors';
import { drawPixelText } from './hudFont';

const LOW_FUEL_THRESHOLD = 0.2;

export function drawTorchIndicator(
  ctx: CanvasRenderingContext2D,
  fuel: number,
  maxFuel: number,
  time: number,
): void {
  const { x, y, w, h } = TORCH_BAR;
  const ratio = Math.max(0, Math.min(1, fuel / maxFuel));

  // Background
  ctx.fillStyle = HUD_COLORS.panelBg;
  ctx.fillRect(x, y, w, h);

  // Bar background
  const barX = x + 20;
  const barY = y + 4;
  const barW = w - 24;
  const barH = h - 8;
  ctx.fillStyle = HUD_COLORS.torchBg;
  ctx.fillRect(barX, barY, barW, barH);

  // Fill
  let fillColor: string = HUD_COLORS.torchFill;
  if (ratio <= LOW_FUEL_THRESHOLD) {
    // Flicker effect when low fuel
    const flicker = Math.sin(time * 10) * Math.sin(time * 7);
    fillColor = flicker > 0 ? HUD_COLORS.torchLow : HUD_COLORS.torchFill;
  }
  ctx.fillStyle = fillColor;
  ctx.fillRect(barX, barY, barW * ratio, barH);

  // Flame icon (5x7 pixel flame)
  drawFlame(ctx, x + 5, y + 4, HUD_COLORS.torchFill);

  // Text: fuel%
  const pct = Math.round(ratio * 100);
  drawPixelText(ctx, `${pct}`, barX + 2, barY + 2, HUD_COLORS.textPrimary, 1);

  // Border
  ctx.strokeStyle = HUD_COLORS.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  // Row 0: ..#..
  ctx.fillRect(x + 2, y, 1, 1);
  // Row 1: .###.
  ctx.fillRect(x + 1, y + 1, 3, 1);
  // Row 2: .###.
  ctx.fillRect(x + 1, y + 2, 3, 1);
  // Row 3: #.#.#
  ctx.fillRect(x, y + 3, 1, 1);
  ctx.fillRect(x + 2, y + 3, 1, 1);
  ctx.fillRect(x + 4, y + 3, 1, 1);
  // Row 4: #####
  ctx.fillRect(x, y + 4, 5, 1);
  // Row 5: .###.
  ctx.fillRect(x + 1, y + 5, 3, 1);
  // Row 6: ..#..
  ctx.fillRect(x + 2, y + 6, 1, 1);
}
