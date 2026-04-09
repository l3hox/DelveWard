import { EditorApp, type EditorTool } from './EditorApp';
import { EditorPreview } from './EditorPreview';
import { getAllLevelEntities } from '../level/levelLoader';
import { GridCanvas } from './GridCanvas';
import { Toolbar } from './Toolbar';
import { Inspector } from './Inspector';
import { LevelProperties } from './LevelProperties';
import { LevelList } from './LevelList';
import { LayerList } from './LayerList';
import {
  openLevelFile, exportLevelFile, exportDungeonFile,
  serializeLevel, serializeDungeon,
  isDevServer, listServerFiles, loadFromServer, saveToServer,
} from './io';
import { itemDatabase } from '../core/itemDatabase';
import { enemyDatabase } from '../enemies/enemyDatabase';
import { npcDatabase } from '../npcs/npcDatabase';
import type { Dungeon } from '../core/types';
import { DialogEditorState } from './DialogEditorState';
import { DialogGraphCanvas } from './DialogGraphCanvas';
import { DialogInspector } from './DialogInspector';
import {
  loadDialogFromServer, saveDialogToServer,
  loadDialogLayout, saveDialogLayout,
  loadQuestIds, loadQuestFromServer, saveQuestToServer,
} from './dialogIO';
import { QuestEditorPanel } from './QuestEditorPanel';
import type { QuestDef } from '../core/questManager';

const app = new EditorApp();

// Load databases eagerly for item preview, enemy type list, and loot table display
import { loadLootTables } from '../core/lootTable';
itemDatabase.load().catch(() => { /* non-fatal */ });
enemyDatabase.load().catch(() => { /* non-fatal */ });
npcDatabase.load().catch(() => { /* non-fatal */ });
loadLootTables().catch(() => { /* non-fatal */ });
loadQuestIds().catch(() => { /* non-fatal */ });

const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
const container = document.getElementById('canvas-container') as HTMLElement;
const btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
const levelNameEl = document.getElementById('level-name') as HTMLSpanElement;
const coordEl = document.getElementById('coord-display') as HTMLSpanElement;
const errorBannerEl = document.getElementById('error-banner') as HTMLElement;
const statusHintEl = document.getElementById('status-hint') as HTMLElement;

const previewCanvas = document.getElementById('preview-canvas') as HTMLCanvasElement;
const previewToggleBtn = document.getElementById('btn-preview-3d') as HTMLButtonElement;
const cameraModeBtn = document.getElementById('btn-camera-mode') as HTMLButtonElement;

const gridCanvas = new GridCanvas(canvas, container, app);
const preview = new EditorPreview(previewCanvas);
gridCanvas.previewCameraGetter = () => preview.getCameraInfo();

previewToggleBtn.addEventListener('click', () => {
  const active = !preview.active;
  preview.setActive(active);
  container.classList.toggle('preview-active', active);
  previewToggleBtn.classList.toggle('active', active);
  cameraModeBtn.style.display = active ? '' : 'none';

  if (active && app.level) {
    const rect = container.getBoundingClientRect();
    preview.resize(Math.floor(rect.width / 2), rect.height);
    preview.buildScene(app.level, app.activeLayerIndex);
  }

  // Trigger 2D canvas resize
  gridCanvas.markDirty();
});

cameraModeBtn.addEventListener('click', () => {
  const mode = preview.getCameraMode() === 'noclip' ? 'freefly' : 'noclip';
  preview.setCameraMode(mode);
  cameraModeBtn.textContent = mode === 'noclip' ? 'Noclip' : 'Free-fly';
});

new ResizeObserver(() => {
  if (preview.active) {
    const rect = container.getBoundingClientRect();
    preview.resize(Math.floor(rect.width / 2), rect.height);
  }
}).observe(container);

const toolbar = new Toolbar(document.getElementById('toolbar')!);
toolbar.setActiveTool('select');
const inspector = new Inspector(document.getElementById('inspector')!, app);
const levelProps = new LevelProperties(document.getElementById('level-props-content')!, app);
const levelList = new LevelList(document.getElementById('level-list')!, app);
const layerList = new LayerList(document.getElementById('layer-list')!, app);

