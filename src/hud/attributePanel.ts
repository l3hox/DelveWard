import { HUD_WIDTH, HUD_HEIGHT } from './hudLayout';
import { HUD_COLORS } from './hudColors';
import { drawPixelText, measurePixelText } from './hudFont';
import type { GameState } from '../core/gameState';

const PANEL_W = 420;
const PANEL_H = 270;
const PANEL_X = Math.floor((HUD_WIDTH - PANEL_W) / 2);
const PANEL_Y = Math.floor((HUD_HEIGHT - PANEL_H) / 2);

const STAT_ROW_H = 36;
const STATS_START_Y = PANEL_Y + 72;

type StatKey = 'str' | 'dex' | 'vit' | 'wis';

const STATS: StatKey[] = ['str', 'dex', 'vit', 'wis'];

const STAT_DISPLAY: Record<StatKey, string> = {
  str: 'STR  Strength',
  dex: 'DEX  Dexterity',
  vit: 'VIT  Vitality',
  wis: 'WIS  Wisdom',
};

const STAT_DESC: Record<StatKey, string> = {
  str: 'Melee damage & weapon reqs',
  dex: 'Crit & dodge chance',
  vit: 'Max HP',
  wis: 'Magic (not yet)',
};

const COLOR_EFFECTIVE = '#44cc44';

export class AttributePanel {
  private _open: boolean = false;
  private selectedStat: number = 0;

  toggle(): void {
    this._open = !this._open;
    if (this._open) {
      this.selectedStat = 0;
    }
  }

  isOpen(): boolean {
    return this._open;
  }

  /**
   * Handle a key event. Returns true if the key was consumed by this panel.
   */
  handleKey(code: string, gameState: GameState): boolean {
    switch (code) {
      case 'ArrowUp':
        this.selectedStat = (this.selectedStat + STATS.length - 1) % STATS.length;
        return true;
      case 'ArrowDown':
        this.selectedStat = (this.selectedStat + 1) % STATS.length;
        return true;
      case 'ArrowRight':
      case 'Enter':
        if (gameState.attributePoints > 0) {
          gameState.allocatePoint(STATS[this.selectedStat]);
        }
        return true;
      default:
        return false;
    }
  }

  draw(ctx: CanvasRenderingContext2D, gameState: GameState): void {
    const eff = gameState.getEffectiveStats();

    // Full-screen dark backdrop
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, HUD_WIDTH, HUD_HEIGHT);

    // Panel background
    ctx.fillStyle = HUD_COLORS.panelBg;
    ctx.fillRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
    ctx.strokeStyle = HUD_COLORS.panelBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(PANEL_X + 0.5, PANEL_Y + 0.5, PANEL_W - 1, PANEL_H - 1);

    // Title "ALLOCATE ATTRIBUTES"
    const title = 'ALLOCATE ATTRIBUTES';
    const titleW = measurePixelText(title, 3);
    drawPixelText(
      ctx,
      title,
      Math.floor(HUD_WIDTH / 2 - titleW / 2),
      PANEL_Y + 12,
      HUD_COLORS.compassActive,
      3,
    );

    // Subtitle: name — level — points available
    const pointsLabel = gameState.attributePoints === 1 ? 'point' : 'points';
    const subtitle = `${gameState.playerName}  \u2014  Level ${gameState.level}  \u2014  ${gameState.attributePoints} ${pointsLabel} available`;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = gameState.attributePoints > 0 ? '#e8c84a' : HUD_COLORS.textDim;
    ctx.fillText(subtitle, HUD_WIDTH / 2, PANEL_Y + 46);

    // Stat rows
    const baseValues: Record<StatKey, number> = {
      str: gameState.str,
      dex: gameState.dex,
      vit: gameState.vit,
      wis: gameState.wis,
    };
    const effValues: Record<StatKey, number> = {
      str: eff.effectiveStr,
      dex: eff.effectiveDex,
      vit: eff.effectiveVit,
      wis: eff.effectiveWis,
    };

    for (let i = 0; i < STATS.length; i++) {
      const key = STATS[i];
      const rowY = STATS_START_Y + i * STAT_ROW_H;
      const isSelected = i === this.selectedStat;

      // Selection highlight
      if (isSelected) {
        ctx.fillStyle = 'rgba(232, 200, 74, 0.12)';
        ctx.fillRect(PANEL_X + 4, rowY - 2, PANEL_W - 8, STAT_ROW_H - 4);
        ctx.strokeStyle = 'rgba(232, 200, 74, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(PANEL_X + 4.5, rowY - 1.5, PANEL_W - 9, STAT_ROW_H - 5);
      }

      // Stat name (left side)
      ctx.textAlign = 'left';
      ctx.font = '10px monospace';
      ctx.fillStyle = isSelected ? HUD_COLORS.compassActive : HUD_COLORS.textPrimary;
      ctx.fillText(STAT_DISPLAY[key], PANEL_X + 48, rowY + 10);

      // Description
      ctx.font = '9px monospace';
      ctx.fillStyle = HUD_COLORS.textDim;
      ctx.fillText(STAT_DESC[key], PANEL_X + 52, rowY + 22);

      // Base value in pixel font (right side)
      const baseVal = baseValues[key];
      const effVal = effValues[key];
      const baseStr = String(baseVal);
      const controlsX = PANEL_X + PANEL_W - 96;
      const valY = rowY + 6;
      const valScale = 2;

      const baseColor = isSelected ? HUD_COLORS.compassActive : HUD_COLORS.textPrimary;
      drawPixelText(ctx, baseStr, controlsX, valY + 3, baseColor, valScale);

      // Effective value in green if boosted by equipment
      if (effVal !== baseVal) {
        const effStr = String(effVal);
        const basePixelW = measurePixelText(baseStr, valScale);
        drawPixelText(ctx, effStr, controlsX + basePixelW + 6, valY + 3, COLOR_EFFECTIVE, valScale);
      }

      // [+] button — gold if points available, dim if not
      const canAllocate = gameState.attributePoints > 0;
      const plusX = PANEL_X + PANEL_W - 32;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = canAllocate
        ? (isSelected ? '#e8c84a' : HUD_COLORS.textPrimary)
        : HUD_COLORS.textDim;
      ctx.fillText('[+]', plusX, valY + 11);
    }

    // Footer
    const footer = 'TAB CLOSE   RIGHT/ENTER ALLOCATE';
    const footerW = measurePixelText(footer, 2);
    drawPixelText(
      ctx,
      footer,
      Math.floor(HUD_WIDTH / 2 - footerW / 2),
      PANEL_Y + PANEL_H - 18,
      HUD_COLORS.textDim,
      2,
    );

    ctx.textAlign = 'left'; // reset
  }
}
