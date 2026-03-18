import type { DungeonLevel, CharDef, Entity, Dungeon } from '../core/types';
import { buildWalkableSet } from '../core/grid';
import { UndoManager } from './UndoManager';

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

export type EditorTool = 'select' | 'paint' | 'entity';

const ENTITY_DEFAULTS: Record<string, Record<string, unknown>> = {
  door:           { state: 'closed' },
  key:            { keyId: '' },
  lever:          { targets: [], wall: 'N' },
  pressure_plate: { targets: [] },
  trigger:        { targets: [], signalMode: 'momentary' },
  tripwire:       { targets: [], signalMode: 'one_shot', visibilityThreshold: 8, orientation: 'EW' },
  gate:           { gateType: 'and', targets: [] },
  torch_sconce:   { wall: 'N' },
  enemy:          { enemyType: 'rat' },
  equipment:      { itemId: '' },
  consumable:     { itemId: '' },
  stairs:         { direction: 'down', facing: 'S', target: '' },
};

export interface ValidationError {
  message: string;
  entity?: Entity;
}

export interface PickModeState {
  entity: Entity;
  field: string;
  validChar?: string;
  validEntityType?: string;
  crossLevel?: boolean;
}

export interface AreaDragState {
  startCol: number;
  startRow: number;
  currentCol: number;
  currentRow: number;
}

export interface WireDragState {
  sourceEntity: Entity;
  field: string;
  validEntityType: string;
  startCol: number;
  startRow: number;
  mouseX: number;
  mouseY: number;
}

/** Wiring info for an entity type: what field it uses and what target type it accepts. */
interface WireSourceInfo {
  field: string;
  validEntityType: string;
}

const WIRE_SOURCE_MAP: Record<string, WireSourceInfo> = {
  lever:          { field: 'targets', validEntityType: 'door' },
  pressure_plate: { field: 'targets', validEntityType: 'door' },
  trigger:        { field: 'targets', validEntityType: 'door' },
  tripwire:       { field: 'targets', validEntityType: 'door' },
  gate:           { field: 'targets', validEntityType: 'door' },
  key:            { field: 'keyId',  validEntityType: 'door' },
  door:           { field: 'keyId',  validEntityType: 'key' },
  stairs:         { field: 'target', validEntityType: 'stairs' },
};

export class EditorApp {
  level: DungeonLevel | null = null;
  viewport: Viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
  hover: HoverInfo | null = null;
  charDefMap: Map<string, CharDef> = new Map();
  walkableSet: Set<string> = new Set();
  errors: ValidationError[] = [];
  dirty = false;
  cleanSnapshot = '';
  dungeon: Dungeon | null = null;
  activeLevelIndex = 0;
  levelCleanSnapshots: string[] = [];
  dirtyLevelIndices = new Set<number>();
  activeTool: EditorTool = 'select';
  selectedChar = '.';
  selectedEntity: Entity | null = null;
  selectedEntityType = 'enemy';
  pickMode: PickModeState | null = null;
  coordPickCallback: ((col: number, row: number) => void) | null = null;
  coordDragCallback: ((fromCol: number, fromRow: number, toCol: number, toRow: number) => void) | null = null;
  areaDragState: AreaDragState | null = null;
  wireDragState: WireDragState | null = null;
  statusHint: string | null = null;
  sourcePath: string | null = null;
  showCeiling = false;
  showItemPreview = true;
  selectedEnemyType = 'rat';
  selectedEquipmentId = 'sword_iron';
  selectedConsumableId = 'health_potion_small';
  undo = new UndoManager();
  onLevelRestored: (() => void) | null = null;

  private selectionIndex = 0;
  private lastClickCell = '';

