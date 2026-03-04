import type { Facing } from '../core/grid';
import { COMPASS } from './hudLayout';
import { HUD_COLORS } from './hudColors';
import { drawPixelText } from './hudFont';

const DIRECTIONS: { label: string; facing: Facing; dx: number; dy: number }[] = [
  { label: 'N', facing: 'N', dx: 0, dy: -1 },
  { label: 'E', facing: 'E', dx: 1, dy: 0 },
  { label: 'S', facing: 'S', dx: 0, dy: 1 },
  { label: 'W', facing: 'W', dx: -1, dy: 0 },
];

export function drawCompass(ctx: CanvasRenderingContext2D, facing: Facing): void {
  const { x, y, w, h } = COMPASS;
  const cx = x + w / 2;
  const cy = y + h / 2;

  // Background
  ctx.fillStyle = HUD_COLORS.panelBg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = HUD_COLORS.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Direction letters
  const scale = 2;
  const letterOffset = 14;
  for (const dir of DIRECTIONS) {
    const color = dir.facing === facing ? HUD_COLORS.compassActive : HUD_COLORS.compassInactive;
    const lx = cx + dir.dx * letterOffset - 3;  // center the 3px-wide glyph
    const ly = cy + dir.dy * letterOffset - 5;  // center the 5px-tall glyph
    drawPixelText(ctx, dir.label, lx, ly, color, scale);
  }

  // Center dot
  ctx.fillStyle = HUD_COLORS.compassActive;
  ctx.fillRect(cx - 1, cy - 1, 3, 3);
}
