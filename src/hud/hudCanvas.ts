import { HUD_WIDTH, HUD_HEIGHT } from './hudLayout';
import { drawCompass } from './compassRose';
import { drawHealthBar } from './healthBar';
import { drawTorchIndicator } from './torchIndicator';
import { drawMinimap } from './minimapRenderer';
import { drawInventoryPanel } from './inventoryPanel';
import type { GameState } from '../core/gameState';
import type { PlayerState } from '../core/grid';

export class HudOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private time: number = 0;

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

  draw(gameState: GameState, playerState: PlayerState, grid: string[], delta: number = 0): void {
    this.time += delta;
    this.ctx.clearRect(0, 0, HUD_WIDTH, HUD_HEIGHT);
    drawCompass(this.ctx, playerState.facing);
    drawHealthBar(this.ctx, gameState.hp, gameState.maxHp, this.time);
    drawTorchIndicator(this.ctx, gameState.torchFuel, gameState.maxTorchFuel, this.time);
    drawMinimap(this.ctx, grid, gameState.exploredCells, playerState.col, playerState.row, playerState.facing);
    drawInventoryPanel(this.ctx, gameState.inventory.size);
  }
}