  loadLevel(level: DungeonLevel): void {
    this.level = level;
    this.rebuildDerivedState();
    this.undo.init();

    // Reset viewport and tool state
    this.viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
    this.hover = null;
    this.activeTool = 'select';
    this.selectedChar = '.';
    this.selectedEntity = null;
    this.selectionIndex = 0;
    this.lastClickCell = '';
    this.pickMode = null;
    this.coordDragCallback = null;
    this.areaDragState = null;
    this.wireDragState = null;
    this.statusHint = null;
    this.dirty = false;
    this.cleanSnapshot = JSON.stringify(level);
    this.sourcePath = null;

    this.dungeon = null;
    this.activeLevelIndex = 0;
    this.levelCleanSnapshots = [];
    this.dirtyLevelIndices = new Set();
  }

  loadDungeon(dungeon: Dungeon): void {
    this.sourcePath = null;
    this.dungeon = dungeon;
    // Auto-generate missing level IDs
    for (let i = 0; i < dungeon.levels.length; i++) {
      const level = dungeon.levels[i];
      if (!level.id) {
        level.id = `level_${i}`;
      }
    }
    // Populate clean snapshots
    this.levelCleanSnapshots = dungeon.levels.map(level => JSON.stringify(level));
    this.dirtyLevelIndices = new Set();
    this.undo.init();
    this.switchToLevel(0);
  }

  switchToLevel(index: number): void {
    if (this.dungeon === null || index < 0 || index >= this.dungeon.levels.length) return;

    // Snapshot-compare outgoing level if there is one
    if (this.level !== null) {
      if (JSON.stringify(this.level) !== this.levelCleanSnapshots[this.activeLevelIndex]) {
        this.dirtyLevelIndices.add(this.activeLevelIndex);
      } else {
        this.dirtyLevelIndices.delete(this.activeLevelIndex);
      }
    }

    this.activeLevelIndex = index;
    this.level = this.dungeon.levels[index];

    this.rebuildDerivedState();
    this.viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
    this.hover = null;
    this.activeTool = 'select';
    this.selectedChar = '.';
    this.selectionIndex = 0;
    this.lastClickCell = '';
    // Preserve cross-level pick mode (e.g. stair target picking across levels)
    if (!this.pickMode?.crossLevel) {
      this.pickMode = null;
      this.statusHint = null;
    }
    this.coordDragCallback = null;
    this.areaDragState = null;
    this.wireDragState = null;

    this.cleanSnapshot = this.levelCleanSnapshots[index];
    this.dirty = this.isDungeonDirty();
  }

  addLevelToDungeon(cols: number, rows: number): number {
    if (!this.dungeon) return -1;

    // Build wall-bordered grid
    const grid: string[] = [];
    for (let r = 0; r < rows; r++) {
      if (r === 0 || r === rows - 1) {
        grid.push('#'.repeat(cols));
      } else {
        grid.push('#' + '.'.repeat(cols - 2) + '#');
      }
    }

    // Find an unused id of the form level_N
    const existingIds = new Set(this.dungeon.levels.map(l => l.id).filter(Boolean));
    let n = 1;
    while (existingIds.has(`level_${n}`)) n++;
    const id = `level_${n}`;

    const newLevel: DungeonLevel = {
      id,
      name: 'Untitled',
      grid,
      playerStart: { col: 1, row: 1, facing: 'S' },
      entities: [],
    };

    this.dungeon.levels.push(newLevel);
    this.levelCleanSnapshots.push(JSON.stringify(newLevel));

    return this.dungeon.levels.length - 1;
  }

  removeLevelFromDungeon(index: number): boolean {
    if (!this.dungeon || this.dungeon.levels.length <= 1) return false;

    this.dungeon.levels.splice(index, 1);
    this.levelCleanSnapshots.splice(index, 1);

    // Remove and shift dirty indices
    this.dirtyLevelIndices.delete(index);
    const shifted = new Set<number>();
    for (const i of this.dirtyLevelIndices) {
      shifted.add(i > index ? i - 1 : i);
    }
    this.dirtyLevelIndices = shifted;

    if (this.activeLevelIndex >= this.dungeon.levels.length) {
      this.activeLevelIndex = this.dungeon.levels.length - 1;
    }
    this.switchToLevel(this.activeLevelIndex);
    return true;
  }

