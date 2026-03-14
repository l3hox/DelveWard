import type { CharDef, TextureArea } from '../core/types';
import type { EditorApp } from './EditorApp';
import { WALL_TEXTURES, FLOOR_TEXTURES, CEILING_TEXTURES } from '../core/textureNames';

export class LevelProperties {
  private container: HTMLElement;
  private app: EditorApp;
  private onChanged: (() => void) | null = null;

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
      });

      this.addOptionalDropdownField(body, 'floorTexture', defaults?.floorTexture, FLOOR_TEXTURES, (val) => {
        if (!level.defaults) level.defaults = {};
        if (val === undefined) {
          delete level.defaults.floorTexture;
        } else {
          level.defaults.floorTexture = val;
        }
        this.onChanged?.();
      });

      this.addOptionalDropdownField(body, 'ceilingTexture', defaults?.ceilingTexture, CEILING_TEXTURES, (val) => {
        if (!level.defaults) level.defaults = {};
        if (val === undefined) {
          delete level.defaults.ceilingTexture;
        } else {
          level.defaults.ceilingTexture = val;
        }
        this.onChanged?.();
      });
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
      });

      this.addOptionalDropdownField(detail, 'floorTexture', def.floorTexture, FLOOR_TEXTURES, (val) => {
        if (val === undefined) {
          delete def.floorTexture;
        } else {
          def.floorTexture = val;
        }
        this.onChanged?.();
        this.refresh();
      });

      this.addOptionalDropdownField(detail, 'ceilingTexture', def.ceilingTexture, CEILING_TEXTURES, (val) => {
        if (val === undefined) {
          delete def.ceilingTexture;
        } else {
          def.ceilingTexture = val;
        }
        this.onChanged?.();
        this.refresh();
      });

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

      this.addNumberField(detail, 'fromCol', area.fromCol, (val) => {
        area.fromCol = val;
        this.onChanged?.();
        this.refresh();
      });

      this.addNumberField(detail, 'toCol', area.toCol, (val) => {
        area.toCol = val;
        this.onChanged?.();
        this.refresh();
      });

      this.addNumberField(detail, 'fromRow', area.fromRow, (val) => {
        area.fromRow = val;
        this.onChanged?.();
        this.refresh();
      });

      this.addNumberField(detail, 'toRow', area.toRow, (val) => {
        area.toRow = val;
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
      });

      this.addOptionalDropdownField(detail, 'floorTexture', area.floorTexture, FLOOR_TEXTURES, (val) => {
        if (val === undefined) {
          delete area.floorTexture;
        } else {
          area.floorTexture = val;
        }
        this.onChanged?.();
        this.refresh();
      });

      this.addOptionalDropdownField(detail, 'ceilingTexture', area.ceilingTexture, CEILING_TEXTURES, (val) => {
        if (val === undefined) {
          delete area.ceilingTexture;
        } else {
          area.ceilingTexture = val;
        }
        this.onChanged?.();
        this.refresh();
      });

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
    input.addEventListener('input', () => onChange(input.value));
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
      const parsed = parseInt(input.value, 10);
      if (!isNaN(parsed)) onChange(parsed);
    });
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
    select.addEventListener('change', () => onChange(select.value));
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
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.style.width = 'auto';
    input.addEventListener('change', () => onChange(input.checked));
    wrapper.appendChild(input);

    parent.appendChild(wrapper);
  }

  private addOptionalDropdownField(
    parent: HTMLElement,
    label: string,
    value: string | undefined,
    options: readonly string[],
    onChange: (val: string | undefined) => void
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

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
      onChange(select.value === 'none' ? undefined : select.value);
    });
    wrapper.appendChild(select);

    parent.appendChild(wrapper);
  }
}
