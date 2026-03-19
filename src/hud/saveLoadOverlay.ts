import { SAVE_SLOT_KEYS, AUTOSAVE_KEY, getAllSlotMetadata, type SlotMetadata } from '../core/saveSystem';

export interface SaveLoadCallbacks {
  onSave: (slotKey: string) => void;
  onLoad: (slotKey: string) => void;
  onDelete: (slotKey: string) => void;
  onExport: () => void;
  onImport: () => void;
  onRestart?: () => void;
}

type OverlayMode = 'save' | 'load';

// All slots in display order: manual slots first, autosave last.
const ALL_SLOT_KEYS = [...SAVE_SLOT_KEYS, AUTOSAVE_KEY];

const SLOT_LABELS: Record<string, string> = {
  delveward_save_1: 'Slot 1',
  delveward_save_2: 'Slot 2',
  delveward_save_3: 'Slot 3',
  delveward_save_4: 'Slot 4',
  delveward_save_5: 'Slot 5',
  [AUTOSAVE_KEY]: 'Autosave',
};

// Color palette — kept consistent with hudColors.ts dark dungeon theme.
const C = {
  backdrop: 'rgba(0, 0, 0, 0.7)',
  panelBg: '#0f0e18',
  panelBorder: '#3a3650',
  titleBg: '#1a1830',
  titleText: '#e8c84a',
  text: '#c0c0c0',
  textDim: '#555566',
  textEmpty: '#44435a',
  buttonBg: '#1a1830',
  buttonBorder: '#3a3650',
  buttonHoverBg: '#252340',
  buttonHoverBorder: '#7070a0',
  buttonDangerBorder: '#7a2020',
  buttonDangerHoverBorder: '#cc3333',
  buttonDangerHoverBg: '#2a1010',
  rowHoverBg: 'rgba(232, 200, 74, 0.04)',
  separator: '#2a2840',
  deathTitle: '#cc3333',
} as const;

