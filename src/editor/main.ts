import { EditorApp } from './EditorApp';
import { GridCanvas } from './GridCanvas';
import { Toolbar } from './Toolbar';
import { Inspector } from './Inspector';
import { LevelProperties } from './LevelProperties';
import { openLevelFile, exportLevelFile } from './io';

const app = new EditorApp();

const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
const container = document.getElementById('canvas-container') as HTMLElement;
const btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
const levelNameEl = document.getElementById('level-name') as HTMLSpanElement;
const coordEl = document.getElementById('coord-display') as HTMLSpanElement;

const gridCanvas = new GridCanvas(canvas, container, app);
const toolbar = new Toolbar(document.getElementById('toolbar')!);
const inspector = new Inspector(document.getElementById('inspector')!, app);
const levelProps = new LevelProperties(document.getElementById('level-properties')!, app);

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
});

toolbar.setEntityTypeSelectCallback((type) => {
  app.selectedEntityType = type;
  app.activeTool = 'entity';
  toolbar.setActiveTool('entity');
  gridCanvas.updateCursor();
});

// Level properties changed callback
levelProps.setChangedCallback(() => {
  app.rebuildDerivedState();
  toolbar.updatePalette(app.level!.charDefs);
  levelNameEl.textContent = app.level!.name;
  gridCanvas.markDirty();
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
  levelNameEl.textContent = app.level!.name;
  toolbar.updatePalette(app.level!.charDefs);
  toolbar.enableExport();
  inspector.refresh();
  levelProps.refresh();
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
});

// Selection callback — update inspector
gridCanvas.setSelectionCallback(() => {
  inspector.refresh();
  gridCanvas.markDirty();
});

// Inspector callbacks
inspector.setEntityChangedCallback(() => {
  gridCanvas.markDirty();
});

inspector.setDeleteCallback(() => {
  if (app.pickMode) app.cancelPickMode();
  app.deleteSelectedEntity();
  inspector.refresh();
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
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
  gridCanvas.updateCursor();
  gridCanvas.markDirty();
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

// Keyboard listeners
document.addEventListener('keydown', (e) => {
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
    app.deleteSelectedEntity();
    inspector.refresh();
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
  }
});

// Open file button
btnOpen.addEventListener('click', async () => {
  const level = await openLevelFile();
  if (level) {
    app.loadLevel(level);
    levelNameEl.textContent = level.name;
    toolbar.updatePalette(level.charDefs);
    toolbar.enableExport();
    inspector.refresh();
    levelProps.refresh();
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
  }
});
