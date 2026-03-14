import { EditorApp } from './EditorApp';
import { GridCanvas } from './GridCanvas';
import { Toolbar } from './Toolbar';
import { Inspector } from './Inspector';
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

// Toolbar callbacks
toolbar.setToolChangeCallback((tool) => {
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
  if (app.level) exportLevelFile(app.level);
});

toolbar.setEntityTypeSelectCallback((type) => {
  app.selectedEntityType = type;
  app.activeTool = 'entity';
  toolbar.setActiveTool('entity');
  gridCanvas.updateCursor();
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
  app.deleteSelectedEntity();
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

// Delete key listener
document.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' && app.selectedEntity) {
    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    app.deleteSelectedEntity();
    inspector.refresh();
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
    gridCanvas.updateCursor();
    gridCanvas.markDirty();
  }
});
