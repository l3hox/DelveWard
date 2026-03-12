import { HUD_WIDTH, HUD_HEIGHT } from './hudLayout';
import { HUD_COLORS } from './hudColors';
import { drawPixelText, measurePixelText } from './hudFont';

export interface CharacterSetup {
  name: string;
  str: number;
  dex: number;
  vit: number;
  wis: number;
}

type StatKey = 'str' | 'dex' | 'vit' | 'wis';

const STATS: StatKey[] = ['str', 'dex', 'vit', 'wis'];

// Human-readable labels rendered with canvas native text (not pixel font)
const STAT_DISPLAY: Record<StatKey, string> = {
  str: 'STR  Strength',
  dex: 'DEX  Dexterity',
  vit: 'VIT  Vitality',
  wis: 'WIS  Wisdom',
};

const STAT_DESC: Record<StatKey, string> = {
  str: 'Melee damage',
  dex: 'Crit & dodge chance',
  vit: 'Max HP',
  wis: 'Magic (not yet)',
};

const STARTING_POINTS = 5;
const MIN_STAT = 1;

// Layout
const PANEL_W = 320;
const PANEL_H = 240;
const PANEL_X = Math.floor((HUD_WIDTH - PANEL_W) / 2);
const PANEL_Y = Math.floor((HUD_HEIGHT - PANEL_H) / 2);

const STAT_ROW_H = 36;
const STATS_START_Y = PANEL_Y + 72;

export class CharacterCreationScreen {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private setup: CharacterSetup;
  private pointsRemaining: number;
  private selectedStat: number;   // 0-3 index into STATS
  private onComplete: (setup: CharacterSetup) => void;
  private animFrame: number = 0;
  private boundHandleKey: (e: KeyboardEvent) => void;

  constructor(
    canvas: HTMLCanvasElement,
    onComplete: (setup: CharacterSetup) => void,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.setup = { name: 'Adventurer', str: 5, dex: 5, vit: 5, wis: 5 };
    this.pointsRemaining = STARTING_POINTS;
    this.selectedStat = 0;
    this.onComplete = onComplete;
    this.boundHandleKey = this.handleKey.bind(this);
  }

  show(): void {
    window.addEventListener('keydown', this.boundHandleKey);
    this._renderLoop();
  }

  hide(): void {
    window.removeEventListener('keydown', this.boundHandleKey);
    if (this.animFrame !== 0) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = 0;
    }
  }

  private _renderLoop(): void {
    this.draw();
    this.animFrame = requestAnimationFrame(() => this._renderLoop());
  }

  private handleKey(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowUp':
        this.selectedStat = (this.selectedStat + STATS.length - 1) % STATS.length;
        break;
      case 'ArrowDown':
        this.selectedStat = (this.selectedStat + 1) % STATS.length;
        break;
      case 'ArrowLeft': {
        // Return a point — decrease stat (min MIN_STAT)
        const key = STATS[this.selectedStat];
        if (this.setup[key] > MIN_STAT) {
          this.setup[key] -= 1;
          this.pointsRemaining++;
        }
        break;
      }
      case 'ArrowRight': {
        // Spend a point — increase stat
        const key = STATS[this.selectedStat];
        if (this.pointsRemaining > 0) {
          this.setup[key] += 1;
          this.pointsRemaining--;
        }
        break;
      }
      case 'Enter':
        if (this.pointsRemaining === 0) {
          this.hide();
          this.onComplete({ ...this.setup });
        }
        break;
    }
  }

  draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, HUD_WIDTH, HUD_HEIGHT);

    // Dark overlay behind panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, HUD_WIDTH, HUD_HEIGHT);

    // Panel background
    ctx.fillStyle = HUD_COLORS.panelBg;
    ctx.fillRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
    ctx.strokeStyle = HUD_COLORS.panelBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(PANEL_X + 0.5, PANEL_Y + 0.5, PANEL_W - 1, PANEL_H - 1);

    // Title — "DELVEWARD" using pixel font (large)
    const titleScale = 4;
    const titleText = 'DELVEWARD';
    const titleW = measurePixelText(titleText, titleScale);
    const titleX = Math.floor((HUD_WIDTH - titleW) / 2);
    drawPixelText(ctx, titleText, titleX, PANEL_Y + 12, HUD_COLORS.compassActive, titleScale);

    // Subtitle — use canvas native text for full alphabet support
    ctx.font = '10px monospace';
    ctx.fillStyle = HUD_COLORS.textDim;
    ctx.textAlign = 'center';
    ctx.fillText('Choose your attributes', HUD_WIDTH / 2, PANEL_Y + 46);

    // Name display
    ctx.fillStyle = HUD_COLORS.textPrimary;
    ctx.fillText(`Name: ${this.setup.name}`, HUD_WIDTH / 2, PANEL_Y + 62);

    // Stat rows
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

      // Stat name + description (native text)
      ctx.textAlign = 'left';
      ctx.font = '10px monospace';
      ctx.fillStyle = isSelected ? HUD_COLORS.compassActive : HUD_COLORS.textPrimary;
      ctx.fillText(STAT_DISPLAY[key], PANEL_X + 16, rowY + 10);

      ctx.font = '9px monospace';
      ctx.fillStyle = HUD_COLORS.textDim;
      ctx.fillText(STAT_DESC[key], PANEL_X + 20, rowY + 22);

      // Value with [-] [+] controls
      const val = this.setup[key];
      const valStr = String(val);
      const valScale = 2;
      const valW = measurePixelText(valStr, valScale);
      const controlsX = PANEL_X + PANEL_W - 68;
      const valY = rowY + 6;

      // [-] button
      const canDecrease = val > MIN_STAT;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = canDecrease
        ? (isSelected ? '#e8c84a' : HUD_COLORS.textPrimary)
        : HUD_COLORS.textDim;
      ctx.fillText('-', controlsX + 8, valY + 10);

      // Value
      const valueColor = isSelected ? HUD_COLORS.compassActive : HUD_COLORS.textPrimary;
      drawPixelText(ctx, valStr, controlsX + 20, valY + 3, valueColor, valScale);

      // [+] button
      const canIncrease = this.pointsRemaining > 0;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = canIncrease
        ? (isSelected ? '#e8c84a' : HUD_COLORS.textPrimary)
        : HUD_COLORS.textDim;
      ctx.fillText('+', controlsX + 20 + valW + 12, valY + 10);
    }

    // Points remaining
    const pointsY = STATS_START_Y + STATS.length * STAT_ROW_H + 8;
    ctx.textAlign = 'center';
    ctx.font = '10px monospace';
    ctx.fillStyle = this.pointsRemaining > 0 ? '#e8c84a' : '#44cc44';
    ctx.fillText(`Points remaining: ${this.pointsRemaining}`, HUD_WIDTH / 2, pointsY);

    // Instructions
    const instrY = PANEL_Y + PANEL_H - 14;
    ctx.font = '9px monospace';
    ctx.fillStyle = HUD_COLORS.textDim;
    ctx.textAlign = 'center';
    if (this.pointsRemaining === 0) {
      ctx.fillStyle = '#44cc44';
      ctx.fillText('Up/Down: Select   Left/Right: Adjust   Enter: Begin', HUD_WIDTH / 2, instrY);
    } else {
      ctx.fillText('Up/Down: Select   Left/Right: Adjust   Enter: Begin (spend all points first)', HUD_WIDTH / 2, instrY);
    }

    ctx.textAlign = 'left'; // reset
  }
}