  moveLevelInDungeon(from: number, to: number): void {
    if (!this.dungeon) return;
    const len = this.dungeon.levels.length;
    if (from < 0 || from >= len || to < 0 || to >= len) return;

    // Snapshot-compare active level before reshuffling
    if (this.level !== null) {
      if (JSON.stringify(this.level) !== this.levelCleanSnapshots[this.activeLevelIndex]) {
        this.dirtyLevelIndices.add(this.activeLevelIndex);
      } else {
        this.dirtyLevelIndices.delete(this.activeLevelIndex);
      }
    }

    // Swap levels and snapshots
    const tmpLevel = this.dungeon.levels[from];
    this.dungeon.levels[from] = this.dungeon.levels[to];
    this.dungeon.levels[to] = tmpLevel;

    const tmpSnap = this.levelCleanSnapshots[from];
    this.levelCleanSnapshots[from] = this.levelCleanSnapshots[to];
    this.levelCleanSnapshots[to] = tmpSnap;

    // Rebuild dirty set: swap from/to dirty state
    const fromDirty = this.dirtyLevelIndices.has(from);
    const toDirty = this.dirtyLevelIndices.has(to);
    if (fromDirty) {
      this.dirtyLevelIndices.add(to);
    } else {
      this.dirtyLevelIndices.delete(to);
    }
    if (toDirty) {
      this.dirtyLevelIndices.add(from);
    } else {
      this.dirtyLevelIndices.delete(from);
    }

    // Track active level through the swap
    if (this.activeLevelIndex === from) {
      this.activeLevelIndex = to;
    } else if (this.activeLevelIndex === to) {
      this.activeLevelIndex = from;
    }
  }

  isDungeonDirty(): boolean {
    if (this.dirtyLevelIndices.size > 0) return true;
    if (this.level && JSON.stringify(this.level) !== this.levelCleanSnapshots[this.activeLevelIndex]) return true;
    return false;
  }

