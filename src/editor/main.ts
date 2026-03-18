import { EditorApp, type EditorTool } from './EditorApp';
import { GridCanvas } from './GridCanvas';
import { Toolbar } from './Toolbar';
import { Inspector } from './Inspector';
import { LevelProperties } from './LevelProperties';
import { LevelList } from './LevelList';
import {
  openLevelFile, exportLevelFile, exportDungeonFile,
  serializeLevel, serializeDungeon,
  isDevServer, listServerFiles, loadFromServer, saveToServer,
} from './io';
import { itemDatabase } from '../core/itemDatabase';
import { enemyDatabase } from '../enemies/enemyDatabase';
import type { Dungeon } from '../core/types';

const app = new EditorApp();

// Load databases eagerly for item preview and enemy type list
itemDatabase.load().catch(() => { /* non-fatal */ });
enemyDatabase.load().catch(() => { /* non-fatal */ });

const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
const container = document.getElementById('canvas-container') as HTMLElement;
const btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
const levelNameEl = document.getElementById('level-name') as HTMLSpanElement;
const coordEl = document.getElementById('coord-display') as HTMLSpanElement;
const errorBannerEl = document.getElementById('error-banner') as HTMLElement;
const statusHintEl = document.getElementById('status-hint') as HTMLElement;

const gridCanvas = new GridCanvas(canvas, container, app);
const toolbar = new Toolbar(document.getElementById('toolbar')!);
const inspector = new Inspector(document.getElementById('inspector')!, app);
const levelProps = new LevelProperties(document.getElementById('level-props-content')!, app);
const levelList = new LevelList(document.getElementById('level-list')!, app);

function markDirty(): void {
  app.dirty = true;
  updateDirtyDisplay();
}

function updateDirtyDisplay(): void {
  const name = app.isDungeonMode()
    ? app.dungeon!.name
    : app.level?.name ?? '(none)';
  const prefix = app.dirty ? '* ' : '';
  levelNameEl.textContent = `${prefix}${name}`;
  document.title = `${prefix}DelveWard — Dungeon Editor`;
  updateSaveButton();
}

function updateSaveButton(): void {
  if (app.sourcePath && app.dirty) {
    toolbar.enableSave();
  } else {
    toolbar.disableSave();
  }
}

function updateStatusHint(): void {
  if (app.statusHint) {
    statusHintEl.textContent = app.statusHint;
    statusHintEl.classList.add('visible');
  } else {
    statusHintEl.textContent = '';
    statusHintEl.classList.remove('visible');
  }
}

function updateStairHighlight(): void {
  let hlIndex: number | null = null;
  const sel = app.selectedEntity;
  if (sel?.type === 'stairs' && sel.target && app.dungeon) {
    const targetId = sel.target as string;
    for (let i = 0; i < app.dungeon.levels.length; i++) {
      if (i === app.activeLevelIndex) continue;
      if (app.dungeon.levels[i].entities.some(e => e.id === targetId)) {
        hlIndex = i;
        break;
      }
    }
  }
  levelList.highlightedLevelIndex = hlIndex;
}

function refreshAllUI(): void {
  toolbar.updatePalette(app.level!.charDefs, app.level!.defaults);
  toolbar.enableExport();
  inspector.refresh();
  updateStairHighlight();
  levelProps.refresh();
  levelList.refresh();
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
  updateDirtyDisplay();
  updateErrorBanner();
  updateStatusHint();
}

// --- Undo/Redo: onLevelRestored callback ---
app.onLevelRestored = () => {
  inspector.refresh();
  updateStairHighlight();
  levelProps.refresh();
  levelList.refresh();
  toolbar.updatePalette(app.level!.charDefs, app.level!.defaults);
  if (app.isDungeonMode()) {
    app.dirty = app.isDungeonDirty();
  } else {
    app.dirty = JSON.stringify(app.level) !== app.cleanSnapshot;
  }
  updateDirtyDisplay();
  gridCanvas.markDirty();
  gridCanvas.updateCursor();
  updateErrorBanner();
};

// Toolbar callbacks — cancel pick mode on tool switch
toolbar.setToolChangeCallback((tool) => {
  if (app.pickMode) { app.cancelPickMode(); inspector.refresh(); }
  app.activeTool = tool;
  gridCanvas.updateCursor();
});

