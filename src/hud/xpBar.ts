import { XP_BAR } from './hudLayout';
import { HUD_COLORS } from './hudColors';
import { drawPixelText } from './hudFont';

export function drawXpBar(
  ctx: CanvasRenderingContext2D,
  xp: number,
  level: number,
  xpForCurrentLevel: number,  // XP needed to reach current level (floor)
  xpForNextLevel: number,     // XP needed to reach next level
  atCap: boolean,
): void {
  const { x, y, w, h } = XP_BAR;

  // Background
  ctx.fillStyle = HUD_COLORS.panelBg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = HUD_COLORS.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Level label
  drawPixelText(ctx, `LV${level}`, x + 6, y + 5, HUD_COLORS.compassActive, 2);

  if (atCap) {
    // At level cap — show MAX
    ctx.font = '9px monospace';
    ctx.fillStyle = HUD_COLORS.compassActive;
    ctx.textAlign = 'left';
    ctx.fillText('MAX', x + 38, y + 14);
    ctx.textAlign = 'left';
    return;
  }

  // XP progress within current level
  const xpIntoLevel = xp - xpForCurrentLevel;
  const xpNeeded = xpForNextLevel - xpForCurrentLevel;
  const ratio = Math.min(1, xpIntoLevel / xpNeeded);

  // Fill bar
  const barX = x + 36;
  const barW = w - 42;
  const barH = 6;
  const barY = y + 4;

  ctx.fillStyle = '#222';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#4a9eff';
  ctx.fillRect(barX, barY, Math.floor(barW * ratio), barH);

  // XP numbers: current/next below bar
  ctx.font = '8px monospace';
  ctx.fillStyle = HUD_COLORS.textDim;
  ctx.textAlign = 'left';
  ctx.fillText(`${xpIntoLevel}/${xpNeeded}`, barX, y + 20);
  ctx.textAlign = 'left';
}