function _formatTimestamp(ts: number | string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[d.getMonth()];
  const day = d.getDate();
  const yr = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${mon} ${day}, ${yr} ${hh}:${mm}`;
}

function _makeButton(label: string, variant: 'normal' | 'danger' = 'normal'): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  const borderColor = variant === 'danger' ? C.buttonDangerBorder : C.buttonBorder;
  const hoverBorder = variant === 'danger' ? C.buttonDangerHoverBorder : C.buttonHoverBorder;
  const hoverBg = variant === 'danger' ? C.buttonDangerHoverBg : C.buttonHoverBg;
  btn.style.cssText = `
    background: ${C.buttonBg};
    border: 1px solid ${borderColor};
    color: ${C.text};
    font-family: 'Courier New', monospace;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.1s, border-color 0.1s;
  `;
  btn.addEventListener('mouseenter', () => {
    btn.style.background = hoverBg;
    btn.style.borderColor = hoverBorder;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = C.buttonBg;
    btn.style.borderColor = borderColor;
  });
  return btn;
}

interface SlotRowElements {
  row: HTMLDivElement;
  infoEl: HTMLSpanElement;
  saveBtn: HTMLButtonElement | null;
  loadBtn: HTMLButtonElement;
  deleteBtn: HTMLButtonElement;
}

export class SaveLoadOverlay {
  private container: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private slotsContainer: HTMLDivElement;
  private restartBtn: HTMLButtonElement;
  private visible = false;
  private mode: OverlayMode = 'load';
  private isDeath = false;
  private callbacks: SaveLoadCallbacks;
  private slotRows: SlotRowElements[] = [];

  constructor(callbacks: SaveLoadCallbacks) {
    this.callbacks = callbacks;

    // Fullscreen backdrop
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 500;
      background: ${C.backdrop};
    `;

    // Panel
    const panel = document.createElement('div');
    panel.style.cssText = `
      background: ${C.panelBg};
      border: 2px solid ${C.panelBorder};
      font-family: 'Courier New', monospace;
      width: 100%;
      max-width: 580px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
      image-rendering: pixelated;
    `;

    // Title bar
    this.titleEl = document.createElement('div');
    this.titleEl.style.cssText = `
      background: ${C.titleBg};
      border-bottom: 2px solid ${C.panelBorder};
      padding: 12px 20px;
      font-size: 14px;
      font-weight: bold;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: ${C.titleText};
      text-align: center;
    `;
    panel.appendChild(this.titleEl);

    // Slots area
    this.slotsContainer = document.createElement('div');
    this.slotsContainer.style.cssText = `
      padding: 8px 0;
      border-bottom: 1px solid ${C.separator};
    `;
    panel.appendChild(this.slotsContainer);

    // Build slot rows
    this.slotRows = ALL_SLOT_KEYS.map((slotKey) => this._buildSlotRow(slotKey));
    this.slotRows.forEach(({ row }) => this.slotsContainer.appendChild(row));

    // Bottom action bar (Export / Import / Restart)
    const actionBar = document.createElement('div');
    actionBar.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-top: 1px solid ${C.separator};
    `;

    const exportBtn = _makeButton('Export Save');
    exportBtn.addEventListener('click', () => this.callbacks.onExport());

    const importBtn = _makeButton('Import Save');
    importBtn.addEventListener('click', () => {
      this.callbacks.onImport();
      // Refresh after import so newly-imported slots are shown immediately.
      this.refreshSlots();
    });

    this.restartBtn = _makeButton('Restart');
    this.restartBtn.style.display = 'none';
    this.restartBtn.addEventListener('click', () => this.callbacks.onRestart?.());

    // Spacer pushes restart to the right
    const spacer = document.createElement('div');
    spacer.style.flex = '1';

    actionBar.appendChild(exportBtn);
    actionBar.appendChild(importBtn);
    actionBar.appendChild(spacer);
    actionBar.appendChild(this.restartBtn);
    panel.appendChild(actionBar);

    this.container.appendChild(panel);

    this._keyHandler = this._keyHandler.bind(this);
  }

  private _buildSlotRow(slotKey: string): SlotRowElements {
    const isAutosave = slotKey === AUTOSAVE_KEY;

    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      border-bottom: 1px solid ${C.separator};
      min-height: 44px;
      gap: 12px;
    `;
    row.addEventListener('mouseenter', () => {
      row.style.background = C.rowHoverBg;
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent';
    });

    // Left: label
    const labelEl = document.createElement('span');
    labelEl.textContent = SLOT_LABELS[slotKey] ?? slotKey;
    labelEl.style.cssText = `
      font-size: 12px;
      color: ${C.text};
      min-width: 70px;
      flex-shrink: 0;
    `;
    row.appendChild(labelEl);

    // Middle: slot info
    const infoEl = document.createElement('span');
    infoEl.style.cssText = `
      font-size: 11px;
      color: ${C.textEmpty};
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    infoEl.textContent = 'Empty';
    row.appendChild(infoEl);

    // Right: buttons
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = `
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    `;

    // Save button — only for manual slots
    let saveBtn: HTMLButtonElement | null = null;
    if (!isAutosave) {
      saveBtn = _makeButton('Save');
      saveBtn.style.display = 'none';
      btnGroup.appendChild(saveBtn);
    }

    const loadBtn = _makeButton('Load');
    loadBtn.style.display = 'none';
    btnGroup.appendChild(loadBtn);

    const deleteBtn = _makeButton('Delete', 'danger');
    deleteBtn.style.display = 'none';
    btnGroup.appendChild(deleteBtn);

    row.appendChild(btnGroup);

    // Wire up button actions using the slotKey captured in closure.
    saveBtn?.addEventListener('click', () => this.callbacks.onSave(slotKey));
    loadBtn.addEventListener('click', () => this.callbacks.onLoad(slotKey));
    deleteBtn.addEventListener('click', () => this.callbacks.onDelete(slotKey));

    return { row, infoEl, saveBtn, loadBtn, deleteBtn };
  }

  private _keyHandler(e: KeyboardEvent): void {
    if (!this.visible) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      this.hide();
    }
  }

  attach(): void {
    document.body.appendChild(this.container);
  }

  show(mode: OverlayMode, isDeath = false): void {
    this.mode = mode;
    this.isDeath = isDeath;

    if (isDeath) {
      this.titleEl.style.color = C.deathTitle;
      this.titleEl.textContent = 'You have died. Load a save?';
      this.restartBtn.style.display = 'inline-block';
    } else {
      this.titleEl.style.color = C.titleText;
      this.titleEl.textContent = mode === 'save' ? 'Save Game' : 'Load Game';
      this.restartBtn.style.display = 'none';
    }

    this.refreshSlots();

    this.container.style.display = 'flex';
    this.visible = true;
    window.addEventListener('keydown', this._keyHandler, true);
  }

  hide(): void {
    this.container.style.display = 'none';
    this.visible = false;
    window.removeEventListener('keydown', this._keyHandler, true);
  }

  isOpen(): boolean {
    return this.visible;
  }

  refreshSlots(): void {
    const metadata = getAllSlotMetadata();

    ALL_SLOT_KEYS.forEach((slotKey, i) => {
      const { infoEl, saveBtn, loadBtn, deleteBtn } = this.slotRows[i];
      const meta: SlotMetadata | null = metadata[slotKey] ?? null;
      const isAutosave = slotKey === AUTOSAVE_KEY;
      const isSaveMode = this.mode === 'save';

      if (meta) {
        const ts = _formatTimestamp(meta.savedAt);
        const level = meta.levelId ?? '?';
        const charLevel = meta.characterLevel != null ? `Lv${meta.characterLevel}` : '';
        const name = meta.playerName ?? 'Unknown';
        const parts = [ts, name, level, charLevel].filter(Boolean);
        infoEl.textContent = parts.join('  |  ');
        infoEl.style.color = C.text;
      } else {
        infoEl.textContent = 'Empty';
        infoEl.style.color = C.textEmpty;
      }

      // Save button: visible only in save mode for manual slots.
      if (saveBtn) {
        saveBtn.style.display = isSaveMode ? 'inline-block' : 'none';
      }

      // Load/Delete: visible only when slot has data.
      loadBtn.style.display = meta ? 'inline-block' : 'none';
      deleteBtn.style.display = meta ? 'inline-block' : 'none';

      // In death mode, hide Save and Delete buttons — keep UI focused on loading.
      if (this.isDeath) {
        if (saveBtn) saveBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';
      }
    });
  }
}
