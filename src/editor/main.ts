import { EditorApp, type EditorTool } from './EditorApp';
import { GridCanvas } from './GridCanvas';
import { Toolbar } from './Toolbar';
import { Inspector } from './Inspector';
import { LevelProperties } from './LevelProperties';
import { openLevelFile, exportLevelFile } from './io';
import { itemDatabase } from '../core/itemDatabase';

const app = new EditorApp();

// Load item database eagerly for item preview (default on)
itemDatabase.load().catch(() => { /* non-fatal */ });

const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
const container = document.getElementById('canvas-container') as HTMLElement;
const btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
const levelNameEl = document.getElementById('level-name') as HTMLSpanElement;
const coordEl = document.getElementById('coord-display') as HTMLSpanElement;
const errorBannerEl = document.getElementById('error-banner') as HTMLElement;

const gridCanvas = new GridCanvas(canvas, container, app);
const toolbar = new Toolbar(document.getElementById('toolbar')!);
const inspector = new Inspector(document.getElementById('inspector')!, app);
const levelProps = new LevelProperties(document.getElementById('level-properties')!, app);

function markDirty(): void {
  app.dirty = true;
  updateDirtyDisplay();
}

function updateDirtyDisplay(): void {
  const name = app.level?.name ?? '(none)';
  const prefix = app.dirty ? '* ' : '';
  levelNameEl.textContent = `${prefix}${name}`;
  document.title = `${prefix}DelveWard — Dungeon Editor`;
}

// --- Undo/Redo: onLevelRestored callback ---
app.onLevelRestored = () => {
  inspector.refresh();
  levelProps.refresh();
  toolbar.updatePalette(app.level!.charDefs, app.level!.defaults);
  app.dirty = JSON.stringify(app.level) !== app.cleanSnapshot;
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
    alert('Cannot export — fix errors first:\n\n' + app.errors.join('\n'));
    return;
  }
  exportLevelFile(app.level);
  app.dirty = false;
  app.cleanSnapshot = JSON.stringify(app.level);
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
  const match = input.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
  if (!match) return;
  const cols = parseInt(match[1], 10);
  const rows = parseInt(match[2], 10);
  if (cols < 3 || cols > 100 || rows < 3 || rows > 100) {
    alert('Dimensions must be between 3 and 100.');
    return;
  }
  app.createNewLevel(cols, rows);
  updateDirtyDisplay();
  toolbar.updatePalette(app.level!.charDefs, app.level!.defaults);
  toolbar.enableExport();
  inspector.refresh();
  levelProps.refresh();
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
  updateErrorBanner();
});

// Selection callback — update inspector
gridCanvas.setSelectionCallback(() => {
  inspector.refresh();
  gridCanvas.markDirty();
  updateErrorBanner();
});

// Inspector callbacks
inspector.setEntityChangedCallback(() => {
  app.rebuildDerivedState();
  markDirty();
  gridCanvas.markDirty();
  updateErrorBanner();
});

inspector.setDeleteCallback(() => {
  if (!app.level) return;
  if (app.pickMode) app.cancelPickMode();
  app.undo.snapshot(app.level);
  app.deleteSelectedEntity();
  markDirty();
  inspector.refresh();
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
  app.rebuildDerivedState();
  updateErrorBanner();
});

// Inspector undo callbacks
inspector.setBeforeDiscreteChangeCallback(() => {
  if (app.level) app.undo.snapshot(app.level);
});

inspector.setBeginTextEditCallback(() => {
  if (app.level) app.undo.beginBatch(app.level);
});

inspector.setCommitTextEditCallback(() => {
  if (app.level) app.undo.commitBatch(app.level);
});

// LevelProperties undo callbacks
levelProps.setBeforeDiscreteChangeCallback(() => {
  if (app.level) app.undo.snapshot(app.level);
});

levelProps.setBeginTextEditCallback(() => {
  if (app.level) app.undo.beginBatch(app.level);
});

levelProps.setCommitTextEditCallback(() => {
  if (app.level) app.undo.commitBatch(app.level);
});

