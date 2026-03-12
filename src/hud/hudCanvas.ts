import { HUD_WIDTH, HUD_HEIGHT } from './hudLayout';
import { drawCompass } from './compassRose';
import { drawHealthBar } from './healthBar';
import { drawTorchIndicator } from './torchIndicator';
import { drawMinimap } from './minimapRenderer';
import { drawInventoryPanel } from './inventoryPanel';
import { drawXpBar } from './xpBar';
import { StatsPanel } from './statsPanel';
import type { LevelUpNotification } from './levelUpNotification';
import type { GameState } from '../core/gameState';
import type { PlayerState } from '../core/grid';
import type { SwordSwingAnimator } from '../rendering/swordSwing';

const MESSAGE_DURATION = 2.5; // seconds

export class HudOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private time: number = 0;
  private messageText: string = '';
  private messageTimer: number = 0;
  private statsPanel = new StatsPanel();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = HUD_WIDTH;
    this.canvas.height = HUD_HEIGHT;
    this.canvas.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 100vw',
      'height: 100vh',
      'pointer-events: none',
      'image-rendering: pixelated',
      'image-rendering: crisp-edges',
      'z-index: 10',
    ].join(';');
    this.ctx = this.canvas.getContext('2d')!;
  }

  attach(parent: HTMLElement = document.body): void {
    parent.appendChild(this.canvas);
  }

  /** Expose the underlying canvas element for overlays that share the HUD surface. */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getStatsPanel(): StatsPanel {
    return this.statsPanel;
  }

  /** Show a temporary text message centered on screen. */
  showMessage(text: string): void {
    this.messageText = text;
    this.messageTimer = MESSAGE_DURATION;
  }

  draw(
    gameState: GameState,
    playerState: PlayerState,
    grid: string[],
    delta: number = 0,
    damageFlashAlpha: number = 0,
    swordSwing?: SwordSwingAnimator,
    levelUpNotification?: LevelUpNotification,
  ): void {
    this.time += delta;
    this.ctx.clearRect(0, 0, HUD_WIDTH, HUD_HEIGHT);

    // Player damage flash — red overlay
    if (damageFlashAlpha > 0) {
      this.ctx.fillStyle = `rgba(180, 0, 0, ${damageFlashAlpha * 0.4})`;
      this.ctx.fillRect(0, 0, HUD_WIDTH, HUD_HEIGHT);
    }

    // Sword swing overlay
    if (swordSwing?.isActive) {
      swordSwing.draw(this.ctx, HUD_WIDTH, HUD_HEIGHT);
    }

    drawCompass(this.ctx, playerState.facing);
    drawHealthBar(this.ctx, gameState.hp, gameState.maxHp, this.time);
    drawTorchIndicator(this.ctx, gameState.torchFuel, gameState.maxTorchFuel, this.time);
    drawMinimap(this.ctx, grid, gameState.exploredCells, playerState.col, playerState.row, playerState.facing, gameState.enemies);
    drawInventoryPanel(this.ctx, gameState);

    const lvl = gameState.level;
    const atCap = lvl >= 15;
    const xpFloor = gameState.xpForLevel(lvl - 1);
    const xpNext  = gameState.xpForLevel(lvl);
    drawXpBar(this.ctx, gameState.xp, lvl, xpFloor, xpNext, atCap);

    // HUD message (e.g., equip denial)
    if (this.messageTimer > 0) {
      this.messageTimer -= delta;
      const alpha = Math.min(1, this.messageTimer / 0.5); // fade out last 0.5s
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.font = '10px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillStyle = '#000000';
      this.ctx.fillText(this.messageText, HUD_WIDTH / 2 + 1, HUD_HEIGHT / 2 + 1);
      this.ctx.fillStyle = '#ff6644';
      this.ctx.fillText(this.messageText, HUD_WIDTH / 2, HUD_HEIGHT / 2);
      this.ctx.restore();
    }

    // Level-up notification (drawn last so it appears on top)
    if (levelUpNotification?.isActive()) {
      levelUpNotification.draw(this.ctx);
    }

    // Stats panel overlay (drawn on top of everything)
    if (this.statsPanel.isOpen()) {
      this.statsPanel.draw(this.ctx, gameState);
    }
  }
}
