import type { EditorTool } from './EditorApp';
import type { CharDef, TextureSet } from '../core/types';
import type { WallTextureName, FloorTextureName, CeilingTextureName } from '../core/textureNames';
import { getWallTexture, getFloorTexture, getCeilingTexture, getThinWallTexture, THIN_WALL_TEXTURE_NAMES } from '../rendering/textures';
import { getTreeOverlayCanvas } from './treeOverlay';
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
  'trigger', 'tripwire', 'gate', 'trap_launcher',
  'torch_sconce', 'equipment', 'consumable', 'stairs',
  'breakable_wall', 'secret_wall', 'block', 'chest', 'sign', 'npc',
  'fountain', 'bookshelf', 'altar', 'barrel', 'ramp',
] as const;

export class Toolbar {
  private toolBtns: Map<EditorTool, HTMLButtonElement> = new Map();
  private charBtns: Map<string, HTMLButtonElement> = new Map();
  private entityBtns: Map<string, HTMLButtonElement> = new Map();
  private thinWallBtns: Map<string, HTMLButtonElement> = new Map();
  private thinWallBackBtns: Map<string, HTMLButtonElement> = new Map();
  private thinWallEraseBtn: HTMLButtonElement | null = null;
  private thinWallEraseActive = false;
  private lastThinWallTexture = 'stone_thin';
  private exportBtn!: HTMLButtonElement;
  private saveBtn!: HTMLButtonElement;
  private saveAsBtn!: HTMLButtonElement;
  private openServerBtn!: HTMLButtonElement;
  private palette!: HTMLElement;
  private entityPalette!: HTMLElement;
  private selectedChar = '.';
  private selectedEntityType = 'enemy';
  private activeTool: EditorTool = 'select';
  private equipmentIcon = 'sword';
  private consumableIcon = 'red-potion';
  private activeContextMenu: HTMLElement | null = null;

  onToolChange: ((tool: EditorTool) => void) | null = null;
  onCharSelect: ((char: string) => void) | null = null;
  onExport: (() => void) | null = null;
  onEntityTypeSelect: ((type: string) => void) | null = null;
  onThinWallToolSelect: ((texture: string) => void) | null = null;
  onThinWallBackSelect: ((texture: string) => void) | null = null;
  onNewLevel: (() => void) | null = null;
  onNewDungeon: (() => void) | null = null;
  onViewToggle: ((flag: 'showCeiling' | 'showItemPreview' | 'showLayerBelow' | 'floodFill' | 'thinWallEraseOnly', value: boolean) => void) | null = null;
  onItemIdChange: ((type: 'equipment' | 'consumable', itemId: string) => void) | null = null;
  onSave: (() => void) | null = null;
  onSaveAs: (() => void) | null = null;
  onOpenFromServer: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.palette = document.getElementById('char-palette')!;
    this.entityPalette = document.getElementById('entity-palette')!;
    // Preload sprites for toolbar icons
    const redraw = (type: string) => () => this.redrawEntityBtn(type);
    getSprite('/editor/goblin-icon.png', redraw('enemy'));
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

  setNewDungeonCallback(cb: () => void): void {
    this.onNewDungeon = cb;
  }

  setViewToggleCallback(cb: (flag: 'showCeiling' | 'showItemPreview' | 'showLayerBelow' | 'floodFill' | 'thinWallEraseOnly', value: boolean) => void): void {
    this.onViewToggle = cb;
  }

  setItemIdChangeCallback(cb: (type: 'equipment' | 'consumable', itemId: string) => void): void {
    this.onItemIdChange = cb;
  }

  setSaveCallback(cb: () => void): void {
    this.onSave = cb;
  }

  setSaveAsCallback(cb: () => void): void {
    this.onSaveAs = cb;
  }

  setOpenFromServerCallback(cb: () => void): void {
    this.onOpenFromServer = cb;
  }

  enableExport(): void {
    this.exportBtn.disabled = false;
  }

  disableExport(): void {
    this.exportBtn.disabled = true;
  }

  showServerButtons(): void {
    this.saveBtn.style.display = '';
    this.saveAsBtn.style.display = '';
    this.openServerBtn.style.display = '';
  }