  isDungeonMode(): boolean {
    return this.dungeon !== null;
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

  validate(): ValidationError[] {
    if (!this.level) return [];
    const errors: ValidationError[] = [];
    const level = this.level;

    // Duplicate charDef chars
    if (level.charDefs) {
      const seen = new Map<string, number>();
      for (let i = 0; i < level.charDefs.length; i++) {
        const ch = level.charDefs[i].char;
        if (seen.has(ch)) {
          errors.push({ message: `Duplicate charDef '${ch}' at indices ${seen.get(ch)} and ${i}` });
        } else {
          seen.set(ch, i);
        }
      }
    }

    // Grid chars used but not defined
    const knownChars = new Set(['#', '.', ' ']);
    if (level.charDefs) {
      for (const def of level.charDefs) knownChars.add(def.char);
    }
    const unknownChars = new Set<string>();
    for (const row of level.grid) {
      for (const ch of row) {
        if (!knownChars.has(ch)) unknownChars.add(ch);
      }
    }
    for (const ch of unknownChars) {
      errors.push({ message: `Grid char '${ch}' is used but has no charDef` });
    }

    // Entity references to non-existent targets
    const entityIds = new Set<string>();
    for (const e of level.entities) {
      if (e.id) entityIds.add(e.id);
    }
    for (const e of level.entities) {
      if (e.type === 'stairs') continue; // stairs.target points to another level — validated separately below
      const rec = e as Record<string, unknown>;
      // Check scalar target field
      const target = rec.target;
      if (typeof target === 'string' && target && !entityIds.has(target)) {
        errors.push({ message: `${e.type} '${e.id ?? '?'}' references non-existent target '${target}'`, entity: e });
      }
      // Check targets array field (lever, pressure_plate)
      if (Array.isArray(rec.targets)) {
        for (const t of rec.targets as string[]) {
          if (typeof t === 'string' && t && !entityIds.has(t)) {
            errors.push({ message: `${e.type} '${e.id ?? '?'}' references non-existent target '${t}'`, entity: e });
          }
        }
      }
    }

    // Player start out of bounds
    const ps = level.playerStart;
    if (ps.row < 0 || ps.row >= level.grid.length ||
        ps.col < 0 || ps.col >= (level.grid[ps.row]?.length ?? 0)) {
      errors.push({ message: `Player start (${ps.col},${ps.row}) is out of bounds` });
    } else {
      const psChar = level.grid[ps.row][ps.col];
      if (!this.walkableSet.has(psChar)) {
        errors.push({ message: `Player start (${ps.col},${ps.row}) is on non-walkable cell '${psChar}'` });
      }
    }

    // Entity on non-walkable cell
    for (const e of level.entities) {
      if (e.row < 0 || e.row >= level.grid.length ||
          e.col < 0 || e.col >= (level.grid[e.row]?.length ?? 0)) {
        errors.push({ message: `${e.type} '${e.id ?? '?'}' at (${e.col},${e.row}) is out of bounds`, entity: e });
        continue;
      }
      const ch = level.grid[e.row][e.col];
      if (!this.walkableSet.has(ch)) {
        errors.push({ message: `${e.type} '${e.id ?? '?'}' at (${e.col},${e.row}) is on non-walkable cell '${ch}'`, entity: e });
      }
    }

    // Cross-level stair validation (dungeon mode only)
    if (this.dungeon) {
      for (const e of level.entities) {
        if (e.type !== 'stairs') continue;
        const targetId = e.target as string;
        if (!targetId) continue;

        // Find target stair on another level
        let targetStair: Entity | undefined;
        let targetLevel: DungeonLevel | undefined;
        for (const otherLevel of this.dungeon.levels) {
          if (otherLevel === level) continue;
          targetStair = otherLevel.entities.find(oe => oe.id === targetId);
          if (targetStair) {
            targetLevel = otherLevel;
            break;
          }
        }

        if (!targetStair || !targetLevel) {
          errors.push({ message: `Stairs '${e.id ?? '?'}' targets non-existent entity '${targetId}'`, entity: e });
          continue;
        }
        if (targetStair.type !== 'stairs') {
          errors.push({ message: `Stairs '${e.id ?? '?'}' target '${targetId}' is not a stairs entity`, entity: e });
          continue;
        }

        // Validate spawn cell (one step in target stair's facing direction)
        const FACING_OFFSETS: Record<string, [number, number]> = {
          N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
        };
        const targetFacing = targetStair.facing as string;
        const [dc, dr] = FACING_OFFSETS[targetFacing] ?? [0, 0];
        const spawnCol = targetStair.col + dc;
        const spawnRow = targetStair.row + dr;

        if (spawnRow < 0 || spawnRow >= targetLevel.grid.length || spawnCol < 0 || spawnCol >= (targetLevel.grid[spawnRow]?.length ?? 0)) {
          errors.push({ message: `Stairs '${e.id ?? '?'}' spawn position (${spawnCol},${spawnRow}) is out of bounds on level '${targetLevel.id}'`, entity: e });
        } else {
          const targetWalkable = buildWalkableSet(targetLevel.charDefs);
          const targetChar = targetLevel.grid[spawnRow][spawnCol];
          if (!targetWalkable.has(targetChar)) {
            errors.push({ message: `Stairs '${e.id ?? '?'}' spawn position (${spawnCol},${spawnRow}) is on non-walkable cell '${targetChar}' on level '${targetLevel.id}'`, entity: e });
          }
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
    // sourcePath already reset by loadLevel
  }

  restoreLevel(level: DungeonLevel): void {
    this.level = level;
    if (this.dungeon) {
      this.dungeon.levels[this.activeLevelIndex] = level;
    }
    this.rebuildDerivedState();
    // Preserve selection by matching id in restored level
    if (this.selectedEntity) {
      const id = this.selectedEntity.id;
      this.selectedEntity = id ? level.entities.find(e => e.id === id) ?? null : null;
    }
    this.onLevelRestored?.();
  }

  /** Restore a level that may be on a different level index (cross-level undo/redo). */
  restoreLevelAtIndex(level: DungeonLevel, levelIndex: number): void {
    if (this.dungeon && levelIndex !== this.activeLevelIndex) {
      // Commit dirty state for outgoing level
      if (this.level !== null) {
        if (JSON.stringify(this.level) !== this.levelCleanSnapshots[this.activeLevelIndex]) {
          this.dirtyLevelIndices.add(this.activeLevelIndex);
        } else {
          this.dirtyLevelIndices.delete(this.activeLevelIndex);
        }
      }
      this.activeLevelIndex = levelIndex;
      this.cleanSnapshot = this.levelCleanSnapshots[levelIndex];
      // Reset viewport for the new level (preserve selectedEntity for cross-level inspection)
      this.viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
      this.hover = null;
      this.selectionIndex = 0;
      this.lastClickCell = '';
      this.pickMode = null;
    }
    this.restoreLevel(level);
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
    // Inject remembered subtypes for entity placement
    if (type === 'enemy' && this.selectedEnemyType) {
      entity.enemyType = this.selectedEnemyType;
    } else if (type === 'equipment' && this.selectedEquipmentId) {
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
    if (pm.validEntityType) {
      const hasEntity = this.getEntitiesAt(col, row).some(e => e.type === pm.validEntityType);
      // Cross-level stair pick: also accept walkable cells (will auto-create a stair)
      if (!hasEntity) {
        if (pm.crossLevel && pm.validEntityType === 'stairs' && this.walkableSet.has(grid[row][col])) {
          return true;
        }
        return false;
      }
    }
    return pm.validChar !== undefined || pm.validEntityType !== undefined;
  }

  completePickMode(col: number, row: number): boolean {
    if (!this.pickMode || !this.level) return false;
    if (!this.isValidPickTarget(col, row)) return false;

    const pm = this.pickMode;

    if ((pm.field === 'target' || pm.field === 'targets') && pm.validEntityType) {
      // ID-based pick: find target entity, ensure it has an ID, write ID into source's field
      let pickedTargets = this.getEntitiesAt(col, row).filter(e => e.type === pm.validEntityType);
      // Cross-level stair pick: auto-create a stair on empty walkable cell
      if (pickedTargets.length === 0 && pm.crossLevel && pm.validEntityType === 'stairs') {
        const sourceDir = (pm.entity as Record<string, unknown>).direction as string;
        const oppositeDir = sourceDir === 'up' ? 'down' : 'up';
        const defaults = { direction: oppositeDir, facing: 'S', target: '' };
        const newStair: Entity = { col, row, type: 'stairs', id: this.generateEntityId('stairs'), ...defaults };
        this.level!.entities.push(newStair);
        pickedTargets = [newStair];
      }
      if (pickedTargets.length === 0) { this.pickMode = null; return false; }
      const pickedTarget = pickedTargets[0];
      if (!pickedTarget.id) {
        pickedTarget.id = this.generateEntityId(pickedTarget.type);
      }
      // Ensure source has an ID too
      if (!pm.entity.id) {
        pm.entity.id = this.generateEntityId(pm.entity.type);
      }
      if (pm.field === 'targets') {
        // Array field: push into targets array
        const arr = ((pm.entity as Record<string, unknown>).targets as string[]) ?? [];
        if (!arr.includes(pickedTarget.id!)) {
          arr.push(pickedTarget.id!);
        }
        (pm.entity as Record<string, unknown>).targets = arr;
      } else {
        (pm.entity as Record<string, unknown>)[pm.field] = pickedTarget.id;
      }
      // Cross-level: mutually link and select the target entity (only for scalar target)
      if (pm.crossLevel && pm.field === 'target') {
        (pickedTarget as Record<string, unknown>)[pm.field] = pm.entity.id;
        this.selectedEntity = pickedTarget;
      }
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
    return this.level.entities.filter(e => {
      const rec = e as Record<string, unknown>;
      // Check scalar target field (stairs)
      if (rec.target === entity.id) return true;
      // Check targets array field (lever, pressure_plate)
      if (Array.isArray(rec.targets) && (rec.targets as string[]).includes(entity.id!)) return true;
      return false;
    });
  }

  getKeyIdPeers(entity: Entity): Entity[] {
    if (!this.level) return [];
    const keyId = (entity as Record<string, unknown>).keyId as string;
    if (!keyId) return [];
    return this.level.entities.filter(e => e !== entity && (e as Record<string, unknown>).keyId === keyId);
  }

  getWireSourceInfo(entity: Entity): WireSourceInfo | null {
    return WIRE_SOURCE_MAP[entity.type] ?? null;
  }

  isValidWireTarget(col: number, row: number): boolean {
    const ws = this.wireDragState;
    if (!ws || !this.level) return false;
    const grid = this.level.grid;
    if (row < 0 || row >= grid.length || col < 0 || col >= grid[row].length) return false;
    if (col === ws.startCol && row === ws.startRow) return false;

    const targets = this.getEntitiesAt(col, row);
    // Forward match: target cell has an entity of the expected type
    if (targets.some(e => e.type === ws.validEntityType)) return true;
    // Reverse match: target cell has an entity that can wire to the source entity's type
    for (const t of targets) {
      const info = WIRE_SOURCE_MAP[t.type];
      if (info && info.validEntityType === ws.sourceEntity.type) return true;
    }
    return false;
  }

  completeWireDrag(col: number, row: number): boolean {
    const ws = this.wireDragState;
    if (!ws || !this.level) return false;

    const targets = this.getEntitiesAt(col, row);
    if (targets.length === 0) return false;

    // Try forward wiring: source.field = target.id
    const forwardTarget = targets.find(e => e.type === ws.validEntityType);
    if (forwardTarget) {
      return this.applyWire(ws.sourceEntity, forwardTarget, ws.field);
    }

    // Try reverse wiring: target.field = source.id
    for (const t of targets) {
      const info = WIRE_SOURCE_MAP[t.type];
      if (info && info.validEntityType === ws.sourceEntity.type) {
        return this.applyWire(t, ws.sourceEntity, info.field);
      }
    }

    return false;
  }

  private applyWire(source: Entity, target: Entity, field: string): boolean {
    if (!source.id) source.id = this.generateEntityId(source.type);
    if (!target.id) target.id = this.generateEntityId(target.type);

    if (field === 'keyId') {
      // keyId sync: match keyId between source and target
      const sourceVal = (source as Record<string, unknown>)[field] as string || '';
      const targetVal = (target as Record<string, unknown>)[field] as string || '';
      const syncedVal = targetVal || sourceVal || this.generateKeyId();
      (source as Record<string, unknown>)[field] = syncedVal;
      (target as Record<string, unknown>)[field] = syncedVal;
    } else if (field === 'targets') {
      // Array field: push target's id into source's targets array
      const arr = (source as Record<string, unknown>)[field] as string[] ?? [];
      if (!arr.includes(target.id!)) {
        arr.push(target.id!);
      }
      (source as Record<string, unknown>)[field] = arr;
    } else {
      // Scalar target field: write target's id into source's field
      (source as Record<string, unknown>)[field] = target.id;
    }
    return true;
  }

  private generateEntityId(type: string): string {
    const existing = new Set<string>();
    if (this.dungeon) {
      for (const level of this.dungeon.levels) {
        for (const e of level.entities) {
          if (typeof e.id === 'string' && e.id) existing.add(e.id);
        }
      }
    } else if (this.level) {
      for (const e of this.level.entities) {
        if (typeof e.id === 'string' && e.id) existing.add(e.id);
      }
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
