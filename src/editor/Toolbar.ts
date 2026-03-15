import type { EditorTool } from './EditorApp';
import type { CharDef, TextureSet } from '../core/types';
import type { WallTextureName, FloorTextureName, CeilingTextureName } from '../core/textureNames';
import { getWallTexture, getFloorTexture, getCeilingTexture } from '../rendering/textures';
import { itemDatabase } from '../core/itemDatabase';

// Simple sprite image cache
const spriteImgCache = new Map<string, HTMLImageElement>();
function getSprite(path: string, onLoad?: () => void): HTMLImageElement | null {
  const cached = spriteImgCache.get(path);
  if (cached) return cached.complete ? cached : null;
  const img = new Image();
  img.src = path;
  if (onLoad) img.onload = onLoad;
  spriteImgCache.set(path, img);
  return null;
}

const ENTITY_TYPES = [
  'enemy', 'door', 'key', 'lever', 'pressure_plate',
  'torch_sconce', 'equipment', 'consumable', 'stairs',
] as const;

export class Toolbar {
  private toolBtns: Map<EditorTool, HTMLButtonElement> = new Map();
  private charBtns: Map<string, HTMLButtonElement> = new Map();
  private entityBtns: Map<string, HTMLButtonElement> = new Map();
  private exportBtn!: HTMLButtonElement;
  private palette!: HTMLElement;
  private entityPalette!: HTMLElement;
  private selectedChar = '.';
  private selectedEntityType = 'enemy';
  private equipmentIcon = 'sword';
  private consumableIcon = 'red-potion';
  private activeContextMenu: HTMLElement | null = null;

