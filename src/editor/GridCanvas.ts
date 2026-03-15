import { EditorApp } from './EditorApp';
import { resolveTextures } from '../core/textureResolver';
import { getWallTexture, getFloorTexture, getCeilingTexture } from '../rendering/textures';
import type { WallTextureName, FloorTextureName, CeilingTextureName } from '../core/textureNames';
import type { Entity } from '../core/types';
import type { Facing } from '../core/grid';
import { itemDatabase } from '../core/itemDatabase';

const TILE_SIZE = 32;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Simple image cache for entity sprite previews
const spriteCache = new Map<string, HTMLImageElement>();
function getSpriteImage(path: string): HTMLImageElement | null {
  const cached = spriteCache.get(path);
  if (cached) return cached.complete ? cached : null;
  const img = new Image();
  img.src = path;
  spriteCache.set(path, img);
  return null;
}

export class GridCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private app: EditorApp;
  private dirty = true;
  private isPanning = false;
  private isPainting = false;
  private lastPanX = 0;
  private lastPanY = 0;
  private onHoverChange: (() => void) | null = null;
  private onSelectionChange: (() => void) | null = null;
  private onPickComplete: (() => void) | null = null;
  private onBeforePaint: (() => void) | null = null;
  private onAfterPaint: (() => void) | null = null;
  private onBeforeEntityAdd: (() => void) | null = null;
  private onBeforePickComplete: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, container: HTMLElement, app: EditorApp) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.app = app;

    this.setupEvents();
    this.setupResize(container);
    this.startRenderLoop();
  }

  setHoverCallback(cb: () => void): void {
    this.onHoverChange = cb;
  }

  setSelectionCallback(cb: () => void): void {
    this.onSelectionChange = cb;
  }

  setPickCompleteCallback(cb: () => void): void {
    this.onPickComplete = cb;
  }

  setBeforePaintCallback(cb: () => void): void {
    this.onBeforePaint = cb;
  }

  setAfterPaintCallback(cb: () => void): void {
    this.onAfterPaint = cb;
  }

  setBeforeEntityAddCallback(cb: () => void): void {
    this.onBeforeEntityAdd = cb;
  }

  setBeforePickCompleteCallback(cb: () => void): void {
    this.onBeforePickComplete = cb;
  }

  markDirty(): void {
    this.dirty = true;
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  private setupEvents(): void {
    const canvas = this.canvas;

    canvas.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        const dx = e.clientX - this.lastPanX;
        const dy = e.clientY - this.lastPanY;
        this.app.viewport.offsetX += dx;
        this.app.viewport.offsetY += dy;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        this.dirty = true;
      }

      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const { col, row } = this.screenToGrid(screenX, screenY);

      const level = this.app.level;
      if (level && row >= 0 && row < level.grid.length && col >= 0 && col < level.grid[0].length) {
        const char = level.grid[row][col];
        this.app.hover = { col, row, char };
      } else {
        this.app.hover = null;
      }

      // Drag-paint: paint into cells as cursor moves while button is held
      if (this.isPainting && this.app.hover) {
        const tool = this.app.activeTool;
        const paintChar = tool === 'erase' ? ' ' : this.app.selectedChar;
        this.app.paintCell(this.app.hover.col, this.app.hover.row, paintChar);
      }

      this.onHoverChange?.();
      this.dirty = true;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        this.isPanning = true;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        e.preventDefault();
      }

      if (e.button === 0) {
        if (this.app.coordPickCallback) {
          const rect = canvas.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const { col, row } = this.screenToGrid(screenX, screenY);
          this.onBeforePickComplete?.();
          const cb = this.app.coordPickCallback;
          this.app.coordPickCallback = null;
          cb(col, row);
          this.onPickComplete?.();
          this.dirty = true;
          return;
        }

        if (this.app.pickMode) {
          const rect = canvas.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const { col, row } = this.screenToGrid(screenX, screenY);
          this.onBeforePickComplete?.();
          const success = this.app.completePickMode(col, row);
          if (success) this.onPickComplete?.();
          this.dirty = true;
          return;
        }

        const tool = this.app.activeTool;
        if (tool === 'paint' || tool === 'erase') {
          this.onBeforePaint?.();
          const rect = canvas.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const { col, row } = this.screenToGrid(screenX, screenY);
          const char = tool === 'erase' ? ' ' : this.app.selectedChar;
          this.app.paintCell(col, row, char);
          this.isPainting = true;
          this.dirty = true;
        } else if (tool === 'select') {
          const rect = canvas.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const { col, row } = this.screenToGrid(screenX, screenY);
          const entity = this.app.selectEntityAt(col, row);
          if (!entity) this.app.deselectEntity();
          this.onSelectionChange?.();
          this.dirty = true;
        } else if (tool === 'entity') {
          const rect = canvas.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const { col, row } = this.screenToGrid(screenX, screenY);
          this.onBeforeEntityAdd?.();
          this.app.addEntity(col, row, this.app.selectedEntityType);
          this.onSelectionChange?.();
          this.dirty = true;
        }
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 1) {
        this.isPanning = false;
      }
      if (e.button === 0) {
        if (this.isPainting) this.onAfterPaint?.();
        this.isPainting = false;
      }
    });

    canvas.addEventListener('mouseleave', () => {
      this.isPanning = false;
      if (this.isPainting) this.onAfterPaint?.();
      this.isPainting = false;
      this.app.hover = null;
      this.onHoverChange?.();
      this.dirty = true;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const vp = this.app.viewport;
      const oldZoom = vp.zoom;
      const newZoom = clamp(oldZoom * (e.deltaY < 0 ? 1.1 : 0.9), MIN_ZOOM, MAX_ZOOM);

      // Keep the point under cursor fixed in world space
      vp.offsetX = cursorX - (cursorX - vp.offsetX) * (newZoom / oldZoom);
      vp.offsetY = cursorY - (cursorY - vp.offsetY) * (newZoom / oldZoom);
      vp.zoom = newZoom;

      this.dirty = true;
    }, { passive: false });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.app.coordPickCallback) {
        this.app.coordPickCallback = null;
        this.onPickComplete?.();
        this.dirty = true;
        return;
      }
      if (this.app.pickMode) {
        this.app.cancelPickMode();
        this.onPickComplete?.();
        this.dirty = true;
      }
    });
  }

  private setupResize(container: HTMLElement): void {
    const observer = new ResizeObserver(() => {
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
      this.dirty = true;
    });
    observer.observe(container);

    // Initial size
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
  }

  private startRenderLoop(): void {
    const loop = () => {
      if (this.dirty) {
        this.render();
        this.dirty = false;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // -------------------------------------------------------------------------
  // Coordinate conversion
  // -------------------------------------------------------------------------

  private screenToGrid(screenX: number, screenY: number): { col: number; row: number } {
    const { offsetX, offsetY, zoom } = this.app.viewport;
    const col = Math.floor((screenX - offsetX) / (TILE_SIZE * zoom));
    const row = Math.floor((screenY - offsetY) / (TILE_SIZE * zoom));
    return { col, row };
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private render(): void {
    const { canvas, ctx } = this;
    ctx.imageSmoothingEnabled = false;

    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const level = this.app.level;
    if (!level) return;

    const { offsetX, offsetY, zoom } = this.app.viewport;
    const tileSize = TILE_SIZE * zoom;
    const rows = level.grid.length;
    const cols = level.grid[0].length;

    // Visible cell range (with 1-cell buffer)
    const firstCol = Math.max(0, Math.floor(-offsetX / tileSize) - 1);
    const firstRow = Math.max(0, Math.floor(-offsetY / tileSize) - 1);
    const lastCol = Math.min(cols - 1, Math.ceil((canvas.width - offsetX) / tileSize));
    const lastRow = Math.min(rows - 1, Math.ceil((canvas.height - offsetY) / tileSize));

    // Draw cells
    for (let r = firstRow; r <= lastRow; r++) {
      for (let c = firstCol; c <= lastCol; c++) {
        const char = level.grid[r][c];
        const px = Math.floor(offsetX + c * tileSize);
        const py = Math.floor(offsetY + r * tileSize);
        const tw = Math.ceil(tileSize);
        const th = Math.ceil(tileSize);

        this.drawCell(c, r, char, px, py, tw, th);
      }
    }

    // Draw grid lines
    this.drawGridLines(firstCol, firstRow, lastCol, lastRow, offsetX, offsetY, tileSize);

    // Draw entity overlays
    this.drawEntityOverlays(firstCol, firstRow, lastCol, lastRow, offsetX, offsetY, tileSize);

    // Draw player start marker
    this.drawPlayerStart(offsetX, offsetY, tileSize);

    // Draw hover highlight
    this.drawHover(offsetX, offsetY, tileSize);

    // Draw selection highlight
    this.drawSelectionHighlight(offsetX, offsetY, tileSize);

    // Draw wiring lines for lever/pressure_plate -> door connections
    this.drawWiringLines(offsetX, offsetY, tileSize);
  }

  private drawCell(
    col: number,
    row: number,
    char: string,
    px: number,
    py: number,
    tw: number,
    th: number,
  ): void {
    const { ctx, app } = this;
    const level = app.level!;

    if (char === ' ') {
      // Void — checkered pattern
      const even = (col + row) % 2 === 0;
      ctx.fillStyle = even ? '#1a1a1a' : '#222';
      ctx.fillRect(px, py, tw, th);
      return;
    }

    const charDef = app.charDefMap.get(char);
    const isSolid = char === '#' || (charDef !== undefined && charDef.solid);

    if (isSolid) {
      // Wall — resolve wall texture, draw with dark overlay
      const { wall } = resolveTextures(col, row, char, level.defaults, app.charDefMap, level.areas);
      const texImage = getWallTexture(wall as WallTextureName).image as HTMLCanvasElement;
      ctx.drawImage(texImage, px, py, tw, th);
      // Dark overlay to distinguish walls from floor
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(px, py, tw, th);
    } else if (app.showCeiling) {
      // Ceiling view mode
      const { ceiling } = resolveTextures(col, row, char, level.defaults, app.charDefMap, level.areas);
      const texImage = getCeilingTexture(ceiling as CeilingTextureName).image as HTMLCanvasElement;
      ctx.drawImage(texImage, px, py, tw, th);
    } else {
      // Floor view mode (default)
      const { floor } = resolveTextures(col, row, char, level.defaults, app.charDefMap, level.areas);
      const texImage = getFloorTexture(floor as FloorTextureName).image as HTMLCanvasElement;
      ctx.drawImage(texImage, px, py, tw, th);
    }
  }


  private drawGridLines(
    firstCol: number,
    firstRow: number,
    lastCol: number,
    lastRow: number,
    offsetX: number,
    offsetY: number,
    tileSize: number,
  ): void {
    const { ctx, canvas } = this;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;

    ctx.beginPath();

    // Vertical lines
    for (let c = firstCol; c <= lastCol + 1; c++) {
      const x = Math.floor(offsetX + c * tileSize) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }

    // Horizontal lines
    for (let r = firstRow; r <= lastRow + 1; r++) {
      const y = Math.floor(offsetY + r * tileSize) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }

    ctx.stroke();
  }

  private drawEntityOverlays(
    firstCol: number,
    firstRow: number,
    lastCol: number,
    lastRow: number,
    offsetX: number,
    offsetY: number,
    tileSize: number,
  ): void {
    const level = this.app.level!;
    const { ctx } = this;

    for (const entity of level.entities) {
      if (entity.col < firstCol || entity.col > lastCol) continue;
      if (entity.row < firstRow || entity.row > lastRow) continue;

      const px = Math.floor(offsetX + entity.col * tileSize);
      const py = Math.floor(offsetY + entity.row * tileSize);
      const tw = Math.ceil(tileSize);
      const th = Math.ceil(tileSize);

      this.drawEntityIcon(entity, px, py, tw, th);
    }
  }

  private drawEntityIcon(entity: Entity, px: number, py: number, tw: number, th: number): void {
    const { ctx } = this;

    // Try sprite preview mode first
    if (this.app.showItemPreview && this.drawEntitySprite(entity, px, py, tw, th)) {
      return;
    }

    const cx = px + tw / 2;
    const cy = py + th / 2;
    const iconRadius = Math.max(3, Math.min(tw, th) * 0.2);
    const fontSize = Math.max(8, Math.min(tw, th) * 0.28);

    ctx.save();

    switch (entity.type) {
      case 'enemy': {
        ctx.fillStyle = '#cc2222';
        ctx.beginPath();
        ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'key': {
        ctx.fillStyle = '#ffd700';
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('K', cx, cy);
        break;
      }

      case 'lever': {
        const lWall = (entity.wall as string) || 'N';
        const lLen = Math.max(4, Math.min(tw, th) * 0.3);
        const lThick = Math.max(2, Math.min(tw, th) * 0.08);
        // Bar sticks out perpendicular from the wall
        let lx: number, ly: number, lw: number, lh: number;
        if (lWall === 'N') {
          lx = cx - lThick / 2; ly = py; lw = lThick; lh = lLen;
        } else if (lWall === 'S') {
          lx = cx - lThick / 2; ly = py + th - lLen; lw = lThick; lh = lLen;
        } else if (lWall === 'W') {
          lx = px; ly = cy - lThick / 2; lw = lLen; lh = lThick;
        } else {
          lx = px + tw - lLen; ly = cy - lThick / 2; lw = lLen; lh = lThick;
        }
        ctx.fillStyle = '#8B5A2B';
        ctx.fillRect(lx, ly, lw, lh);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = Math.max(1, lThick * 0.3);
        ctx.strokeRect(lx, ly, lw, lh);
        break;
      }

      case 'pressure_plate': {
        // Diamond shape
        ctx.fillStyle = '#aaaaaa';
        const d = iconRadius * 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - d);
        ctx.lineTo(cx + d, cy);
        ctx.lineTo(cx, cy + d);
        ctx.lineTo(cx - d, cy);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'equipment': {
        ctx.fillStyle = '#44cc44';
        const hs = iconRadius;
        ctx.fillRect(cx - hs, cy - hs, hs * 2, hs * 2);
        break;
      }

      case 'consumable': {
        ctx.fillStyle = '#ff88cc';
        ctx.beginPath();
        ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'torch_sconce': {
        const sWall = (entity.wall as string) || 'N';
        const sInset = Math.max(1, Math.min(tw, th) * 0.05);
        const sRadius = Math.max(2, Math.min(tw, th) * 0.1);
        // Position the flame center against the wall edge
        let sx: number, sy: number;
        if (sWall === 'N') {
          sx = cx; sy = py + sInset + sRadius;
        } else if (sWall === 'S') {
          sx = cx; sy = py + th - sInset - sRadius;
        } else if (sWall === 'W') {
          sx = px + sInset + sRadius; sy = cy;
        } else {
          sx = px + tw - sInset - sRadius; sy = cy;
        }
        // Warm aura glow
        const auraRadius = sRadius * 3.5;
        const grad = ctx.createRadialGradient(sx, sy, sRadius * 0.5, sx, sy, auraRadius);
        grad.addColorStop(0, 'rgba(255, 200, 60, 0.35)');
        grad.addColorStop(1, 'rgba(255, 200, 60, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx - auraRadius, sy - auraRadius, auraRadius * 2, auraRadius * 2);
        // Flame circle
        ctx.fillStyle = '#ffcc33';
        ctx.beginPath();
        ctx.arc(sx, sy, sRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#cc8800';
        ctx.lineWidth = Math.max(1, sRadius * 0.3);
        ctx.beginPath();
        ctx.arc(sx, sy, sRadius, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'door': {
        const ew = this.isDoorEW(entity.col, entity.row);
        const barThick = Math.max(2, Math.min(tw, th) * 0.1);
        const hingeSize = Math.max(2, Math.min(tw, th) * 0.08);
        const pad = Math.min(tw, th) * 0.05;

        ctx.fillStyle = '#c8a060';
        ctx.strokeStyle = '#6b4226';
        ctx.lineWidth = Math.max(1, barThick * 0.3);

        if (ew) {
          // Bar runs E-W (horizontal)
          const bx = px + pad;
          const by = cy - barThick / 2;
          const bw = tw - pad * 2;
          ctx.fillRect(bx, by, bw, barThick);
          ctx.strokeRect(bx, by, bw, barThick);
          // Hinges at left and right ends
          ctx.fillStyle = '#555';
          ctx.fillRect(bx, cy - hingeSize, hingeSize, hingeSize * 2);
          ctx.fillRect(bx + bw - hingeSize, cy - hingeSize, hingeSize, hingeSize * 2);
        } else {
          // Bar runs N-S (vertical)
          const bx = cx - barThick / 2;
          const by = py + pad;
          const bh = th - pad * 2;
          ctx.fillRect(bx, by, barThick, bh);
          ctx.strokeRect(bx, by, barThick, bh);
          // Hinges at top and bottom ends
          ctx.fillStyle = '#555';
          ctx.fillRect(cx - hingeSize, by, hingeSize * 2, hingeSize);
          ctx.fillRect(cx - hingeSize, by + bh - hingeSize, hingeSize * 2, hingeSize);
        }

        // Padlock overlay for keyed doors
        if (entity.keyId) {
          const s = iconRadius * 0.5;
          const lockX = cx + iconRadius * 0.6;
          const lockY = cy - iconRadius * 0.4;
          ctx.fillStyle = '#ffcc44';
          ctx.fillRect(lockX - s, lockY, s * 2, s * 1.2);
          ctx.strokeStyle = '#ffcc44';
          ctx.lineWidth = Math.max(1, s * 0.3);
          ctx.beginPath();
          ctx.arc(lockX, lockY - s * 0.1, s * 0.5, Math.PI, 0);
          ctx.stroke();
        }
        break;
      }

      case 'stairs': {
        const isDown = entity.direction === 'down';
        ctx.fillStyle = '#80c0ff';
        ctx.font = `bold ${fontSize * 2}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isDown ? '\u2193' : '\u2191', cx, cy);
        break;
      }

      default:
        break;
    }

    ctx.restore();
  }

  /**
   * Try to draw a sprite image for this entity. Returns true if drawn,
   * false if no sprite is available (caller should fall back to simple icon).
   */
  private drawEntitySprite(entity: Entity, px: number, py: number, tw: number, th: number): boolean {
    let spritePath: string | null = null;

    switch (entity.type) {
      case 'enemy': {
        const enemyType = (entity.enemyType as string) || 'rat';
        spritePath = `/sprites/${enemyType}.png`;
        break;
      }
      case 'key':
        spritePath = '/sprites/items/key.png';
        break;
      case 'equipment':
      case 'consumable': {
        const itemId = entity.itemId as string;
        if (itemId) {
          const def = itemDatabase.getItem(itemId);
          if (def) {
            spritePath = `/sprites/items/${def.icon}.png`;
          }
        }
        break;
      }
      default:
        // No sprite available for this entity type
        return false;
    }

    if (!spritePath) return false;

    const img = getSpriteImage(spritePath);
    if (!img) {
      this.dirty = true; // re-render once the image loads
      return false;
    }

    const { ctx } = this;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // Draw sprite scaled to fit tile with some padding
    const pad = Math.max(2, tw * 0.1);
    ctx.drawImage(img, px + pad, py + pad, tw - pad * 2, th - pad * 2);
    ctx.restore();
    return true;
  }

  /** Detect door orientation: EW means bar runs east-west (horizontal). */
  private isDoorEW(col: number, row: number): boolean {
    const level = this.app.level!;
    const grid = level.grid;
    const rows = grid.length;
    const cols = grid[0].length;
    const walkable = this.app.walkableSet;

    const eastSolid = col + 1 >= cols || !walkable.has(grid[row][col + 1]);
    const westSolid = col - 1 < 0 || !walkable.has(grid[row][col - 1]);
    if (eastSolid && westSolid) return true;
    return false;
  }

  private drawPlayerStart(offsetX: number, offsetY: number, tileSize: number): void {
    const level = this.app.level!;
    const { ctx } = this;
    const { col, row, facing } = level.playerStart;

    const px = Math.floor(offsetX + col * tileSize);
    const py = Math.floor(offsetY + row * tileSize);
    const tw = Math.ceil(tileSize);
    const th = Math.ceil(tileSize);
    const cx = px + tw / 2;
    const cy = py + th / 2;
    const r = Math.max(4, Math.min(tw, th) * 0.28);

    // Arrow direction vectors per facing
    const arrows: Record<Facing, [number, number]> = {
      N: [0, -1],
      E: [1, 0],
      S: [0, 1],
      W: [-1, 0],
    };

    const [dx, dy] = arrows[facing];
    const tipX = cx + dx * r;
    const tipY = cy + dy * r;

    // Perpendicular for triangle base
    const perpX = -dy;
    const perpY = dx;
    const baseHalf = r * 0.6;

    ctx.save();
    ctx.fillStyle = '#ffd700';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(cx - dx * r * 0.4 + perpX * baseHalf, cy - dy * r * 0.4 + perpY * baseHalf);
    ctx.lineTo(cx - dx * r * 0.4 - perpX * baseHalf, cy - dy * r * 0.4 - perpY * baseHalf);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawHover(offsetX: number, offsetY: number, tileSize: number): void {
    const { hover } = this.app;
    if (!hover) return;

    const { ctx } = this;
    const px = Math.floor(offsetX + hover.col * tileSize);
    const py = Math.floor(offsetY + hover.row * tileSize);
    const tw = Math.ceil(tileSize);
    const th = Math.ceil(tileSize);

    let strokeColor: string;
    let fillColor: string;

    if (this.app.pickMode) {
      const isValid = this.app.isValidPickTarget(hover.col, hover.row);
      strokeColor = isValid ? 'rgba(68, 255, 68, 0.8)' : 'rgba(255, 68, 68, 0.5)';
      fillColor = isValid ? 'rgba(68, 255, 68, 0.15)' : 'rgba(255, 68, 68, 0.05)';
    } else {
      switch (this.app.activeTool) {
        case 'paint':
          strokeColor = 'rgba(68, 136, 255, 0.7)';
          fillColor = 'rgba(68, 136, 255, 0.1)';
          break;
        case 'erase':
          strokeColor = 'rgba(255, 68, 68, 0.7)';
          fillColor = 'rgba(255, 68, 68, 0.1)';
          break;
        case 'entity':
          strokeColor = 'rgba(68, 255, 68, 0.7)';
          fillColor = 'rgba(68, 255, 68, 0.1)';
          break;
        default:
          strokeColor = 'rgba(255, 255, 255, 0.6)';
          fillColor = 'rgba(255, 255, 255, 0.05)';
          break;
      }
    }

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, tw - 1, th - 1);
    ctx.fillStyle = fillColor;
    ctx.fillRect(px, py, tw, th);
    ctx.restore();
  }

  private drawSelectionHighlight(offsetX: number, offsetY: number, tileSize: number): void {
    const entity = this.app.selectedEntity;
    if (!entity) return;

    const { ctx } = this;
    const px = Math.floor(offsetX + entity.col * tileSize);
    const py = Math.floor(offsetY + entity.row * tileSize);
    const tw = Math.ceil(tileSize);
    const th = Math.ceil(tileSize);

    ctx.save();
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, tw - 2, th - 2);
    ctx.restore();
  }

  updateCursor(): void {
    if (this.app.pickMode) { this.canvas.style.cursor = 'crosshair'; return; }
    const tool = this.app.activeTool;
    this.canvas.style.cursor = tool === 'paint' || tool === 'erase' || tool === 'entity' ? 'crosshair' : 'default';
  }

  private drawArrowhead(x1: number, y1: number, x2: number, y2: number, size: number): void {
    const { ctx } = this;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  private drawWiringLines(offsetX: number, offsetY: number, tileSize: number): void {
    const level = this.app.level;
    if (!level) return;

    const { ctx } = this;
    const selected = this.app.selectedEntity;

    // Collect all wiring arrows from every lever/pressure_plate
    type Arrow = { fromCol: number; fromRow: number; toCol: number; toRow: number; active: boolean };
    const arrows: Arrow[] = [];

    for (const e of level.entities) {
      if ((e.type === 'lever' || e.type === 'pressure_plate') && e.target) {
        const targetId = e.target as string;
        const targetEntity = level.entities.find(t => t.id === targetId);
        if (!targetEntity) continue;
        const isActive = selected !== null && (
          e === selected ||
          (selected.id !== undefined && selected.id === targetId)
        );
        arrows.push({ fromCol: e.col, fromRow: e.row, toCol: targetEntity.col, toRow: targetEntity.row, active: isActive });
      }
      if (e.type === 'key' && (e as Record<string, unknown>).keyId) {
        const keyId = (e as Record<string, unknown>).keyId as string;
        for (const other of level.entities) {
          if (other.type === 'door' && (other as Record<string, unknown>).keyId === keyId) {
            const isActive = selected !== null && (e === selected || other === selected);
            arrows.push({ fromCol: e.col, fromRow: e.row, toCol: other.col, toRow: other.row, active: isActive });
          }
        }
      }
    }

    if (arrows.length === 0) return;

    // Draw inactive first, then active on top
    for (const active of [false, true]) {
      for (const a of arrows) {
        if (a.active !== active) continue;

        const color = active ? '#ffaa00' : 'rgba(150, 150, 150, 0.6)';
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = active ? 2 : 1;
        ctx.setLineDash(active ? [6, 3] : [4, 3]);

        const x1 = offsetX + (a.fromCol + 0.5) * tileSize;
        const y1 = offsetY + (a.fromRow + 0.5) * tileSize;
        const x2 = offsetX + (a.toCol + 0.5) * tileSize;
        const y2 = offsetY + (a.toRow + 0.5) * tileSize;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.setLineDash([]);
        this.drawArrowhead(x1, y1, x2, y2, active ? 8 : 5);

        ctx.restore();
      }
    }
  }
}
