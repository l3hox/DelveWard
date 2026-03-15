import type { Entity } from '../core/types';
import type { EditorApp } from './EditorApp';
import { ENEMY_DEFS } from '../enemies/enemyTypes';
import { itemDatabase, type ItemDef } from '../core/itemDatabase';
import { getItemImage } from '../rendering/itemSprites';

const enemySpriteCache = new Map<string, HTMLImageElement>();
function getEnemySpriteImage(type: string): HTMLImageElement | null {
  const cached = enemySpriteCache.get(type);
  if (cached) return cached.complete ? cached : null;
  const img = new Image();
  img.src = `/sprites/${type}.png`;
  enemySpriteCache.set(type, img);
  return null;
}

export class Inspector {
  private container: HTMLElement;
  private app: EditorApp;
  private onEntityChanged: (() => void) | null = null;
  private onDelete: (() => void) | null = null;
  private onPickRequested: ((entity: Entity, field: string, validChar?: string, validEntityType?: string) => void) | null = null;
  private onRefClicked: ((entity: Entity) => void) | null = null;
  private onBeforeDiscreteChange: (() => void) | null = null;
  private onBeginTextEdit: (() => void) | null = null;
  private onCommitTextEdit: (() => void) | null = null;

  constructor(container: HTMLElement, app: EditorApp) {
    this.container = container;
    this.app = app;
  }

  setEntityChangedCallback(cb: () => void): void {
    this.onEntityChanged = cb;
  }

  setDeleteCallback(cb: () => void): void {
    this.onDelete = cb;
  }

  setPickRequestedCallback(cb: (entity: Entity, field: string, validChar?: string, validEntityType?: string) => void): void {
    this.onPickRequested = cb;
  }

  setRefClickedCallback(cb: (entity: Entity) => void): void {
    this.onRefClicked = cb;
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

    const entity = this.app.selectedEntity;
    if (!entity) {
      const placeholder = document.createElement('div');
      placeholder.className = 'inspector-placeholder';
      placeholder.textContent = 'No entity selected';
      this.container.appendChild(placeholder);
      return;
    }

    const header = document.createElement('div');
    header.className = 'inspector-header';
    header.textContent = `${entity.type} @ (${entity.col}, ${entity.row})`;
    this.container.appendChild(header);

    if (entity.id) {
      const idLabel = document.createElement('div');
      idLabel.className = 'inspector-id';
      idLabel.textContent = `id: ${entity.id}`;
      this.container.appendChild(idLabel);
    }

    this.buildFields(entity);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = 'Delete Entity';
    deleteBtn.addEventListener('click', () => this.onDelete?.());
    this.container.appendChild(deleteBtn);
  }

