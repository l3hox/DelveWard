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
  lever:          { target: '', wall: 'N' },
  pressure_plate: { target: '' },
  torch_sconce:   { wall: 'N' },
  enemy:          { enemyType: 'rat' },
  equipment:      { itemId: '' },
  consumable:     { itemId: '' },
  stairs:         { direction: 'down', targetLevel: '', targetCol: 0, targetRow: 0 },
};

export interface PickModeState {
  entity: Entity;
  field: string;
  validChar?: string;
  validEntityType?: string;
}

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
  pickMode: PickModeState | null = null;
  coordPickCallback: ((col: number, row: number) => void) | null = null;
  showCeiling = false;
  showItemPreview = true;
  selectedEquipmentId = 'sword_iron';
  selectedConsumableId = 'health_potion_small';

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
    this.pickMode = null;
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
    const entity: Entity = { col, row, type, id: this.generateEntityId(type), ...defaults };
    // Inject remembered itemId for equipment/consumable
    if (type === 'equipment' && this.selectedEquipmentId) {
      entity.itemId = this.selectedEquipmentId;
    } else if (type === 'consumable' && this.selectedConsumableId) {
      entity.itemId = this.selectedConsumableId;
    }
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

    if (type === 'door') {
      if (!this.walkableSet.has(char)) return false;
      return !this.getEntitiesAt(col, row).some(e => e.type === 'door');
    }
    if (type === 'stairs') {
      if (!this.walkableSet.has(char)) return false;
      return !this.getEntitiesAt(col, row).some(e => e.type === 'stairs');
    }
    // All others require a walkable cell
    return this.walkableSet.has(char);
  }

  enterPickMode(entity: Entity, field: string, validChar?: string, validEntityType?: string): void {
    this.pickMode = { entity, field, validChar, validEntityType };
  }

  cancelPickMode(): void {
    this.pickMode = null;
  }

  isValidPickTarget(col: number, row: number): boolean {
    if (!this.pickMode || !this.level) return false;
    const grid = this.level.grid;
    if (row < 0 || row >= grid.length) return false;
    if (col < 0 || col >= grid[row].length) return false;

    const pm = this.pickMode;
    if (pm.validChar && grid[row][col] !== pm.validChar) return false;
    if (pm.validEntityType && !this.getEntitiesAt(col, row).some(e => e.type === pm.validEntityType)) return false;
    return pm.validChar !== undefined || pm.validEntityType !== undefined;
  }

  completePickMode(col: number, row: number): boolean {
    if (!this.pickMode || !this.level) return false;
    if (!this.isValidPickTarget(col, row)) return false;

    const pm = this.pickMode;

    if (pm.field === 'target' && pm.validEntityType) {
      // ID-based pick: find target entity, ensure it has an ID, write ID into source's target field
      const targets = this.getEntitiesAt(col, row).filter(e => e.type === pm.validEntityType);
      if (targets.length === 0) { this.pickMode = null; return false; }
      const target = targets[0];
      if (!target.id) {
        target.id = this.generateEntityId(target.type);
      }
      (pm.entity as Record<string, unknown>)[pm.field] = target.id;
    } else {
      // keyId sync: sync field value between source and target entities
      const targets = this.getEntitiesAt(col, row).filter(e => e.type === pm.validEntityType);
      if (targets.length === 0) { this.pickMode = null; return false; }
      const target = targets[0];
      const sourceVal = (pm.entity as Record<string, unknown>)[pm.field] as string || '';
      const targetVal = (target as Record<string, unknown>)[pm.field] as string || '';
      const syncedVal = targetVal || sourceVal || this.generateKeyId();
      (pm.entity as Record<string, unknown>)[pm.field] = syncedVal;
      (target as Record<string, unknown>)[pm.field] = syncedVal;
    }

    this.pickMode = null;
    return true;
  }

  getReferencingEntities(entity: Entity): Entity[] {
    if (!this.level || !entity.id) return [];
    return this.level.entities.filter(e => (e as Record<string, unknown>).target === entity.id);
  }

  getKeyIdPeers(entity: Entity): Entity[] {
    if (!this.level) return [];
    const keyId = (entity as Record<string, unknown>).keyId as string;
    if (!keyId) return [];
    return this.level.entities.filter(e => e !== entity && (e as Record<string, unknown>).keyId === keyId);
  }

  private generateEntityId(type: string): string {
    if (!this.level) return `${type}_1`;
    const existing = new Set<string>();
    for (const e of this.level.entities) {
      if (typeof e.id === 'string' && e.id) existing.add(e.id);
    }
    let n = 1;
    while (existing.has(`${type}_${n}`)) n++;
    return `${type}_${n}`;
  }

  private generateKeyId(): string {
    if (!this.level) return 'key_1';
    const existing = new Set<string>();
    for (const e of this.level.entities) {
      const kid = (e as Record<string, unknown>).keyId;
      if (typeof kid === 'string' && kid) existing.add(kid);
    }
    let n = 1;
    while (existing.has(`key_${n}`)) n++;
    return `key_${n}`;
  }
}