toolbar.setCharSelectCallback((char) => {
  app.selectedChar = char;
  app.activeTool = 'paint';
  toolbar.setActiveTool('paint');
  gridCanvas.updateCursor();
});

toolbar.setExportCallback(() => {
  if (!app.level) return;
  if (app.errors.length > 0) {
    alert('Cannot export \u2014 fix errors first:\n\n' + app.errors.map(e => e.message).join('\n'));
    return;
  }
  if (app.isDungeonMode()) {
    // Validate ALL levels before exporting dungeon
    const allErrors: string[] = [];
    const savedIndex = app.activeLevelIndex;
    for (let i = 0; i < app.dungeon!.levels.length; i++) {
      const lvl = app.dungeon!.levels[i];
      app.level = lvl;
      app.rebuildDerivedState();
      if (app.errors.length > 0) {
        allErrors.push(...app.errors.map(e => `[${lvl.name}] ${e.message}`));
      }
    }
    // Restore active level
    app.level = app.dungeon!.levels[savedIndex];
    app.rebuildDerivedState();
    if (allErrors.length > 0) {
      alert('Cannot export \u2014 fix errors first:\n\n' + allErrors.join('\n'));
      return;
    }
    exportDungeonFile(app.dungeon!);
    // Update all clean snapshots and clear dirty state
    app.levelCleanSnapshots = app.dungeon!.levels.map(l => JSON.stringify(l));
    app.dirtyLevelIndices = new Set();
    app.cleanSnapshot = app.levelCleanSnapshots[app.activeLevelIndex];
  } else {
    exportLevelFile(app.level);
    app.cleanSnapshot = JSON.stringify(app.level);
  }
  app.dirty = false;
  updateDirtyDisplay();
});

toolbar.setEntityTypeSelectCallback((type) => {
  app.selectedEntityType = type;
  app.activeTool = 'entity';
  toolbar.setActiveTool('entity');
  gridCanvas.updateCursor();
});

toolbar.setItemIdChangeCallback((type, itemId) => {
  if (type === 'equipment') {
    app.selectedEquipmentId = itemId;
  } else {
    app.selectedConsumableId = itemId;
  }
});

toolbar.setViewToggleCallback(async (flag, value) => {
  app[flag] = value;
  if (flag === 'showItemPreview' && value) {
    const { itemDatabase } = await import('../core/itemDatabase');
    if (!itemDatabase.isLoaded()) {
      await itemDatabase.load();
    }
  }
  gridCanvas.markDirty();
});

// --- Server save/load ---

let savingInProgress = false;

function validateAllLevels(): string[] | null {
  if (!app.isDungeonMode()) {
    if (app.errors.length > 0) return app.errors.map(e => e.message);
    return null;
  }
  const allErrors: string[] = [];
  const savedIndex = app.activeLevelIndex;
  for (let i = 0; i < app.dungeon!.levels.length; i++) {
    const lvl = app.dungeon!.levels[i];
    app.level = lvl;
    app.rebuildDerivedState();
    if (app.errors.length > 0) {
      allErrors.push(...app.errors.map(e => `[${lvl.name}] ${e.message}`));
    }
  }
  app.level = app.dungeon!.levels[savedIndex];
  app.rebuildDerivedState();
  return allErrors.length > 0 ? allErrors : null;
}

async function performSave(filename: string): Promise<void> {
  if (savingInProgress) return;
  if (!app.level) return;

  const errors = validateAllLevels();
  if (errors) {
    alert('Cannot save \u2014 fix errors first:\n\n' + errors.join('\n'));
    return;
  }

  const content = app.isDungeonMode()
    ? JSON.stringify(serializeDungeon(app.dungeon!), null, 2)
    : JSON.stringify(serializeLevel(app.level), null, 2);

  savingInProgress = true;
  try {
    await saveToServer(filename, content);
    app.sourcePath = filename;
    if (app.isDungeonMode()) {
      app.levelCleanSnapshots = app.dungeon!.levels.map(l => JSON.stringify(l));
      app.dirtyLevelIndices = new Set();
      app.cleanSnapshot = app.levelCleanSnapshots[app.activeLevelIndex];
    } else {
      app.cleanSnapshot = JSON.stringify(app.level);
    }
    app.dirty = false;
    updateDirtyDisplay();
  } catch (err) {
    alert(`Save failed: ${(err as Error).message}`);
  } finally {
    savingInProgress = false;
  }
}

