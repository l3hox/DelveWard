import type { DungeonLevel, CharDef, Entity, Dungeon, LayerDef } from '../core/types';
import { buildWalkableSet } from '../core/grid';
import { getAllLevelEntities, findEntityLayerIndex } from '../level/levelLoader';
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

export type EditorTool = 'select' | 'paint' | 'entity' | 'thin_wall';

const ENTITY_DEFAULTS: Record<string, Record<string, unknown>> = {
  door:           { state: 'closed', gateMode: 'or' },
  key:            { keyId: '' },
  lever:          { targets: [], wall: 'N', signalMode: 'toggle' },
  pressure_plate: { targets: [], signalMode: 'toggle' },
  trigger:        { targets: [], signalMode: 'momentary' },
  tripwire:       { targets: [], visibilityThreshold: 8, orientation: 'EW' },
  gate:           { gateType: 'and', targets: [] },
  trap_launcher:  { facing: 'S', projectileType: 'dart', fireMode: 'repeat', reloadTime: 3 },
  torch_sconce:   { wall: 'N' },
  enemy:          { enemyType: 'rat' },
  equipment:      { itemId: '' },
  consumable:     { itemId: '' },
  stairs:         { direction: 'down', facing: 'S', target: '' },
  breakable_wall: { hp: 30 },
  secret_wall:    { persistent: false },
  block:          {},
  chest:          { state: 'closed', facing: 'S' },
  sign:           { wall: 'N', text: '' },
  npc:            { npcId: '' },
  fountain:       { healAmount: 20 },
  bookshelf:      { wall: 'N', text: '' },
  altar:          { buffType: 'atk', buffAmount: 5, buffDuration: 60 },
  barrel:         { hp: 10 },
  ramp:           { facing: 'N', style: 'ramp' },
  prop:           { propId: 'pillar' },
  thin_wall:      { wall: 'S', solid: true, height: 'full', texture: 'stone_thin' },
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
  lever:          { field: 'targets', validEntityType: 'door,gate,trap_launcher,chest' },
  pressure_plate: { field: 'targets', validEntityType: 'door,gate,trap_launcher,chest' },
  trigger:        { field: 'targets', validEntityType: 'door,gate,trap_launcher,chest' },
  tripwire:       { field: 'targets', validEntityType: 'door,gate,trap_launcher,chest' },
  gate:           { field: 'targets', validEntityType: 'door,gate,trap_launcher,chest' },
  key:            { field: 'keyId',  validEntityType: 'door,chest' },
  door:           { field: 'keyId',  validEntityType: 'key' },
  chest:          { field: 'targets', validEntityType: 'door,gate,trap_launcher' },
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
  activeLayerIndex = 0;
  private lastLayerPerLevel = new Map<number, number>(); // levelIndex → last active layerIndex
  levelCleanSnapshots: string[] = [];
  dirtyLevelIndices = new Set<number>();
  activeTool: EditorTool = 'select';
  selectedChar = '.';
  selectedEntity: Entity | null = null;
  highlightedEntity: Entity | null = null;
  selectedEntityType = 'enemy';
  pickMode: PickModeState | null = null;
  coordPickCallback: ((col: number, row: number) => void) | null = null;
  coordDragCallback: ((fromCol: number, fromRow: number, toCol: number, toRow: number) => void) | null = null;
  areaDragState: AreaDragState | null = null;
  wireDragState: WireDragState | null = null;
  statusHint: string | null = null;
  editorMode: 'level' | 'dialog' = 'level';
  dialogNpcId: string | null = null;
  sourcePath: string | null = null;
  showCeiling = false;
  showItemPreview = true;
  showLayerBelow = true;
  floodFill = false;
  selectedEnemyType = 'rat';
  selectedRampFacing: import('../core/grid').Facing = 'N';
  selectedRampStyle: 'ramp' | 'stairs' = 'ramp';
  selectedPropId = 'pillar';
  selectedEquipmentId = 'sword_iron';
  selectedConsumableId = 'health_potion_small';
  selectedThinWallTexture = 'stone_thin';
  selectedThinWallTextureBack = 'stone_thin';  // when same as exterior, textureBack is omitted
  thinWallEraseOnly = false;
  undo = new UndoManager();
  onLevelRestored: (() => void) | null = null;

  private selectionIndex = 0;
  private lastClickCell = '';

  loadLevel(level: DungeonLevel): void {
    this.level = level;
    // Open the layer where playerStart is (default layer 0)
    const psLayer = level.playerStart?.layerIndex ?? 0;
    this.activeLayerIndex = this.resolveLayerIndex(psLayer);
    // Sync active layer data into the working surface
    this.syncFromActiveLayer();
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
    // Migration: if dungeon has no playerStart, promote the first level's playerStart
    if (!dungeon.playerStart) {
      const migrateLevel = dungeon.levels.find(l => l.playerStart !== undefined);
      if (migrateLevel && migrateLevel.playerStart) {
        (dungeon as Dungeon).playerStart = {
          levelId: migrateLevel.id!,
          col: migrateLevel.playerStart.col,
          row: migrateLevel.playerStart.row,
          facing: migrateLevel.playerStart.facing,
        };
      } else {
        // Fallback: place at (1,1) on first level
        (dungeon as Dungeon).playerStart = {
          levelId: dungeon.levels[0].id!,
          col: 1,
          row: 1,
          facing: 'S',
        };
      }
    }
    // Populate clean snapshots
    this.levelCleanSnapshots = dungeon.levels.map(level => JSON.stringify(level));
    this.dirtyLevelIndices = new Set();
    this.lastLayerPerLevel = new Map();
    this.undo.init();
    // Open the level and layer where playerStart is
    const ps = dungeon.playerStart;
    let startLevelIndex = 0;
    if (ps.levelId) {
      const idx = dungeon.levels.findIndex(l => l.id === ps.levelId);
      if (idx >= 0) startLevelIndex = idx;
    }
    // Pre-seed the layer for the start level so switchToLevel opens the right layer
    const startLevel = dungeon.levels[startLevelIndex];
    const layerCoord = ps.layerIndex ?? 0;  // default to layer 0 when not specified
    const layerStartId = String(layerCoord);
    const layerStartIdx = startLevel.layers.findIndex(l => l.id === layerStartId);
    if (layerStartIdx >= 0) this.lastLayerPerLevel.set(startLevelIndex, layerStartIdx);
    this.switchToLevel(startLevelIndex);
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
      // Remember current layer for the outgoing level
      this.syncToActiveLayer();
      this.lastLayerPerLevel.set(this.activeLevelIndex, this.activeLayerIndex);
    }

    this.activeLevelIndex = index;
    this.level = this.dungeon.levels[index];
    // Restore last active layer for this level (default 0)
    this.activeLayerIndex = this.lastLayerPerLevel.get(index) ?? 0;
    if (this.activeLayerIndex >= this.level.layers.length) {
      this.activeLayerIndex = 0;
    }
    this.syncFromActiveLayer();

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
      entities: [],
      layers: [{
        id: '0',
        grid,
        entities: [],
      }],
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

  /** Resolve a layer coordinate (numeric ID like 0, 1, -1) to an array index. Returns 0 if not found. */
  resolveLayerIndex(coord: number): number {
    if (!this.level) return 0;
    const id = String(coord);
    const idx = this.level.layers.findIndex(l => l.id === id);
    return idx >= 0 ? idx : 0;
  }

  /** Sync the level's top-level editing fields back to the active layer in layers[]. */
  syncToActiveLayer(): void {
    if (!this.level) return;
    const layer = this.level.layers[this.activeLayerIndex];
    if (!layer) return;
    layer.grid = this.level.grid;
    layer.entities = this.level.entities;
    // charDefs are level-global, not per-layer
    layer.areas = this.level.areas;
    layer.defaults = this.level.defaults;
    layer.ceiling = this.level.ceiling;
  }

  /** Load the active layer's data into the level's top-level editing fields. */
  syncFromActiveLayer(): void {
    if (!this.level) return;
    const layer = this.level.layers[this.activeLayerIndex];
    if (!layer) return;
    this.level.grid = layer.grid;
    this.level.entities = layer.entities;
    // charDefs stay on level (global across all layers)
    this.level.areas = layer.areas;
    this.level.defaults = layer.defaults;
    this.level.ceiling = layer.ceiling;
  }

  switchToLayer(index: number): void {
    if (!this.level || index < 0 || index >= this.level.layers.length) return;
    // Save current editing surface back to old layer
    this.syncToActiveLayer();
    this.activeLayerIndex = index;
    // Load new layer into editing surface
    this.syncFromActiveLayer();
    this.selectedEntity = null;
    this.rebuildDerivedState();
  }

  /** Insert a new empty layer above the uppermost or below the lowermost. Returns the new layer's index. */
  insertLayer(position: 'above' | 'below', copyLayout = false): number {
    if (!this.level) return -1;
    this.syncToActiveLayer();
    const activeLayer = this.level.layers[this.activeLayerIndex];
    const rows = activeLayer.grid.length;
    const cols = activeLayer.grid[0].length;

    let grid: string[];
    let entities: Entity[] = [];

    if (copyLayout) {
      // Copy the grid (walls + floors) from the active layer
      grid = activeLayer.grid.map(r => r);
      // Copy only thin_wall entities (layout elements, not gameplay entities)
      entities = activeLayer.entities
        .filter(e => e.type === 'thin_wall')
        .map(e => ({ ...e, id: undefined }));
    } else {
      grid = [];
      for (let r = 0; r < rows; r++) {
        if (r === 0 || r === rows - 1) {
          grid.push('#'.repeat(cols));
        } else {
          grid.push('#' + '.'.repeat(cols - 2) + '#');
        }
      }
    }

    if (position === 'above') {
      const topId = parseInt(this.level.layers[this.level.layers.length - 1].id ?? '0', 10) || 0;
      const newLayer: LayerDef = { id: String(topId + 1), grid, entities };
      this.level.layers.push(newLayer);
      return this.level.layers.length - 1;
    } else {
      const bottomId = parseInt(this.level.layers[0].id ?? '0', 10) || 0;
      const newLayer: LayerDef = { id: String(bottomId - 1), grid, entities };
      this.level.layers.splice(0, 0, newLayer);
      this.activeLayerIndex++;
      return 0;
    }
  }

  removeLayerFromLevel(index: number): boolean {
    if (!this.level || this.level.layers.length <= 1) return false;
    this.syncToActiveLayer();
    this.level.layers.splice(index, 1);
    if (this.activeLayerIndex >= this.level.layers.length) {
      this.activeLayerIndex = this.level.layers.length - 1;
    }
    // No playerStart.layerIndex shifting — it stores a layer coordinate (ID), not array index
    this.syncFromActiveLayer();
    this.selectedEntity = null;
    this.rebuildDerivedState();
    return true;
  }

  isDungeonDirty(): boolean {
    if (this.dirtyLevelIndices.size > 0) return true;
    if (this.level && JSON.stringify(this.level) !== this.levelCleanSnapshots[this.activeLevelIndex]) return true;
    return false;
  }

  isDungeonMode(): boolean {
    return this.dungeon !== null;
  }

  getPlayerStart(): { levelId?: string; col: number; row: number; facing: import('../core/grid').Facing; layerIndex?: number } | null {
    if (this.dungeon) {
      return this.dungeon.playerStart;
    }
    return this.level?.playerStart ?? null;
  }

  /** Get the active layer's coordinate (numeric ID). */
  getActiveLayerCoord(): number {
    if (!this.level) return 0;
    return parseInt(this.level.layers[this.activeLayerIndex]?.id ?? '0', 10) || 0;
  }

  setPlayerStart(col: number, row: number, facing: import('../core/grid').Facing, levelId?: string): void {
    const layerCoord = this.getActiveLayerCoord();
    if (this.dungeon) {
      this.dungeon.playerStart = { levelId: levelId ?? this.dungeon.playerStart.levelId, col, row, facing, layerIndex: layerCoord };
    } else if (this.level) {
      this.level.playerStart = { col, row, facing, layerIndex: layerCoord };
    }
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
          errors.push({ message: `Duplicate tile type '${ch}' at indices ${seen.get(ch)} and ${i}` });
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
      errors.push({ message: `Tile '${ch}' is used in the grid but has no tile type definition` });
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

    // Signal chain loop detection — DFS with proper cycle detection
    const SIGNAL_ENTITY_TYPES = new Set(['lever', 'pressure_plate', 'trigger', 'tripwire', 'gate', 'chest']);
    const entityMap = new Map<string, Entity>();
    for (const e of level.entities) {
      if (e.id) entityMap.set(e.id, e);
    }
    const reportedLoops = new Set<string>(); // avoid duplicate loop errors
    for (const e of level.entities) {
      if (!SIGNAL_ENTITY_TYPES.has(e.type) || !e.id) continue;
      // DFS: check if any path from e leads back to e
      const visited = new Set<string>();
      const stack: string[] = [];
      // Seed with direct targets (not e.id itself)
      const startRec = e as Record<string, unknown>;
      if (Array.isArray(startRec.targets)) {
        for (const t of startRec.targets as string[]) stack.push(t);
      }
      let foundLoop = false;
      while (stack.length > 0 && !foundLoop) {
        const cur = stack.pop()!;
        if (cur === e.id) {
          if (!reportedLoops.has(e.id)) {
            errors.push({ message: `Signal loop detected: '${e.id}' is part of a cycle`, entity: e });
            reportedLoops.add(e.id);
          }
          foundLoop = true;
          break;
        }
        if (visited.has(cur)) continue;
        visited.add(cur);
        const curEntity = entityMap.get(cur);
        if (!curEntity) continue;
        const rec = curEntity as Record<string, unknown>;
        if (Array.isArray(rec.targets)) {
          for (const t of rec.targets as string[]) {
            if (!visited.has(t)) stack.push(t);
          }
        }
      }
    }

    // Entities with empty targets (warning — not blocking)
    const TARGETS_ENTITY_TYPES = new Set(['lever', 'pressure_plate', 'trigger', 'tripwire', 'gate']);
    for (const e of level.entities) {
      if (TARGETS_ENTITY_TYPES.has(e.type)) {
        const rec = e as Record<string, unknown>;
        const targets = rec.targets as string[] | undefined;
        if (!targets || targets.length === 0) {
          errors.push({ message: `${e.type} '${e.id ?? '?'}' has no targets`, entity: e });
        }
      }
    }

    // Player start validation — one global playerStart only
    if (this.dungeon) {
      const dp = this.dungeon.playerStart;
      if (dp.levelId === level.id) {
        const arrIdx = this.resolveLayerIndex(dp.layerIndex ?? 0);
        const psGrid = level.layers[arrIdx].grid;
        if (dp.row < 0 || dp.row >= psGrid.length ||
            dp.col < 0 || dp.col >= (psGrid[dp.row]?.length ?? 0)) {
          errors.push({ message: `Player start (${dp.col},${dp.row}) is out of bounds on layer ${dp.layerIndex ?? 0}` });
        } else if (!this.walkableSet.has(psGrid[dp.row][dp.col])) {
          errors.push({ message: `Player start (${dp.col},${dp.row}) is on a non-walkable tile on layer ${dp.layerIndex ?? 0}` });
        }
      }
    } else {
      const ps = level.playerStart;
      if (ps) {
        const arrIdx = this.resolveLayerIndex(ps.layerIndex ?? 0);
        const psGrid = level.layers[arrIdx].grid;
        if (ps.row < 0 || ps.row >= psGrid.length ||
            ps.col < 0 || ps.col >= (psGrid[ps.row]?.length ?? 0)) {
          errors.push({ message: `Player start (${ps.col},${ps.row}) is out of bounds on layer ${ps.layerIndex ?? 0}` });
        } else if (!this.walkableSet.has(psGrid[ps.row][ps.col])) {
          errors.push({ message: `Player start (${ps.col},${ps.row}) is on a non-walkable tile on layer ${ps.layerIndex ?? 0}` });
        }
      }
    }

    // Entity on non-walkable cell — check each layer's entities against its own grid
    for (let li = 0; li < level.layers.length; li++) {
      const layerGrid = level.layers[li].grid;
      for (const e of level.layers[li].entities) {
        if (e.row < 0 || e.row >= layerGrid.length ||
            e.col < 0 || e.col >= (layerGrid[e.row]?.length ?? 0)) {
          errors.push({ message: `${e.type} '${e.id ?? '?'}' at (${e.col},${e.row}) is out of bounds on layer ${level.layers[li].id ?? li}`, entity: e });
          continue;
        }
        const ch = layerGrid[e.row][e.col];
        if (!this.walkableSet.has(ch) && e.type !== 'gate' && e.type !== 'breakable_wall' && e.type !== 'secret_wall') {
          errors.push({ message: `${e.type} '${e.id ?? '?'}' at (${e.col},${e.row}) is on non-walkable cell '${ch}' on layer ${level.layers[li].id ?? li}`, entity: e });
        }
      }
    }

    // Sign with empty text
    for (const e of level.entities) {
      if (e.type === 'sign' && !(e.text as string)) {
        errors.push({ message: `sign '${e.id ?? '?'}' at (${e.col},${e.row}) has empty text`, entity: e });
      }
    }

    // Cross-level stair validation (dungeon mode only)
    // Searches all layers on both source and target levels.
    if (this.dungeon) {
      const allSourceEntities = getAllLevelEntities(level);
      for (const e of allSourceEntities) {
        if (e.type !== 'stairs') continue;
        const targetId = e.target as string;
        if (!targetId) continue;

        // Find target stair on another level (search all layers)
        let targetStair: Entity | undefined;
        let targetLevel: DungeonLevel | undefined;
        let targetLayerIdx = 0;
        for (const otherLevel of this.dungeon.levels) {
          if (otherLevel === level) continue;
          const otherEntities = getAllLevelEntities(otherLevel);
          targetStair = otherEntities.find(oe => oe.id === targetId);
          if (targetStair) {
            targetLevel = otherLevel;
            targetLayerIdx = findEntityLayerIndex(otherLevel, targetId);
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

        // Validate spawn cell using the target stair's layer grid
        const targetGrid = targetLevel.layers[targetLayerIdx].grid;
        const FACING_OFFSETS: Record<string, [number, number]> = {
          N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
        };
        const targetFacing = targetStair.facing as string;
        const [dc, dr] = FACING_OFFSETS[targetFacing] ?? [0, 0];
        const spawnCol = targetStair.col + dc;
        const spawnRow = targetStair.row + dr;

        if (spawnRow < 0 || spawnRow >= targetGrid.length || spawnCol < 0 || spawnCol >= (targetGrid[spawnRow]?.length ?? 0)) {
          errors.push({ message: `Stairs '${e.id ?? '?'}' spawn position (${spawnCol},${spawnRow}) is out of bounds on level '${targetLevel.id}'`, entity: e });
        } else {
          const targetWalkable = buildWalkableSet(targetLevel.charDefs);
          const targetChar = targetGrid[spawnRow][spawnCol];
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
      playerStart: { col: 1, row: 1, facing: 'S', layerIndex: 0 },
      entities: [],
      layers: [{
        id: '0',
        grid,
        entities: [],
      }],
    };
    this.loadLevel(level);
    // sourcePath already reset by loadLevel
  }

  restoreLevel(level: DungeonLevel): void {
    this.level = level;
    if (this.dungeon) {
      this.dungeon.levels[this.activeLevelIndex] = level;
    }
    // Clamp activeLayerIndex in case layer count changed (undo add/remove layer)
    if (this.activeLayerIndex >= level.layers.length) {
      this.activeLayerIndex = level.layers.length - 1;
    }
    this.syncFromActiveLayer();
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

  floodFillCell(col: number, row: number, char: string): boolean {
    if (!this.level) return false;
    const grid = this.level.grid;
    if (row < 0 || row >= grid.length) return false;
    if (col < 0 || col >= grid[row].length) return false;
    const target = grid[row][col];
    if (target === char) return false;

    const rows = grid.length;
    const cols = grid[0].length;
    const stack: [number, number][] = [[col, row]];
    const visited = new Set<string>();

    while (stack.length > 0) {
      const [c, r] = stack.pop()!;
      const key = `${c},${r}`;
      if (visited.has(key)) continue;
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      if (grid[r][c] !== target) continue;
      visited.add(key);
      grid[r] = grid[r].substring(0, c) + char + grid[r].substring(c + 1);
      stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    return visited.size > 0;
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
    const entity: Entity = { col, row, type, id: this.generateEntityId(type), ...JSON.parse(JSON.stringify(defaults)) };
    // Inject remembered subtypes for entity placement
    if (type === 'enemy' && this.selectedEnemyType) {
      entity.enemyType = this.selectedEnemyType;
    } else if (type === 'equipment' && this.selectedEquipmentId) {
      entity.itemId = this.selectedEquipmentId;
    } else if (type === 'consumable' && this.selectedConsumableId) {
      entity.itemId = this.selectedConsumableId;
    } else if (type === 'ramp') {
      entity.facing = this.selectedRampFacing;
      entity.style = this.selectedRampStyle;
    } else if (type === 'prop') {
      entity.propId = this.selectedPropId;
    }
    // Auto-detect wall orientation for wall-mounted entities
    if ((type === 'lever' || type === 'torch_sconce') && this.level) {
      const detected = this.autoDetectWall(col, row);
      if (detected) {
        entity.wall = detected;
      }
    }
    if (type === 'sign' && this.level) {
      const detected = this.autoDetectWall(col, row);
      if (detected) {
        entity.wall = detected;
      }
    }
    if (type === 'bookshelf' && this.level) {
      const detected = this.autoDetectWall(col, row);
      if (detected) {
        entity.wall = detected;
      }
    }
    if (type === 'prop' && this.level) {
      // Auto-detect wall for wall-mounted props (banner)
      if (entity.propId === 'banner') {
        const detected = this.autoDetectWall(col, row);
        if (detected) entity.wall = detected;
      }
    }
    // Trap launcher: auto-detect facing (opposite of the wall it's mounted on)
    if (type === 'trap_launcher' && this.level) {
      const detected = this.autoDetectWall(col, row);
      if (detected) {
        const OPPOSITE: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E' };
        entity.facing = OPPOSITE[detected];
      }
    }
    // Copy targets from the previously selected entity of the same type
    if (this.selectedEntity && this.selectedEntity.type === type) {
      const prev = this.selectedEntity as Record<string, unknown>;
      if (Array.isArray(prev.targets) && (prev.targets as string[]).length > 0) {
        (entity as Record<string, unknown>).targets = [...prev.targets as string[]];
      }
    }
    this.level.entities.push(entity);
    this.selectedEntity = entity;
    return entity;
  }

  deleteSelectedEntity(): void {
    if (!this.level || !this.selectedEntity) return;
    const deletedId = this.selectedEntity.id;
    const idx = this.level.entities.indexOf(this.selectedEntity);
    if (idx >= 0) {
      this.level.entities.splice(idx, 1);
    }
    this.selectedEntity = null;

    // Clean up all references to the deleted entity
    if (deletedId) {
      for (const e of this.level.entities) {
        const rec = e as Record<string, unknown>;
        // Scalar target field (stairs)
        if (rec.target === deletedId) {
          rec.target = '';
        }
        // Array targets field (lever, plate, trigger, tripwire, gate)
        if (Array.isArray(rec.targets)) {
          const arr = rec.targets as string[];
          const i = arr.indexOf(deletedId);
          if (i >= 0) arr.splice(i, 1);
        }
        // keyId sync (key ↔ door)
        if (rec.keyId === deletedId) {
          rec.keyId = '';
        }
      }
    }
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
    // Gates are abstract logic — placeable anywhere (including walls)
    if (type === 'gate') return char !== ' ';
    // Wall entities: must be on solid (non-walkable) cell
    if (type === 'breakable_wall' || type === 'secret_wall') {
      return !this.walkableSet.has(char) && char !== ' ';
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
      const validTypes = pm.validEntityType.split(',');
      const hasEntity = this.getEntitiesAt(col, row).some(e => validTypes.includes(e.type));
      // Cross-level stair pick: also accept walkable cells (will auto-create a stair)
      if (!hasEntity) {
        if (pm.crossLevel && validTypes.includes('stairs') && this.walkableSet.has(grid[row][col])) {
          return true;
        }
        // keyId pick from door/chest: accept walkable cells to auto-create a key
        if (pm.field === 'keyId' && validTypes.includes('key') && this.walkableSet.has(grid[row][col])) {
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
      const validTypes = pm.validEntityType!.split(',');
      let pickedTargets = this.getEntitiesAt(col, row).filter(e => validTypes.includes(e.type));
      // Cross-level stair pick: auto-create a stair on empty walkable cell
      if (pickedTargets.length === 0 && pm.crossLevel && validTypes.includes('stairs')) {
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
      let targets = this.getEntitiesAt(col, row).filter(e => e.type === pm.validEntityType);
      // Auto-create a key entity on empty walkable cell when picking keyId for door/chest
      if (targets.length === 0 && pm.field === 'keyId' && pm.validEntityType === 'key') {
        if (this.walkableSet.has(this.level!.grid[row]?.[col])) {
          const newKey: Entity = {
            col, row, type: 'key',
            id: this.generateEntityId('key'),
            keyId: (pm.entity as Record<string, unknown>)[pm.field] as string || this.generateKeyId(),
          };
          this.level!.entities.push(newKey);
          targets = [newKey];
          this.selectedEntity = newKey;
        }
      }
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
    // Forward match: target cell has an entity of one of the expected types
    const wsValidTypes = ws.validEntityType.split(',');
    if (targets.some(e => wsValidTypes.includes(e.type))) return true;
    // Reverse match: target cell has an entity that can wire to the source entity's type
    for (const t of targets) {
      const info = WIRE_SOURCE_MAP[t.type];
      if (info && info.validEntityType.split(',').includes(ws.sourceEntity.type)) return true;
    }
    return false;
  }

  completeWireDrag(col: number, row: number): boolean {
    const ws = this.wireDragState;
    if (!ws || !this.level) return false;

    const targets = this.getEntitiesAt(col, row);
    if (targets.length === 0) return false;

    // Try forward wiring: source.field = target.id
    const wsValidTypes2 = ws.validEntityType.split(',');
    const forwardTarget = targets.find(e => wsValidTypes2.includes(e.type));
    if (forwardTarget) {
      return this.applyWire(ws.sourceEntity, forwardTarget, ws.field);
    }

    // Try reverse wiring: target.field = source.id
    for (const t of targets) {
      const info = WIRE_SOURCE_MAP[t.type];
      if (info && info.validEntityType.split(',').includes(ws.sourceEntity.type)) {
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

  /**
   * Compute the full signal chain reachable from an entity (both forward through targets
   * and backward through referencing sources). Returns a set of entity IDs in the chain.
   */
  getSignalChain(entity: Entity): Set<string> {
    if (!this.level || !entity.id) return new Set();
    const chain = new Set<string>();
    const entityMap = new Map<string, Entity>();
    for (const e of this.level.entities) {
      if (e.id) entityMap.set(e.id, e);
    }
    // Forward: follow targets
    const forwardStack = [entity.id];
    while (forwardStack.length > 0) {
      const cur = forwardStack.pop()!;
      if (chain.has(cur)) continue;
      chain.add(cur);
      const curEntity = entityMap.get(cur);
      if (!curEntity) continue;
      const rec = curEntity as Record<string, unknown>;
      if (Array.isArray(rec.targets)) {
        for (const t of rec.targets as string[]) forwardStack.push(t);
      }
    }
    // Backward: follow referencing entities
    const backwardStack = [entity.id];
    const visitedBack = new Set<string>();
    while (backwardStack.length > 0) {
      const cur = backwardStack.pop()!;
      if (visitedBack.has(cur)) continue;
      visitedBack.add(cur);
      chain.add(cur);
      for (const e of this.level.entities) {
        if (!e.id || chain.has(e.id)) continue;
        const rec = e as Record<string, unknown>;
        if (Array.isArray(rec.targets) && (rec.targets as string[]).includes(cur)) {
          backwardStack.push(e.id);
        }
      }
    }
    return chain;
  }

  /** Public auto-detect wall for hover preview. */
  autoDetectWallAt(col: number, row: number): string | null {
    return this.autoDetectWall(col, row);
  }

  /** Auto-detect which wall a wall-mounted entity should face based on adjacent solid cells. */
  private autoDetectWall(col: number, row: number): string | null {
    if (!this.level) return null;
    const grid = this.level.grid;
    const rows = grid.length;
    const cols = grid[0].length;
    type Candidate = { facing: string; solid: boolean };
    const candidates: Candidate[] = [
      { facing: 'N', solid: row - 1 >= 0 && !this.walkableSet.has(grid[row - 1][col]) && grid[row - 1][col] !== ' ' },
      { facing: 'S', solid: row + 1 < rows && !this.walkableSet.has(grid[row + 1][col]) && grid[row + 1][col] !== ' ' },
      { facing: 'E', solid: col + 1 < cols && !this.walkableSet.has(grid[row][col + 1]) && grid[row][col + 1] !== ' ' },
      { facing: 'W', solid: col - 1 >= 0 && !this.walkableSet.has(grid[row][col - 1]) && grid[row][col - 1] !== ' ' },
    ];
    const solidWalls = candidates.filter(c => c.solid);
    if (solidWalls.length >= 1) return solidWalls[0].facing;
    return null;
  }

  /** Collect all entity IDs across all layers and the working surface. */
  private collectAllEntityIds(): Set<string> {
    const existing = new Set<string>();
    const addFrom = (entities: Entity[]) => {
      for (const e of entities) {
        if (typeof e.id === 'string' && e.id) existing.add(e.id);
      }
    };
    if (this.dungeon) {
      for (const level of this.dungeon.levels) {
        // Working surface (may differ from layer ref after undo)
        addFrom(level.entities);
        // All layers
        if (level.layers) {
          for (const layer of level.layers) addFrom(layer.entities);
        }
      }
    } else if (this.level) {
      addFrom(this.level.entities);
      if (this.level.layers) {
        for (const layer of this.level.layers) addFrom(layer.entities);
      }
    }
    return existing;
  }

  private generateEntityId(type: string): string {
    const existing = this.collectAllEntityIds();
    let n = 1;
    while (existing.has(`${type}_${n}`)) n++;
    return `${type}_${n}`;
  }

  private generateKeyId(): string {
    if (!this.level) return 'key_1';
    const existing = new Set<string>();
    // Collect keyIds from all entities across all layers + working surface
    const allEntities: Entity[] = [];
    allEntities.push(...this.level.entities);
    if (this.level.layers) {
      for (const layer of this.level.layers) allEntities.push(...layer.entities);
    }
    for (const e of allEntities) {
      const kid = (e as Record<string, unknown>).keyId;
      if (typeof kid === 'string' && kid) existing.add(kid);
    }
    let n = 1;
    while (existing.has(`key_${n}`)) n++;
    return `key_${n}`;
  }

  resolveNearestEdge(col: number, row: number, fracX: number, fracY: number): { col: number; row: number; wall: 'S' | 'E' } | null {
    if (!this.level) return null;
    const grid = this.level.grid;

    // Determine distances to each edge
    const distN = fracY;           // distance to north edge
    const distS = 1 - fracY;      // distance to south edge
    const distW = fracX;           // distance to west edge
    const distE = 1 - fracX;      // distance to east edge

    // Find closest edge
    const min = Math.min(distN, distS, distW, distE);

    let edgeCol: number, edgeRow: number;
    let wall: 'S' | 'E';

    if (min === distS) {
      // South edge of this cell → canonical: (col, row, 'S')
      edgeCol = col; edgeRow = row; wall = 'S';
    } else if (min === distN) {
      // North edge of this cell → canonical: (col, row-1, 'S')
      edgeCol = col; edgeRow = row - 1; wall = 'S';
    } else if (min === distE) {
      // East edge of this cell → canonical: (col, row, 'E')
      edgeCol = col; edgeRow = row; wall = 'E';
    } else {
      // West edge of this cell → canonical: (col-1, row, 'E')
      edgeCol = col - 1; edgeRow = row; wall = 'E';
    }

    // Bounds check: canonical cell must be within grid
    if (edgeRow < 0 || edgeRow >= grid.length) return null;
    if (edgeCol < 0 || edgeCol >= grid[0].length) return null;

    return { col: edgeCol, row: edgeRow, wall };
  }

  addThinWallOnEdge(col: number, row: number, wall: 'S' | 'E', textureOverride?: string, textureBackOverride?: string): Entity | null {
    if (!this.level) return null;
    const grid = this.level.grid;
    if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return null;

    // Check no duplicate thin wall at same edge
    const existing = this.level.entities.find(
      e => e.type === 'thin_wall' && e.col === col && e.row === row && (e.wall as string) === wall
    );
    if (existing) return null;

    const entity: Entity = {
      id: this.generateEntityId('thin_wall'),
      type: 'thin_wall',
      col, row,
      wall,
      solid: true,
      height: 'full',
      texture: textureOverride ?? this.selectedThinWallTexture,
      ...(() => {
        const tex = textureOverride ?? this.selectedThinWallTexture;
        const back = textureBackOverride ?? this.selectedThinWallTextureBack;
        return back && back !== tex ? { textureBack: back } : {};
      })(),
    };

    this.level.entities.push(entity);
    this.dirty = true;
    return entity;
  }

  eraseThinWallOnEdge(col: number, row: number, wall: 'S' | 'E'): boolean {
    if (!this.level) return false;
    const idx = this.level.entities.findIndex(
      e => e.type === 'thin_wall' && e.col === col && e.row === row && (e.wall as string) === wall
    );
    if (idx === -1) return false;

    // If the erased entity was selected, deselect
    if (this.selectedEntity === this.level.entities[idx]) {
      this.selectedEntity = null;
    }
    this.level.entities.splice(idx, 1);
    this.dirty = true;
    return true;
  }

  selectThinWallOnEdge(col: number, row: number, wall: 'S' | 'E'): Entity | null {
    if (!this.level) return null;
    const entity = this.level.entities.find(
      e => e.type === 'thin_wall' && e.col === col && e.row === row && (e.wall as string) === wall
    );
    if (entity) {
      this.selectedEntity = entity;
      return entity;
    }
    return null;
  }
}