// --- Dialog editor components ---
const dialogCanvasEl = document.getElementById('dialog-canvas') as HTMLCanvasElement;
const dialogInspectorEl = document.getElementById('dialog-inspector') as HTMLElement;
const dialogCanvas = new DialogGraphCanvas(dialogCanvasEl, container);
const dialogInspector = new DialogInspector(dialogInspectorEl);
const dialogState = new DialogEditorState();

// Level-mode elements to hide/show on mode switch
const levelModeEls = [
  document.getElementById('editor-canvas')!,
  document.getElementById('char-palette')!,
  document.getElementById('entity-palette')!,
  document.getElementById('level-properties')!,
  document.getElementById('inspector')!,
];
const dialogModeEls = [dialogCanvasEl, dialogInspectorEl];

// --- Dialog toolbar buttons (created once, shown/hidden) ---
const toolbarEl = document.getElementById('toolbar')!;

const dialogBackBtn = document.createElement('button');
dialogBackBtn.id = 'btn-dialog-back';
dialogBackBtn.className = 'tool-btn';
dialogBackBtn.textContent = '\u2190 Back';
dialogBackBtn.style.display = 'none';
dialogBackBtn.addEventListener('click', () => exitDialogMode());
toolbarEl.insertBefore(dialogBackBtn, levelNameEl);

const dialogAddNodeBtn = document.createElement('button');
dialogAddNodeBtn.id = 'btn-dialog-add-node';
dialogAddNodeBtn.className = 'tool-btn';
dialogAddNodeBtn.textContent = 'Add Node';
dialogAddNodeBtn.style.display = 'none';
dialogAddNodeBtn.addEventListener('click', () => {
  dialogState.pushUndo();
  dialogState.addNode();
  refreshDialogUI();
});
toolbarEl.insertBefore(dialogAddNodeBtn, coordEl);

const dialogSaveBtn = document.createElement('button');
dialogSaveBtn.id = 'btn-dialog-save';
dialogSaveBtn.className = 'tool-btn';
dialogSaveBtn.textContent = 'Save Dialog';
dialogSaveBtn.style.display = 'none';
dialogSaveBtn.disabled = true;
dialogSaveBtn.addEventListener('click', () => saveDialog());
toolbarEl.insertBefore(dialogSaveBtn, coordEl);

// Level-specific toolbar buttons to hide in dialog mode
const levelToolbarBtns = [
  document.getElementById('btn-open'),
  document.getElementById('btn-new'),
  document.getElementById('btn-new-dungeon'),
  document.getElementById('btn-export'),
  document.getElementById('btn-save'),
  document.getElementById('btn-save-as'),
  document.getElementById('btn-open-server'),
].filter((el): el is HTMLElement => el !== null);
// Also hide the tool group and view toggles
const toolGroupEls = toolbarEl.querySelectorAll('.tool-group, .toolbar-sep');
// Save original display state so we restore correctly (some start hidden)
const savedToolbarDisplay = new Map<HTMLElement, string>();

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
      if (getAllLevelEntities(app.dungeon.levels[i]).some(e => e.id === targetId)) {
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
  layerList.refresh();
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
  updateDirtyDisplay();
  updateErrorBanner();
  updateStatusHint();
  if (preview.active && app.level) {
    preview.buildScene(app.level, app.activeLayerIndex);
  }
}