toolbar.setSaveCallback(() => {
  if (!app.sourcePath) {
    toolbar.onSaveAs?.();
    return;
  }
  performSave(app.sourcePath);
});

toolbar.setSaveAsCallback(() => {
  const defaultName = app.sourcePath
    ?? ((app.isDungeonMode() ? app.dungeon?.name : app.level?.name) || 'level')
        .replace(/[^a-zA-Z0-9_\-]/g, '_') + '.json';
  const filename = prompt('Save as:', defaultName);
  if (!filename) return;
  if (!/^[a-zA-Z0-9_\-()]+\.json$/.test(filename)) {
    alert('Invalid filename. Use only letters, numbers, _, -, () and end with .json');
    return;
  }
  performSave(filename);
});

function showFilePicker(files: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'file-picker-overlay';

    const picker = document.createElement('div');
    picker.className = 'file-picker';

    const title = document.createElement('div');
    title.className = 'file-picker-title';
    title.textContent = 'Open from server';
    picker.appendChild(title);

    const list = document.createElement('div');
    list.className = 'file-picker-list';
    for (const file of files) {
      const item = document.createElement('div');
      item.className = 'file-picker-item';
      item.textContent = file;
      item.addEventListener('click', () => { overlay.remove(); resolve(file); });
      list.appendChild(item);
    }
    picker.appendChild(list);

    const cancel = document.createElement('div');
    cancel.className = 'file-picker-cancel';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { overlay.remove(); resolve(null); });
    cancel.appendChild(cancelBtn);
    picker.appendChild(cancel);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); resolve(null); }
    });

    overlay.appendChild(picker);
    document.body.appendChild(overlay);
  });
}

toolbar.setOpenFromServerCallback(async () => {
  try {
    const files = await listServerFiles();
    if (files.length === 0) {
      alert('No level files found on server.');
      return;
    }

    const filename = await showFilePicker(files);
    if (!filename) return;

    const result = await loadFromServer(filename);
    if (!result) return;

    if (result.type === 'dungeon') {
      app.loadDungeon(result.dungeon);
    } else {
      app.loadLevel(result.level);
    }
    app.sourcePath = filename;
    refreshAllUI();
  } catch (err) {
    alert(`Failed to load from server: ${(err as Error).message}`);
  }
});

// Detect dev server on startup
isDevServer().then(available => {
  if (available) toolbar.showServerButtons();
});

// Level properties changed callback
levelProps.setChangedCallback(() => {
  app.rebuildDerivedState();
  toolbar.updatePalette(app.level!.charDefs, app.level!.defaults);
  markDirty();
  gridCanvas.markDirty();
  updateErrorBanner();
});

// New level callback
toolbar.setNewLevelCallback(() => {
  const input = prompt('New level dimensions (WxH):', '16x16');
  if (!input) return;
  const match = input.match(/^(\d+)\s*[xX\u00d7]\s*(\d+)$/);
  if (!match) return;
  const cols = parseInt(match[1], 10);
  const rows = parseInt(match[2], 10);
  if (cols < 3 || cols > 100 || rows < 3 || rows > 100) {
    alert('Dimensions must be between 3 and 100.');
    return;
  }
  app.createNewLevel(cols, rows);
  refreshAllUI();
});

// New dungeon callback
toolbar.setNewDungeonCallback(() => {
  const name = prompt('Dungeon name:', 'New Dungeon');
  if (!name) return;
  const dimInput = prompt('First level dimensions (WxH):', '16x16');
  if (!dimInput) return;
  const match = dimInput.match(/^(\d+)\s*[xX\u00d7]\s*(\d+)$/);
  if (!match) return;
  const cols = parseInt(match[1], 10);
  const rows = parseInt(match[2], 10);
  if (cols < 3 || cols > 100 || rows < 3 || rows > 100) {
    alert('Dimensions must be between 3 and 100.');
    return;
  }

  // Build the first level
  const grid: string[] = [];
  for (let r = 0; r < rows; r++) {
    if (r === 0 || r === rows - 1) {
      grid.push('#'.repeat(cols));
    } else {
      grid.push('#' + '.'.repeat(cols - 2) + '#');
    }
  }

  const dungeon: Dungeon = {
    name,
    levels: [{
      id: 'level_1',
      name: 'Level 1',
      grid,
      playerStart: { col: 1, row: 1, facing: 'S' },
      entities: [],
    }],
  };

  app.loadDungeon(dungeon);
  refreshAllUI();
});