  enableSave(): void {
    this.saveBtn.disabled = false;
  }

  disableSave(): void {
    this.saveBtn.disabled = true;
  }

  setActiveTool(tool: EditorTool): void {
    this.activeTool = tool;
    // Select button highlight
    const selectBtn = this.toolBtns.get('select');
    selectBtn?.classList.toggle('selected', tool === 'select');
    // Char selection visible only in paint mode
    for (const [char, btn] of this.charBtns) {
      btn.classList.toggle('selected', tool === 'paint' && char === this.selectedChar);
    }
    // Entity selection visible only in entity mode
    for (const [type, btn] of this.entityBtns) {
      btn.classList.toggle('selected', tool === 'entity' && type === this.selectedEntityType);
    }
    // Deselect thin wall buttons when switching to other tools
    for (const b of this.thinWallBtns.values()) {
      b.classList.toggle('selected', false);
    }
  }

  updatePalette(charDefs?: CharDef[], defaults?: TextureSet): void {
    this.palette.innerHTML = '';
    this.charBtns.clear();
    this.thinWallBtns.clear();
    this.thinWallBackBtns.clear();
    this.thinWallEraseBtn = null;
    this.thinWallEraseActive = false;
    this.selectedChar = '.';

    const defWall = (defaults?.wallTexture ?? 'stone') as WallTextureName;
    const defFloor = (defaults?.floorTexture ?? 'stone_tile') as FloorTextureName;
    const defCeil = (defaults?.ceilingTexture ?? 'dark_rock') as CeilingTextureName;

    // Collect walkable, wall, and see-through entries
    const walkable: Array<{ char: string; floor: FloorTextureName; ceiling: CeilingTextureName }> = [];
    const walls: Array<{ char: string; wall: WallTextureName }> = [];
    const seeThrough: Array<{ char: string; floor: FloorTextureName }> = [];

    // Built-in '.' = walkable floor
    walkable.push({ char: '.', floor: defFloor, ceiling: defCeil });

    // Built-in '#' = wall
    walls.push({ char: '#', wall: defWall });

    // Custom charDefs
    const builtinSet = new Set(['.', '#', ' ']);
    if (charDefs) {
      for (const def of charDefs) {
        if (builtinSet.has(def.char)) continue;
        if (def.solid && def.seeThrough) {
          seeThrough.push({
            char: def.char,
            floor: (def.floorTexture ?? defaults?.floorTexture ?? 'stone_tile') as FloorTextureName,
          });
        } else if (def.solid) {
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
    for (const entry of seeThrough) {
      this.addSeeThruBtn(wallGroup, entry.char, entry.floor);
    }
    this.palette.appendChild(wallGroup);

    // Separator
    this.palette.appendChild(this.makePaletteSep());

    // Void button (plain text, special case)
    this.addVoidBtn();

    // --- Thin Walls group ---
    this.palette.appendChild(this.makePaletteSep());

    const thinWallLabel = document.createElement('span');
    thinWallLabel.className = 'palette-label';
    thinWallLabel.textContent = 'Thin Walls';
    this.palette.appendChild(thinWallLabel);

    // Horizontal container: stacked texture rows (left) + eraser (right, centered)
    const thinWallContainer = document.createElement('div');
    thinWallContainer.style.display = 'flex';
    thinWallContainer.style.alignItems = 'center';
    thinWallContainer.style.gap = '6px';

    // Left side: two stacked rows
    const rowsWrapper = document.createElement('div');
    rowsWrapper.style.display = 'flex';
    rowsWrapper.style.flexDirection = 'column';
    rowsWrapper.style.gap = '2px';

    // Exterior texture row
    const extGroup = document.createElement('div');
    extGroup.className = 'palette-group';
    extGroup.style.margin = '0';
    for (const texName of THIN_WALL_TEXTURE_NAMES) {
      this.addThinWallBtn(extGroup, texName);
    }
    rowsWrapper.appendChild(extGroup);

    // Interior texture row ("same" button + texture buttons)
    const intGroup = document.createElement('div');
    intGroup.className = 'palette-group';
    intGroup.style.margin = '0';

    for (const texName of THIN_WALL_TEXTURE_NAMES) {
      this.addThinWallBackBtn(intGroup, texName);
    }
    // Select first interior button by default (matches exterior default)
    const firstBackBtn = this.thinWallBackBtns.get(THIN_WALL_TEXTURE_NAMES[0]);
    if (firstBackBtn) firstBackBtn.classList.add('selected');
    rowsWrapper.appendChild(intGroup);

    thinWallContainer.appendChild(rowsWrapper);

    // Right side: eraser button, vertically centered between the two rows
    const eraseBtn = document.createElement('button');
    eraseBtn.className = 'char-swatch-btn';
    eraseBtn.title = 'Erase thin walls';
    const eraseCanvas = document.createElement('canvas');
    const eSize = 28;
    eraseCanvas.width = eSize;
    eraseCanvas.height = eSize;
    const eCtx = eraseCanvas.getContext('2d')!;
    eCtx.fillStyle = '#333';
    eCtx.fillRect(0, 0, eSize, eSize);
    eCtx.fillStyle = '#cc6666';
    eCtx.fillRect(4, 6, 20, 16);
    eCtx.strokeStyle = '#fff';
    eCtx.lineWidth = 2;
    eCtx.beginPath();
    eCtx.moveTo(8, 10); eCtx.lineTo(20, 18);
    eCtx.moveTo(20, 10); eCtx.lineTo(8, 18);
    eCtx.stroke();
    eraseBtn.appendChild(eraseCanvas);
    eraseBtn.addEventListener('click', () => {
      const newState = !this.thinWallEraseActive;
      this.thinWallEraseActive = newState;
      eraseBtn.classList.toggle('selected', newState);
      this.onViewToggle?.('thinWallEraseOnly', newState);
      if (newState) {
        for (const b of this.thinWallBtns.values()) b.classList.remove('selected');
      }
      this.onThinWallToolSelect?.(newState ? '__erase__' : this.lastThinWallTexture);
    });
    this.thinWallEraseBtn = eraseBtn;
    thinWallContainer.appendChild(eraseBtn);

    this.palette.appendChild(thinWallContainer);

    // Flood fill toggle
    this.palette.appendChild(this.makePaletteSep());
    this.addViewToggle(this.palette, 'Flood Fill', 'floodFill', false);

    // Re-enable palettes now that a level is loaded
    this.palette.classList.remove('dimmed');
    this.entityPalette.classList.remove('dimmed');

    // Apply selection highlights based on active tool
    if (this.activeTool === 'paint') {
      this.charBtns.get(this.selectedChar)?.classList.add('selected');
    }
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

    const btnNewDungeon = document.createElement('button');
    btnNewDungeon.id = 'btn-new-dungeon';
    btnNewDungeon.textContent = 'New Dungeon';
    btnNewDungeon.addEventListener('click', () => this.onNewDungeon?.());
    btnNew.insertAdjacentElement('afterend', btnNewDungeon);

    // Separator after Open File
    const sep1 = this.makeSep();
    btnOpen.insertAdjacentElement('afterend', sep1);

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

    // Save button — next to Export, initially hidden
    const saveBtn = document.createElement('button');
    saveBtn.id = 'btn-save';
    saveBtn.textContent = 'Save';
    saveBtn.disabled = true;
    saveBtn.style.display = 'none';
    saveBtn.addEventListener('click', () => {
      if (!saveBtn.disabled) this.onSave?.();
    });
    this.saveBtn = saveBtn;
    exportBtn.insertAdjacentElement('afterend', saveBtn);

    // Save As button — next to Save, initially hidden
    const saveAsBtn = document.createElement('button');
    saveAsBtn.id = 'btn-save-as';
    saveAsBtn.textContent = 'Save As';
    saveAsBtn.style.display = 'none';
    saveAsBtn.addEventListener('click', () => this.onSaveAs?.());
    this.saveAsBtn = saveAsBtn;
    saveBtn.insertAdjacentElement('afterend', saveAsBtn);

    // Open Server button — next to Open File, initially hidden
    const openServerBtn = document.createElement('button');
    openServerBtn.id = 'btn-open-server';
    openServerBtn.textContent = 'Open Server';
    openServerBtn.style.display = 'none';
    openServerBtn.addEventListener('click', () => this.onOpenFromServer?.());
    this.openServerBtn = openServerBtn;
    sep1.insertAdjacentElement('beforebegin', openServerBtn);
  }

  private buildEntityPalette(): void {
    // Select tool button (mouse cursor icon)
    const selectBtn = document.createElement('button');
    selectBtn.className = 'entity-swatch-btn';
    selectBtn.title = 'Select (1)';
    const selectCanvas = document.createElement('canvas');
    selectCanvas.width = 24;
    selectCanvas.height = 24;
    const sCtx = selectCanvas.getContext('2d')!;
    // Draw mouse cursor arrow
    sCtx.fillStyle = '#ccc';
    sCtx.beginPath();
    sCtx.moveTo(5, 3);
    sCtx.lineTo(5, 19);
    sCtx.lineTo(9, 15);
    sCtx.lineTo(13, 21);
    sCtx.lineTo(15, 20);
    sCtx.lineTo(11, 14);
    sCtx.lineTo(16, 13);
    sCtx.closePath();
    sCtx.fill();
    sCtx.strokeStyle = '#333';
    sCtx.lineWidth = 1;
    sCtx.stroke();
    selectBtn.appendChild(selectCanvas);
    selectBtn.addEventListener('click', () => {
      this.setActiveTool('select');
      this.onToolChange?.('select');
    });
    this.toolBtns.set('select', selectBtn);
    this.entityPalette.appendChild(selectBtn);

    // Divider (small — matches entity button height)
    const sep = document.createElement('span');
    sep.className = 'palette-sep-sm';
    this.entityPalette.appendChild(sep);

    for (const type of ENTITY_TYPES) {
      this.addEntityBtn(type);
    }

    // Spacer pushes view toggles to the right
    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    this.entityPalette.appendChild(spacer);

    // View toggles
    this.addViewToggle(this.entityPalette, 'Floor / Ceiling', 'showCeiling', false);
    this.addViewToggle(this.entityPalette, 'Item Preview', 'showItemPreview', true);
    this.addViewToggle(this.entityPalette, 'Layer Below', 'showLayerBelow', true);
  }

  private addViewToggle(
    parent: HTMLElement,
    label: string,
    flag: 'showCeiling' | 'showItemPreview' | 'showLayerBelow' | 'floodFill' | 'thinWallEraseOnly',
    defaultOn: boolean
  ): void {
    const wrapper = document.createElement('label');
    wrapper.className = 'view-toggle';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = defaultOn;
    // Sync app state to match checkbox initial value (palette may be rebuilt)
    this.onViewToggle?.(flag, defaultOn);
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

  private addSeeThruBtn(parent: HTMLElement, char: string, floor: FloorTextureName): void {
    const btn = document.createElement('button');
    btn.className = 'char-swatch-btn wall';
    btn.title = `'${char}' — see-through: ${floor}`;

    const canvas = document.createElement('canvas');
    const size = 28;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const floorSrc = getFloorTexture(floor).image as HTMLCanvasElement;
    ctx.drawImage(floorSrc, 0, 0, size, size);
    ctx.drawImage(getTreeOverlayCanvas(), 0, 0, size, size);

    btn.appendChild(canvas);
    btn.addEventListener('click', () => this.selectCharBtn(btn, char));

    this.charBtns.set(char, btn);
    parent.appendChild(btn);
  }

  private addVoidBtn(): void {
    const btn = document.createElement('button');
    btn.className = 'char-swatch-btn';
    btn.title = 'void (space) — empty cell';

    const size = 28;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    // 4x4 checkerboard matching the grid canvas void pattern
    const cellSize = size / 4;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#1a1a1a' : '#222';
        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
    btn.appendChild(canvas);
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
    const btnR = type === 'breakable_wall' || type === 'secret_wall' || type === 'block' || type === 'chest' || type === 'sign'
      ? size * 0.35 : size * 0.25;
    const fs = size * 0.4;

    this.drawEntityIcon(ctx, type, cx, cy, btnR, fs);

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
    const btnR = type === 'breakable_wall' || type === 'secret_wall' || type === 'block' || type === 'chest' || type === 'sign'
      ? size * 0.35 : size * 0.25;
    this.drawEntityIcon(ctx, type, size / 2, size / 2, btnR, size * 0.4);
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
        if (!this.drawSprite(ctx, '/editor/goblin-icon.png', cx, cy, r)) {
          ctx.fillStyle = '#cc2222';
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
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
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
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
      case 'trigger': {
        // Dashed circle
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = Math.max(1, r * 0.2);
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      }
      case 'tripwire': {
        // Dashed horizontal line with small end dots
        const pad = r * 0.3;
        ctx.strokeStyle = '#ff3366';
        ctx.lineWidth = Math.max(1, r * 0.2);
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(cx - r - pad, cy);
        ctx.lineTo(cx + r + pad, cy);
        ctx.stroke();
        ctx.setLineDash([]);
        // End dots
        ctx.fillStyle = '#ff3366';
        ctx.beginPath();
        ctx.arc(cx - r - pad, cy, 1.5, 0, Math.PI * 2);
        ctx.arc(cx + r + pad, cy, 1.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'gate': {
        // Diamond with letter — larger to fill the button
        const gd = r * 1.4;
        ctx.fillStyle = '#6688ff';
        ctx.beginPath();
        ctx.moveTo(cx, cy - gd);
        ctx.lineTo(cx + gd, cy);
        ctx.lineTo(cx, cy + gd);
        ctx.lineTo(cx - gd, cy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#3344aa';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(7, gd * 0.65)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('G', cx, cy);
        break;
      }
      case 'trap_launcher': {
        // Wall-mounted body against top edge, short arrow pointing down
        const tlBodyW = r * 1.4;
        const tlBodyH = r * 0.5;
        const tlArrowLen = r * 0.6;
        const tlArrowW = r * 0.5;
        ctx.fillStyle = '#884444';
        ctx.strokeStyle = '#442222';
        ctx.lineWidth = 1;
        // Body against top
        const tlY = cy - r;
        ctx.fillRect(cx - tlBodyW / 2, tlY, tlBodyW, tlBodyH);
        ctx.strokeRect(cx - tlBodyW / 2, tlY, tlBodyW, tlBodyH);
        // Arrow
        ctx.beginPath();
        ctx.moveTo(cx - tlArrowW, tlY + tlBodyH);
        ctx.lineTo(cx, tlY + tlBodyH + tlArrowLen);
        ctx.lineTo(cx + tlArrowW, tlY + tlBodyH);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }

      case 'stairs': {
        // Steps going down, facing north — matches grid icon style
        const size = cx * 2;
        const STEPS = 5;
        const stepH = size / STEPS;
        const stepGap = Math.max(0.5, stepH * 0.4);
        const sidePad = size * 0.08;
        for (let i = 0; i < STEPS; i++) {
          const t = i / (STEPS - 1);
          const shrink = t * 0.35;
          const bright = { r: 90, g: 134, b: 179 };
          const dark = { r: 16, g: 24, b: 48 };
          const cr = Math.round(bright.r + (dark.r - bright.r) * t);
          const cg = Math.round(bright.g + (dark.g - bright.g) * t);
          const cb = Math.round(bright.b + (dark.b - bright.b) * t);
          ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
          const w = (size - sidePad * 2) * (1 - shrink);
          const y = i * stepH;
          ctx.fillRect((size - w) / 2, y, w, Math.ceil(stepH - stepGap));
        }
        break;
      }

      case 'breakable_wall': {
        // Cracked X — two diagonal lines with a gap/break in the middle
        ctx.strokeStyle = '#cc8844';
        ctx.lineWidth = Math.max(1.5, r * 0.3);
        const bGap = r * 0.3;
        // NW-to-SE diagonal, broken at center
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - r);
        ctx.lineTo(cx - bGap, cy - bGap);
        ctx.moveTo(cx + bGap, cy + bGap);
        ctx.lineTo(cx + r, cy + r);
        ctx.stroke();
        // NE-to-SW diagonal, broken at center
        ctx.beginPath();
        ctx.moveTo(cx + r, cy - r);
        ctx.lineTo(cx + bGap, cy - bGap);
        ctx.moveTo(cx - bGap, cy + bGap);
        ctx.lineTo(cx - r, cy + r);
        ctx.stroke();
        break;
      }

      case 'secret_wall': {
        // Dashed rectangle outline
        const swPad = r * 0.2;
        ctx.strokeStyle = '#aaaaee';
        ctx.lineWidth = Math.max(1, r * 0.2);
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(cx - r + swPad, cy - r + swPad, (r - swPad) * 2, (r - swPad) * 2);
        ctx.setLineDash([]);
        break;
      }

      case 'block': {
        // Filled gray square, smaller than full cell
        const bkPad = r * 0.25;
        ctx.fillStyle = '#888888';
        ctx.fillRect(cx - r + bkPad, cy - r + bkPad, (r - bkPad) * 2, (r - bkPad) * 2);
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = Math.max(1, r * 0.15);
        ctx.strokeRect(cx - r + bkPad, cy - r + bkPad, (r - bkPad) * 2, (r - bkPad) * 2);
        break;
      }

      case 'chest': {
        // Box shape with lid line and yellow lock bar (south-facing = lock at bottom)
        const chW = r * 1.6;
        const chH = r * 1.2;
        const chX = cx - chW / 2;
        const chY = cy - chH / 2;
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(chX, chY, chW, chH);
        ctx.strokeStyle = '#4a3500';
        ctx.lineWidth = Math.max(1, r * 0.15);
        ctx.strokeRect(chX, chY, chW, chH);
        // Lid line across the middle
        const cLidY = chY + chH * 0.45;
        ctx.beginPath();
        ctx.moveTo(chX, cLidY);
        ctx.lineTo(chX + chW, cLidY);
        ctx.stroke();
        // Yellow lock bar at bottom center
        const lockW = chW * 0.25;
        const lockH = chH * 0.18;
        ctx.fillStyle = '#ddaa22';
        ctx.fillRect(cx - lockW / 2, chY + chH - lockH - chH * 0.08, lockW, lockH);
        break;
      }

      case 'sign': {
        // Small scroll/tablet rectangle
        const sgW = r * 1.4;
        const sgH = r * 1.0;
        const sgX = cx - sgW / 2;
        const sgY = cy - sgH / 2;
        ctx.fillStyle = '#d4b896';
        ctx.fillRect(sgX, sgY, sgW, sgH);
        ctx.strokeStyle = '#6b4226';
        ctx.lineWidth = Math.max(1, r * 0.15);
        ctx.strokeRect(sgX, sgY, sgW, sgH);
        // Two text lines
        ctx.fillStyle = '#6b4226';
        const lineH = sgH * 0.25;
        ctx.fillRect(sgX + sgW * 0.15, sgY + sgH * 0.2, sgW * 0.7, lineH * 0.6);
        ctx.fillRect(sgX + sgW * 0.15, sgY + sgH * 0.55, sgW * 0.7, lineH * 0.6);
        break;
      }

      case 'npc': {
        // Teal/cyan circle with "NPC" label
        ctx.fillStyle = '#22aacc';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(6, fontSize * 0.5)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('NPC', cx, cy);
        break;
      }
      case 'fountain': {
        // Blue basin circle with lighter water center
        ctx.fillStyle = '#4488cc';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2266aa';
        ctx.lineWidth = Math.max(1, r * 0.15);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#aaddff';
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'bookshelf': {
        // Brown tall rectangle with book-spine lines
        const bw = r * 1.4;
        const bh = r * 1.8;
        ctx.fillStyle = '#4a3020';
        ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
        ctx.strokeStyle = '#2a1810';
        ctx.lineWidth = Math.max(1, r * 0.15);
        ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
        // Book spine lines
        ctx.lineWidth = Math.max(1, r * 0.1);
        for (let i = -1; i <= 1; i++) {
          const ly = cy + i * bh * 0.25;
          ctx.beginPath();
          ctx.moveTo(cx - bw / 2 + 2, ly);
          ctx.lineTo(cx + bw / 2 - 2, ly);
          ctx.stroke();
        }
        break;
      }
      case 'altar': {
        // Gray platform with raised center pillar
        const aW = r * 1.6;
        const aH = r * 0.6;
        ctx.fillStyle = '#777777';
        ctx.fillRect(cx - aW / 2, cy, aW, aH);
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = Math.max(1, r * 0.15);
        ctx.strokeRect(cx - aW / 2, cy, aW, aH);
        const pW = r * 0.8;
        const pH = r * 1.0;
        ctx.fillStyle = '#999999';
        ctx.fillRect(cx - pW / 2, cy - pH + aH * 0.2, pW, pH);
        ctx.strokeStyle = '#666666';
        ctx.strokeRect(cx - pW / 2, cy - pH + aH * 0.2, pW, pH);
        break;
      }
      case 'barrel': {
        // Brown circle with dark iron band ring
        ctx.fillStyle = '#8b5e3c';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = Math.max(1.5, r * 0.2);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        // Inner band
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'ramp': {
        ctx.strokeStyle = '#aa8844';
        ctx.lineWidth = Math.max(2, r * 0.15);
        ctx.beginPath();
        // Diagonal line from bottom-left to top-right
        ctx.moveTo(cx - r * 0.6, cy + r * 0.6);
        ctx.lineTo(cx + r * 0.6, cy - r * 0.6);
        ctx.stroke();
        // Small arrow head at top
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.6, cy - r * 0.6);
        ctx.lineTo(cx + r * 0.2, cy - r * 0.5);
        ctx.moveTo(cx + r * 0.6, cy - r * 0.6);
        ctx.lineTo(cx + r * 0.5, cy - r * 0.2);
        ctx.stroke();
        break;
      }
      case 'thin_wall': {
        // Draw a thick horizontal line (representing a wall on a cell edge)
        ctx.strokeStyle = '#8B4513';  // brick brown
        ctx.lineWidth = Math.max(2, r * 0.3);
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.8, cy + r * 0.6);
        ctx.lineTo(cx + r * 0.8, cy + r * 0.6);
        ctx.stroke();
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
    // Fill most of the button area (cx*2 is canvas width)
    const s = cx * 2 - 4;
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

  private addThinWallBtn(parent: HTMLElement, texName: string): void {
    const btn = document.createElement('button');
    btn.className = 'char-swatch-btn';
    btn.title = `Thin wall: ${texName}`;

    const size = 28;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Draw the thin wall texture preview
    const tex = getThinWallTexture(texName);
    const src = tex.image as HTMLCanvasElement;
    ctx.drawImage(src, 0, 0, size, size);

    btn.appendChild(canvas);
    btn.addEventListener('click', () => {
      this.selectThinWallBtn(btn, texName);
      this.onThinWallToolSelect?.(texName);
    });

    this.thinWallBtns.set(texName, btn);
    parent.appendChild(btn);
  }

  private addThinWallBackBtn(parent: HTMLElement, texName: string): void {
    const btn = document.createElement('button');
    btn.className = 'char-swatch-btn';
    btn.title = `Interior: ${texName}`;

    const size = 28;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const tex = getThinWallTexture(texName);
    const src = tex.image as HTMLCanvasElement;
    ctx.drawImage(src, 0, 0, size, size);

    btn.appendChild(canvas);
    btn.addEventListener('click', () => {
      for (const b of this.thinWallBackBtns.values()) b.classList.remove('selected');
      btn.classList.add('selected');
      this.onThinWallBackSelect?.(texName);
    });

    this.thinWallBackBtns.set(texName, btn);
    parent.appendChild(btn);
  }

  private selectThinWallBtn(btn: HTMLButtonElement, texName: string): void {
    // Deselect all other button types
    for (const b of this.charBtns.values()) b.classList.remove('selected');
    for (const b of this.entityBtns.values()) b.classList.remove('selected');
    for (const b of this.thinWallBtns.values()) b.classList.remove('selected');
    btn.classList.add('selected');

    // Deselect erase button and exit erase mode
    this.thinWallEraseActive = false;
    this.thinWallEraseBtn?.classList.remove('selected');
    this.lastThinWallTexture = texName;

    // Also deselect the select tool button
    const selectBtn = this.toolBtns.get('select');
    selectBtn?.classList.remove('selected');
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
