import type { CharDef, TextureArea } from '../core/types';
import type { EditorApp } from './EditorApp';
import { WALL_TEXTURES, FLOOR_TEXTURES, CEILING_TEXTURES } from '../core/textureNames';
import type { WallTextureName, FloorTextureName, CeilingTextureName } from '../core/textureNames';
import { getWallTexture, getFloorTexture, getCeilingTexture } from '../rendering/textures';

export class LevelProperties {
  private container: HTMLElement;
  private app: EditorApp;
  private onChanged: (() => void) | null = null;
  private onBeforeDiscreteChange: (() => void) | null = null;
  private onBeginTextEdit: (() => void) | null = null;
  private onCommitTextEdit: (() => void) | null = null;

  private expandedSections = new Set<string>(['level', 'environment', 'defaults']);
  private expandedCharDefs = new Set<number>();
  private expandedAreas = new Set<number>();

  constructor(container: HTMLElement, app: EditorApp) {
    this.container = container;
    this.app = app;
  }

  setChangedCallback(cb: () => void): void {
    this.onChanged = cb;
  }

  setBeforeDiscreteChangeCallback(cb: () => void): void {
    this.onBeforeDiscreteChange = cb;
  }

  setBeginTextEditCallback(cb: () => void): void {
    this.onBeginTextEdit = cb;
  }

  setCommitTextEditCallback(cb: () => void): void {
    this.onCommitTextEdit = cb;
  }

  refresh(): void {
    this.container.innerHTML = '';

    const level = this.app.level;
    if (!level) {
      const placeholder = document.createElement('div');
      placeholder.className = 'inspector-placeholder';
      placeholder.textContent = 'No level loaded';
      this.container.appendChild(placeholder);
      return;
    }

    this.addCollapsibleSection('Level', 'level', (body) => {
      this.addTextField(body, 'name', level.name, (val) => {
        level.name = val;
        this.onChanged?.();
      });
      this.addTextField(body, 'id', level.id ?? '', (val) => {
        level.id = val || undefined;
        this.onChanged?.();
      });
    });

    this.addCollapsibleSection('Environment', 'environment', (body) => {
      this.addDropdownField(body, 'environment', level.environment ?? 'dungeon', ['dungeon', 'mist'], (val) => {
        level.environment = val as 'dungeon' | 'mist';
        this.onChanged?.();
      });

      const ceilingOn = level.ceiling ?? true;
      this.addCheckboxField(body, 'ceiling', ceilingOn, (val) => {
        if (val) {
          delete level.ceiling;
        } else {
          level.ceiling = false;
        }
        this.onChanged?.();
        this.refresh();
      });

      if (!ceilingOn) {
        this.addDropdownField(
          body,
          'skybox',
          level.skybox ?? 'none',
          ['none', 'starry-night'],
          (val) => {
            if (val === 'none') {
              delete level.skybox;
            } else {
              level.skybox = val as 'starry-night';
            }
            this.onChanged?.();
          }
        );
      }

      this.addCheckboxField(body, 'dustMotes', level.dustMotes ?? true, (val) => {
        if (val) {
          delete level.dustMotes;
        } else {
          level.dustMotes = false;
        }
        this.onChanged?.();
      });

      this.addCheckboxField(body, 'waterDrips', level.waterDrips ?? false, (val) => {
        if (!val) {
          delete level.waterDrips;
        } else {
          level.waterDrips = true;
        }
        this.onChanged?.();
      });
    });

    this.addCollapsibleSection('Defaults', 'defaults', (body) => {
      const defaults = level.defaults;

      this.addOptionalDropdownField(body, 'wallTexture', defaults?.wallTexture, WALL_TEXTURES, (val) => {
        if (!level.defaults) level.defaults = {};
        if (val === undefined) {
          delete level.defaults.wallTexture;
        } else {
          level.defaults.wallTexture = val;
        }
        this.onChanged?.();
      }, 'wall');

      this.addOptionalDropdownField(body, 'floorTexture', defaults?.floorTexture, FLOOR_TEXTURES, (val) => {
        if (!level.defaults) level.defaults = {};
        if (val === undefined) {
          delete level.defaults.floorTexture;
        } else {
          level.defaults.floorTexture = val;
        }
        this.onChanged?.();
      }, 'floor');

      this.addOptionalDropdownField(body, 'ceilingTexture', defaults?.ceilingTexture, CEILING_TEXTURES, (val) => {
        if (!level.defaults) level.defaults = {};
        if (val === undefined) {
          delete level.defaults.ceilingTexture;
        } else {
          level.defaults.ceilingTexture = val;
        }
        this.onChanged?.();
      }, 'ceiling');
    });

    this.addCollapsibleSection('CharDefs', 'charDefs', (body) => {
      if (!level.charDefs) level.charDefs = [];
      const charDefs = level.charDefs;

      for (let i = 0; i < charDefs.length; i++) {
        const def = charDefs[i];
        this.buildCharDefEntry(body, def, i, charDefs);
      }

      const addBtn = document.createElement('button');
      addBtn.className = 'btn-add';
      addBtn.textContent = 'Add CharDef';
      addBtn.addEventListener('click', () => {
        this.onBeforeDiscreteChange?.();
        charDefs.push({ char: '?', solid: false });
        this.onChanged?.();
        this.refresh();
      });
      body.appendChild(addBtn);
    });

    this.addCollapsibleSection('Areas', 'areas', (body) => {
      if (!level.areas) level.areas = [];
      const areas = level.areas;

      for (let i = 0; i < areas.length; i++) {
        const area = areas[i];
        this.buildAreaEntry(body, area, i, areas);
      }

      const addBtn = document.createElement('button');
      addBtn.className = 'btn-add';
      addBtn.textContent = 'Add Area';
      addBtn.addEventListener('click', () => {
        this.onBeforeDiscreteChange?.();
        areas.push({ fromCol: 0, toCol: 0, fromRow: 0, toRow: 0 });
        this.onChanged?.();
        this.refresh();
      });
      body.appendChild(addBtn);
    });
  }

