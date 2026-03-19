import { HUD_WIDTH, HUD_HEIGHT, XP_BAR } from './hudLayout';
import { drawCompass } from './compassRose';
import { drawHealthBar } from './healthBar';
import { drawTorchIndicator } from './torchIndicator';
import { drawStatusIcons } from './statusEffectIcons';
import { hasEffect } from '../core/statusEffects';
import { drawMinimap } from './minimapRenderer';
import { drawInventoryPanel } from './inventoryPanel';
import { drawXpBar } from './xpBar';
import { drawPixelText, measurePixelText } from './hudFont';
import { StatsPanel } from './statsPanel';
import { InventoryOverlay } from './inventoryOverlay';
import { AttributePanel } from './attributePanel';
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
  private inventoryOverlay = new InventoryOverlay();
  private attributePanel = new AttributePanel();

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

  getInventoryOverlay(): InventoryOverlay {
    return this.inventoryOverlay;
  }

  getAttributePanel(): AttributePanel {
    return this.attributePanel;
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

    // Status effect screen tints
    if (gameState.playerStatusEffects.length > 0) {
      const time = this.time;
      if (hasEffect(gameState.playerStatusEffects, 'burning')) {
        const a = 0.08 + 0.04 * Math.sin(time * 12);
        this.ctx.fillStyle = `rgba(255, 100, 0, ${a})`;
        this.ctx.fillRect(0, 0, HUD_WIDTH, HUD_HEIGHT);
      }
      if (hasEffect(gameState.playerStatusEffects, 'poison')) {
        const a = 0.06 + 0.02 * Math.sin(time * 4);
        this.ctx.fillStyle = `rgba(0, 180, 0, ${a})`;
        this.ctx.fillRect(0, 0, HUD_WIDTH, HUD_HEIGHT);
      }
      if (hasEffect(gameState.playerStatusEffects, 'slow')) {
        this.ctx.fillStyle = 'rgba(80, 120, 255, 0.06)';
        this.ctx.fillRect(0, 0, HUD_WIDTH, HUD_HEIGHT);
      }
    }

    // Sword swing overlay
    if (swordSwing?.isActive) {
      swordSwing.draw(this.ctx, HUD_WIDTH, HUD_HEIGHT);
    }

    drawCompass(this.ctx, playerState.facing);
    drawHealthBar(this.ctx, gameState.hp, gameState.maxHp, this.time);
    drawStatusIcons(this.ctx, gameState.playerStatusEffects, this.time);
    drawTorchIndicator(this.ctx, gameState.torchFuel, gameState.maxTorchFuel, this.time);
    drawMinimap(this.ctx, grid, gameState.exploredCells, playerState.col, playerState.row, playerState.facing, gameState.enemies, gameState.doors, gameState.stairs, gameState.secretWalls);
    drawInventoryPanel(this.ctx, gameState);

    const lvl = gameState.level;
    const atCap = lvl >= 15;
    const xpFloor = gameState.xpForLevel(lvl - 1);
    const xpNext  = gameState.xpForLevel(lvl);
    drawXpBar(this.ctx, gameState.xp, lvl, xpFloor, xpNext, atCap);

    // "Press 'L' to level up" hint above XP bar
    if (gameState.attributePoints > 0) {
      const hint = "PRESS 'L' TO LEVEL UP";
      const hintW = measurePixelText(hint, 2);
      const hintX = XP_BAR.x + Math.floor((XP_BAR.w - hintW) / 2);
      const hintY = XP_BAR.y - 12;
      drawPixelText(this.ctx, hint, hintX, hintY, '#e8c84a', 2);
    }

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

    // Inventory overlay (drawn above normal HUD, below other overlays)
    if (this.inventoryOverlay.isOpen()) {
      this.inventoryOverlay.draw(this.ctx, gameState);
    }

    // Attribute panel overlay
    if (this.attributePanel.isOpen()) {
      this.attributePanel.draw(this.ctx, gameState);
    }

    // Stats panel overlay (drawn on top of everything)
    if (this.statsPanel.isOpen()) {
      this.statsPanel.draw(this.ctx, gameState);
    }
  }
}
