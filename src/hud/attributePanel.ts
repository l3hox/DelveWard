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
const COLOR_PENDING = '#44cc44';

export type PanelMode = 'levelup' | 'stats';

export class AttributePanel {
  private _open = false;
  private selectedStat = 0;
  private _mode: PanelMode = 'stats';

  // Levelup state — pending allocations applied on close
  private baselineStats: Record<StatKey, number> = { str: 0, dex: 0, vit: 0, wis: 0 };
  private pendingAlloc: Record<StatKey, number> = { str: 0, dex: 0, vit: 0, wis: 0 };
  private totalPoints = 0;

  get mode(): PanelMode { return this._mode; }

  open(gameState: GameState): void {
    this._open = true;
    this.selectedStat = 0;

    if (gameState.attributePoints > 0) {
      this._mode = 'levelup';
      this.totalPoints = gameState.attributePoints;
      this.baselineStats = {
        str: gameState.str, dex: gameState.dex,
        vit: gameState.vit, wis: gameState.wis,
      };
      this.pendingAlloc = { str: 0, dex: 0, vit: 0, wis: 0 };
    } else {
      this._mode = 'stats';
    }
  }

  /**
   * Try to close the panel. In levelup mode, all points must be spent.
   * On success, applies pending allocations and returns true.
   * Returns false if close is blocked (unspent points).
   */
  tryClose(gameState: GameState): boolean {
    if (this._mode === 'levelup') {
      const spent = STATS.reduce((sum, s) => sum + this.pendingAlloc[s], 0);
      if (spent < this.totalPoints) return false;

      // Apply allocations
      for (const stat of STATS) {
        gameState[stat] = this.baselineStats[stat] + this.pendingAlloc[stat];
      }
      gameState.attributePoints = 0;

      // Recalculate maxHp (VIT may have changed)
      const wasAtMax = gameState.hp === gameState.maxHp;
      gameState.maxHp = gameState.getEffectiveStats().maxHp;
      if (wasAtMax) gameState.hp = gameState.maxHp;
    }
    this._open = false;
    return true;
  }

  isOpen(): boolean {
    return this._open;
  }

  private get remainingPoints(): number {
    return this.totalPoints - STATS.reduce((sum, s) => sum + this.pendingAlloc[s], 0);
  }

