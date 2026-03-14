import type { EditorTool } from './EditorApp';
import type { CharDef } from '../core/types';

const BUILTIN_CHARS: Array<{ char: string; label: string }> = [
  { char: '.', label: '.' },
  { char: '#', label: '#' },
  { char: 'D', label: 'D' },
  { char: 'S', label: 'S' },
  { char: 'U', label: 'U' },
  { char: 'O', label: 'O' },
  { char: ' ', label: '_' },
];

export class Toolbar {
  private toolBtns: Map<EditorTool, HTMLButtonElement> = new Map();
  private charBtns: Map<string, HTMLButtonElement> = new Map();
  private exportBtn!: HTMLButtonElement;
  private palette!: HTMLElement;
  private selectedChar = '.';
  private entitySelect!: HTMLSelectElement;

  onToolChange: ((tool: EditorTool) => void) | null = null;
  onCharSelect: ((char: string) => void) | null = null;
  onExport: (() => void) | null = null;
  onEntityTypeSelect: ((type: string) => void) | null = null;
  onNewLevel: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.palette = document.getElementById('char-palette')!;
    this.buildToolbar(container);
    this.updatePalette();
  }

  setToolChangeCallback(cb: (tool: EditorTool) => void): void {
    this.onToolChange = cb;
  }

  setCharSelectCallback(cb: (char: string) => void): void {
    this.onCharSelect = cb;
  }

  setExportCallback(cb: () => void): void {
    this.onExport = cb;
  }

  setEntityTypeSelectCallback(cb: (type: string) => void): void {
    this.onEntityTypeSelect = cb;
  }

  setNewLevelCallback(cb: () => void): void {
    this.onNewLevel = cb;
  }

  enableExport(): void {
    this.exportBtn.disabled = false;
  }

  disableExport(): void {
    this.exportBtn.disabled = true;
  }

  setActiveTool(tool: EditorTool): void {
    for (const [t, btn] of this.toolBtns) {
      btn.classList.toggle('active', t === tool);
    }
    this.entitySelect.classList.toggle('dimmed', tool !== 'entity');
  }

  updatePalette(charDefs?: CharDef[]): void {
    this.palette.innerHTML = '';
    this.charBtns.clear();
    this.selectedChar = '.';

    // Built-in chars
    for (const { char, label } of BUILTIN_CHARS) {
      this.addCharBtn(char, label);
    }

    // Custom charDef chars (skip any that duplicate a built-in)
    if (charDefs) {
      const builtinSet = new Set(BUILTIN_CHARS.map(b => b.char));
      for (const def of charDefs) {
        if (!builtinSet.has(def.char)) {
          this.addCharBtn(def.char, def.char);
        }
      }
    }

    // Mark '.' as selected
    this.charBtns.get('.')?.classList.add('selected');

    // Re-enable palette now that a level is loaded
    this.palette.classList.remove('dimmed');
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildToolbar(container: HTMLElement): void {
    // Find the existing btn-open to insert after it
    const btnOpen = container.querySelector('#btn-open') as HTMLButtonElement;
    const coordDisplay = container.querySelector('#coord-display') as HTMLElement;

    // New button — insert before Open File
    const btnNew = document.createElement('button');
    btnNew.id = 'btn-new';
    btnNew.textContent = 'New';
    btnNew.addEventListener('click', () => this.onNewLevel?.());
    btnOpen.insertAdjacentElement('beforebegin', btnNew);

    // Separator after Open File
    const sep1 = this.makeSep();
    btnOpen.insertAdjacentElement('afterend', sep1);

    // Tool button group
    const toolGroup = document.createElement('div');
    toolGroup.className = 'tool-group';

    const tools: Array<{ tool: EditorTool; label: string }> = [
      { tool: 'select', label: 'Select' },
      { tool: 'paint', label: 'Paint' },
      { tool: 'erase', label: 'Erase' },
      { tool: 'entity', label: 'Entity' },
    ];

    for (const { tool, label } of tools) {
      const btn = document.createElement('button');
      btn.className = 'tool-btn';
      btn.textContent = label;
      if (tool === 'select') btn.classList.add('active');

      btn.addEventListener('click', () => {
        this.setActiveTool(tool);
        this.onToolChange?.(tool);
      });

      this.toolBtns.set(tool, btn);
      toolGroup.appendChild(btn);
    }

    sep1.insertAdjacentElement('afterend', toolGroup);

    // Entity type dropdown
    const entitySelect = document.createElement('select');
    entitySelect.id = 'entity-type-select';
    entitySelect.className = 'entity-type-select';
    const entityTypes = [
      'enemy', 'door', 'key', 'lever', 'pressure_plate',
      'torch_sconce', 'equipment', 'consumable', 'stairs',
    ];
    for (const type of entityTypes) {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type;
      entitySelect.appendChild(opt);
    }
    entitySelect.addEventListener('change', () => {
      this.onEntityTypeSelect?.(entitySelect.value);
    });
    toolGroup.insertAdjacentElement('afterend', entitySelect);
    this.entitySelect = entitySelect;

    // Separator after entity select
    const sep2 = this.makeSep();
    entitySelect.insertAdjacentElement('afterend', sep2);

    // Export button — insert before coord-display (which has margin-left: auto)
    const exportBtn = document.createElement('button');
    exportBtn.id = 'btn-export';
    exportBtn.textContent = 'Export';
    exportBtn.disabled = true;
    exportBtn.addEventListener('click', () => {
      if (!exportBtn.disabled) this.onExport?.();
    });

    this.exportBtn = exportBtn;
    coordDisplay.insertAdjacentElement('beforebegin', exportBtn);
  }

  private addCharBtn(char: string, label: string): void {
    const btn = document.createElement('button');
    btn.className = 'char-btn';
    btn.textContent = label;
    btn.title = char === ' ' ? 'void (space)' : char;

    btn.addEventListener('click', () => {
      // Deselect all, select this one
      for (const b of this.charBtns.values()) {
        b.classList.remove('selected');
      }
      btn.classList.add('selected');
      this.selectedChar = char;
      this.onCharSelect?.(char);
    });

    this.charBtns.set(char, btn);
    this.palette.appendChild(btn);
  }

  private makeSep(): HTMLSpanElement {
    const sep = document.createElement('span');
    sep.className = 'toolbar-sep';
    return sep;
  }
}
