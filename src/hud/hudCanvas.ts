import { HUD_WIDTH, HUD_HEIGHT, XP_BAR } from './hudLayout';
import { drawCompass } from './compassRose';
import { drawHealthBar } from './healthBar';
import { drawTorchIndicator } from './torchIndicator';
import { drawHungerBar } from './hungerBar';
import { drawStatusIcons } from './statusEffectIcons';
import { hasEffect } from '../core/statusEffects';
import { drawMinimap } from './minimapRenderer';
import {
  drawInventoryPanel,
  panelHitTest,
  panelHandleMouseMove,
  panelHandleDragStart,
  panelHandleDragEnd,
  panelHandleDblClick,
  panelHandleRightClick,
  panelIsDragging,
  panelClearHover,
} from './inventoryPanel';
import { drawXpBar } from './xpBar';
import { drawPixelText, measurePixelText } from './hudFont';
import { StatsPanel } from './statsPanel';
import { InventoryOverlay } from './inventoryOverlay';
import type { InventoryAction } from './inventoryOverlay';
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
  private _gameState: GameState | null = null;
  private _playerCol = 0;
  private _playerRow = 0;

  onInventoryAction: ((action: InventoryAction) => void) | null = null;

  setPlayerPosition(col: number, row: number): void {
    this._playerCol = col;
    this._playerRow = row;
  }

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

    // Mouse support for inventory overlay
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.inventoryOverlay.isOpen()) return;
      const { hudX, hudY } = this._screenToHud(e.clientX, e.clientY);
      if (this.inventoryOverlay.isDragging()) {
        this.inventoryOverlay.handleDragMove(hudX, hudY);
      } else {
        this.inventoryOverlay.handleMouseMove(hudX, hudY);
      }
    });

    // Left mousedown — start drag
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.inventoryOverlay.isOpen()) return;
      if (e.button === 0) {
        const { hudX, hudY } = this._screenToHud(e.clientX, e.clientY);
        this.inventoryOverlay.handleDragStart(hudX, hudY, this._gameState!);
      } else if (e.button === 2) {
        // Right-click to drop
        e.preventDefault();
        const { hudX, hudY } = this._screenToHud(e.clientX, e.clientY);
        const action = this.inventoryOverlay.handleMouseClick(
          hudX, hudY, 2,
          this._gameState!, this._playerCol, this._playerRow,
        );
        if (action) this.onInventoryAction?.(action);
      }
    });

    // Left mouseup — complete drag
    this.canvas.addEventListener('mouseup', (e) => {
      if (!this.inventoryOverlay.isOpen() || e.button !== 0) return;
      if (this.inventoryOverlay.isDragging()) {
        const { hudX, hudY } = this._screenToHud(e.clientX, e.clientY);
        const action = this.inventoryOverlay.handleDragEnd(hudX, hudY, this._gameState!);
        if (action) this.onInventoryAction?.(action);
      }
    });

    // Double-click to equip/use
    this.canvas.addEventListener('dblclick', (e) => {
      if (!this.inventoryOverlay.isOpen()) return;
      e.preventDefault();
      const { hudX, hudY } = this._screenToHud(e.clientX, e.clientY);
      const action = this.inventoryOverlay.handleMouseClick(
        hudX, hudY, 0,
        this._gameState!, this._playerCol, this._playerRow,
      );
      if (action) this.onInventoryAction?.(action);
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      if (this.inventoryOverlay.isOpen()) e.preventDefault();
    });

    // Window-level listeners for the mini inventory panel.
    // The HUD canvas keeps pointer-events:none so the 3D view is unaffected.
    // We only call preventDefault when the hit test confirms the event lands on
    // the panel, leaving all other events unblocked for the renderer below.

    window.addEventListener('mousemove', (e) => {
      if (this.inventoryOverlay.isOpen()) return;
      const { hudX, hudY } = this._screenToHud(e.clientX, e.clientY);
      if (panelIsDragging()) {
        panelHandleMouseMove(hudX, hudY);
      } else {
        const hit = panelHitTest(hudX, hudY);
        if (hit) {
          panelHandleMouseMove(hudX, hudY);
        } else {
          panelClearHover();
        }
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.inventoryOverlay.isOpen()) return;
      const { hudX, hudY } = this._screenToHud(e.clientX, e.clientY);
      if (e.button === 0 && panelHitTest(hudX, hudY)) {
        panelHandleDragStart(hudX, hudY, this._gameState!);
      } else if (e.button === 2 && panelHitTest(hudX, hudY)) {
        e.preventDefault();
        const action = panelHandleRightClick(
          hudX, hudY, this._gameState!, this._playerCol, this._playerRow,
        );
        if (action) this.onInventoryAction?.(action);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.inventoryOverlay.isOpen()) return;
      if (e.button === 0 && panelIsDragging()) {
        const { hudX, hudY } = this._screenToHud(e.clientX, e.clientY);
        const action = panelHandleDragEnd(hudX, hudY, this._gameState!);
        if (action) this.onInventoryAction?.(action);
      }
    });

    window.addEventListener('dblclick', (e) => {
      if (this.inventoryOverlay.isOpen()) return;
      const { hudX, hudY } = this._screenToHud(e.clientX, e.clientY);
      if (panelHitTest(hudX, hudY)) {
        const action = panelHandleDblClick(hudX, hudY, this._gameState!);
        if (action) this.onInventoryAction?.(action);
      }
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.inventoryOverlay.isOpen()) return;
      const { hudX, hudY } = this._screenToHud(e.clientX, e.clientY);
      if (panelHitTest(hudX, hudY)) e.preventDefault();
    });
  }

  private _screenToHud(screenX: number, screenY: number): { hudX: number; hudY: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = HUD_WIDTH / rect.width;
    const scaleY = HUD_HEIGHT / rect.height;
    return {
      hudX: (screenX - rect.left) * scaleX,
      hudY: (screenY - rect.top) * scaleY,
    };
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
    this._gameState = gameState;
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

    // Starvation screen tint
    if (gameState.hunger <= 0) {
      this.ctx.fillStyle = 'rgba(100, 60, 0, 0.06)';
      this.ctx.fillRect(0, 0, HUD_WIDTH, HUD_HEIGHT);
    }

    // Sword swing overlay
    if (swordSwing?.isActive) {
      swordSwing.draw(this.ctx, HUD_WIDTH, HUD_HEIGHT);
    }

    drawCompass(this.ctx, playerState.facing);
    drawHealthBar(this.ctx, gameState.hp, gameState.maxHp, this.time);
    drawStatusIcons(this.ctx, gameState.playerStatusEffects, this.time);
    drawTorchIndicator(this.ctx, gameState.torchFuel, gameState.maxTorchFuel, this.time);
    drawHungerBar(this.ctx, gameState.hunger, gameState.maxHunger, this.time);
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
    this.canvas.style.pointerEvents = this.inventoryOverlay.isOpen() ? 'auto' : 'none';

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
