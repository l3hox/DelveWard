import type { DungeonLevel, CharDef, Entity } from '../core/types';
import { buildWalkableSet } from '../core/grid';

export interface Viewport {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export interface HoverInfo {
  col: number;
  row: number;
  char: string;
}

export type EditorTool = 'select' | 'paint' | 'erase' | 'entity';

const ENTITY_DEFAULTS: Record<string, Record<string, unknown>> = {
  door:           { state: 'closed' },
  key:            { keyId: '' },
  lever:          { targetDoor: '', wall: 'N' },
  pressure_plate: { targetDoor: '' },
  torch_sconce:   { wall: 'N' },
  enemy:          { enemyType: 'rat' },
  equipment:      { itemId: '' },
  consumable:     { itemId: '' },
  stairs:         { direction: 'down', targetLevel: '', targetCol: 0, targetRow: 0 },
};

export class EditorApp {
  level: DungeonLevel | null = null;
  viewport: Viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
  hover: HoverInfo | null = null;
  charDefMap: Map<string, CharDef> = new Map();
  walkableSet: Set<string> = new Set();
  errors: string[] = [];
  activeTool: EditorTool = 'select';
  selectedChar = '.';
  selectedEntity: Entity | null = null;
  selectedEntityType = 'enemy';

  private selectionIndex = 0;
  private lastClickCell = '';

  loadLevel(level: DungeonLevel): void {
    this.level = level;
    this.rebuildDerivedState();

    // Reset viewport and tool state
    this.viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
    this.hover = null;
    this.activeTool = 'select';
    this.selectedChar = '.';
    this.selectedEntity = null;
    this.selectionIndex = 0;
    this.lastClickCell = '';
  }

  rebuildDerivedState(): void {
    if (!this.level) return;
    this.charDefMap = new Map();
    if (this.level.charDefs) {
      for (const def of this.level.charDefs) {
        this.charDefMap.set(def.char, def);
      }
    }
    this.walkableSet = buildWalkableSet(this.level.charDefs);
    this.errors = this.validate();
  }

  validate(): string[] {
    if (!this.level) return [];
    const errors: string[] = [];

    // Duplicate charDef chars
    if (this.level.charDefs) {
      const seen = new Map<string, number>();
      for (let i = 0; i < this.level.charDefs.length; i++) {
        const ch = this.level.charDefs[i].char;
        if (seen.has(ch)) {
          errors.push(`Duplicate charDef '${ch}' at indices ${seen.get(ch)} and ${i}`);
        } else {
          seen.set(ch, i);
        }
      }
    }

    return errors;
  }

  createNewLevel(cols: number, rows: number): void {
    const grid: string[] = [];
    for (let r = 0; r < rows; r++) {
      if (r === 0 || r === rows - 1) {
        grid.push('#'.repeat(cols));
      } else {
        grid.push('#' + '.'.repeat(cols - 2) + '#');
      }
    }
    const level: DungeonLevel = {
      name: 'Untitled',
      grid,
      playerStart: { col: 1, row: 1, facing: 'S' },
      entities: [],
    };
    this.loadLevel(level);
  }

  paintCell(col: number, row: number, char: string): boolean {
    if (!this.level) return false;

    const grid = this.level.grid;
    if (row < 0 || row >= grid.length) return false;
    if (col < 0 || col >= grid[row].length) return false;
    if (grid[row][col] === char) return false;

    grid[row] = grid[row].substring(0, col) + char + grid[row].substring(col + 1);
    return true;
  }

  getEntitiesAt(col: number, row: number): Entity[] {
    if (!this.level) return [];
    return this.level.entities.filter(e => e.col === col && e.row === row);
  }

  selectEntityAt(col: number, row: number): Entity | null {
    const entities = this.getEntitiesAt(col, row);
    if (entities.length === 0) {
      this.selectedEntity = null;
      return null;
    }

    const cellKey = `${col},${row}`;
    if (this.lastClickCell === cellKey) {
      this.selectionIndex = (this.selectionIndex + 1) % entities.length;
    } else {
      this.selectionIndex = 0;
      this.lastClickCell = cellKey;
    }

    this.selectedEntity = entities[this.selectionIndex];
    return this.selectedEntity;
  }

  deselectEntity(): void {
    this.selectedEntity = null;
    this.lastClickCell = '';
    this.selectionIndex = 0;
  }

  addEntity(col: number, row: number, type: string): Entity | null {
    if (!this.level) return null;
    if (!this.canPlaceEntityType(col, row, type)) return null;

    const defaults = ENTITY_DEFAULTS[type] ?? {};
    const entity: Entity = { col, row, type, ...defaults };
    this.level.entities.push(entity);
    this.selectedEntity = entity;
    return entity;
  }

  deleteSelectedEntity(): void {
    if (!this.level || !this.selectedEntity) return;
    const idx = this.level.entities.indexOf(this.selectedEntity);
    if (idx >= 0) {
      this.level.entities.splice(idx, 1);
    }
    this.selectedEntity = null;
  }

  canPlaceEntityType(col: number, row: number, type: string): boolean {
    if (!this.level) return false;
    const grid = this.level.grid;
    if (row < 0 || row >= grid.length) return false;
    if (col < 0 || col >= grid[row].length) return false;

    const char = grid[row][col];

    if (type === 'door') return char === 'D';
    if (type === 'stairs') return char === 'S' || char === 'U';
    // All others require a walkable cell
    return this.walkableSet.has(char);
  }
}