  onToolChange: ((tool: EditorTool) => void) | null = null;
  onCharSelect: ((char: string) => void) | null = null;
  onExport: (() => void) | null = null;
  onEntityTypeSelect: ((type: string) => void) | null = null;
  onNewLevel: (() => void) | null = null;
  onViewToggle: ((flag: 'showCeiling' | 'showItemPreview', value: boolean) => void) | null = null;
  onItemIdChange: ((type: 'equipment' | 'consumable', itemId: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.palette = document.getElementById('char-palette')!;
    this.entityPalette = document.getElementById('entity-palette')!;
    // Preload item sprites for toolbar icons
    const redraw = (type: string) => () => this.redrawEntityBtn(type);
    getSprite('/sprites/items/key.png', redraw('key'));
    getSprite(`/sprites/items/${this.equipmentIcon}.png`, redraw('equipment'));
    getSprite(`/sprites/items/${this.consumableIcon}.png`, redraw('consumable'));
    // Close context menu on outside click
    document.addEventListener('click', () => this.closeContextMenu());
    this.buildToolbar(container);
    this.buildEntityPalette();
    this.updatePalette();
  }

  setToolChangeCallback(cb: (tool: EditorTool) => void): void {
    this.onToolChange = cb;
  }

  setCharSelectCallback(cb: (char: string) => void): void {
    this.onCharSelect = cb;
  }

  setExportCallback(cb: () => void): void {
    this.onExport = cb;
  }

  setEntityTypeSelectCallback(cb: (type: string) => void): void {
    this.onEntityTypeSelect = cb;
  }

  setNewLevelCallback(cb: () => void): void {
    this.onNewLevel = cb;
  }

  setViewToggleCallback(cb: (flag: 'showCeiling' | 'showItemPreview', value: boolean) => void): void {
    this.onViewToggle = cb;
  }

  setItemIdChangeCallback(cb: (type: 'equipment' | 'consumable', itemId: string) => void): void {
    this.onItemIdChange = cb;
  }

  enableExport(): void {
    this.exportBtn.disabled = false;
  }

  disableExport(): void {
    this.exportBtn.disabled = true;
  }

  setActiveTool(tool: EditorTool): void {
    for (const [t, btn] of this.toolBtns) {
      btn.classList.toggle('active', t === tool);
    }
    // Dim entity palette when not in entity mode
    this.entityPalette.classList.toggle('dimmed', tool !== 'entity');
  }

  updatePalette(charDefs?: CharDef[], defaults?: TextureSet): void {
    this.palette.innerHTML = '';
    this.charBtns.clear();
    this.selectedChar = '.';

    const defWall = (defaults?.wallTexture ?? 'stone') as WallTextureName;
    const defFloor = (defaults?.floorTexture ?? 'stone_tile') as FloorTextureName;
    const defCeil = (defaults?.ceilingTexture ?? 'dark_rock') as CeilingTextureName;

    // Collect walkable and wall entries
    const walkable: Array<{ char: string; floor: FloorTextureName; ceiling: CeilingTextureName }> = [];
    const walls: Array<{ char: string; wall: WallTextureName }> = [];

    // Built-in '.' = walkable floor
    walkable.push({ char: '.', floor: defFloor, ceiling: defCeil });

    // Built-in '#' = wall
    walls.push({ char: '#', wall: defWall });

    // Custom charDefs
    const builtinSet = new Set(['.', '#', ' ']);
    if (charDefs) {
      for (const def of charDefs) {
        if (builtinSet.has(def.char)) continue;
        if (def.solid) {
          walls.push({
            char: def.char,
            wall: (def.wallTexture ?? defaults?.wallTexture ?? 'stone') as WallTextureName,
          });
        } else {
          walkable.push({
            char: def.char,
            floor: (def.floorTexture ?? defaults?.floorTexture ?? 'stone_tile') as FloorTextureName,
            ceiling: (def.ceilingTexture ?? defaults?.ceilingTexture ?? 'dark_rock') as CeilingTextureName,
          });
        }
      }
    }

    // --- Walkable group ---
    const floorLabel = document.createElement('span');
    floorLabel.className = 'palette-label';
    floorLabel.textContent = 'Floors';
    this.palette.appendChild(floorLabel);

    const floorGroup = document.createElement('div');
    floorGroup.className = 'palette-group';
    for (const entry of walkable) {
      this.addWalkableBtn(floorGroup, entry.char, entry.floor, entry.ceiling);
    }
    this.palette.appendChild(floorGroup);

    // Separator
    this.palette.appendChild(this.makePaletteSep());

    // --- Wall group ---
    const wallLabel = document.createElement('span');
    wallLabel.className = 'palette-label';
    wallLabel.textContent = 'Walls';
    this.palette.appendChild(wallLabel);

    const wallGroup = document.createElement('div');
    wallGroup.className = 'palette-group';
    for (const entry of walls) {
      this.addWallBtn(wallGroup, entry.char, entry.wall);
    }
    this.palette.appendChild(wallGroup);

    // Separator
    this.palette.appendChild(this.makePaletteSep());

    // Void button (plain text, special case)
    this.addVoidBtn();

    // Mark '.' as selected
    this.charBtns.get('.')?.classList.add('selected');

    // Re-enable palette now that a level is loaded
    this.palette.classList.remove('dimmed');
    this.entityPalette.classList.remove('dimmed');
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildToolbar(container: HTMLElement): void {
    const btnOpen = container.querySelector('#btn-open') as HTMLButtonElement;
    const coordDisplay = container.querySelector('#coord-display') as HTMLElement;

    // New button — insert before Open File
    const btnNew = document.createElement('button');
    btnNew.id = 'btn-new';
    btnNew.textContent = 'New';
    btnNew.addEventListener('click', () => this.onNewLevel?.());
    btnOpen.insertAdjacentElement('beforebegin', btnNew);

    // Separator after Open File
    const sep1 = this.makeSep();
    btnOpen.insertAdjacentElement('afterend', sep1);

    // Tool button group
    const toolGroup = document.createElement('div');
    toolGroup.className = 'tool-group';

    const tools: Array<{ tool: EditorTool; label: string }> = [
      { tool: 'select', label: 'Select' },
      { tool: 'paint', label: 'Paint' },
      { tool: 'erase', label: 'Erase' },
      { tool: 'entity', label: 'Entity' },
    ];

    for (const { tool, label } of tools) {
      const btn = document.createElement('button');
      btn.className = 'tool-btn';
      btn.textContent = label;
      if (tool === 'select') btn.classList.add('active');

      btn.addEventListener('click', () => {
        this.setActiveTool(tool);
        this.onToolChange?.(tool);
      });

      this.toolBtns.set(tool, btn);
      toolGroup.appendChild(btn);
    }

    sep1.insertAdjacentElement('afterend', toolGroup);

    // Separator after tool group
    const sep2 = this.makeSep();
    toolGroup.insertAdjacentElement('afterend', sep2);

    // Export button — insert before coord-display (which has margin-left: auto)
    const exportBtn = document.createElement('button');
    exportBtn.id = 'btn-export';
    exportBtn.textContent = 'Export';
    exportBtn.disabled = true;
    exportBtn.addEventListener('click', () => {
      if (!exportBtn.disabled) this.onExport?.();
    });

    this.exportBtn = exportBtn;
    coordDisplay.insertAdjacentElement('beforebegin', exportBtn);
  }

  private buildEntityPalette(): void {
    const label = document.createElement('span');
    label.className = 'palette-label';
    label.textContent = 'Entities';
    this.entityPalette.appendChild(label);

    for (const type of ENTITY_TYPES) {
      this.addEntityBtn(type);
    }

    // Mark default as selected
    this.entityBtns.get('enemy')?.classList.add('selected');

    // Spacer pushes view toggles to the right
    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    this.entityPalette.appendChild(spacer);

    // View toggles
    this.addViewToggle(this.entityPalette, 'Floor / Ceiling', 'showCeiling', false);
    this.addViewToggle(this.entityPalette, 'Item Preview', 'showItemPreview', true);
  }

  private addViewToggle(
    parent: HTMLElement,
    label: string,
    flag: 'showCeiling' | 'showItemPreview',
    defaultOn: boolean
  ): void {
    const wrapper = document.createElement('label');
    wrapper.className = 'view-toggle';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = defaultOn;
    input.addEventListener('change', () => {
      this.onViewToggle?.(flag, input.checked);
    });
    wrapper.appendChild(input);

    const text = document.createElement('span');
    text.textContent = label;
    wrapper.appendChild(text);

    parent.appendChild(wrapper);
  }

  private selectCharBtn(btn: HTMLButtonElement, char: string): void {
    for (const b of this.charBtns.values()) b.classList.remove('selected');
    btn.classList.add('selected');
    this.selectedChar = char;
    this.onCharSelect?.(char);
  }

  private selectEntityBtn(btn: HTMLButtonElement, type: string): void {
    for (const b of this.entityBtns.values()) b.classList.remove('selected');
    btn.classList.add('selected');
    this.selectedEntityType = type;
    this.onEntityTypeSelect?.(type);
  }

  private addWalkableBtn(
    parent: HTMLElement,
    char: string,
    floor: FloorTextureName,
    ceiling: CeilingTextureName
  ): void {
    const btn = document.createElement('button');
    btn.className = 'char-swatch-btn walkable';
    btn.title = `'${char}' — ceiling: ${ceiling}, floor: ${floor}`;

    const canvas = document.createElement('canvas');
    const size = 28;
    canvas.width = size;
    canvas.height = size * 2 + 1;
    const ctx = canvas.getContext('2d')!;

    const ceilSrc = getCeilingTexture(ceiling).image as HTMLCanvasElement;
    ctx.drawImage(ceilSrc, 0, 0, size, size);

    const floorSrc = getFloorTexture(floor).image as HTMLCanvasElement;
    ctx.drawImage(floorSrc, 0, size + 1, size, size);

    btn.appendChild(canvas);
    btn.addEventListener('click', () => this.selectCharBtn(btn, char));

    this.charBtns.set(char, btn);
    parent.appendChild(btn);
  }

  private addWallBtn(parent: HTMLElement, char: string, wall: WallTextureName): void {
    const btn = document.createElement('button');
    btn.className = 'char-swatch-btn wall';
    btn.title = `'${char}' — wall: ${wall}`;

    const canvas = document.createElement('canvas');
    const size = 28;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const wallSrc = getWallTexture(wall).image as HTMLCanvasElement;
    ctx.drawImage(wallSrc, 0, 0, size, size);

    btn.appendChild(canvas);
    btn.addEventListener('click', () => this.selectCharBtn(btn, char));

    this.charBtns.set(char, btn);
    parent.appendChild(btn);
  }

  private addVoidBtn(): void {
    const btn = document.createElement('button');
    btn.className = 'char-swatch-btn void';
    btn.title = 'void (space) — empty cell';
    btn.textContent = '_';

    btn.addEventListener('click', () => this.selectCharBtn(btn, ' '));

    this.charBtns.set(' ', btn);
    this.palette.appendChild(btn);
  }

  private addEntityBtn(type: string): void {
    const btn = document.createElement('button');
    btn.className = 'entity-swatch-btn';
    btn.title = type;

    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.25;
    const fs = size * 0.4;

    this.drawEntityIcon(ctx, type, cx, cy, r, fs);

    btn.appendChild(canvas);
    btn.addEventListener('click', () => this.selectEntityBtn(btn, type));

    // Right-click context menu for equipment/consumable
    if (type === 'equipment' || type === 'consumable') {
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showItemContextMenu(btn, type);
      });
    }

    this.entityBtns.set(type, btn);
    this.entityPalette.appendChild(btn);
  }