// Pick mode entry
inspector.setPickRequestedCallback((entity, field, validChar, validEntityType) => {
  app.enterPickMode(entity, field, validChar, validEntityType);
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
});

// Pick mode completion (success or cancel via right-click)
gridCanvas.setPickCompleteCallback(() => {
  inspector.refresh();
  levelProps.refresh();
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
});

// GridCanvas undo callbacks — paint drag coalescing
gridCanvas.setBeforePaintCallback(() => {
  if (app.level) app.undo.beginBatch(app.level);
});

gridCanvas.setAfterPaintCallback(() => {
  if (app.level) app.undo.commitBatch(app.level);
  markDirty();
  app.rebuildDerivedState();
  updateErrorBanner();
});

// Entity add snapshot
gridCanvas.setBeforeEntityAddCallback(() => {
  if (app.level) app.undo.snapshot(app.level);
  markDirty();
});

// Pick complete snapshot
gridCanvas.setBeforePickCompleteCallback(() => {
  if (app.level) app.undo.snapshot(app.level);
  markDirty();
});

// Reference click → select that entity
inspector.setRefClickedCallback((entity) => {
  app.selectedEntity = entity;
  inspector.refresh();
  gridCanvas.markDirty();
});

// Hover callback — update coordinate display
gridCanvas.setHoverCallback(() => {
  if (app.hover) {
    coordEl.textContent = `Col: ${app.hover.col}  Row: ${app.hover.row}  [${app.hover.char}]`;
  } else {
    coordEl.textContent = '—';
  }
});

function updateErrorBanner(): void {
  if (app.errors.length === 0) {
    errorBannerEl.classList.remove('visible');
    errorBannerEl.textContent = '';
  } else {
    errorBannerEl.classList.add('visible');
    errorBannerEl.textContent = app.errors.length === 1
      ? `⚠ ${app.errors[0]}`
      : `⚠ ${app.errors.length} errors: ${app.errors.join(' | ')}`;
  }
}

// Keyboard listeners
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.coordPickCallback) {
    app.coordPickCallback = null;
    levelProps.refresh();
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
    return;
  }
  if (e.key === 'Escape' && app.pickMode) {
    app.cancelPickMode();
    inspector.refresh();
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
    return;
  }
  if (e.key === 'Delete' && app.selectedEntity) {
    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (app.pickMode) app.cancelPickMode();
    if (app.level) app.undo.snapshot(app.level);
    app.deleteSelectedEntity();
    markDirty();
    inspector.refresh();
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
    return;
  }

  // Undo/Redo: Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (!app.level) return;
      // Cancel pick modes before undo
      if (app.coordPickCallback) { app.coordPickCallback = null; }
      if (app.pickMode) { app.cancelPickMode(); }
      // Flush any pending batch
      if (app.undo.hasPending) app.undo.commitBatch(app.level);
      const restored = app.undo.undo(app.level);
      if (restored) app.restoreLevel(restored);
      return;
    }

    if ((e.key === 'z' && e.shiftKey) || (e.key === 'y' && !e.shiftKey)) {
      e.preventDefault();
      if (!app.level) return;
      if (app.coordPickCallback) { app.coordPickCallback = null; }
      if (app.pickMode) { app.cancelPickMode(); }
      if (app.undo.hasPending) app.undo.commitBatch(app.level);
      const restored = app.undo.redo(app.level);
      if (restored) app.restoreLevel(restored);
      return;
    }
  }

  // Tool shortcuts: 1–4
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const toolMap: Record<string, EditorTool> = { '1': 'select', '2': 'paint', '3': 'erase', '4': 'entity' };
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
  const level = await openLevelFile();
  if (level) {
    app.loadLevel(level);
    updateDirtyDisplay();
    toolbar.updatePalette(level.charDefs, level.defaults);
    toolbar.enableExport();
    inspector.refresh();
    levelProps.refresh();
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
    updateErrorBanner();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (app.dirty) {
    e.preventDefault();
  }
});
