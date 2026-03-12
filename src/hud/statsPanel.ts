import { HUD_WIDTH, HUD_HEIGHT } from './hudLayout';
import { HUD_COLORS } from './hudColors';
import { drawPixelText, measurePixelText } from './hudFont';
import type { GameState } from '../core/gameState';

const PANEL_W = 420;
const PANEL_H = 300;
const PANEL_X = Math.floor((HUD_WIDTH - PANEL_W) / 2);
const PANEL_Y = Math.floor((HUD_HEIGHT - PANEL_H) / 2);

const ROW_H = 20;
const ROWS_START_Y = PANEL_Y + 90;

// Column X positions (absolute)
const LABEL_X = PANEL_X + 30;
const BASE_X = PANEL_X + 180;
const EFF_X = PANEL_X + 290;

const COLOR_POSITIVE = '#44cc44';
const COLOR_NEGATIVE = '#cc4444';
const COLOR_NEUTRAL = '#cccccc';

interface StatRow {
  label: string;
  base: number;
  effective: number;
  suffix?: string; // e.g. '%' for crit/dodge
}

export class StatsPanel {
  private _open = false;

  toggle(): void {
    this._open = !this._open;
  }

  isOpen(): boolean {
    return this._open;
  }

  draw(ctx: CanvasRenderingContext2D, gameState: GameState): void {
    if (!this._open) return;

    const eff = gameState.getEffectiveStats();

    // Base derived values (from base stats only, no equipment)
    const baseAtk = Math.floor(gameState.str / 2);
    const baseDef = Math.floor(gameState.vit / 4);
    const baseHp = 40 + gameState.vit * 5;
    const baseCrit = 5 + Math.floor(gameState.dex / 3);
    const baseDodge = Math.max(0, Math.min(25, Math.floor((gameState.dex - 5) / 4)));

    const attrRows: StatRow[] = [
      { label: 'STR', base: gameState.str, effective: eff.effectiveStr },
      { label: 'DEX', base: gameState.dex, effective: eff.effectiveDex },
      { label: 'VIT', base: gameState.vit, effective: eff.effectiveVit },
      { label: 'WIS', base: gameState.wis, effective: eff.effectiveWis },
    ];

    const derivedRows: StatRow[] = [
      { label: 'ATK', base: baseAtk, effective: eff.atk },
      { label: 'DEF', base: baseDef, effective: eff.def },
      { label: 'HP', base: baseHp, effective: eff.maxHp },
      { label: 'CRIT', base: baseCrit, effective: eff.critChance, suffix: '%' },
      { label: 'DODGE', base: baseDodge, effective: eff.dodgeChance, suffix: '%' },
    ];

    // Full-screen backdrop
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, HUD_WIDTH, HUD_HEIGHT);

    // Panel
    ctx.fillStyle = HUD_COLORS.panelBg;
    ctx.fillRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
    ctx.strokeStyle = HUD_COLORS.panelBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);

    // Title: "CHARACTER STATS"
    const title = 'CHARACTER STATS';
    const titleW = measurePixelText(title, 3);
    drawPixelText(ctx, title, Math.floor(HUD_WIDTH / 2 - titleW / 2), PANEL_Y + 16, HUD_COLORS.compassActive, 3);

    // Subtitle: player name + level
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = HUD_COLORS.textDim;
    ctx.fillText(`${gameState.playerName}  Level ${gameState.level}`, HUD_WIDTH / 2, PANEL_Y + 46);

    // Column headers
    const baseHeader = 'BASE';
    const effHeader = 'EFFECTIVE';
    const headerY = PANEL_Y + 68;
    drawPixelText(ctx, baseHeader, BASE_X, headerY, HUD_COLORS.textDim, 2);
    drawPixelText(ctx, effHeader, EFF_X, headerY, HUD_COLORS.textDim, 2);

    // Draw rows
    let y = ROWS_START_Y;

    for (const row of attrRows) {
      this.drawRow(ctx, row, y);
      y += ROW_H;
    }

    // Separator line
    y += 4;
    ctx.strokeStyle = HUD_COLORS.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PANEL_X + 20, y);
    ctx.lineTo(PANEL_X + PANEL_W - 20, y);
    ctx.stroke();
    y += 10;

    for (const row of derivedRows) {
      this.drawRow(ctx, row, y);
      y += ROW_H;
    }

    // Footer: "T  CLOSE"
    const footer = 'T  CLOSE';
    const footerW = measurePixelText(footer, 2);
    drawPixelText(ctx, footer, Math.floor(HUD_WIDTH / 2 - footerW / 2), PANEL_Y + PANEL_H - 22, HUD_COLORS.textDim, 2);
  }

  private drawRow(ctx: CanvasRenderingContext2D, row: StatRow, y: number): void {
    // Label
    drawPixelText(ctx, row.label, LABEL_X, y, COLOR_NEUTRAL, 2);

    // Base value
    const baseStr = String(row.base);
    drawPixelText(ctx, baseStr, BASE_X, y, COLOR_NEUTRAL, 2);

    // Suffix for base (% via native text)
    if (row.suffix) {
      const basePixelW = measurePixelText(baseStr, 2);
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = COLOR_NEUTRAL;
      ctx.fillText(row.suffix, BASE_X + basePixelW + 3, y + 9);
    }

    // Effective value + color
    const diff = row.effective - row.base;
    let color: string;
    if (diff > 0) color = COLOR_POSITIVE;
    else if (diff < 0) color = COLOR_NEGATIVE;
    else color = COLOR_NEUTRAL;

    const effStr = String(row.effective);
    drawPixelText(ctx, effStr, EFF_X, y, color, 2);

    // Suffix + diff via native text
    const effPixelW = measurePixelText(effStr, 2);
    let nativeX = EFF_X + effPixelW + 3;

    if (row.suffix) {
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = color;
      ctx.fillText(row.suffix, nativeX, y + 9);
      nativeX += ctx.measureText(row.suffix).width + 2;
    }

    if (diff !== 0) {
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = color;
      const diffLabel = diff > 0 ? ` (+${diff})` : ` (-${Math.abs(diff)})`;
      ctx.fillText(diffLabel, nativeX, y + 9);
    }
  }
}
