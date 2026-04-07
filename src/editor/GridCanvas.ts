import { EditorApp } from './EditorApp';
import { resolveTextures } from '../core/textureResolver';
import { getWallTexture, getFloorTexture, getCeilingTexture } from '../rendering/textures';
import type { WallTextureName, FloorTextureName, CeilingTextureName } from '../core/textureNames';
import type { Entity, CharDef } from '../core/types';
import { getTreeOverlayCanvas } from './treeOverlay';
import type { Facing } from '../core/grid';
import { itemDatabase } from '../core/itemDatabase';
import { npcDatabase } from '../npcs/npcDatabase';

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
  private isThinWallDrawing = false;
  private thinWallDrawStart: { col: number; row: number; wall: 'S' | 'E' } | null = null;
  private thinWallDrawEdges: Array<{ col: number; row: number; wall: 'S' | 'E' }> = [];
  private hoveredEdge: { col: number; row: number; wall: 'S' | 'E' } | null = null;
  private lastPanX = 0;
  private lastPanY = 0;
  private onHoverChange: (() => void) | null = null;
  private onSelectionChange: (() => void) | null = null;
  private onPickComplete: (() => void) | null = null;
  private onBeforePaint: (() => void) | null = null;
  private onAfterPaint: (() => void) | null = null;
  private onBeforeEntityAdd: (() => void) | null = null;
  private onBeforePickComplete: (() => void) | null = null;
  private potentialWireSource: { entity: Entity; col: number; row: number } | null = null;

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

      // Update drag rectangle during area drag
      if (this.app.areaDragState && this.app.hover) {
        this.app.areaDragState.currentCol = this.app.hover.col;
        this.app.areaDragState.currentRow = this.app.hover.row;
        this.dirty = true;
      }

      // Transition potential wire source to active wire drag when cursor leaves the source cell
      if (this.potentialWireSource && this.app.hover) {
        const pw = this.potentialWireSource;
        if (this.app.hover.col !== pw.col || this.app.hover.row !== pw.row) {
          const info = this.app.getWireSourceInfo(pw.entity);
          if (info) {
            this.app.wireDragState = {
              sourceEntity: pw.entity,
              field: info.field,
              validEntityType: info.validEntityType,
              startCol: pw.col,
              startRow: pw.row,
              mouseX: screenX,
              mouseY: screenY,
            };
            this.canvas.style.cursor = 'crosshair';
          }
          this.potentialWireSource = null;
        }
      }

      // Update wire drag mouse position
      if (this.app.wireDragState) {
        this.app.wireDragState.mouseX = screenX;
        this.app.wireDragState.mouseY = screenY;
      }

      // Drag-paint: paint into cells as cursor moves while button is held
      if (this.isPainting && this.app.hover) {
        this.app.paintCell(this.app.hover.col, this.app.hover.row, this.app.selectedChar);
      }

      // Thin wall hover tracking and drag drawing
      if (this.app.activeTool === 'thin_wall') {
        const { col: fCol, row: fRow, fracX, fracY } = this.screenToGridFrac(screenX, screenY);
        this.hoveredEdge = this.app.resolveNearestEdge(fCol, fRow, fracX, fracY);

        if (this.isThinWallDrawing) {
          const edge = this.hoveredEdge;
          if (this.app.thinWallEraseOnly && edge) {
            this.onBeforePaint?.();
            this.app.eraseThinWallOnEdge(edge.col, edge.row, edge.wall);
            this.onAfterPaint?.();
          } else if (this.thinWallDrawStart && edge) {
            this.thinWallDrawEdges = this.computeThinWallLine(this.thinWallDrawStart, edge);
          }
        }
      } else {
        this.hoveredEdge = null;
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
        if (this.app.coordDragCallback) {
          const rect = canvas.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const { col, row } = this.screenToGrid(screenX, screenY);
          this.app.areaDragState = { startCol: col, startRow: row, currentCol: col, currentRow: row };
          this.dirty = true;
          return;
        }

        if (this.app.coordPickCallback) {
          const rect = canvas.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const { col, row } = this.screenToGrid(screenX, screenY);
          this.onBeforePickComplete?.();
          const cb = this.app.coordPickCallback;
          cb(col, row);
          // Only clear if the callback accepted the pick (set itself to null or kept itself)
          if (this.app.coordPickCallback === cb) {
            // Callback didn't clear itself — it rejected the click, stay in pick mode
          } else {
            this.onPickComplete?.();
          }
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
        if (tool === 'paint') {
          this.onBeforePaint?.();
          const rect = canvas.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const { col, row } = this.screenToGrid(screenX, screenY);
          const char = this.app.selectedChar;
          if (this.app.floodFill) {
            this.app.floodFillCell(col, row, char);
            this.onAfterPaint?.(); // commit undo batch immediately (no drag)
          } else {
            this.app.paintCell(col, row, char);
            this.isPainting = true;
          }
          this.dirty = true;
        } else if (tool === 'select') {
          const rect = canvas.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const { col, row, fracX, fracY } = this.screenToGridFrac(screenX, screenY);

          // Try thin wall edge selection first when click is near a cell edge
          const nearEdge = fracX < 0.2 || fracX > 0.8 || fracY < 0.2 || fracY > 0.8;
          if (nearEdge) {
            const edge = this.app.resolveNearestEdge(col, row, fracX, fracY);
            if (edge) {
              const tw = this.app.selectThinWallOnEdge(edge.col, edge.row, edge.wall);
              if (tw) {
                this.potentialWireSource = null;
                this.onSelectionChange?.();
                this.dirty = true;
                return;
              }
            }
          }

          const entity = this.app.selectEntityAt(col, row);
          if (!entity) this.app.deselectEntity();
          // Record potential wire drag source — try selected entity first,
          // then fall back to any wirable entity at this cell
          let wireSource: Entity | null = null;
          if (entity && this.app.getWireSourceInfo(entity)) {
            wireSource = entity;
          } else {
            const allAt = this.app.getEntitiesAt(col, row);
            for (const e of allAt) {
              if (this.app.getWireSourceInfo(e)) { wireSource = e; break; }
            }
          }
          this.potentialWireSource = wireSource ? { entity: wireSource, col, row } : null;
          this.onSelectionChange?.();
          this.dirty = true;
        } else if (tool === 'entity') {
          const rect = canvas.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const { col, row } = this.screenToGrid(screenX, screenY);
          this.onBeforeEntityAdd?.();
          const added = this.app.addEntity(col, row, this.app.selectedEntityType);
          if (!added) {
            const t = this.app.selectedEntityType;
            if (t === 'breakable_wall' || t === 'secret_wall') {
              this.app.statusHint = 'Must be placed on a solid wall tile';
            } else if (t !== 'gate') {
              this.app.statusHint = 'Must be placed on a floor tile';
            }
          } else {
            this.app.statusHint = null;
          }
          this.onSelectionChange?.();
          this.dirty = true;
        } else if (tool === 'thin_wall') {
          const rect = canvas.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const { col, row, fracX, fracY } = this.screenToGridFrac(screenX, screenY);
          const edge = this.app.resolveNearestEdge(col, row, fracX, fracY);
          if (!edge) return;

          if (this.app.thinWallEraseOnly) {
            // Erase mode: remove thin wall at this edge
            this.onBeforePaint?.();
            this.app.eraseThinWallOnEdge(edge.col, edge.row, edge.wall);
            this.isThinWallDrawing = true;
            this.onAfterPaint?.();
          } else {
            // Draw mode: start line drawing
            this.onBeforePaint?.();
            this.thinWallDrawStart = edge;
            this.thinWallDrawEdges = [edge];
            this.isThinWallDrawing = true;
          }
          this.dirty = true;
        }
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 1) {
        this.isPanning = false;
      }
      if (e.button === 0) {
        this.potentialWireSource = null;
        if (this.app.wireDragState) {
          const rect = canvas.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const { col, row } = this.screenToGrid(screenX, screenY);
          if (this.app.isValidWireTarget(col, row)) {
            this.onBeforePickComplete?.();
            this.app.completeWireDrag(col, row);
            this.app.selectedEntity = this.app.wireDragState.sourceEntity;
          }
          this.app.wireDragState = null;
          this.updateCursor();
          this.onPickComplete?.();
          this.dirty = true;
          return;
        }
        if (this.app.areaDragState && this.app.coordDragCallback) {
          const ds = this.app.areaDragState;
          const level = this.app.level;
          const maxCol = level ? level.grid[0].length - 1 : ds.currentCol;
          const maxRow = level ? level.grid.length - 1 : ds.currentRow;
          const fromCol = Math.max(0, Math.min(ds.startCol, ds.currentCol));
          const fromRow = Math.max(0, Math.min(ds.startRow, ds.currentRow));
          const toCol = Math.min(maxCol, Math.max(ds.startCol, ds.currentCol));
          const toRow = Math.min(maxRow, Math.max(ds.startRow, ds.currentRow));
          this.app.areaDragState = null;
          this.onBeforePickComplete?.();
          const cb = this.app.coordDragCallback;
          this.app.coordDragCallback = null;
          cb(fromCol, fromRow, toCol, toRow);
          this.onPickComplete?.();
          this.dirty = true;
          return;
        }
        if (this.isThinWallDrawing) {
          if (!this.app.thinWallEraseOnly && this.thinWallDrawEdges.length > 0) {
            const ext = this.app.selectedThinWallTexture;
            const int = this.app.selectedThinWallTextureBack;

            const hasS = this.thinWallDrawEdges.some(e => e.wall === 'S');
            const hasE = this.thinWallDrawEdges.some(e => e.wall === 'E');
            const isRect = hasS && hasE;

            if (isRect && int && int !== ext) {
              // Rectangle with dual textures — assign exterior/interior per edge side.
              const sEdges = this.thinWallDrawEdges.filter(e => e.wall === 'S');
              const eEdges = this.thinWallDrawEdges.filter(e => e.wall === 'E');
              const topRow = Math.min(...sEdges.map(e => e.row));
              const leftCol = Math.min(...eEdges.map(e => e.col));

              for (const edge of this.thinWallDrawEdges) {
                if (edge.wall === 'S') {
                  if (edge.row === topRow) {
                    // Top edge: north face = exterior, south face = interior
                    this.app.addThinWallOnEdge(edge.col, edge.row, edge.wall, ext, int);
                  } else {
                    // Bottom edge: north face = interior, south face = exterior
                    this.app.addThinWallOnEdge(edge.col, edge.row, edge.wall, int, ext);
                  }
                } else {
                  if (edge.col === leftCol) {
                    // Left edge: west face = exterior, east face = interior
                    this.app.addThinWallOnEdge(edge.col, edge.row, edge.wall, ext, int);
                  } else {
                    // Right edge: west face = interior, east face = exterior
                    this.app.addThinWallOnEdge(edge.col, edge.row, edge.wall, int, ext);
                  }
                }
              }
            } else {
              // Single line or no interior texture — simple placement
              for (const edge of this.thinWallDrawEdges) {
                this.app.addThinWallOnEdge(edge.col, edge.row, edge.wall);
              }
            }
            this.onAfterPaint?.();
          }
          this.isThinWallDrawing = false;
          this.thinWallDrawStart = null;
          this.thinWallDrawEdges = [];
          this.dirty = true;
        }
        if (this.isPainting) this.onAfterPaint?.();
        this.isPainting = false;
      }
    });

    canvas.addEventListener('mouseleave', () => {
      this.isPanning = false;
      if (this.isPainting) this.onAfterPaint?.();
      this.isPainting = false;
      this.isThinWallDrawing = false;
      this.thinWallDrawStart = null;
      this.thinWallDrawEdges = [];
      this.hoveredEdge = null;
      this.potentialWireSource = null;
      if (this.app.wireDragState) {
        this.app.wireDragState = null;
        this.updateCursor();
      }
      if (this.app.areaDragState) {
        this.app.areaDragState = null;
        // Keep coordDragCallback so user can retry on re-enter
      }
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
      if (this.app.wireDragState) {
        this.app.wireDragState = null;
        this.potentialWireSource = null;
        this.updateCursor();
        this.dirty = true;
        return;
      }
      if (this.app.coordDragCallback || this.app.areaDragState) {
        this.app.coordDragCallback = null;
        this.app.areaDragState = null;
        this.app.statusHint = null;
        this.onPickComplete?.();
        this.dirty = true;
        return;
      }
      if (this.app.coordPickCallback) {
        this.app.coordPickCallback = null;
        this.app.statusHint = null;
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

  private screenToGridFrac(screenX: number, screenY: number): { col: number; row: number; fracX: number; fracY: number } {
    const { offsetX, offsetY, zoom } = this.app.viewport;
    const tileSize = TILE_SIZE * zoom;
    const worldX = screenX - offsetX;
    const worldY = screenY - offsetY;
    const col = Math.floor(worldX / tileSize);
    const row = Math.floor(worldY / tileSize);
    const fracX = (worldX / tileSize) - col;
    const fracY = (worldY / tileSize) - row;
    return { col, row, fracX: clamp(fracX, 0, 1), fracY: clamp(fracY, 0, 1) };
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

    // Draw drag rectangle for area selection
    this.drawDragRectangle(offsetX, offsetY, tileSize);

    // Draw selection highlight
    this.drawSelectionHighlight(offsetX, offsetY, tileSize);

    // Draw inspector hover highlight
    this.drawInspectorHoverHighlight(offsetX, offsetY, tileSize);

    // Draw wiring lines for lever/pressure_plate -> door connections
    this.drawWiringLines(offsetX, offsetY, tileSize);

    // Draw wire drag line (active drag-to-wire)
    this.drawWireDragLine(offsetX, offsetY, tileSize);

    // Draw thin wall hover edge highlight
    if (this.app.activeTool === 'thin_wall' && this.hoveredEdge && !this.isThinWallDrawing) {
      this.drawEdgeLine(this.hoveredEdge, 'rgba(139, 69, 19, 0.5)', 3, offsetX, offsetY, tileSize);
    }

    // Draw thin wall line preview during drag
    if (this.thinWallDrawEdges.length > 0) {
      for (const edge of this.thinWallDrawEdges) {
        this.drawEdgeLine(edge, 'rgba(139, 69, 19, 0.7)', 3, offsetX, offsetY, tileSize);
      }
    }
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
      this.drawLayerBelowPreview(col, row, px, py, tw, th);
      return;
    }

    const charDef = app.charDefMap.get(char);
    const isSolid = char === '#' || (charDef !== undefined && charDef.solid);
    const isSeeThrough = charDef !== undefined && charDef.solid && charDef.seeThrough;

    if (isSeeThrough) {
      // See-through solid — show floor texture + tree overlay
      const { floor } = resolveTextures(col, row, char, level.defaults, app.charDefMap, level.areas);
      const texImage = getFloorTexture(floor as FloorTextureName).image as HTMLCanvasElement;
      ctx.drawImage(texImage, px, py, tw, th);
      ctx.drawImage(getTreeOverlayCanvas(), px, py, tw, th);
    } else if (isSolid) {
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

    // Show layer below for cells with auto-detected open bottom (same as engine hollow logic)
    if (!isSolid) {
      this.drawLayerBelowPreview(col, row, px, py, tw, th);
    }
  }

  /** Draw greyed preview of layers below through cells with no floor (void or auto-detected hollow). */
  private drawLayerBelowPreview(col: number, row: number, px: number, py: number, tw: number, th: number): void {
    const { ctx, app } = this;
    if (!app.showLayerBelow || !app.level?.layers) return;

    const layers = app.level.layers;
    const activeIdx = app.activeLayerIndex;

    // Check if the layer below has a non-wall cell (auto-detect open bottom, same as engine)
    const belowGrid = layers[activeIdx - 1]?.grid;
    if (!belowGrid) return;
    if (row >= belowGrid.length || col >= belowGrid[0].length) return;
    const belowChar = belowGrid[row][col];
    const belowDef = app.charDefMap.get(belowChar);
    const belowIsSolidWall = belowChar === '#' || (belowDef !== undefined && belowDef.solid && !belowDef.seeThrough);
    if (belowIsSolidWall) return; // solid wall below → floor is kept, nothing to show

    // Walk downward to find the first non-void renderable content
    let depth = 0;
    for (let li = activeIdx - 1; li >= 0; li--) {
      depth++;
      const layerGrid = layers[li].grid;
      if (row >= layerGrid.length || col >= layerGrid[0].length) break;
      const ch = layerGrid[row][col];
      if (ch === ' ') continue; // void — go deeper

      // Found content — draw it greyed
      const chDef = app.charDefMap.get(ch);
      const chSolid = ch === '#' || (chDef !== undefined && chDef.solid);
      const layerAreas = layers[li].areas ?? app.level.areas;
      const layerDefaults = layers[li].defaults ?? app.level.defaults;

      if (chSolid) {
        const { wall } = resolveTextures(col, row, ch, layerDefaults, app.charDefMap, layerAreas);
        const texImage = getWallTexture(wall as WallTextureName).image as HTMLCanvasElement;
        ctx.drawImage(texImage, px, py, tw, th);
      } else {
        const { floor } = resolveTextures(col, row, ch, layerDefaults, app.charDefMap, layerAreas);
        const texImage = getFloorTexture(floor as FloorTextureName).image as HTMLCanvasElement;
        ctx.drawImage(texImage, px, py, tw, th);
      }
      // Checkerboard watermark — alternating dark/light squares over the preview
      const alpha = Math.min(0.85, 0.35 + depth * 0.15);
      const checkSize = Math.max(2, Math.floor(tw / 4));
      for (let cy = 0; cy < th; cy += checkSize) {
        for (let cx = 0; cx < tw; cx += checkSize) {
          const even = ((cx / checkSize) + (cy / checkSize)) % 2 === 0;
          ctx.fillStyle = even ? `rgba(0, 0, 0, ${alpha})` : `rgba(0, 0, 0, ${alpha * 0.5})`;
          ctx.fillRect(px + cx, py + cy, Math.min(checkSize, tw - cx), Math.min(checkSize, th - cy));
        }
      }
      break;
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
        ctx.fillStyle = '#aaaaaa';
        ctx.beginPath();
        ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
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
        const facing = (entity.facing as string) ?? 'S';
        const STEPS = 5;
        const isHorz = facing === 'N' || facing === 'S';
        const span = isHorz ? th : tw;
        const barThick = span / STEPS;
        const stepGap = Math.max(1, barThick * 0.4);
        const sidePad = Math.min(tw, th) * 0.08;
        const inward = facing === 'N' ? 1 : facing === 'S' ? -1 : facing === 'W' ? 1 : -1;
        for (let i = 0; i < STEPS; i++) {
          const t = i / (STEPS - 1);
          const shrink = t * 0.35;
          const bright = { r: 90, g: 134, b: 179 };
          const dark = { r: 16, g: 24, b: 48 };
          const ct = isDown ? t : 1 - t;
          const r = Math.round(bright.r + (dark.r - bright.r) * ct);
          const g = Math.round(bright.g + (dark.g - bright.g) * ct);
          const b = Math.round(bright.b + (dark.b - bright.b) * ct);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          const drawThick = barThick - stepGap;
          if (isHorz) {
            const w = (tw - sidePad * 2) * (1 - shrink);
            const startY = facing === 'N' ? py : py + th - barThick;
            const y = startY + inward * i * barThick;
            ctx.fillRect(px + (tw - w) / 2, y, w, Math.ceil(drawThick));
          } else {
            const h = (th - sidePad * 2) * (1 - shrink);
            const startX = facing === 'W' ? px : px + tw - barThick;
            const x = startX + inward * i * barThick;
            ctx.fillRect(x, py + (th - h) / 2, Math.ceil(drawThick), h);
          }
        }
        break;
      }

      case 'trigger': {
        // Dashed circle
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = Math.max(1, iconRadius * 0.3);
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      }

      case 'tripwire': {
        // Dashed line — orientation-aware (EW = horizontal, NS = vertical)
        const twOrient = (entity.orientation as string) ??
          (this.isTripwireNS(entity.col, entity.row) ? 'NS' : 'EW');
        const pad = Math.min(tw, th) * 0.1;
        const dotR = Math.max(1.5, iconRadius * 0.15);
        ctx.strokeStyle = '#ff3366';
        ctx.lineWidth = Math.max(1, iconRadius * 0.25);
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        if (twOrient === 'NS') {
          ctx.moveTo(cx, py + pad);
          ctx.lineTo(cx, py + th - pad);
        } else {
          ctx.moveTo(px + pad, cy);
          ctx.lineTo(px + tw - pad, cy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        // End dots
        ctx.fillStyle = '#ff3366';
        if (twOrient === 'NS') {
          ctx.beginPath();
          ctx.arc(cx, py + pad, dotR, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx, py + th - pad, dotR, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(px + pad, cy, dotR, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(px + tw - pad, cy, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'gate': {
        // Logic gate symbol (diamond) — sized to fill most of the tile
        const gd = Math.max(5, Math.min(tw, th) * 0.38);
        ctx.fillStyle = '#6688ff';
        ctx.beginPath();
        ctx.moveTo(cx, cy - gd);
        ctx.lineTo(cx + gd, cy);
        ctx.lineTo(cx, cy + gd);
        ctx.lineTo(cx - gd, cy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#3344aa';
        ctx.lineWidth = Math.max(1, gd * 0.15);
        ctx.stroke();
        // Label
        const gateLabel = ((entity.gateType as string) ?? 'and').toUpperCase().charAt(0);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(8, gd * 0.9)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(gateLabel, cx, cy);
        break;
      }

      case 'trap_launcher': {
        // Wall-mounted launcher: body against the wall, short arrow pointing inward
        const tlFacing = (entity.facing as string) ?? 'S';
        // The launcher is mounted on the wall opposite to facing
        const tlMountWall: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E' };
        const tlWall = tlMountWall[tlFacing] ?? 'N';
        const tlBodyW = Math.max(4, Math.min(tw, th) * 0.3);
        const tlBodyH = Math.max(3, Math.min(tw, th) * 0.12);
        const tlArrowLen = Math.max(3, Math.min(tw, th) * 0.15);
        const tlArrowW = Math.max(2, Math.min(tw, th) * 0.12);
        ctx.fillStyle = '#884444';
        ctx.strokeStyle = '#442222';
        ctx.lineWidth = Math.max(1, tlBodyH * 0.25);
        if (tlWall === 'N' || tlWall === 'S') {
          // Body bar horizontal against N or S wall
          const wallY = tlWall === 'N' ? py : py + th - tlBodyH;
          const bodyX = cx - tlBodyW / 2;
          ctx.fillRect(bodyX, wallY, tlBodyW, tlBodyH);
          ctx.strokeRect(bodyX, wallY, tlBodyW, tlBodyH);
          // Arrow pointing away from wall (into the cell)
          const tipDir = tlWall === 'N' ? 1 : -1;
          const baseY = tlWall === 'N' ? wallY + tlBodyH : wallY;
          ctx.beginPath();
          ctx.moveTo(cx - tlArrowW, baseY);
          ctx.lineTo(cx, baseY + tipDir * tlArrowLen);
          ctx.lineTo(cx + tlArrowW, baseY);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          // Body bar vertical against E or W wall
          const wallX = tlWall === 'W' ? px : px + tw - tlBodyH;
          const bodyY = cy - tlBodyW / 2;
          ctx.fillRect(wallX, bodyY, tlBodyH, tlBodyW);
          ctx.strokeRect(wallX, bodyY, tlBodyH, tlBodyW);
          // Arrow pointing away from wall
          const tipDir = tlWall === 'W' ? 1 : -1;
          const baseX = tlWall === 'W' ? wallX + tlBodyH : wallX;
          ctx.beginPath();
          ctx.moveTo(baseX, cy - tlArrowW);
          ctx.lineTo(baseX + tipDir * tlArrowLen, cy);
          ctx.lineTo(baseX, cy + tlArrowW);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        break;
      }

      case 'breakable_wall': {
        // Cracked X — two diagonal lines with a gap/break in the middle
        const bGap = Math.max(2, Math.min(tw, th) * 0.12);
        const bReach = Math.min(tw, th) * 0.4;
        ctx.strokeStyle = '#cc8844';
        ctx.lineWidth = Math.max(1.5, Math.min(tw, th) * 0.06);
        // NW-to-SE diagonal, broken at center
        ctx.beginPath();
        ctx.moveTo(cx - bReach, cy - bReach);
        ctx.lineTo(cx - bGap, cy - bGap);
        ctx.moveTo(cx + bGap, cy + bGap);
        ctx.lineTo(cx + bReach, cy + bReach);
        ctx.stroke();
        // NE-to-SW diagonal, broken at center
        ctx.beginPath();
        ctx.moveTo(cx + bReach, cy - bReach);
        ctx.lineTo(cx + bGap, cy - bGap);
        ctx.moveTo(cx - bGap, cy + bGap);
        ctx.lineTo(cx - bReach, cy + bReach);
        ctx.stroke();
        break;
      }

      case 'secret_wall': {
        // Dashed rectangle outline
        const swPad = Math.min(tw, th) * 0.12;
        ctx.strokeStyle = '#aaaaee';
        ctx.lineWidth = Math.max(1, Math.min(tw, th) * 0.06);
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(px + swPad, py + swPad, tw - swPad * 2, th - swPad * 2);
        ctx.setLineDash([]);
        break;
      }

      case 'block': {
        // Filled gray square, inset from the tile edges
        const bkPad = Math.min(tw, th) * 0.15;
        ctx.fillStyle = '#888888';
        ctx.fillRect(px + bkPad, py + bkPad, tw - bkPad * 2, th - bkPad * 2);
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = Math.max(1, Math.min(tw, th) * 0.05);
        ctx.strokeRect(px + bkPad, py + bkPad, tw - bkPad * 2, th - bkPad * 2);
        break;
      }

      case 'chest': {
        // Box shape with lid line and yellow lock bar, rotated by facing
        const facing = (entity.facing as string) ?? 'S';
        const rotMap: Record<string, number> = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };
        const chRot = rotMap[facing] ?? 0;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(chRot);
        const chW2 = Math.min(tw, th) * 0.38;
        const chH2 = Math.min(tw, th) * 0.28;
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(-chW2, -chH2, chW2 * 2, chH2 * 2);
        ctx.strokeStyle = '#4a3500';
        ctx.lineWidth = Math.max(1, Math.min(tw, th) * 0.05);
        ctx.strokeRect(-chW2, -chH2, chW2 * 2, chH2 * 2);
        // Lid line
        const chLidOff = chH2 * 0.1;
        ctx.beginPath();
        ctx.moveTo(-chW2, chLidOff);
        ctx.lineTo(chW2, chLidOff);
        ctx.stroke();
        // Yellow lock bar at bottom center (south in local space)
        const lkW = chW2 * 0.5;
        const lkH = chH2 * 0.35;
        ctx.fillStyle = '#ddaa22';
        ctx.fillRect(-lkW / 2, chH2 - lkH - chH2 * 0.15, lkW, lkH);
        ctx.restore();
        break;
      }

      case 'sign': {
        // Small scroll/tablet rectangle with two simulated text lines
        const sgPad = Math.min(tw, th) * 0.15;
        const sgW = tw - sgPad * 2;
        const sgH = (th - sgPad * 2) * 0.7;
        const sgX = px + sgPad;
        const sgY = cy - sgH / 2;
        ctx.fillStyle = '#d4b896';
        ctx.fillRect(sgX, sgY, sgW, sgH);
        ctx.strokeStyle = '#6b4226';
        ctx.lineWidth = Math.max(1, Math.min(tw, th) * 0.05);
        ctx.strokeRect(sgX, sgY, sgW, sgH);
        // Two text lines
        ctx.fillStyle = '#6b4226';
        const lineH = Math.max(1, sgH * 0.15);
        ctx.fillRect(sgX + sgW * 0.15, sgY + sgH * 0.2, sgW * 0.7, lineH);
        ctx.fillRect(sgX + sgW * 0.15, sgY + sgH * 0.55, sgW * 0.7, lineH);
        break;
      }

      case 'npc': {
        // Teal circle
        ctx.fillStyle = '#22aacc';
        ctx.beginPath();
        ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'fountain': {
        ctx.fillStyle = '#4488cc';
        ctx.beginPath();
        ctx.arc(cx, cy, iconRadius * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#aaddff';
        ctx.beginPath();
        ctx.arc(cx, cy, iconRadius * 0.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'bookshelf': {
        // Wall-mounted: position flush against the wall like sconce/lever
        const bsWall = (entity.wall as string) || 'N';
        const bsInset = Math.max(1, Math.min(tw, th) * 0.05);
        const bsThick = Math.max(2, Math.min(tw, th) * 0.12);
        const bsLen = Math.max(4, Math.min(tw, th) * 0.7);
        let bsX: number, bsY: number, bsW: number, bsH: number;
        if (bsWall === 'N') {
          bsX = cx - bsLen / 2; bsY = py + bsInset; bsW = bsLen; bsH = bsThick;
        } else if (bsWall === 'S') {
          bsX = cx - bsLen / 2; bsY = py + th - bsInset - bsThick; bsW = bsLen; bsH = bsThick;
        } else if (bsWall === 'W') {
          bsX = px + bsInset; bsY = cy - bsLen / 2; bsW = bsThick; bsH = bsLen;
        } else {
          bsX = px + tw - bsInset - bsThick; bsY = cy - bsLen / 2; bsW = bsThick; bsH = bsLen;
        }
        ctx.fillStyle = '#4a3020';
        ctx.fillRect(bsX, bsY, bsW, bsH);
        ctx.strokeStyle = '#2a1810';
        ctx.lineWidth = Math.max(1, Math.min(tw, th) * 0.04);
        ctx.strokeRect(bsX, bsY, bsW, bsH);
        // Book spine lines across the short axis
        const bsHoriz = bsWall === 'N' || bsWall === 'S';
        ctx.lineWidth = Math.max(1, Math.min(tw, th) * 0.03);
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          if (bsHoriz) {
            const lx = cx + i * bsLen * 0.25;
            ctx.moveTo(lx, bsY + 1);
            ctx.lineTo(lx, bsY + bsH - 1);
          } else {
            const ly = cy + i * bsLen * 0.25;
            ctx.moveTo(bsX + 1, ly);
            ctx.lineTo(bsX + bsW - 1, ly);
          }
          ctx.stroke();
        }
        break;
      }

      case 'altar': {
        const alR = iconRadius;
        ctx.fillStyle = '#777777';
        ctx.fillRect(cx - alR, cy - alR * 0.3, alR * 2, alR * 0.6);
        ctx.fillStyle = '#999999';
        ctx.fillRect(cx - alR * 0.35, cy - alR * 0.7, alR * 0.7, alR * 0.7);
        break;
      }

      case 'barrel': {
        ctx.fillStyle = '#8b5e3c';
        ctx.beginPath();
        ctx.arc(cx, cy, iconRadius * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = Math.max(1, Math.min(tw, th) * 0.04);
        ctx.beginPath();
        ctx.arc(cx, cy, iconRadius * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'ramp': {
        const rFacing = (entity.facing as string) || 'N';
        const rThick = Math.max(2, Math.min(tw, th) * 0.06);
        ctx.strokeStyle = '#aa8844';
        ctx.lineWidth = rThick;
        ctx.beginPath();

        // Draw slope line from low side to high side based on facing
        // Facing = direction from bottom to top
        const margin = Math.min(tw, th) * 0.15;
        let x1: number, y1: number, x2: number, y2: number;
        if (rFacing === 'N') {
          // Bottom at south (py+th), top at north (py)
          x1 = cx; y1 = py + th - margin;
          x2 = cx; y2 = py + margin;
        } else if (rFacing === 'S') {
          x1 = cx; y1 = py + margin;
          x2 = cx; y2 = py + th - margin;
        } else if (rFacing === 'E') {
          x1 = px + margin; y1 = cy;
          x2 = px + tw - margin; y2 = cy;
        } else { // W
          x1 = px + tw - margin; y1 = cy;
          x2 = px + margin; y2 = cy;
        }

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Arrow head at the top (high) end
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len;
        const uy = dy / len;
        const arrowLen = Math.min(tw, th) * 0.2;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ux * arrowLen + uy * arrowLen * 0.5, y2 - uy * arrowLen - ux * arrowLen * 0.5);
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ux * arrowLen - uy * arrowLen * 0.5, y2 - uy * arrowLen + ux * arrowLen * 0.5);
        ctx.stroke();
        break;
      }

      case 'thin_wall': {
        const twWall = (entity.wall as string) || 'S';
        const twThick = Math.max(2, Math.min(tw, th) * 0.08);
        const halfDash = (entity.height as string) === 'half';
        // Black outline (1px wider on each side)
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = twThick + 2;
        if (halfDash) ctx.setLineDash([3, 3]);
        ctx.beginPath();
        if (twWall === 'S') {
          ctx.moveTo(px, py + th);
          ctx.lineTo(px + tw, py + th);
        } else {
          ctx.moveTo(px + tw, py);
          ctx.lineTo(px + tw, py + th);
        }
        ctx.stroke();
        if (halfDash) ctx.setLineDash([]);
        // Brown fill on top
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = twThick;
        if (halfDash) ctx.setLineDash([3, 3]);
        ctx.beginPath();
        if (twWall === 'S') {
          ctx.moveTo(px, py + th);
          ctx.lineTo(px + tw, py + th);
        } else {
          ctx.moveTo(px + tw, py);
          ctx.lineTo(px + tw, py + th);
        }
        ctx.stroke();
        if (halfDash) ctx.setLineDash([]);
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
      case 'npc': {
        const npcId = (entity.npcId as string) || '';
        const def = npcDatabase.getNpc(npcId);
        if (def) spritePath = def.sprite.path;
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

  /** Auto-detect tripwire orientation: NS if E/W neighbors are walls. */
  private isTripwireNS(col: number, row: number): boolean {
    // Tripwire runs perpendicular to passage: if passage is N-S (E/W walls), wire is EW.
    // So NS tripwire = passage is E-W = N/S walls.
    return !this.isDoorEW(col, row);
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

    let ps: { col: number; row: number; facing: Facing; layerIndex?: number } | undefined;
    if (this.app.dungeon) {
      const dp = this.app.dungeon.playerStart;
      if (dp.levelId === level.id) {
        ps = dp;
      }
    } else {
      ps = level.playerStart ?? undefined;
    }
    if (!ps) return;
    // Only show player start on the matching layer
    if ((ps.layerIndex ?? 0) !== this.app.getActiveLayerCoord()) return;

    const { col, row, facing } = ps;

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

    // Suppress hover highlight during active drag (the rectangle provides feedback)
    if (this.app.areaDragState) return;

    const { ctx } = this;
    const px = Math.floor(offsetX + hover.col * tileSize);
    const py = Math.floor(offsetY + hover.row * tileSize);
    const tw = Math.ceil(tileSize);
    const th = Math.ceil(tileSize);

    let strokeColor: string;
    let fillColor: string;

    if (this.app.wireDragState) {
      const isValid = this.app.isValidWireTarget(hover.col, hover.row);
      strokeColor = isValid ? 'rgba(68, 255, 68, 0.8)' : 'rgba(255, 68, 68, 0.5)';
      fillColor = isValid ? 'rgba(68, 255, 68, 0.15)' : 'rgba(255, 68, 68, 0.05)';
    } else if (this.app.coordDragCallback || this.app.coordPickCallback) {
      // Blue hover for coordinate picking modes
      strokeColor = 'rgba(68, 136, 255, 0.8)';
      fillColor = 'rgba(68, 136, 255, 0.15)';
    } else if (this.app.pickMode) {
      const isValid = this.app.isValidPickTarget(hover.col, hover.row);
      strokeColor = isValid ? 'rgba(68, 255, 68, 0.8)' : 'rgba(255, 68, 68, 0.5)';
      fillColor = isValid ? 'rgba(68, 255, 68, 0.15)' : 'rgba(255, 68, 68, 0.05)';
    } else {
      switch (this.app.activeTool) {
        case 'paint':
          strokeColor = 'rgba(68, 136, 255, 0.7)';
          fillColor = 'rgba(68, 136, 255, 0.1)';
          break;
        case 'entity': {
          const canPlace = this.app.canPlaceEntityType(hover.col, hover.row, this.app.selectedEntityType);
          strokeColor = canPlace ? 'rgba(68, 255, 68, 0.7)' : 'rgba(255, 68, 68, 0.5)';
          fillColor = canPlace ? 'rgba(68, 255, 68, 0.1)' : 'rgba(255, 68, 68, 0.05)';
          break;
        }
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

    // Entity mode: draw ghost icon of the entity type that would be placed
    if (this.app.activeTool === 'entity' && !this.app.pickMode && !this.app.wireDragState) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      const eType = this.app.selectedEntityType;
      const ghostEntity: Record<string, unknown> = {
        col: hover.col,
        row: hover.row,
        type: eType,
      };
      // Auto-detect wall orientation for wall-mounted entities
      if (eType === 'lever' || eType === 'torch_sconce') {
        ghostEntity.wall = this.app.autoDetectWallAt(hover.col, hover.row) ?? 'N';
      }
      if (eType === 'trap_launcher') {
        const wall = this.app.autoDetectWallAt(hover.col, hover.row) ?? 'N';
        const OPP: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E' };
        ghostEntity.facing = OPP[wall];
      }
      if (eType === 'tripwire') {
        ghostEntity.orientation = this.isTripwireNS(hover.col, hover.row) ? 'NS' : 'EW';
      }
      // Inject remembered subtypes for sprite preview
      if (eType === 'enemy') ghostEntity.enemyType = this.app.selectedEnemyType;
      if (eType === 'equipment') ghostEntity.itemId = this.app.selectedEquipmentId;
      if (eType === 'consumable') ghostEntity.itemId = this.app.selectedConsumableId;
      if (eType === 'ramp') { ghostEntity.facing = this.app.selectedRampFacing; ghostEntity.style = this.app.selectedRampStyle; }
      // Try sprite first (always, regardless of showItemPreview toggle)
      if (!this.drawEntitySprite(ghostEntity as Entity, px, py, tw, th)) {
        this.drawEntityIcon(ghostEntity as Entity, px, py, tw, th);
      }
      ctx.restore();
    }
  }

  private drawDragRectangle(offsetX: number, offsetY: number, tileSize: number): void {
    const ds = this.app.areaDragState;
    if (!ds) return;

    const { ctx } = this;
    const fromCol = Math.min(ds.startCol, ds.currentCol);
    const fromRow = Math.min(ds.startRow, ds.currentRow);
    const toCol = Math.max(ds.startCol, ds.currentCol);
    const toRow = Math.max(ds.startRow, ds.currentRow);

    const px = Math.floor(offsetX + fromCol * tileSize);
    const py = Math.floor(offsetY + fromRow * tileSize);
    const w = Math.ceil((toCol - fromCol + 1) * tileSize);
    const h = Math.ceil((toRow - fromRow + 1) * tileSize);

    ctx.save();
    ctx.fillStyle = 'rgba(68, 136, 255, 0.15)';
    ctx.fillRect(px, py, w, h);
    ctx.strokeStyle = 'rgba(68, 136, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  private drawSelectionHighlight(offsetX: number, offsetY: number, tileSize: number): void {
    const entity = this.app.selectedEntity;
    if (!entity) return;
    // Don't draw highlight if entity is on a different level
    if (this.app.level && !this.app.level.entities.includes(entity)) return;

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

  private drawInspectorHoverHighlight(offsetX: number, offsetY: number, tileSize: number): void {
    const entity = this.app.highlightedEntity;
    if (!entity) return;
    // Only highlight if the entity is on the current level
    if (this.app.level && !this.app.level.entities.includes(entity)) return;

    const { ctx } = this;
    const px = Math.floor(offsetX + entity.col * tileSize);
    const py = Math.floor(offsetY + entity.row * tileSize);
    const tw = Math.ceil(tileSize);
    const th = Math.ceil(tileSize);

    ctx.save();
    ctx.fillStyle = 'rgba(80, 160, 255, 0.3)';
    ctx.fillRect(px, py, tw, th);
    ctx.strokeStyle = 'rgba(80, 160, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, tw - 2, th - 2);
    ctx.restore();
  }

  updateCursor(): void {
    if (this.app.wireDragState || this.app.pickMode || this.app.coordPickCallback || this.app.coordDragCallback) {
      this.canvas.style.cursor = 'crosshair';
      return;
    }
    const tool = this.app.activeTool;
    if (tool === 'thin_wall') {
      this.canvas.style.cursor = 'crosshair';
      return;
    }
    this.canvas.style.cursor = tool === 'paint' || tool === 'entity' ? 'crosshair' : 'default';
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

  private drawWireDragLine(offsetX: number, offsetY: number, tileSize: number): void {
    const ws = this.app.wireDragState;
    if (!ws) return;

    const { ctx } = this;
    const x1 = offsetX + (ws.startCol + 0.5) * tileSize;
    const y1 = offsetY + (ws.startRow + 0.5) * tileSize;
    const x2 = ws.mouseX;
    const y2 = ws.mouseY;

    ctx.save();
    ctx.strokeStyle = '#ffaa00';
    ctx.fillStyle = '#ffaa00';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.setLineDash([]);
    this.drawArrowhead(x1, y1, x2, y2, 8);
    ctx.restore();
  }

  private drawEdgeLine(
    edge: { col: number; row: number; wall: 'S' | 'E' },
    color: string,
    lineWidth: number,
    offsetX: number,
    offsetY: number,
    tileSize: number,
  ): void {
    const ctx = this.ctx;
    const x = offsetX + edge.col * tileSize;
    const y = offsetY + edge.row * tileSize;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    if (edge.wall === 'S') {
      // Bottom edge of cell
      ctx.moveTo(x, y + tileSize);
      ctx.lineTo(x + tileSize, y + tileSize);
    } else {
      // Right edge of cell
      ctx.moveTo(x + tileSize, y);
      ctx.lineTo(x + tileSize, y + tileSize);
    }
    ctx.stroke();
    ctx.restore();
  }

  private computeThinWallLine(
    start: { col: number; row: number; wall: 'S' | 'E' },
    end: { col: number; row: number; wall: 'S' | 'E' },
  ): Array<{ col: number; row: number; wall: 'S' | 'E' }> {
    const edges: Array<{ col: number; row: number; wall: 'S' | 'E' }> = [];

    // Determine if this is a rectangle drag (spans both axes) or a single line
    const dCol = Math.abs(end.col - start.col);
    const dRow = Math.abs(end.row - start.row);

    if (dCol > 0 && dRow > 0) {
      // Rectangle drag — draw perimeter thin walls around the enclosed area.
      // The rectangle is defined by the edges, so we compute the bounding cell range.
      // For S-edges: the row is the row of the cell owning the south edge
      // For E-edges: the col is the col of the cell owning the east edge
      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);

      // Top side: S-edges along the top row boundary (row = minRow - 1 if we want north edge)
      // Actually: use the canonical form. North boundary = S-edge of row above.
      // Top boundary: S-edges at row (minRow - 1) for cols minCol..maxCol
      if (minRow - 1 >= 0) {
        for (let c = minCol; c <= maxCol; c++) {
          edges.push({ col: c, row: minRow - 1, wall: 'S' });
        }
      }
      // Bottom boundary: S-edges at row maxRow for cols minCol..maxCol
      for (let c = minCol; c <= maxCol; c++) {
        edges.push({ col: c, row: maxRow, wall: 'S' });
      }
      // Left boundary: E-edges at col (minCol - 1) for rows minRow..maxRow
      if (minCol - 1 >= 0) {
        for (let r = minRow; r <= maxRow; r++) {
          edges.push({ col: minCol - 1, row: r, wall: 'E' });
        }
      }
      // Right boundary: E-edges at col maxCol for rows minRow..maxRow
      for (let r = minRow; r <= maxRow; r++) {
        edges.push({ col: maxCol, row: r, wall: 'E' });
      }
    } else {
      // Single axis drag — line of edges
      const wall = start.wall;
      if (wall === 'S') {
        const row = start.row;
        const minC = Math.min(start.col, end.col);
        const maxC = Math.max(start.col, end.col);
        for (let c = minC; c <= maxC; c++) {
          edges.push({ col: c, row, wall: 'S' });
        }
      } else {
        const col = start.col;
        const minR = Math.min(start.row, end.row);
        const maxR = Math.max(start.row, end.row);
        for (let r = minR; r <= maxR; r++) {
          edges.push({ col, row: r, wall: 'E' });
        }
      }
    }

    return edges;
  }

  private drawWiringLines(offsetX: number, offsetY: number, tileSize: number): void {
    const level = this.app.level;
    if (!level) return;

    const { ctx } = this;
    const selected = this.app.selectedEntity;

    // Compute full signal chain for highlighting
    const signalChain = selected ? this.app.getSignalChain(selected) : new Set<string>();

    // Collect all wiring arrows (fractional col/row for sub-cell origin offset)
    type Arrow = { fromCol: number; fromRow: number; toCol: number; toRow: number; active: boolean };
    const arrows: Arrow[] = [];

    for (const e of level.entities) {
      const hasTargetsArray = e.type === 'lever' || e.type === 'pressure_plate' || e.type === 'trigger' || e.type === 'tripwire' || e.type === 'gate' || e.type === 'chest';
      if (hasTargetsArray && Array.isArray(e.targets)) {
        // Lever arrows originate from the bar center, not cell center
        let fromCol = e.col;
        let fromRow = e.row;
        if (e.type === 'lever') {
          const wall = (e.wall as string) || 'N';
          const barOffset = 0.35; // bar center offset from wall edge
          if (wall === 'N') fromRow = e.row + barOffset - 0.5;
          else if (wall === 'S') fromRow = e.row + 0.5 - barOffset;
          else if (wall === 'W') fromCol = e.col + barOffset - 0.5;
          else if (wall === 'E') fromCol = e.col + 0.5 - barOffset;
        }
        for (const targetId of e.targets as string[]) {
          const targetEntity = level.entities.find(t => t.id === targetId);
          if (!targetEntity) continue;
          // Highlight if either endpoint is in the signal chain
          const isActive = selected !== null && (
            (e.id !== undefined && signalChain.has(e.id)) ||
            (targetEntity.id !== undefined && signalChain.has(targetEntity.id!))
          );
          // Trap launcher arrows end at the wall-mounted position
          let toCol = targetEntity.col;
          let toRow = targetEntity.row;
          if (targetEntity.type === 'trap_launcher') {
            const facing = (targetEntity.facing as string) || 'S';
            const wallOffset = 0.35;
            // Mount wall is opposite of facing
            if (facing === 'S') toRow = targetEntity.row + wallOffset - 0.5;
            else if (facing === 'N') toRow = targetEntity.row + 0.5 - wallOffset;
            else if (facing === 'E') toCol = targetEntity.col + wallOffset - 0.5;
            else if (facing === 'W') toCol = targetEntity.col + 0.5 - wallOffset;
          }
          arrows.push({ fromCol, fromRow, toCol, toRow, active: isActive });
        }
      }
      if (e.type === 'stairs' && e.target) {
        const targetId = e.target as string;
        const targetEntity = level.entities.find(t => t.id === targetId);
        if (targetEntity) {
          const isActive = selected !== null && (e === selected || targetEntity === selected);
          arrows.push({ fromCol: e.col, fromRow: e.row, toCol: targetEntity.col, toRow: targetEntity.row, active: isActive });
        }
      }
      if (e.type === 'key' && (e as Record<string, unknown>).keyId) {
        const keyId = (e as Record<string, unknown>).keyId as string;
        for (const other of level.entities) {
          if ((other.type === 'door' || other.type === 'chest') && (other as Record<string, unknown>).keyId === keyId) {
            const isActive = selected !== null && (e === selected || other === selected);
            arrows.push({ fromCol: e.col, fromRow: e.row, toCol: other.col, toRow: other.row, active: isActive });
          }
        }
      }
    }

    // Cross-level stair: selected stair is on another level, its target is on this level
    if (selected?.type === 'stairs' && selected.target && !level.entities.includes(selected)) {
      const targetEntity = level.entities.find(e => e.id === selected.target);
      if (targetEntity) {
        const cx = offsetX + (targetEntity.col + 0.5) * tileSize;
        const cy = offsetY + (targetEntity.row + 0.5) * tileSize;
        const d = tileSize * 0.48;
        const headSize = 7;
        const tailLen = tileSize * 0.12;
        ctx.save();
        ctx.fillStyle = '#ffaa00';
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 2;
        const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [dx, dy] of dirs) {
          const tipX = cx + dx * (d - tailLen);
          const tipY = cy + dy * (d - tailLen);
          const fromX = cx + dx * d;
          const fromY = cy + dy * d;
          this.drawArrowhead(fromX, fromY, tipX, tipY, headSize);
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(fromX + dx * tailLen, fromY + dy * tailLen);
          ctx.stroke();
        }
        ctx.restore();
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