  private buildFields(entity: Entity): void {
    switch (entity.type) {
      case 'door': {
        const state = (entity.state as string) ?? 'closed';
        this.addDropdownField('state', state, ['open', 'closed'], (val) => {
          entity.state = val;
          this.onEntityChanged?.();
          this.refresh();
        });
        this.addPickableField('keyId', (entity.keyId as string) ?? '', entity, 'keyId', (val) => {
          entity.keyId = val;
          this.onEntityChanged?.();
        }, undefined, 'key');
        const refs = [
          ...this.app.getReferencingEntities(entity),
          ...this.app.getKeyIdPeers(entity).filter(e => e.type === 'key'),
        ];
        if (refs.length > 0) {
          const refHeader = document.createElement('div');
          refHeader.className = 'inspector-ref-header';
          refHeader.textContent = `Referenced by (${refs.length})`;
          this.container.appendChild(refHeader);
          for (const ref of refs) {
            const refItem = document.createElement('div');
            refItem.className = 'inspector-ref-item';
            refItem.textContent = `${ref.type} @ (${ref.col}, ${ref.row})`;
            refItem.addEventListener('click', () => this.onRefClicked?.(ref));
            this.container.appendChild(refItem);
          }
        }
        break;
      }

      case 'key': {
        this.addPickableField('keyId', (entity.keyId as string) ?? '', entity, 'keyId', (val) => {
          entity.keyId = val;
          this.onEntityChanged?.();
        }, undefined, 'door');
        const keyPeers = this.app.getKeyIdPeers(entity).filter(e => e.type === 'door');
        if (keyPeers.length > 0) {
          const unlockHeader = document.createElement('div');
          unlockHeader.className = 'inspector-ref-header';
          unlockHeader.textContent = `Unlocks (${keyPeers.length})`;
          this.container.appendChild(unlockHeader);
          for (const peer of keyPeers) {
            const peerItem = document.createElement('div');
            peerItem.className = 'inspector-ref-item';
            peerItem.textContent = `${peer.type} @ (${peer.col}, ${peer.row})`;
            peerItem.addEventListener('click', () => this.onRefClicked?.(peer));
            this.container.appendChild(peerItem);
          }
        }
        break;
      }

      case 'lever':
        this.addDropdownField('wall', (entity.wall as string) ?? 'N', ['N', 'S', 'E', 'W'], (val) => {
          entity.wall = val;
          this.onEntityChanged?.();
        });
        this.addPickableField('target', (entity.target as string) ?? '', entity, 'target', (val) => {
          entity.target = val;
          this.onEntityChanged?.();
        }, undefined, 'door');
        break;

      case 'pressure_plate':
        this.addPickableField('target', (entity.target as string) ?? '', entity, 'target', (val) => {
          entity.target = val;
          this.onEntityChanged?.();
        }, undefined, 'door');
        break;

      case 'torch_sconce':
        this.addDropdownField('wall', (entity.wall as string) ?? 'N', ['N', 'S', 'E', 'W'], (val) => {
          entity.wall = val;
          this.onEntityChanged?.();
        });
        break;

      case 'enemy': {
        const enemyType = (entity.enemyType as string) ?? Object.keys(ENEMY_DEFS)[0] ?? '';
        this.addEnemyTypeDropdown(entity, enemyType);
        const def = ENEMY_DEFS[enemyType];
        if (def) {
          this.addEnemyDetails(def);
        }
        break;
      }

      case 'equipment':
        this.addItemDropdown(entity, 'equipment');
        break;

      case 'consumable':
        this.addItemDropdown(entity, 'consumable');
        break;

      case 'stairs':
        this.addDropdownField('direction', (entity.direction as string) ?? 'down', ['up', 'down'], (val) => {
          entity.direction = val;
          this.onEntityChanged?.();
        });
        this.addTextField('targetLevel', (entity.targetLevel as string) ?? '', (val) => {
          entity.targetLevel = val;
          this.onEntityChanged?.();
        });
        this.addNumberField('targetCol', (entity.targetCol as number) ?? 0, (val) => {
          entity.targetCol = val;
          this.onEntityChanged?.();
        });
        this.addNumberField('targetRow', (entity.targetRow as number) ?? 0, (val) => {
          entity.targetRow = val;
          this.onEntityChanged?.();
        });
        break;
    }
  }

  private addDropdownField(
    label: string,
    value: string,
    options: string[],
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

    this.container.appendChild(wrapper);
  }

  private addTextField(
    label: string,
    value: string,
    onChange: (val: string) => void
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.addEventListener('input', () => {
      this.onBeginTextEdit?.();
      onChange(input.value);
    });
    input.addEventListener('blur', () => this.onCommitTextEdit?.());
    wrapper.appendChild(input);

    this.container.appendChild(wrapper);
  }

  private addNumberField(
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

    this.container.appendChild(wrapper);
  }

  private addPickableField(
    label: string,
    value: string,
    entity: Entity,
    field: string,
    onChange: (val: string) => void,
    validChar?: string,
    validEntityType?: string,
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '4px';

    const input = document.createElement('input');
    input.type = 'text';
    input.style.flex = '1';
    input.value = value;
    input.addEventListener('input', () => {
      this.onBeginTextEdit?.();
      onChange(input.value);
    });
    input.addEventListener('blur', () => this.onCommitTextEdit?.());
    row.appendChild(input);

    const pickBtn = document.createElement('button');
    const isPickingThis =
      this.app.pickMode !== null &&
      this.app.pickMode.entity === entity &&
      this.app.pickMode.field === field;
    pickBtn.className = isPickingThis ? 'btn-pick active' : 'btn-pick';
    pickBtn.textContent = isPickingThis ? 'Picking...' : 'Pick';
    pickBtn.addEventListener('click', () => this.onPickRequested?.(entity, field, validChar, validEntityType));
    row.appendChild(pickBtn);

    wrapper.appendChild(row);
    this.container.appendChild(wrapper);
  }

  private addEnemyTypeDropdown(entity: Entity, currentType: string): void {
    const types = Object.keys(ENEMY_DEFS);

    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = 'enemyType';
    wrapper.appendChild(lbl);

    const container = document.createElement('div');
    container.className = 'tex-dropdown';

    // Trigger
    const trigger = document.createElement('div');
    trigger.className = 'tex-dropdown-trigger';
    const triggerSwatch = this.createEnemySwatch(currentType);
    const triggerText = document.createElement('span');
    triggerText.textContent = currentType;
    trigger.appendChild(triggerSwatch);
    trigger.appendChild(triggerText);
    container.appendChild(trigger);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'tex-dropdown-panel';

    for (const type of types) {
      const row = document.createElement('div');
      row.className = 'tex-dropdown-option';
      if (type === currentType) row.classList.add('selected');

      const swatch = this.createEnemySwatch(type);
      const name = document.createElement('span');
      name.textContent = type;
      row.appendChild(swatch);
      row.appendChild(name);

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onBeforeDiscreteChange?.();
        entity.enemyType = type;
        panel.classList.remove('open');
        this.onEntityChanged?.();
        this.refresh();
      });

