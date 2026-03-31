import type { EditorApp } from './EditorApp';

export class LayerList {
  private container: HTMLElement;
  private app: EditorApp;

  hoverHighlightLayerIndex: number | null = null;

  onLayerSwitch: ((index: number) => void) | null = null;
  onAddLayerAbove: (() => void) | null = null;
  onAddLayerBelow: (() => void) | null = null;
  onRemoveLayer: ((index: number) => void) | null = null;
  onConvertToLayers: (() => void) | null = null;
  onBeforeDiscreteChange: (() => void) | null = null;

  constructor(container: HTMLElement, app: EditorApp) {
    this.container = container;
    this.app = app;
  }

  refresh(): void {
    this.container.innerHTML = '';

    if (!this.app.level) {
      this.container.classList.remove('visible');
      return;
    }

    // Always show for layered levels
    if (!this.app.hasLayers()) {
      this.container.classList.add('visible');
      // Show "Convert to Layers" button
      const convertBtn = document.createElement('button');
      convertBtn.className = 'btn-add';
      convertBtn.textContent = 'Convert to Layers';
      convertBtn.addEventListener('click', () => this.onConvertToLayers?.());
      this.container.appendChild(convertBtn);
      return;
    }

    this.container.classList.add('visible');
    const layers = this.app.level.layers!;

    // "Layers" header
    const header = document.createElement('div');
    header.className = 'level-list-header';
    header.textContent = 'Layers';
    this.container.appendChild(header);

    // Scrollable list (highest layer first — layers above appear at the top)
    const scroll = document.createElement('div');
    scroll.className = 'level-list-scroll';

    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const entry = document.createElement('div');
      entry.className = 'level-entry';
      if (i === this.app.activeLayerIndex) entry.classList.add('active');
      if (i === this.hoverHighlightLayerIndex && i !== this.app.activeLayerIndex) entry.classList.add('hover-highlight');

      const name = document.createElement('span');
      name.className = 'level-entry-name';
      name.textContent = `Layer ${layer.id ?? i}`;
      entry.appendChild(name);

      const dims = document.createElement('span');
      dims.className = 'level-entry-id';
      dims.textContent = `(${layer.grid[0].length}\u00d7${layer.grid.length})`;
      entry.appendChild(dims);

      const actions = document.createElement('div');
      actions.className = 'level-entry-actions';

      // Remove button (only if >1 layer)
      if (layers.length > 1) {
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '\u00d7';
        removeBtn.title = 'Remove layer';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onRemoveLayer?.(i);
        });
        actions.appendChild(removeBtn);
      }

      entry.appendChild(actions);

      entry.addEventListener('click', () => {
        if (i !== this.app.activeLayerIndex) {
          this.onLayerSwitch?.(i);
        }
      });

      scroll.appendChild(entry);
    }

    this.container.appendChild(scroll);

    // Add Layer buttons
    const addAboveBtn = document.createElement('button');
    addAboveBtn.className = 'btn-add';
    addAboveBtn.textContent = 'Add Layer Above';
    addAboveBtn.addEventListener('click', () => this.onAddLayerAbove?.());
    this.container.appendChild(addAboveBtn);

    const addBelowBtn = document.createElement('button');
    addBelowBtn.className = 'btn-add';
    addBelowBtn.textContent = 'Add Layer Below';
    addBelowBtn.style.marginTop = '2px';
    addBelowBtn.addEventListener('click', () => this.onAddLayerBelow?.());
    this.container.appendChild(addBelowBtn);
  }
}