// --- Undo/Redo: onLevelRestored callback ---
app.onLevelRestored = () => {
  inspector.refresh();
  updateStairHighlight();
  levelProps.refresh();
  levelList.refresh();
  layerList.refresh();
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
  if (preview.active && app.level) {
    preview.buildScene(app.level, app.activeLayerIndex);
  }
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
  if (app.isDungeonMode()) {
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

toolbar.onThinWallToolSelect = (texture) => {
  if (texture !== '__erase__') {
    app.selectedThinWallTexture = texture;
    app.thinWallEraseOnly = false;
  }
  app.activeTool = 'thin_wall';
  gridCanvas.updateCursor();
};

toolbar.onThinWallBackSelect = (texture) => {
  app.selectedThinWallTextureBack = texture;
};

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

  app.syncToActiveLayer();
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
    playerStart: { levelId: 'level_1', col: 1, row: 1, facing: 'S', layerIndex: 0 },
    levels: [{
      id: 'level_1',
      name: 'Level 1',
      grid,
      entities: [],
      layers: [{
        id: '0',
        grid,
        entities: [],
      }],
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

// --- LayerList callbacks ---

layerList.onLayerSwitch = (index) => {
  app.switchToLayer(index);
  refreshAllUI();
};

layerList.onAddLayerAbove = () => {
  app.undo.snapshot(app.level!, app.activeLevelIndex);
  const newIndex = app.insertLayer('above', layerList.copyLayout);
  if (newIndex >= 0) {
    app.switchToLayer(newIndex);
    markDirty();
    refreshAllUI();
  }
};

layerList.onAddLayerBelow = () => {
  app.undo.snapshot(app.level!, app.activeLevelIndex);
  const newIndex = app.insertLayer('below', layerList.copyLayout);
  if (newIndex >= 0) {
    app.switchToLayer(newIndex);
    markDirty();
    refreshAllUI();
  }
};

layerList.onRemoveLayer = (index) => {
  app.undo.snapshot(app.level!, app.activeLevelIndex);
  if (app.removeLayerFromLevel(index)) {
    markDirty();
    refreshAllUI();
  }
};

// Selection callback — update inspector
gridCanvas.setSelectionCallback(() => {
  app.errors = app.validate();
  inspector.refresh();
  updateStairHighlight();
  levelList.refresh();
  gridCanvas.markDirty();
  updateErrorBanner();
  updateStatusHint();
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
    if (e.type === 'ramp') {
      if (typeof e.facing === 'string') app.selectedRampFacing = e.facing as import('../core/grid').Facing;
      if (typeof e.style === 'string') app.selectedRampStyle = e.style as 'ramp' | 'stairs';
    }
    if (e.type === 'prop' && typeof e.propId === 'string') app.selectedPropId = e.propId;
  }
  updateStairHighlight();
  levelList.refresh();
  markDirty();
  gridCanvas.markDirty();
  updateErrorBanner();
  if (preview.active) preview.markFullRebuild();
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
  if (preview.active) preview.markFullRebuild();
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
  } else if (field === 'targets' && validEntityType) {
    app.statusHint = `Click a ${validEntityType} to add as target (Esc to cancel)`;
  } else if (field === 'target' && validEntityType) {
    app.statusHint = `Click a ${validEntityType} to set as target (Esc to cancel)`;
  }
  updateStatusHint();
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
});

// Pick mode completion (success or cancel via right-click)
gridCanvas.setPickCompleteCallback(() => {
  app.statusHint = null;
  app.rebuildDerivedState();
  inspector.refresh();
  updateStairHighlight();
  levelProps.refresh();
  levelList.refresh();
  markDirty();
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
  updateStatusHint();
  updateErrorBanner();
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
  if (preview.active) preview.markGeometryDirty(app.activeLayerIndex);
});

// Entity add snapshot
gridCanvas.setBeforeEntityAddCallback(() => {
  if (app.level) app.undo.snapshot(app.level, app.activeLevelIndex);
  markDirty();
  if (preview.active) preview.markFullRebuild();
});

// Pick complete snapshot
gridCanvas.setBeforePickCompleteCallback(() => {
  if (app.level) app.undo.snapshot(app.level, app.activeLevelIndex);
  markDirty();
});

// Helper: find which level index and layer index an entity is on
function findEntityLocation(entity: import('../core/types').Entity): { levelIndex: number; layerIndex: number } | null {
  if (app.dungeon) {
    for (let li = 0; li < app.dungeon.levels.length; li++) {
      const level = app.dungeon.levels[li];
      if (level.layers) {
        for (let lai = 0; lai < level.layers.length; lai++) {
          if (level.layers[lai].entities.includes(entity)) return { levelIndex: li, layerIndex: lai };
        }
      }
      if (level.entities.includes(entity)) return { levelIndex: li, layerIndex: 0 };
    }
  } else if (app.level?.layers) {
    for (let lai = 0; lai < app.level.layers.length; lai++) {
      if (app.level.layers[lai].entities.includes(entity)) return { levelIndex: 0, layerIndex: lai };
    }
  }
  return null;
}

// Reference click → navigate to entity's level+layer and select it
inspector.setRefClickedCallback((entity) => {
  navigateToEntity(entity);
  app.highlightedEntity = null;
  levelList.hoverHighlightLevelIndex = null;
  layerList.hoverHighlightLayerIndex = null;
  levelList.refresh();
  layerList.refresh();
});

inspector.setRefHoveredCallback((entity) => {
  app.highlightedEntity = entity;
  levelList.hoverHighlightLevelIndex = null;
  layerList.hoverHighlightLayerIndex = null;
  if (entity) {
    const loc = findEntityLocation(entity);
    if (loc) {
      if (loc.levelIndex !== app.activeLevelIndex) {
        levelList.hoverHighlightLevelIndex = loc.levelIndex;
      }
      if (loc.layerIndex !== app.activeLayerIndex) {
        layerList.hoverHighlightLayerIndex = loc.layerIndex;
      }
    }
  }
  levelList.refresh();
  layerList.refresh();
  gridCanvas.markDirty();
});

// Stair "go to" — switch to target level+layer and select target stair
inspector.setStairGoToCallback((targetId) => {
  if (!app.dungeon) return;
  for (let i = 0; i < app.dungeon.levels.length; i++) {
    const level = app.dungeon.levels[i];
    const allEntities = getAllLevelEntities(level);
    const targetStair = allEntities.find(e => e.id === targetId);
    if (targetStair) {
      if (app.level && app.undo.hasPending) app.undo.commitBatch(app.level);
      app.switchToLevel(i);
      // Find layer
      if (level.layers) {
        for (let lai = 0; lai < level.layers.length; lai++) {
          if (level.layers[lai].entities.includes(targetStair)) {
            app.switchToLayer(lai);
            break;
          }
        }
      }
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

/** Navigate to the correct level + layer for an entity, then select it. */
function navigateToEntity(entity: import('../core/types').Entity): void {
  // In dungeon mode, find which level contains this entity
  if (app.dungeon) {
    for (let li = 0; li < app.dungeon.levels.length; li++) {
      const level = app.dungeon.levels[li];
      const allEntities = getAllLevelEntities(level);
      if (allEntities.includes(entity)) {
        if (li !== app.activeLevelIndex) {
          app.switchToLevel(li);
        }
        // Find which layer the entity is on
        if (level.layers) {
          for (let lai = 0; lai < level.layers.length; lai++) {
            if (level.layers[lai].entities.includes(entity)) {
              if (lai !== app.activeLayerIndex) {
                app.switchToLayer(lai);
              }
              break;
            }
          }
        }
        break;
      }
    }
  } else if (app.level?.layers) {
    // Single-level mode with layers — find which layer
    for (let lai = 0; lai < app.level.layers.length; lai++) {
      if (app.level.layers[lai].entities.includes(entity)) {
        if (lai !== app.activeLayerIndex) {
          app.switchToLayer(lai);
        }
        break;
      }
    }
  }
  selectEntity(entity);
  refreshAllUI();
}

function renderErrorSpan(err: import('./EditorApp').ValidationError): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = err.message;
  if (err.entity) {
    const ent = err.entity;
    const link = document.createElement('a');
    link.className = 'error-goto';
    link.textContent = `${ent.type} @ (${ent.col}, ${ent.row})`;
    if (ent.id) link.title = ent.id;
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToEntity(ent);
    });
    span.appendChild(document.createTextNode(' '));
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

// --- Dialog editor mode ---

async function enterDialogMode(npcId: string): Promise<void> {
  try {
    const tree = await loadDialogFromServer(npcId);
    const layout = await loadDialogLayout(npcId);
    dialogState.loadTree(npcId, tree, layout ?? undefined);
  } catch {
    // No dialog file exists — create a new empty tree
    const defaultTree = {
      startNode: 'greeting',
      nodes: {
        greeting: { speaker: '', text: '' },
      },
    };
    dialogState.loadTree(npcId, defaultTree);
  }

  app.editorMode = 'dialog';
  app.dialogNpcId = npcId;

  // Hide level-mode elements, show dialog-mode elements
  for (const el of levelModeEls) el.style.display = 'none';
  for (const el of dialogModeEls) el.style.display = '';

  // Hide level toolbar buttons, show dialog toolbar buttons
  savedToolbarDisplay.clear();
  for (const el of levelToolbarBtns) {
    savedToolbarDisplay.set(el, el.style.display);
    el.style.display = 'none';
  }
  for (const el of toolGroupEls) {
    const htmlEl = el as HTMLElement;
    savedToolbarDisplay.set(htmlEl, htmlEl.style.display);
    htmlEl.style.display = 'none';
  }
  dialogBackBtn.style.display = '';
  dialogAddNodeBtn.style.display = '';
  dialogSaveBtn.style.display = '';
  dialogSaveBtn.disabled = true;
  levelNameEl.textContent = `Dialog: ${npcId}`;
  coordEl.textContent = '';

  // Wire dialog canvas + inspector to state
  dialogCanvas.setState(dialogState);
  dialogCanvas.resetViewport();
  dialogCanvas.markDirty();
  dialogInspector.state = dialogState;
  dialogInspector.refresh();
}

async function exitDialogMode(): Promise<void> {
  if (dialogState.isDirty()) {
    if (confirm('Save dialog changes before exiting?')) {
      await saveDialog();
    }
  }

  app.editorMode = 'level';
  app.dialogNpcId = null;

  // Show level-mode elements, hide dialog-mode elements
  for (const el of levelModeEls) el.style.display = '';
  for (const el of dialogModeEls) el.style.display = 'none';

  // Restore level toolbar buttons, hide dialog toolbar buttons
  for (const [el, display] of savedToolbarDisplay) el.style.display = display;
  savedToolbarDisplay.clear();
  dialogBackBtn.style.display = 'none';
  dialogAddNodeBtn.style.display = 'none';
  dialogSaveBtn.style.display = 'none';
  updateDirtyDisplay();
  coordEl.textContent = '\u2014';

  // Restore inspector to level mode
  inspector.refresh();
  gridCanvas.markDirty();
}

let dialogSaving = false;

async function saveDialog(): Promise<void> {
  if (dialogSaving || !dialogState.tree || !dialogState.npcId) return;
  dialogSaving = true;
  try {
    await saveDialogToServer(dialogState.npcId, dialogState.tree);
    await saveDialogLayout(
      dialogState.npcId,
      Object.fromEntries(dialogState.nodePositions),
    );
    dialogState.markClean();
    levelNameEl.textContent = `Dialog: ${dialogState.npcId}`;
    dialogSaveBtn.disabled = true;
  } catch (err) {
    alert(`Save failed: ${(err as Error).message}`);
  } finally {
    dialogSaving = false;
  }
}

/** Update dirty display, canvas, and error banner — does NOT rebuild the inspector. */
function updateDialogStatus(): void {
  dialogCanvas.markDirty();
  dialogState.updateDirty();
  const prefix = dialogState.dirty ? '* ' : '';
  levelNameEl.textContent = `${prefix}Dialog: ${dialogState.npcId ?? ''}`;
  dialogSaveBtn.disabled = !dialogState.dirty;

  // Show validation errors in the error banner
  const validationErrors = dialogState.validate();
  errorBannerEl.innerHTML = '';
  if (validationErrors.length === 0) {
    errorBannerEl.classList.remove('visible');
  } else {
    errorBannerEl.classList.add('visible');
    const prefix2 = document.createTextNode(
      validationErrors.length === 1 ? '\u26a0 ' : `\u26a0 ${validationErrors.length} errors: `
    );
    errorBannerEl.appendChild(prefix2);
    for (let i = 0; i < validationErrors.length; i++) {
      if (i > 0) errorBannerEl.appendChild(document.createTextNode(' | '));
      const span = document.createElement('span');
      span.textContent = validationErrors[i].message;
      errorBannerEl.appendChild(span);
    }
  }
}

/** Full refresh: rebuilds inspector + updates status. Use after structural changes. */
function refreshDialogUI(): void {
  dialogInspector.refresh();
  updateDialogStatus();
}

// Inspector "Edit Dialog" button callback
inspector.setEditDialogCallback((npcId) => enterDialogMode(npcId));

// Dialog canvas callbacks
dialogCanvas.setSelectionCallback(() => {
  dialogInspector.refresh();
  dialogCanvas.markDirty();
});

dialogCanvas.setNodeMovedCallback(() => {
  dialogState.updateDirty();
  refreshDialogUI();
});

dialogCanvas.setAddNodeCallback((x, y) => {
  dialogState.pushUndo();
  const id = dialogState.addNode();
  dialogState.nodePositions.set(id, { x, y });
  refreshDialogUI();
});

dialogCanvas.setContextMenuCallback((nodeId, screenX, screenY) => {
  // Remove existing context menu if any
  document.querySelectorAll('.dialog-context-menu').forEach(el => el.remove());

  const menu = document.createElement('div');
  menu.className = 'dialog-context-menu';
  menu.style.cssText = `position:fixed; left:${screenX}px; top:${screenY}px; background:#222; border:1px solid #555; z-index:200; font-family:monospace; font-size:12px; min-width:140px;`;

  const setStart = document.createElement('div');
  setStart.textContent = 'Set as Start Node';
  setStart.style.cssText = 'padding:6px 12px; cursor:pointer; color:#ccc;';
  setStart.addEventListener('mouseover', () => { setStart.style.background = '#333'; });
  setStart.addEventListener('mouseout', () => { setStart.style.background = ''; });
  setStart.addEventListener('click', () => {
    dialogState.pushUndo();
    dialogState.setStartNode(nodeId);
    refreshDialogUI();
    menu.remove();
  });
  menu.appendChild(setStart);

  const deleteNode = document.createElement('div');
  deleteNode.textContent = 'Delete Node';
  deleteNode.style.cssText = 'padding:6px 12px; cursor:pointer; color:#ff6666;';
  deleteNode.addEventListener('mouseover', () => { deleteNode.style.background = '#333'; });
  deleteNode.addEventListener('mouseout', () => { deleteNode.style.background = ''; });
  deleteNode.addEventListener('click', () => {
    dialogState.pushUndo();
    dialogState.removeNode(nodeId);
    refreshDialogUI();
    menu.remove();
  });
  menu.appendChild(deleteNode);

  document.body.appendChild(menu);

  // Close on click elsewhere
  const closeMenu = (ev: MouseEvent) => {
    if (!menu.contains(ev.target as Node)) {
      menu.remove();
      document.removeEventListener('mousedown', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
});

// Dialog inspector callbacks
dialogInspector.onBeforeDiscreteChange = () => dialogState.pushUndo();
dialogInspector.onBeginTextEdit = () => dialogState.pushUndo();
dialogInspector.onCommitTextEdit = () => {}; // undo already pushed on begin
dialogInspector.onNodeChanged = () => updateDialogStatus();
dialogInspector.onNodeDeleted = () => refreshDialogUI();
dialogInspector.onNewNode = (callback) => {
  dialogState.pushUndo();
  const newId = dialogState.addNode();
  callback(newId);
  refreshDialogUI();
};

// --- Quest editor panel ---
const questEditorPanel = new QuestEditorPanel();
questEditorPanel.attach();

questEditorPanel.setOnSave(async (quest: QuestDef, isNew: boolean) => {
  try {
    await saveQuestToServer(quest.id, quest);
    questEditorPanel.close();
    // Refresh inspector to update quest dropdowns
    if (isNew) {
      dialogState.pushUndo();
    }
    dialogInspector.refresh();
  } catch (err) {
    alert(`Save quest failed: ${(err as Error).message}`);
  }
});

questEditorPanel.setOnCancel(() => {});

dialogInspector.onEditQuest = async (questId) => {
  try {
    const quest = await loadQuestFromServer(questId);
    questEditorPanel.open(quest, false);
  } catch (err) {
    alert(`Failed to load quest: ${(err as Error).message}`);
  }
};

dialogInspector.onNewQuest = (callback) => {
  const defaultQuest: QuestDef = {
    id: '',
    name: '',
    description: '',
    stages: [{ description: '' }],
  };
  questEditorPanel.open(defaultQuest, true);
  // Temporarily override save/cancel to wire the callback
  const restore = () => {
    questEditorPanel.setOnSave(async (quest: QuestDef) => {
      try {
        await saveQuestToServer(quest.id, quest);
        questEditorPanel.close();
        dialogInspector.refresh();
      } catch (err) {
        alert(`Save quest failed: ${(err as Error).message}`);
      }
    });
    questEditorPanel.setOnCancel(() => {});
  };
  questEditorPanel.setOnSave(async (quest: QuestDef) => {
    try {
      await saveQuestToServer(quest.id, quest);
      questEditorPanel.close();
      callback(quest.id);
      dialogInspector.refresh();
    } catch (err) {
      alert(`Save quest failed: ${(err as Error).message}`);
    }
    restore();
  });
  questEditorPanel.setOnCancel(() => { restore(); });
};

// Keyboard listeners
document.addEventListener('keydown', (e) => {
  // --- Dialog mode keyboard shortcuts ---
  if (app.editorMode === 'dialog') {
    // Close context menus on Escape
    if (e.key === 'Escape') {
      document.querySelectorAll('.dialog-context-menu').forEach(el => el.remove());
      if (dialogState.selectedNodeId) {
        dialogState.deselectNode();
        dialogInspector.refresh();
        dialogCanvas.markDirty();
      } else {
        exitDialogMode();
      }
      return;
    }

    // Delete selected node
    if (e.key === 'Delete' && dialogState.selectedNodeId) {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      dialogState.pushUndo();
      dialogState.removeNode(dialogState.selectedNodeId);
      refreshDialogUI();
      return;
    }

    // Ctrl+S: save dialog
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveDialog();
      return;
    }

    // Ctrl+Z: undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      dialogState.undo();
      refreshDialogUI();
      return;
    }

    // Ctrl+Shift+Z or Ctrl+Y: redo
    if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || (e.key === 'y' && !e.shiftKey))) {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      dialogState.redo();
      refreshDialogUI();
      return;
    }

    return; // Don't fall through to level-mode shortcuts
  }

  // --- Level mode keyboard shortcuts (existing) ---
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
  if (e.key === 'Escape' && (app.activeTool === 'entity' || app.activeTool === 'thin_wall')) {
    app.activeTool = 'select';
    toolbar.setActiveTool('select');
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
    return;
  }
  if (e.key === 'Delete' && app.selectedEntity) {
    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (app.pickMode) app.cancelPickMode();
    if (app.level) app.undo.snapshot(app.level, app.activeLevelIndex);
    app.deleteSelectedEntity();
    app.rebuildDerivedState();
    markDirty();
    inspector.refresh();
    updateStairHighlight();
    levelList.refresh();
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
    updateErrorBanner();
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
  if (app.dirty || dialogState.isDirty()) {
    e.preventDefault();
  }
});
