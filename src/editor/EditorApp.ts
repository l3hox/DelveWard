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
  activeTool: EditorTool = 'select';
  selectedChar = '.';
  selectedEntity: Entity | null = null;
  selectedEntityType = 'enemy';

  private selectionIndex = 0;
  private lastClickCell = '';

  loadLevel(level: DungeonLevel): void {
    this.level = level;

    // Build charDef lookup map
    this.charDefMap = new Map();
    if (level.charDefs) {
      for (const def of level.charDefs) {
        this.charDefMap.set(def.char, def);
      }
    }

    // Build walkable set
    this.walkableSet = buildWalkableSet(level.charDefs);

    // Reset viewport and tool state
    this.viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
    this.hover = null;
    this.activeTool = 'select';
    this.selectedChar = '.';
    this.selectedEntity = null;
    this.selectionIndex = 0;
    this.lastClickCell = '';
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