      panel.appendChild(row);
    }

    container.appendChild(panel);

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.tex-dropdown-panel.open').forEach((p) => {
        if (p !== panel) p.classList.remove('open');
      });
      panel.classList.toggle('open');
    });

    const closeHandler = (e: MouseEvent) => {
      if (!container.contains(e.target as Node)) {
        panel.classList.remove('open');
      }
    };
    document.addEventListener('click', closeHandler);
    const observer = new MutationObserver(() => {
      if (!container.isConnected) {
        document.removeEventListener('click', closeHandler);
        observer.disconnect();
      }
    });
    observer.observe(this.container, { childList: true, subtree: true });

    wrapper.appendChild(container);
    this.container.appendChild(wrapper);
  }

  private createEnemySwatch(type: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = 'tex-swatch';
    canvas.width = 20;
    canvas.height = 20;
    const ctx = canvas.getContext('2d')!;
    const img = getEnemySpriteImage(type);
    if (img) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, 20, 20);
    } else {
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, 20, 20);
    }
    return canvas;
  }

  private addEnemyDetails(def: import('../enemies/enemyTypes').EnemyDef): void {
    const section = document.createElement('div');
    section.className = 'item-details';

    this.addSpritePreview(section, `/sprites/${def.type}.png`, 1);

    this.addReadonlyField(section, 'hp', String(def.maxHp));
    this.addReadonlyField(section, 'atk / def', `${def.atk} / ${def.def}`);
    this.addReadonlyField(section, 'aggro range', String(def.aggroRange));
    this.addReadonlyField(section, 'move interval', `${def.moveInterval}s`);
    this.addReadonlyField(section, 'xp', String(def.xp));

    this.container.appendChild(section);
  }

  private addItemDropdown(entity: Entity, entityType: 'equipment' | 'consumable'): void {
    const currentId = (entity.itemId as string) ?? '';

    if (!itemDatabase.isLoaded()) {
      // Fallback to plain text field if database not loaded
      this.addTextField('itemId', currentId, (val) => {
        entity.itemId = val;
        this.onEntityChanged?.();
      });
      return;
    }

    const items = itemDatabase.getAllItems().filter((item) => {
      if (entityType === 'consumable') return item.type === 'consumable';
      return item.type !== 'consumable';
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = 'itemId';
    wrapper.appendChild(lbl);

    // Custom dropdown with icons
    const container = document.createElement('div');
    container.className = 'tex-dropdown';

    const currentItem = currentId ? itemDatabase.getItem(currentId) : undefined;

    // Trigger
    const trigger = document.createElement('div');
    trigger.className = 'tex-dropdown-trigger';
    const triggerSwatch = this.createItemSwatch(currentItem?.icon);
    const triggerText = document.createElement('span');
    triggerText.textContent = currentId || '(none)';
    trigger.appendChild(triggerSwatch);
    trigger.appendChild(triggerText);
    container.appendChild(trigger);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'tex-dropdown-panel';

    // "none" option
    const noneRow = document.createElement('div');
    noneRow.className = 'tex-dropdown-option';
    if (!currentId) noneRow.classList.add('selected');
    const noneSwatch = this.createItemSwatch(undefined);
    const noneLabel = document.createElement('span');
    noneLabel.textContent = '(none)';
    noneRow.appendChild(noneSwatch);
    noneRow.appendChild(noneLabel);
    noneRow.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onBeforeDiscreteChange?.();
      entity.itemId = '';
      triggerSwatch.replaceWith(this.createItemSwatch(undefined));
      triggerText.textContent = '(none)';
      panel.classList.remove('open');
      this.onEntityChanged?.();
      this.refresh();
    });
    panel.appendChild(noneRow);

    // Group items by subtype
    const groups = new Map<string, ItemDef[]>();
    for (const item of items) {
      if (!groups.has(item.subtype)) groups.set(item.subtype, []);
      groups.get(item.subtype)!.push(item);
    }

    for (const [subtype, groupItems] of groups) {
      const header = document.createElement('div');
      header.className = 'item-ctx-header';
      header.textContent = subtype.replace(/_/g, ' ');
      panel.appendChild(header);

      for (const item of groupItems) {
        const row = document.createElement('div');
        row.className = 'tex-dropdown-option';
        if (item.id === currentId) row.classList.add('selected');

        const swatch = this.createItemSwatch(item.icon);
        const name = document.createElement('span');
        name.textContent = `${item.name} (${item.id})`;
        row.appendChild(swatch);
        row.appendChild(name);

        row.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onBeforeDiscreteChange?.();
          entity.itemId = item.id;
          triggerSwatch.replaceWith(this.createItemSwatch(item.icon));
          triggerText.textContent = item.id;
          panel.classList.remove('open');
          this.onEntityChanged?.();
          this.refresh();
        });

        panel.appendChild(row);
      }
    }

    container.appendChild(panel);

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.tex-dropdown-panel.open').forEach((p) => {
        if (p !== panel) p.classList.remove('open');
      });
      panel.classList.toggle('open');
    });

    const closeHandler = (e: MouseEvent) => {
      if (!container.contains(e.target as Node)) {
        panel.classList.remove('open');
      }
    };
    document.addEventListener('click', closeHandler);
    const observer = new MutationObserver(() => {
      if (!container.isConnected) {
        document.removeEventListener('click', closeHandler);
        observer.disconnect();
      }
    });
    observer.observe(this.container, { childList: true, subtree: true });

    wrapper.appendChild(container);
    this.container.appendChild(wrapper);

    // Show item details below
    if (currentItem) {
      this.addItemDetails(currentItem);
    }
  }

  private createItemSwatch(icon: string | undefined): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = 'tex-swatch';
    canvas.width = 20;
    canvas.height = 20;
    const ctx = canvas.getContext('2d')!;
    if (!icon) {
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, 20, 20);
      ctx.strokeStyle = '#882222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, 4); ctx.lineTo(16, 16);
      ctx.moveTo(16, 4); ctx.lineTo(4, 16);
      ctx.stroke();
      return canvas;
    }
    const img = getItemImage(icon);
    if (img) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, 20, 20);
    } else {
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, 20, 20);
    }
    return canvas;
  }

  private addItemDetails(item: ItemDef): void {
    const section = document.createElement('div');
    section.className = 'item-details';

    this.addSpritePreview(section, `/sprites/items/${item.icon}.png`);

    this.addReadonlyField(section, 'name', item.name);
    this.addReadonlyField(section, 'type', `${item.type} / ${item.subtype}`);
    this.addReadonlyField(section, 'quality', item.quality);

    if (item.description) {
      this.addReadonlyField(section, 'description', item.description);
    }

    // Stats
    const statEntries = Object.entries(item.stats).filter(([, v]) => v !== undefined && v !== 0);
    if (statEntries.length > 0) {
      this.addReadonlyField(section, 'stats', statEntries.map(([k, v]) => `${k}: ${v}`).join(', '));
    }

    // Requirements
    const reqEntries = Object.entries(item.requirements).filter(([, v]) => v !== undefined && v !== 0);
    if (reqEntries.length > 0) {
      this.addReadonlyField(section, 'requires', reqEntries.map(([k, v]) => `${k}: ${v}`).join(', '));
    }

    // Modifiers
    if (item.modifiers.length > 0) {
      this.addReadonlyField(section, 'modifiers', item.modifiers.map((m) => `${m.name}: ${m.effect}`).join('; '));
    }

    // Weight & value
    this.addReadonlyField(section, 'weight / value', `${item.weight} / ${item.value}g`);

    // Consumable-specific
    if (item.stackable) {
      this.addReadonlyField(section, 'stackable', `max ${item.stackMax ?? '?'}`);
    }
    if (item.effect) {
      const effects: string[] = [];
      if (item.effect.torchFuel) effects.push(`torch fuel: ${item.effect.torchFuel}`);
      if (item.effect.curePoison) effects.push('cures poison');
      if (effects.length > 0) {
        this.addReadonlyField(section, 'effect', effects.join(', '));
      }
    }

    this.container.appendChild(section);
  }

  private addSpritePreview(parent: HTMLElement, src: string, scale: number = 2): void {
    const img = document.createElement('img');
    img.src = src;
    img.className = 'sprite-preview';
    img.onload = () => {
      img.style.width = `${img.naturalWidth * scale}px`;
      img.style.height = `${img.naturalHeight * scale}px`;
    };
    parent.appendChild(img);
  }

  private addReadonlyField(parent: HTMLElement, label: string, value: string): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field readonly-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const val = document.createElement('div');
    val.className = 'readonly-value';
    val.textContent = value;
    wrapper.appendChild(val);

    parent.appendChild(wrapper);
  }
}
