import type { DialogEditorState } from './DialogEditorState';
import type { DialogTree, DialogNode } from '../core/dialogManager';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const NODE_WIDTH = 220;
const NODE_HEADER_HEIGHT = 24;
const NODE_LINE_HEIGHT = 16;
const NODE_PADDING = 8;
const NODE_BORDER_RADIUS = 6;
const ARROW_SIZE = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class DialogGraphCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: DialogEditorState | null = null;

  private viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
  private dirty = true;

  private isPanning = false;
  private isDragging = false;
  private dragStarted = false;
  private dragNodeId: string | null = null;
  private dragOffset = { x: 0, y: 0 };
  private lastPanX = 0;
  private lastPanY = 0;

  private onSelectionChange: (() => void) | null = null;
  private onNodeMoved: (() => void) | null = null;
  private onAddNode: ((x: number, y: number) => void) | null = null;
  private onContextMenu: ((nodeId: string, screenX: number, screenY: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, container: HTMLElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    this.setupEvents();
    this.setupResize(container);
    this.startRenderLoop();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  setState(state: DialogEditorState): void {
    this.state = state;
    this.dirty = true;
  }

  setSelectionCallback(cb: () => void): void {
    this.onSelectionChange = cb;
  }

  setNodeMovedCallback(cb: () => void): void {
    this.onNodeMoved = cb;
  }

  setAddNodeCallback(cb: (x: number, y: number) => void): void {
    this.onAddNode = cb;
  }

  setContextMenuCallback(cb: (nodeId: string, screenX: number, screenY: number) => void): void {
    this.onContextMenu = cb;
  }

  markDirty(): void {
    this.dirty = true;
  }

  resetViewport(): void {
    this.viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
    this.dirty = true;
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  private setupEvents(): void {
    const canvas = this.canvas;

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('dblclick', (e) => this.onDblClick(e));
    canvas.addEventListener('contextmenu', (e) => this.onContextMenuEvent(e));
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
        this.dirty = false;
        this.render();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------------
  // Coordinate helpers
  // ---------------------------------------------------------------------------

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = (sx - rect.left - this.viewport.offsetX) / this.viewport.zoom;
    const y = (sy - rect.top - this.viewport.offsetY) / this.viewport.zoom;
    return { x, y };
  }

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx * this.viewport.zoom + this.viewport.offsetX,
      y: wy * this.viewport.zoom + this.viewport.offsetY,
    };
  }

  // ---------------------------------------------------------------------------
  // Node geometry
  // ---------------------------------------------------------------------------

  private getNodeHeight(node: DialogNode): number {
    let h = NODE_HEADER_HEIGHT + NODE_PADDING;
    if (node.speaker) {
      h += NODE_LINE_HEIGHT;
    }
    // Text occupies at least 1 line, at most 2
    const textLines = Math.max(1, Math.min(2, Math.ceil(node.text.length / 28)));
    h += NODE_LINE_HEIGHT * textLines;
    // Badge row at bottom
    h += NODE_LINE_HEIGHT + NODE_PADDING;
    return h;
  }

  private hitTestNode(worldX: number, worldY: number): string | null {
    if (!this.state?.tree) return null;

    for (const [nodeId, node] of Object.entries(this.state.tree.nodes)) {
      const pos = this.state.nodePositions.get(nodeId);
      if (!pos) continue;

      const h = this.getNodeHeight(node);
      if (
        worldX >= pos.x &&
        worldX <= pos.x + NODE_WIDTH &&
        worldY >= pos.y &&
        worldY <= pos.y + h
      ) {
        return nodeId;
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Mouse handlers
  // ---------------------------------------------------------------------------

  private onMouseDown(e: MouseEvent): void {
    // Middle button — pan
    if (e.button === 1) {
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      e.preventDefault();
      return;
    }

    if (e.button === 0) {
      const world = this.screenToWorld(e.clientX, e.clientY);
      const hit = this.hitTestNode(world.x, world.y);

      if (hit !== null) {
        this.state!.selectNode(hit);
        this.onSelectionChange?.();

        const pos = this.state!.nodePositions.get(hit)!;
        this.isDragging = true;
        this.dragStarted = false;
        this.dragNodeId = hit;
        this.dragOffset = { x: world.x - pos.x, y: world.y - pos.y };
        this.dirty = true;
      } else {
        if (this.state) {
          this.state.deselectNode();
          this.onSelectionChange?.();
          this.dirty = true;
        }
      }
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.isPanning) {
      const dx = e.clientX - this.lastPanX;
      const dy = e.clientY - this.lastPanY;
      this.viewport.offsetX += dx;
      this.viewport.offsetY += dy;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.dirty = true;
      return;
    }

    if (this.isDragging && this.dragNodeId !== null && this.state) {
      const world = this.screenToWorld(e.clientX, e.clientY);
      const newX = world.x - this.dragOffset.x;
      const newY = world.y - this.dragOffset.y;
      this.state.nodePositions.set(this.dragNodeId, { x: newX, y: newY });
      this.dragStarted = true;
      this.dirty = true;
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 1) {
      this.isPanning = false;
      return;
    }

    if (e.button === 0) {
      if (this.isDragging) {
        const movedActually = this.dragStarted;
        this.isDragging = false;
        this.dragNodeId = null;
        this.dragStarted = false;

        if (movedActually) {
          this.onNodeMoved?.();
        }
      }
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const vp = this.viewport;
    const oldZoom = vp.zoom;
    const newZoom = clamp(oldZoom * (e.deltaY < 0 ? 1.1 : 0.9), MIN_ZOOM, MAX_ZOOM);

    // Keep the point under cursor fixed in world space
    vp.offsetX = cursorX - (cursorX - vp.offsetX) * (newZoom / oldZoom);
    vp.offsetY = cursorY - (cursorY - vp.offsetY) * (newZoom / oldZoom);
    vp.zoom = newZoom;

    this.dirty = true;
  }

  private onDblClick(e: MouseEvent): void {
    const world = this.screenToWorld(e.clientX, e.clientY);
    const hit = this.hitTestNode(world.x, world.y);
    if (hit === null) {
      this.onAddNode?.(world.x, world.y);
    }
  }

  private onContextMenuEvent(e: MouseEvent): void {
    e.preventDefault();
    const world = this.screenToWorld(e.clientX, e.clientY);
    const hit = this.hitTestNode(world.x, world.y);
    if (hit !== null) {
      this.onContextMenu?.(hit, e.clientX, e.clientY);
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    const { canvas, ctx } = this;

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!this.state || !this.state.tree) return;

    const { offsetX, offsetY, zoom } = this.viewport;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);

    this.renderConnections(ctx, this.state.tree);
    this.renderNodes(ctx, this.state.tree);

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Connection rendering
  // ---------------------------------------------------------------------------

  private renderConnections(ctx: CanvasRenderingContext2D, tree: DialogTree): void {
    const selectedId = this.state?.selectedNodeId ?? null;

    for (const [nodeId, node] of Object.entries(tree.nodes) as [string, DialogNode][]) {
      const fromPos = this.state!.nodePositions.get(nodeId);
      if (!fromPos) continue;

      const fromH = this.getNodeHeight(node);
      const fromBottomX = fromPos.x + NODE_WIDTH / 2;
      const fromBottomY = fromPos.y + fromH;

      if (node.next != null) {
        // Linear connection: bottom-center of source to top-center of target
        const toPos = this.state!.nodePositions.get(node.next);
        const isHighlighted = nodeId === selectedId || node.next === selectedId;

        if (!toPos) {
          // Broken reference — draw in red going downward a fixed amount
          const color = '#ff4444';
          const fakeToX = fromBottomX;
          const fakeToY = fromBottomY + 60;
          this.drawConnection(ctx, fromBottomX, fromBottomY, fakeToX, fakeToY, color);
        } else {
          const toTopX = toPos.x + NODE_WIDTH / 2;
          const toTopY = toPos.y;
          const color = isHighlighted ? '#88aaff' : '#555';
          this.drawConnection(ctx, fromBottomX, fromBottomY, toTopX, toTopY, color);
        }
      }

      if (node.choices) {
        for (let i = 0; i < node.choices.length; i++) {
          const choice = node.choices[i];
          if (choice.next == null) continue;

          // Source: right edge of node at vertical offset per choice
          const choiceOffsetY = NODE_HEADER_HEIGHT + NODE_PADDING + (i + 0.5) * NODE_LINE_HEIGHT;
          const fromRightX = fromPos.x + NODE_WIDTH;
          const fromRightY = fromPos.y + choiceOffsetY;

          const toPos = this.state!.nodePositions.get(choice.next);
          const isHighlighted = nodeId === selectedId || choice.next === selectedId;

          if (!toPos) {
            const color = '#ff4444';
            this.drawConnection(ctx, fromRightX, fromRightY, fromRightX + 60, fromRightY, color);
          } else {
            const toTopX = toPos.x + NODE_WIDTH / 2;
            const toTopY = toPos.y;
            const color = isHighlighted ? '#88aaff' : '#555';
            this.drawConnection(ctx, fromRightX, fromRightY, toTopX, toTopY, color);
          }
        }
      }
    }
  }

  private drawConnection(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: string
  ): void {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const midX = (fromX + toX) / 2;
    const midY = (fromY + toY) / 2;
    ctx.moveTo(fromX, fromY);
    ctx.quadraticCurveTo(midX, fromY, midX, midY);
    ctx.quadraticCurveTo(midX, toY, toX, toY);
    ctx.stroke();

    this.drawArrowhead(ctx, midX, midY, toX, toY, color);
  }

  private drawArrowhead(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: string
  ): void {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - ARROW_SIZE * Math.cos(angle - Math.PI / 6),
      toY - ARROW_SIZE * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      toX - ARROW_SIZE * Math.cos(angle + Math.PI / 6),
      toY - ARROW_SIZE * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Node rendering
  // ---------------------------------------------------------------------------

  private renderNodes(ctx: CanvasRenderingContext2D, tree: DialogTree): void {
    const selectedId = this.state?.selectedNodeId ?? null;

    for (const [nodeId, node] of Object.entries(tree.nodes) as [string, DialogNode][]) {
      const pos = this.state!.nodePositions.get(nodeId);
      if (!pos) continue;

      const { x, y } = pos;
      const h = this.getNodeHeight(node);
      const isStart = nodeId === tree.startNode;
      const isSelected = nodeId === selectedId;

      // Node background
      ctx.fillStyle = '#222';
      this.roundedRect(ctx, x, y, NODE_WIDTH, h, NODE_BORDER_RADIUS);
      ctx.fill();

      // Header bar
      const headerColor = isStart ? '#44aa44' : '#4488cc';
      ctx.fillStyle = headerColor;
      ctx.beginPath();
      ctx.moveTo(x + NODE_BORDER_RADIUS, y);
      ctx.lineTo(x + NODE_WIDTH - NODE_BORDER_RADIUS, y);
      ctx.arcTo(x + NODE_WIDTH, y, x + NODE_WIDTH, y + NODE_BORDER_RADIUS, NODE_BORDER_RADIUS);
      ctx.lineTo(x + NODE_WIDTH, y + NODE_HEADER_HEIGHT);
      ctx.lineTo(x, y + NODE_HEADER_HEIGHT);
      ctx.lineTo(x, y + NODE_BORDER_RADIUS);
      ctx.arcTo(x, y, x + NODE_BORDER_RADIUS, y, NODE_BORDER_RADIUS);
      ctx.closePath();
      ctx.fill();

      // Node ID in header
      ctx.fillStyle = '#fff';
      ctx.font = `bold 11px monospace`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const labelX = x + NODE_PADDING;
      const labelY = y + NODE_HEADER_HEIGHT / 2;
      const maxLabelWidth = NODE_WIDTH - NODE_PADDING * 2;
      ctx.fillText(nodeId, labelX, labelY, maxLabelWidth);

      // Content area — y cursor starts below header
      let contentY = y + NODE_HEADER_HEIGHT + NODE_PADDING;

      // Speaker line
      if (node.speaker) {
        ctx.fillStyle = '#888';
        ctx.font = `italic 10px sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(node.speaker, labelX, contentY, maxLabelWidth);
        contentY += NODE_LINE_HEIGHT;
      }

      // Text — up to 2 lines, truncated at ~50 chars per line
      ctx.fillStyle = '#ccc';
      ctx.font = `11px sans-serif`;
      ctx.textBaseline = 'top';
      const textLines = Math.max(1, Math.min(2, Math.ceil(node.text.length / 28)));
      const fullText = node.text.length > 50 ? node.text.slice(0, 50) + '…' : node.text;
      if (textLines === 1) {
        ctx.fillText(fullText, labelX, contentY, maxLabelWidth);
        contentY += NODE_LINE_HEIGHT;
      } else {
        // Two lines: split roughly in half
        const half = Math.ceil(fullText.length / 2);
        const line1 = fullText.slice(0, half);
        const line2 = fullText.slice(half);
        ctx.fillText(line1, labelX, contentY, maxLabelWidth);
        contentY += NODE_LINE_HEIGHT;
        ctx.fillText(line2, labelX, contentY, maxLabelWidth);
        contentY += NODE_LINE_HEIGHT;
      }

      // Badge row
      contentY += NODE_PADDING / 2;
      ctx.font = `10px monospace`;
      ctx.textBaseline = 'top';

      if (node.choices && node.choices.length > 0) {
        ctx.fillStyle = '#888';
        ctx.fillText(`${node.choices.length} choices`, labelX, contentY, maxLabelWidth);
      } else if (node.next != null) {
        ctx.fillStyle = '#888';
        ctx.fillText(`\u2192 ${node.next}`, labelX, contentY, maxLabelWidth);
      } else {
        ctx.fillStyle = '#ff8866';
        ctx.fillText('END', labelX, contentY, maxLabelWidth);
      }

      // Border
      ctx.strokeStyle = isSelected ? '#4488ff' : '#444';
      ctx.lineWidth = isSelected ? 2 : 1;
      this.roundedRect(ctx, x, y, NODE_WIDTH, h, NODE_BORDER_RADIUS);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing utilities
  // ---------------------------------------------------------------------------

  private roundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}