  private buildCharDefEntry(
    parent: HTMLElement,
    def: CharDef,
    index: number,
    charDefs: CharDef[]
  ): void {
    const entry = document.createElement('div');
    entry.className = 'props-array-entry';

    const isDuplicate = charDefs.some((d, j) => j !== index && d.char === def.char);
    const textureParts: string[] = [];
    if (def.wallTexture) textureParts.push(def.wallTexture);
    if (def.floorTexture) textureParts.push(def.floorTexture);
    const textureInfo = textureParts.length > 0 ? `, ${textureParts.join('/')}` : '';
    const errorTag = isDuplicate ? ' [DUPLICATE]' : '';
    const summary = `'${def.char}' \u2014 ${def.solid ? 'solid' : 'walkable'}${textureInfo}${errorTag}`;

    const summaryRow = document.createElement('div');
    summaryRow.className = 'props-array-summary';

    const summaryText = document.createElement('span');
    summaryText.textContent = summary;
    if (isDuplicate) summaryText.style.color = '#cc6666';
    summaryRow.appendChild(summaryText);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onBeforeDiscreteChange?.();
      charDefs.splice(index, 1);
      this.expandedCharDefs.delete(index);
      this.onChanged?.();
      this.refresh();
    });
    summaryRow.appendChild(removeBtn);

    summaryRow.addEventListener('click', () => {
      if (this.expandedCharDefs.has(index)) {
        this.expandedCharDefs.delete(index);
      } else {
        this.expandedCharDefs.add(index);
      }
      this.refresh();
    });

    entry.appendChild(summaryRow);

    if (this.expandedCharDefs.has(index)) {
      const detail = document.createElement('div');
      detail.className = 'props-array-detail';

      this.addTextField(detail, 'char', def.char, (val) => {
        const ch = val.slice(0, 1);
        if (!ch) return;
        const isDuplicate = charDefs.some((d, j) => j !== index && d.char === ch);
        if (isDuplicate) return;
        def.char = ch;
        this.onChanged?.();
        this.refresh();
      }, 1);

      this.addCheckboxField(detail, 'solid', def.solid, (val) => {
        def.solid = val;
        this.onChanged?.();
        this.refresh();
      });

      this.addOptionalDropdownField(detail, 'wallTexture', def.wallTexture, WALL_TEXTURES, (val) => {
        if (val === undefined) {
          delete def.wallTexture;
        } else {
          def.wallTexture = val;
        }
        this.onChanged?.();
        this.refresh();
      }, 'wall');

      this.addOptionalDropdownField(detail, 'floorTexture', def.floorTexture, FLOOR_TEXTURES, (val) => {
        if (val === undefined) {
          delete def.floorTexture;
        } else {
          def.floorTexture = val;
        }
        this.onChanged?.();
        this.refresh();
      }, 'floor');

      this.addOptionalDropdownField(detail, 'ceilingTexture', def.ceilingTexture, CEILING_TEXTURES, (val) => {
        if (val === undefined) {
          delete def.ceilingTexture;
        } else {
          def.ceilingTexture = val;
        }
        this.onChanged?.();
        this.refresh();
      }, 'ceiling');

      entry.appendChild(detail);
    }

    parent.appendChild(entry);
  }

  private buildAreaEntry(
    parent: HTMLElement,
    area: TextureArea,
    index: number,
    areas: TextureArea[]
  ): void {
    const entry = document.createElement('div');
    entry.className = 'props-array-entry';

    const summary = `Area ${index} (${area.fromCol},${area.fromRow})\u2192(${area.toCol},${area.toRow})`;

    const summaryRow = document.createElement('div');
    summaryRow.className = 'props-array-summary';

    const summaryText = document.createElement('span');
    summaryText.textContent = summary;
    summaryRow.appendChild(summaryText);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onBeforeDiscreteChange?.();
      areas.splice(index, 1);
      this.expandedAreas.delete(index);
      this.onChanged?.();
      this.refresh();
    });
    summaryRow.appendChild(removeBtn);

    summaryRow.addEventListener('click', () => {
      if (this.expandedAreas.has(index)) {
        this.expandedAreas.delete(index);
      } else {
        this.expandedAreas.add(index);
      }
      this.refresh();
    });

    entry.appendChild(summaryRow);

    if (this.expandedAreas.has(index)) {
      const detail = document.createElement('div');
      detail.className = 'props-array-detail';

      // From corner: fromCol, fromRow + pick button
      this.addCoordPairField(detail, 'from', area.fromCol, area.fromRow, (col, row) => {
        area.fromCol = col;
        area.fromRow = row;
        this.onChanged?.();
        this.refresh();
      });

      // To corner: toCol, toRow + pick button
      this.addCoordPairField(detail, 'to', area.toCol, area.toRow, (col, row) => {
        area.toCol = col;
        area.toRow = row;
        this.onChanged?.();
        this.refresh();
      });

      this.addOptionalDropdownField(detail, 'wallTexture', area.wallTexture, WALL_TEXTURES, (val) => {
        if (val === undefined) {
          delete area.wallTexture;
        } else {
          area.wallTexture = val;
        }
        this.onChanged?.();
        this.refresh();
      }, 'wall');

      this.addOptionalDropdownField(detail, 'floorTexture', area.floorTexture, FLOOR_TEXTURES, (val) => {
        if (val === undefined) {
          delete area.floorTexture;
        } else {
          area.floorTexture = val;
        }
        this.onChanged?.();
        this.refresh();
      }, 'floor');

      this.addOptionalDropdownField(detail, 'ceilingTexture', area.ceilingTexture, CEILING_TEXTURES, (val) => {
        if (val === undefined) {
          delete area.ceilingTexture;
        } else {
          area.ceilingTexture = val;
        }
        this.onChanged?.();
        this.refresh();
      }, 'ceiling');

      entry.appendChild(detail);
    }

    parent.appendChild(entry);
  }

  private addCollapsibleSection(
    title: string,
    key: string,
    buildContent: (body: HTMLElement) => void
  ): void {
    const expanded = this.expandedSections.has(key);

    const section = document.createElement('div');
    section.className = 'props-section';

    const header = document.createElement('div');
    header.className = 'props-section-header';
    header.textContent = `${expanded ? '\u25bc' : '\u25b6'} ${title}`;
    header.addEventListener('click', () => {
      if (this.expandedSections.has(key)) {
        this.expandedSections.delete(key);
      } else {
        this.expandedSections.add(key);
      }
      this.refresh();
    });
    section.appendChild(header);

    if (expanded) {
      const body = document.createElement('div');
      body.className = 'props-section-body';
      buildContent(body);
      section.appendChild(body);
    }

    this.container.appendChild(section);
  }

  private addTextField(
    parent: HTMLElement,
    label: string,
    value: string,
    onChange: (val: string) => void,
    maxLength?: number
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    if (maxLength !== undefined) input.maxLength = maxLength;
    input.addEventListener('input', () => {
      this.onBeginTextEdit?.();
      onChange(input.value);
    });
    input.addEventListener('blur', () => this.onCommitTextEdit?.());
    wrapper.appendChild(input);

    parent.appendChild(wrapper);
  }

  private addNumberField(
    parent: HTMLElement,
    label: string,
    value: number,
    onChange: (val: number) => void
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.addEventListener('input', () => {
      this.onBeginTextEdit?.();
      const parsed = parseInt(input.value, 10);
      if (!isNaN(parsed)) onChange(parsed);
    });
    input.addEventListener('blur', () => this.onCommitTextEdit?.());
    wrapper.appendChild(input);

    parent.appendChild(wrapper);
  }

  private addDropdownField(
    parent: HTMLElement,
    label: string,
    value: string,
    options: readonly string[],
    onChange: (val: string) => void
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const select = document.createElement('select');
    for (const opt of options) {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      if (opt === value) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener('change', () => {
      this.onBeforeDiscreteChange?.();
      onChange(select.value);
    });
    wrapper.appendChild(select);

    parent.appendChild(wrapper);
  }

  private addCheckboxField(
    parent: HTMLElement,
    label: string,
    checked: boolean,
    onChange: (val: boolean) => void
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field checkbox-field';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.style.width = 'auto';
    input.addEventListener('change', () => {
      this.onBeforeDiscreteChange?.();
      onChange(input.checked);
    });
    wrapper.appendChild(input);

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    parent.appendChild(wrapper);
  }

  private addOptionalDropdownField(
    parent: HTMLElement,
    label: string,
    value: string | undefined,
    options: readonly string[],
    onChange: (val: string | undefined) => void,
    textureCategory?: 'wall' | 'floor' | 'ceiling'
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    if (textureCategory) {
      this.buildTextureDropdown(wrapper, value, options, onChange, textureCategory);
    } else {
      const select = document.createElement('select');

      const noneOption = document.createElement('option');
      noneOption.value = 'none';
      noneOption.textContent = 'none';
      if (value === undefined) noneOption.selected = true;
      select.appendChild(noneOption);

      for (const opt of options) {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (opt === value) option.selected = true;
        select.appendChild(option);
      }

      select.addEventListener('change', () => {
        this.onBeforeDiscreteChange?.();
        onChange(select.value === 'none' ? undefined : select.value);
      });
      wrapper.appendChild(select);
    }

    parent.appendChild(wrapper);
  }

  private buildTextureDropdown(
    wrapper: HTMLElement,
    value: string | undefined,
    options: readonly string[],
    onChange: (val: string | undefined) => void,
    category: 'wall' | 'floor' | 'ceiling'
  ): void {
    const allValues: (string | undefined)[] = [undefined, ...options];
    const container = document.createElement('div');
    container.className = 'tex-dropdown';

    // Selected display (trigger button)
    const trigger = document.createElement('div');
    trigger.className = 'tex-dropdown-trigger';
    const triggerSwatch = this.createSwatch(category, value);
    const triggerText = document.createElement('span');
    triggerText.textContent = value ?? 'none';
    trigger.appendChild(triggerSwatch);
    trigger.appendChild(triggerText);
    container.appendChild(trigger);

    // Dropdown panel
    const panel = document.createElement('div');
    panel.className = 'tex-dropdown-panel';

    for (const opt of allValues) {
      const row = document.createElement('div');
      row.className = 'tex-dropdown-option';
      if (opt === value) row.classList.add('selected');

      const swatch = this.createSwatch(category, opt);
      const name = document.createElement('span');
      name.textContent = opt ?? 'none';
      row.appendChild(swatch);
      row.appendChild(name);

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onBeforeDiscreteChange?.();
        // Update trigger display
        triggerSwatch.replaceWith(this.createSwatch(category, opt));
        triggerText.textContent = opt ?? 'none';
        panel.classList.remove('open');
        onChange(opt);
      });

      panel.appendChild(row);
    }
    container.appendChild(panel);

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close any other open tex-dropdown panels first
      document.querySelectorAll('.tex-dropdown-panel.open').forEach((p) => {
        if (p !== panel) p.classList.remove('open');
      });
      panel.classList.toggle('open');
    });

    // Close on outside click
    const closeHandler = (e: MouseEvent) => {
      if (!container.contains(e.target as Node)) {
        panel.classList.remove('open');
      }
    };
    document.addEventListener('click', closeHandler);
    // Clean up when the panel is removed from DOM (on refresh)
    const observer = new MutationObserver(() => {
      if (!container.isConnected) {
        document.removeEventListener('click', closeHandler);
        observer.disconnect();
      }
    });
    observer.observe(this.container, { childList: true, subtree: true });

    wrapper.appendChild(container);
  }

  private createSwatch(
    category: 'wall' | 'floor' | 'ceiling',
    textureName: string | undefined
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = 'tex-swatch';
    canvas.width = 20;
    canvas.height = 20;
    this.drawSwatch(canvas, category, textureName);
    return canvas;
  }

  private drawSwatch(
    canvas: HTMLCanvasElement,
    category: 'wall' | 'floor' | 'ceiling',
    textureName: string | undefined
  ): void {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 20, 20);

    if (!textureName) {
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, 20, 20);
      ctx.strokeStyle = '#882222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, 4); ctx.lineTo(16, 16);
      ctx.moveTo(16, 4); ctx.lineTo(4, 16);
      ctx.stroke();
      return;
    }

    let source: HTMLCanvasElement;
    if (category === 'wall') {
      source = getWallTexture(textureName as WallTextureName).image as HTMLCanvasElement;
    } else if (category === 'floor') {
      source = getFloorTexture(textureName as FloorTextureName).image as HTMLCanvasElement;
    } else {
      source = getCeilingTexture(textureName as CeilingTextureName).image as HTMLCanvasElement;
    }

    ctx.drawImage(source, 0, 0, 20, 20);
  }

  private addCoordPairField(
    parent: HTMLElement,
    label: string,
    col: number,
    row: number,
    onChange: (col: number, row: number) => void
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field coord-pair-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const row_ = document.createElement('div');
    row_.className = 'coord-pair-row';

    const colInput = document.createElement('input');
    colInput.type = 'number';
    colInput.value = String(col);
    colInput.title = 'col';
    colInput.addEventListener('input', () => {
      this.onBeginTextEdit?.();
      const v = parseInt(colInput.value, 10);
      if (!isNaN(v)) onChange(v, parseInt(rowInput.value, 10) || 0);
    });
    colInput.addEventListener('blur', () => this.onCommitTextEdit?.());
    row_.appendChild(colInput);

    const sep = document.createElement('span');
    sep.textContent = ',';
    sep.className = 'coord-sep';
    row_.appendChild(sep);

    const rowInput = document.createElement('input');
    rowInput.type = 'number';
    rowInput.value = String(row);
    rowInput.title = 'row';
    rowInput.addEventListener('input', () => {
      this.onBeginTextEdit?.();
      const v = parseInt(rowInput.value, 10);
      if (!isNaN(v)) onChange(parseInt(colInput.value, 10) || 0, v);
    });
    rowInput.addEventListener('blur', () => this.onCommitTextEdit?.());
    row_.appendChild(rowInput);

    const isPicking = this.app.coordPickCallback !== null;
    const pickBtn = document.createElement('button');
    pickBtn.className = isPicking ? 'btn-pick active' : 'btn-pick';
    pickBtn.textContent = isPicking ? '...' : 'Pick';
    pickBtn.addEventListener('click', () => {
      this.app.coordPickCallback = (c, r) => {
        this.onBeforeDiscreteChange?.();
        onChange(c, r);
      };
    });
    row_.appendChild(pickBtn);

    wrapper.appendChild(row_);
    parent.appendChild(wrapper);
  }
}