// --- LevelList callbacks ---

levelList.onLevelSwitch = (index) => {
  // Commit any pending undo batch before switching
  if (app.level && app.undo.hasPending) app.undo.commitBatch(app.level);
  app.switchToLevel(index);
  refreshAllUI();
};

levelList.onAddLevel = () => {
  const input = prompt('New level dimensions (WxH):', '16x16');
  if (!input) return;
  const match = input.match(/^(\d+)\s*[xX\u00d7]\s*(\d+)$/);
  if (!match) return;
  const cols = parseInt(match[1], 10);
  const rows = parseInt(match[2], 10);
  if (cols < 3 || cols > 100 || rows < 3 || rows > 100) {
    alert('Dimensions must be between 3 and 100.');
    return;
  }
  // Commit any pending batch before adding
  if (app.level && app.undo.hasPending) app.undo.commitBatch(app.level);
  const newIndex = app.addLevelToDungeon(cols, rows);
  if (newIndex >= 0) {
    app.switchToLevel(newIndex);
    markDirty();
    refreshAllUI();
  }
};

levelList.onRemoveLevel = (index) => {
  if (!confirm('Remove this level? This cannot be undone.')) return;
  if (app.level && app.undo.hasPending) app.undo.commitBatch(app.level);
  if (app.removeLevelFromDungeon(index)) {
    markDirty();
    refreshAllUI();
  }
};

levelList.onMoveLevel = (from, to) => {
  if (app.level && app.undo.hasPending) app.undo.commitBatch(app.level);
  app.moveLevelInDungeon(from, to);
  markDirty();
  levelList.refresh();
  updateDirtyDisplay();
};

levelList.onDungeonNameChanged = () => {
  markDirty();
  updateDirtyDisplay();
};

levelList.onBeginTextEdit = () => {
  if (app.level) app.undo.beginBatch(app.level, app.activeLevelIndex);
};

levelList.onCommitTextEdit = () => {
  if (app.level) app.undo.commitBatch(app.level);
};

// Selection callback — update inspector
gridCanvas.setSelectionCallback(() => {
  inspector.refresh();
  updateStairHighlight();
  levelList.refresh();
  gridCanvas.markDirty();
  updateErrorBanner();
  // Auto-enter pick mode when placing a new stairs in dungeon mode
  const sel = app.selectedEntity;
  if (app.activeTool === 'entity' && sel?.type === 'stairs' && !sel.target && app.dungeon) {
    app.enterPickMode(sel, 'target', undefined, 'stairs');
    app.pickMode!.crossLevel = true;
    app.statusHint = 'Click a stairs entity or empty cell on another level to link (Esc to cancel)';
    inspector.refresh();
    gridCanvas.updateCursor();
    updateStatusHint();
  }
});

// Inspector callbacks
inspector.setEntityChangedCallback(() => {
  app.rebuildDerivedState();
  // Sync remembered subtypes from the edited entity for next placement
  const e = app.selectedEntity;
  if (e) {
    if (e.type === 'enemy' && typeof e.enemyType === 'string') app.selectedEnemyType = e.enemyType;
    if (e.type === 'equipment' && typeof e.itemId === 'string') app.selectedEquipmentId = e.itemId;
    if (e.type === 'consumable' && typeof e.itemId === 'string') app.selectedConsumableId = e.itemId;
  }
  updateStairHighlight();
  levelList.refresh();
  markDirty();
  gridCanvas.markDirty();
  updateErrorBanner();
});

inspector.setDeleteCallback(() => {
  if (!app.level) return;
  if (app.pickMode) app.cancelPickMode();
  app.undo.snapshot(app.level, app.activeLevelIndex);
  app.deleteSelectedEntity();
  markDirty();
  inspector.refresh();
  updateStairHighlight();
  levelList.refresh();
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
  app.rebuildDerivedState();
  updateErrorBanner();
});