  handleKey(code: string, _gameState: GameState): boolean {
    switch (code) {
      case 'ArrowUp':
        this.selectedStat = (this.selectedStat + STATS.length - 1) % STATS.length;
        return true;
      case 'ArrowDown':
        this.selectedStat = (this.selectedStat + 1) % STATS.length;
        return true;
      case 'ArrowRight':
      case 'Enter':
        if (this._mode === 'levelup' && this.remainingPoints > 0) {
          this.pendingAlloc[STATS[this.selectedStat]]++;
        }
        return true;
      case 'ArrowLeft':
        if (this._mode === 'levelup') {
          const stat = STATS[this.selectedStat];
          if (this.pendingAlloc[stat] > 0) {
            this.pendingAlloc[stat]--;
          }
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

    if (this._mode === 'levelup') {
      this._drawLevelup(ctx, gameState);
    } else {
      this._drawStats(ctx, gameState, eff);
    }
  }

  private _drawLevelup(ctx: CanvasRenderingContext2D, gameState: GameState): void {
    // Title
    const title = 'LEVEL UP';
    const titleW = measurePixelText(title, 3);
    drawPixelText(ctx, title, Math.floor(HUD_WIDTH / 2 - titleW / 2), PANEL_Y + 12, '#e8c84a', 3);

    // Subtitle
    const remaining = this.remainingPoints;
    const pointsLabel = remaining === 1 ? 'point' : 'points';
    const subtitle = `${gameState.playerName}  \u2014  Level ${gameState.level}  \u2014  ${remaining} ${pointsLabel} remaining`;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = remaining > 0 ? '#e8c84a' : '#44cc44';
    ctx.fillText(subtitle, HUD_WIDTH / 2, PANEL_Y + 46);

    // Stat rows
    for (let i = 0; i < STATS.length; i++) {
      const key = STATS[i];
      const rowY = STATS_START_Y + i * STAT_ROW_H;
      const isSelected = i === this.selectedStat;
      const pending = this.pendingAlloc[key];
      const currentVal = this.baselineStats[key] + pending;

      // Selection highlight
      if (isSelected) {
        ctx.fillStyle = 'rgba(232, 200, 74, 0.12)';
        ctx.fillRect(PANEL_X + 4, rowY - 2, PANEL_W - 8, STAT_ROW_H - 4);
        ctx.strokeStyle = 'rgba(232, 200, 74, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(PANEL_X + 4.5, rowY - 1.5, PANEL_W - 9, STAT_ROW_H - 5);
      }

      // Stat name
      ctx.textAlign = 'left';
      ctx.font = '10px monospace';
      ctx.fillStyle = isSelected ? HUD_COLORS.compassActive : HUD_COLORS.textPrimary;
      ctx.fillText(STAT_DISPLAY[key], PANEL_X + 48, rowY + 10);

      // Description
      ctx.font = '9px monospace';
      ctx.fillStyle = HUD_COLORS.textDim;
      ctx.fillText(STAT_DESC[key], PANEL_X + 52, rowY + 22);

      // [-] button
      const controlsX = PANEL_X + PANEL_W - 120;
      const valY = rowY + 6;
      const valScale = 2;
      const minusX = controlsX - 24;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = (isSelected && pending > 0) ? '#e8c84a' : HUD_COLORS.textDim;
      ctx.fillText('[-]', minusX, valY + 11);

      // Value
      const valStr = String(currentVal);
      const baseColor = isSelected ? HUD_COLORS.compassActive : HUD_COLORS.textPrimary;
      drawPixelText(ctx, valStr, controlsX, valY + 3, baseColor, valScale);

      // Pending delta indicator
      if (pending > 0) {
        const valPixelW = measurePixelText(valStr, valScale);
        drawPixelText(ctx, `+${pending}`, controlsX + valPixelW + 4, valY + 3, COLOR_PENDING, valScale);
      }

      // [+] button
      const plusX = PANEL_X + PANEL_W - 32;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = (isSelected && remaining > 0) ? '#e8c84a' : HUD_COLORS.textDim;
      ctx.fillText('[+]', plusX, valY + 11);
    }

    // Footer
    const allSpent = remaining === 0;
    const footer = allSpent
      ? 'L CONFIRM   LEFT/RIGHT ADJUST'
      : 'SPEND ALL POINTS TO CLOSE   LEFT/RIGHT ADJUST';
    const footerW = measurePixelText(footer, 2);
    drawPixelText(
      ctx, footer,
      Math.floor(HUD_WIDTH / 2 - footerW / 2),
      PANEL_Y + PANEL_H - 18,
      allSpent ? '#44cc44' : '#e8c84a',
      2,
    );

    ctx.textAlign = 'left';
  }

  private _drawStats(
    ctx: CanvasRenderingContext2D,
    gameState: GameState,
    eff: ReturnType<GameState['getEffectiveStats']>,
  ): void {
    // Title
    const title = 'ATTRIBUTES';
    const titleW = measurePixelText(title, 3);
    drawPixelText(ctx, title, Math.floor(HUD_WIDTH / 2 - titleW / 2), PANEL_Y + 12, HUD_COLORS.compassActive, 3);

    // Subtitle
    const subtitle = `${gameState.playerName}  \u2014  Level ${gameState.level}`;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = HUD_COLORS.textDim;
    ctx.fillText(subtitle, HUD_WIDTH / 2, PANEL_Y + 46);

    // Stat rows
    const baseValues: Record<StatKey, number> = {
      str: gameState.str, dex: gameState.dex, vit: gameState.vit, wis: gameState.wis,
    };
    const effValues: Record<StatKey, number> = {
      str: eff.effectiveStr, dex: eff.effectiveDex, vit: eff.effectiveVit, wis: eff.effectiveWis,
    };

    for (let i = 0; i < STATS.length; i++) {
      const key = STATS[i];
      const rowY = STATS_START_Y + i * STAT_ROW_H;
      const isSelected = i === this.selectedStat;

      if (isSelected) {
        ctx.fillStyle = 'rgba(232, 200, 74, 0.12)';
        ctx.fillRect(PANEL_X + 4, rowY - 2, PANEL_W - 8, STAT_ROW_H - 4);
        ctx.strokeStyle = 'rgba(232, 200, 74, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(PANEL_X + 4.5, rowY - 1.5, PANEL_W - 9, STAT_ROW_H - 5);
      }

      ctx.textAlign = 'left';
      ctx.font = '10px monospace';
      ctx.fillStyle = isSelected ? HUD_COLORS.compassActive : HUD_COLORS.textPrimary;
      ctx.fillText(STAT_DISPLAY[key], PANEL_X + 48, rowY + 10);

      ctx.font = '9px monospace';
      ctx.fillStyle = HUD_COLORS.textDim;
      ctx.fillText(STAT_DESC[key], PANEL_X + 52, rowY + 22);

      const baseVal = baseValues[key];
      const effVal = effValues[key];
      const baseStr = String(baseVal);
      const controlsX = PANEL_X + PANEL_W - 96;
      const valY = rowY + 6;
      const valScale = 2;

      const baseColor = isSelected ? HUD_COLORS.compassActive : HUD_COLORS.textPrimary;
      drawPixelText(ctx, baseStr, controlsX, valY + 3, baseColor, valScale);

      if (effVal !== baseVal) {
        const effStr = String(effVal);
        const basePixelW = measurePixelText(baseStr, valScale);
        drawPixelText(ctx, effStr, controlsX + basePixelW + 6, valY + 3, COLOR_EFFECTIVE, valScale);
      }
    }

    // Footer
    const footer = 'L CLOSE';
    const footerW = measurePixelText(footer, 2);
    drawPixelText(
      ctx, footer,
      Math.floor(HUD_WIDTH / 2 - footerW / 2),
      PANEL_Y + PANEL_H - 18,
      HUD_COLORS.textDim,
      2,
    );

    ctx.textAlign = 'left';
  }
}