  private redrawEntityBtn(type: string): void {
    const btn = this.entityBtns.get(type);
    if (!btn) return;
    const canvas = btn.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const size = canvas.width;
    this.drawEntityIcon(ctx, type, size / 2, size / 2, size * 0.25, size * 0.4);
  }

  /** Draw the same icon shapes used by GridCanvas.drawEntityIcon */
  private drawEntityIcon(
    ctx: CanvasRenderingContext2D,
    type: string,
    cx: number,
    cy: number,
    r: number,
    fontSize: number
  ): void {
    switch (type) {
      case 'enemy': {
        ctx.fillStyle = '#cc2222';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'key': {
        if (!this.drawSprite(ctx, '/sprites/items/key.png', cx, cy, r)) {
          ctx.fillStyle = '#ffd700';
          ctx.font = `bold ${fontSize}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('K', cx, cy);
        }
        break;
      }
      case 'lever': {
        // Brown bar sticking out from N wall
        const lLen = r * 2;
        const lThick = Math.max(2, r * 0.5);
        const lx = cx - lThick / 2;
        const ly = 0;
        ctx.fillStyle = '#8B5A2B';
        ctx.fillRect(lx, ly, lThick, lLen);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.strokeRect(lx, ly, lThick, lLen);
        break;
      }
      case 'pressure_plate': {
        ctx.fillStyle = '#aaaaaa';
        const d = r * 1.2;
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
        if (!this.drawSprite(ctx, `/sprites/items/${this.equipmentIcon}.png`, cx, cy, r)) {
          ctx.fillStyle = '#44cc44';
          ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
        break;
      }
      case 'consumable': {
        if (!this.drawSprite(ctx, `/sprites/items/${this.consumableIcon}.png`, cx, cy, r)) {
          ctx.fillStyle = '#ff88cc';
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'torch_sconce': {
        // Yellow circle with aura on N wall
        const sr = r * 0.5;
        const sy = sr + 1;
        const auraR = sr * 3;
        const grad = ctx.createRadialGradient(cx, sy, sr * 0.5, cx, sy, auraR);
        grad.addColorStop(0, 'rgba(255, 200, 60, 0.35)');
        grad.addColorStop(1, 'rgba(255, 200, 60, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - auraR, sy - auraR, auraR * 2, auraR * 2);
        ctx.fillStyle = '#ffcc33';
        ctx.beginPath();
        ctx.arc(cx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#cc8800';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, sy, sr, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'door': {
        // E-W bar with hinges
        const barThick = Math.max(2, r * 0.4);
        const hingeSize = Math.max(2, r * 0.3);
        const pad = r * 0.15;
        const bx = pad;
        const by = cy - barThick / 2;
        const bw = cx * 2 - pad * 2;
        ctx.fillStyle = '#c8a060';
        ctx.fillRect(bx, by, bw, barThick);
        ctx.strokeStyle = '#6b4226';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, barThick);
        // Hinges
        ctx.fillStyle = '#555';
        ctx.fillRect(bx, cy - hingeSize, hingeSize, hingeSize * 2);
        ctx.fillRect(bx + bw - hingeSize, cy - hingeSize, hingeSize, hingeSize * 2);
        break;
      }
      case 'stairs': {
        ctx.fillStyle = '#80c0ff';
        ctx.font = `bold ${fontSize * 2}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u2195', cx, cy);
        break;
      }
    }
  }

  private drawSprite(
    ctx: CanvasRenderingContext2D,
    path: string,
    cx: number,
    cy: number,
    r: number
  ): boolean {
    const img = getSprite(path);
    if (!img) return false;
    ctx.imageSmoothingEnabled = false;
    const pad = r * 0.3;
    const s = (r + pad) * 2;
    ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s);
    return true;
  }

  private closeContextMenu(): void {
    if (this.activeContextMenu) {
      this.activeContextMenu.remove();
      this.activeContextMenu = null;
    }
  }

  private showItemContextMenu(btn: HTMLButtonElement, entityType: 'equipment' | 'consumable'): void {
    this.closeContextMenu();

    if (!itemDatabase.isLoaded()) return;

    const allItems = itemDatabase.getAllItems().filter((item) => {
      if (entityType === 'consumable') return item.type === 'consumable';
      // Equipment = everything except consumables
      return item.type !== 'consumable';
    });

    // Group by subtype, but only show one entry per unique icon within each subtype
    const groups = new Map<string, Array<{ id: string; name: string; icon: string }>>();
    const seenIcons = new Map<string, Set<string>>();
    for (const item of allItems) {
      const sub = item.subtype;
      if (!groups.has(sub)) {
        groups.set(sub, []);
        seenIcons.set(sub, new Set());
      }
      if (!seenIcons.get(sub)!.has(item.icon)) {
        seenIcons.get(sub)!.add(item.icon);
        groups.get(sub)!.push({ id: item.id, name: item.name, icon: item.icon });
      }
    }

    const menu = document.createElement('div');
    menu.className = 'item-context-menu';

    const rect = btn.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 2}px`;

    for (const [subtype, items] of groups) {
      const header = document.createElement('div');
      header.className = 'item-ctx-header';
      header.textContent = subtype.replace(/_/g, ' ');
      menu.appendChild(header);

      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'item-ctx-row';

        const swatch = document.createElement('canvas');
        swatch.width = 20;
        swatch.height = 20;
        const spriteImg = getSprite(`/sprites/items/${item.icon}.png`);
        if (spriteImg) {
          const sCtx = swatch.getContext('2d')!;
          sCtx.imageSmoothingEnabled = false;
          sCtx.drawImage(spriteImg, 0, 0, 20, 20);
        }
        row.appendChild(swatch);

        const label = document.createElement('span');
        label.textContent = item.name;
        row.appendChild(label);

        row.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectItem(entityType, item.id, item.icon);
          this.closeContextMenu();
        });

        menu.appendChild(row);
      }
    }

    document.body.appendChild(menu);
    this.activeContextMenu = menu;
  }

  private selectItem(entityType: 'equipment' | 'consumable', itemId: string, icon: string): void {
    if (entityType === 'equipment') {
      this.equipmentIcon = icon;
    } else {
      this.consumableIcon = icon;
    }
    // Preload new sprite then redraw
    getSprite(`/sprites/items/${icon}.png`, () => this.redrawEntityBtn(entityType));
    this.redrawEntityBtn(entityType);
    this.onItemIdChange?.(entityType, itemId);
  }

  private makeSep(): HTMLSpanElement {
    const sep = document.createElement('span');
    sep.className = 'toolbar-sep';
    return sep;
  }

  private makePaletteSep(): HTMLSpanElement {
    const sep = document.createElement('span');
    sep.className = 'palette-sep';
    return sep;
  }
}