// Inspector undo callbacks
inspector.setBeforeDiscreteChangeCallback(() => {
  if (app.level) app.undo.snapshot(app.level, app.activeLevelIndex);
});

inspector.setBeginTextEditCallback(() => {
  if (app.level) app.undo.beginBatch(app.level, app.activeLevelIndex);
});

inspector.setCommitTextEditCallback(() => {
  if (app.level) app.undo.commitBatch(app.level);
});

// LevelProperties undo callbacks
levelProps.setBeforeDiscreteChangeCallback(() => {
  if (app.level) app.undo.snapshot(app.level, app.activeLevelIndex);
});

levelProps.setBeginTextEditCallback(() => {
  if (app.level) app.undo.beginBatch(app.level, app.activeLevelIndex);
});

levelProps.setCommitTextEditCallback(() => {
  if (app.level) app.undo.commitBatch(app.level);
});

levelProps.setStatusHintChangedCallback(() => {
  updateStatusHint();
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
});

// Pick mode entry
inspector.setPickRequestedCallback((entity, field, validChar, validEntityType) => {
  app.enterPickMode(entity, field, validChar, validEntityType);
  // Cross-level pick for stairs targets — persists across level switches
  if (entity.type === 'stairs' && field === 'target') {
    app.pickMode!.crossLevel = true;
    app.statusHint = 'Switch to target level and click a stairs entity to link (Esc to cancel)';
    updateStatusHint();
  }
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
});

// Pick mode completion (success or cancel via right-click)
gridCanvas.setPickCompleteCallback(() => {
  app.statusHint = null;
  inspector.refresh();
  updateStairHighlight();
  levelProps.refresh();
  levelList.refresh();
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
  updateStatusHint();
});

// GridCanvas undo callbacks — paint drag coalescing
gridCanvas.setBeforePaintCallback(() => {
  if (app.level) app.undo.beginBatch(app.level, app.activeLevelIndex);
});

gridCanvas.setAfterPaintCallback(() => {
  if (app.level) app.undo.commitBatch(app.level);
  markDirty();
  app.rebuildDerivedState();
  updateErrorBanner();
});

// Entity add snapshot
gridCanvas.setBeforeEntityAddCallback(() => {
  if (app.level) app.undo.snapshot(app.level, app.activeLevelIndex);
  markDirty();
});

// Pick complete snapshot
gridCanvas.setBeforePickCompleteCallback(() => {
  if (app.level) app.undo.snapshot(app.level, app.activeLevelIndex);
  markDirty();
});

// Reference click → select that entity
inspector.setRefClickedCallback((entity) => {
  app.selectedEntity = entity;
  inspector.refresh();
  gridCanvas.markDirty();
});

// Stair "go to" — switch to target level and select target stair
inspector.setStairGoToCallback((targetId) => {
  if (!app.dungeon) return;
  for (let i = 0; i < app.dungeon.levels.length; i++) {
    const targetStair = app.dungeon.levels[i].entities.find(e => e.id === targetId);
    if (targetStair) {
      if (app.level && app.undo.hasPending) app.undo.commitBatch(app.level);
      app.switchToLevel(i);
      app.selectedEntity = targetStair;
      refreshAllUI();
      return;
    }
  }
});

// Hover callback — update coordinate display
gridCanvas.setHoverCallback(() => {
  if (app.hover) {
    coordEl.textContent = `Col: ${app.hover.col}  Row: ${app.hover.row}  [${app.hover.char}]`;
  } else {
    coordEl.textContent = '\u2014';
  }
});

function selectEntity(entity: import('../core/types').Entity): void {
  app.selectedEntity = entity;
  inspector.refresh();
  gridCanvas.markDirty();
}

function renderErrorSpan(err: import('./EditorApp').ValidationError): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = err.message;
  if (err.entity) {
    const link = document.createElement('a');
    link.className = 'error-goto';
    link.textContent = '\u2192select';
    link.title = `Select ${err.entity.type} at (${err.entity.col}, ${err.entity.row})`;
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      selectEntity(err.entity!);
    });
    span.appendChild(link);
  }
  return span;
}

function updateErrorBanner(): void {
  errorBannerEl.innerHTML = '';
  if (app.errors.length === 0) {
    errorBannerEl.classList.remove('visible');
    return;
  }
  errorBannerEl.classList.add('visible');
  const prefix = document.createTextNode(
    app.errors.length === 1 ? '\u26a0 ' : `\u26a0 ${app.errors.length} errors: `
  );
  errorBannerEl.appendChild(prefix);
  for (let i = 0; i < app.errors.length; i++) {
    if (i > 0) {
      errorBannerEl.appendChild(document.createTextNode(' | '));
    }
    errorBannerEl.appendChild(renderErrorSpan(app.errors[i]));
  }
}

// Keyboard listeners
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.wireDragState) {
    app.wireDragState = null;
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
    return;
  }
  if (e.key === 'Escape' && (app.coordDragCallback || app.areaDragState)) {
    app.coordDragCallback = null;
    app.areaDragState = null;
    app.statusHint = null;
    levelProps.refresh();
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
    updateStatusHint();
    return;
  }
  if (e.key === 'Escape' && app.coordPickCallback) {
    app.coordPickCallback = null;
    app.statusHint = null;
    levelProps.refresh();
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
    updateStatusHint();
    return;
  }
  if (e.key === 'Escape' && app.pickMode) {
    app.cancelPickMode();
    app.statusHint = null;
    inspector.refresh();
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
    updateStatusHint();
    return;
  }
  if (e.key === 'Delete' && app.selectedEntity) {
    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (app.pickMode) app.cancelPickMode();
    if (app.level) app.undo.snapshot(app.level, app.activeLevelIndex);
    app.deleteSelectedEntity();
    markDirty();
    inspector.refresh();
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
    return;
  }

  // Ctrl+S save, Undo/Redo: Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    if (e.key === 's') {
      e.preventDefault();
      toolbar.onSave?.();
      return;
    }

    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (!app.level) return;
      if (app.coordPickCallback) { app.coordPickCallback = null; }
      if (app.pickMode) { app.cancelPickMode(); }
      if (app.undo.hasPending) app.undo.commitBatch(app.level);
      const targetIdx = app.undo.undoLevelIndex;
      if (targetIdx === null) return;
      const levelToSave = (app.isDungeonMode() && targetIdx !== app.activeLevelIndex)
        ? app.dungeon!.levels[targetIdx]
        : app.level;
      const result = app.undo.undo(levelToSave);
      if (result) app.restoreLevelAtIndex(result.level, result.levelIndex);
      return;
    }

    if ((e.key === 'z' && e.shiftKey) || (e.key === 'y' && !e.shiftKey)) {
      e.preventDefault();
      if (!app.level) return;
      if (app.coordPickCallback) { app.coordPickCallback = null; }
      if (app.pickMode) { app.cancelPickMode(); }
      if (app.undo.hasPending) app.undo.commitBatch(app.level);
      const targetIdx = app.undo.redoLevelIndex;
      if (targetIdx === null) return;
      const levelToSave = (app.isDungeonMode() && targetIdx !== app.activeLevelIndex)
        ? app.dungeon!.levels[targetIdx]
        : app.level;
      const result = app.undo.redo(levelToSave);
      if (result) app.restoreLevelAtIndex(result.level, result.levelIndex);
      return;
    }
  }

  // Tool shortcuts: 1–4
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const toolMap: Record<string, EditorTool> = { '1': 'select', '2': 'paint', '3': 'entity' };
    const tool = toolMap[e.key];
    if (tool) {
      if (app.pickMode) { app.cancelPickMode(); inspector.refresh(); }
      app.activeTool = tool;
      toolbar.setActiveTool(tool);
      gridCanvas.updateCursor();
      return;
    }
  }
});

// Open file button
btnOpen.addEventListener('click', async () => {
  const result = await openLevelFile();
  if (!result) return;

  if (result.type === 'dungeon') {
    app.loadDungeon(result.dungeon);
  } else {
    app.loadLevel(result.level);
  }
  refreshAllUI();
});

window.addEventListener('beforeunload', (e) => {
  if (app.dirty) {
    e.preventDefault();
  }
});
