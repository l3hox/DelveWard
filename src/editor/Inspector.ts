import type { Entity } from '../core/types';
import type { EditorApp } from './EditorApp';
import { enemyDatabase } from '../enemies/enemyDatabase';
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
  private onStairGoTo: ((targetId: string) => void) | null = null;
  private onRefHovered: ((entity: Entity | null) => void) | null = null;

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

  setStairGoToCallback(cb: (targetId: string) => void): void {
    this.onStairGoTo = cb;
  }

  setRefHoveredCallback(cb: (entity: Entity | null) => void): void {
    this.onRefHovered = cb;
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
        this.addReferencedBySection(entity);
        // Only show gateMode when door has multiple incoming connections
        {
          const refs = this.app.getReferencingEntities(entity);
          if (refs.length > 1) {
            this.addDropdownField('gateMode', (entity.gateMode as string) ?? 'or', ['or', 'and', 'xor'], (val) => {
              entity.gateMode = val;
              this.onEntityChanged?.();
            });
          }
        }
        {
          // Also show key peers as references
          const keyPeers = this.app.getKeyIdPeers(entity).filter(e => e.type === 'key');
          if (keyPeers.length > 0) {
            for (const peer of keyPeers) {
              const peerItem = document.createElement('div');
              peerItem.className = 'inspector-ref-item';
              peerItem.textContent = `key @ (${peer.col}, ${peer.row})`;
              peerItem.addEventListener('click', () => this.onRefClicked?.(peer));
              this.attachHoverHighlight(peerItem, peer);
              this.container.appendChild(peerItem);
            }
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
            this.attachHoverHighlight(peerItem, peer);
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
        this.addTargetsArrayField(entity, 'door,gate,trap_launcher');
        this.addSignalModeField(entity, (entity.signalMode as string) ?? 'toggle',
          ['toggle', 'one_shot', 'timed'], (val) => {
            entity.signalMode = val;
            this.onEntityChanged?.();
            this.refresh();
          });
        if ((entity.signalMode as string) === 'timed') {
          this.addNumberField('signalDuration', (entity.signalDuration as number) ?? 3, (val) => {
            entity.signalDuration = val;
            this.onEntityChanged?.();
          }, { step: '0.1' });
        }
        this.addSignalDelayField(entity);
        break;

      case 'pressure_plate':
        this.addTargetsArrayField(entity, 'door,gate,trap_launcher');
        this.addSignalModeField(entity, (entity.signalMode as string) ?? 'toggle',
          ['toggle', 'momentary', 'one_shot', 'timed'], (val) => {
            entity.signalMode = val;
            this.onEntityChanged?.();
            this.refresh();
          });
        if ((entity.signalMode as string) === 'timed') {
          this.addNumberField('signalDuration', (entity.signalDuration as number) ?? 3, (val) => {
            entity.signalDuration = val;
            this.onEntityChanged?.();
          }, { step: '0.1' });
        }
        this.addSignalDelayField(entity);
        break;

      case 'torch_sconce':
        this.addDropdownField('wall', (entity.wall as string) ?? 'N', ['N', 'S', 'E', 'W'], (val) => {
          entity.wall = val;
          this.onEntityChanged?.();
        });
        break;

      case 'enemy': {
        const enemyType = (entity.enemyType as string) ?? enemyDatabase.getAllEnemyIds()[0] ?? '';
        this.addEnemyTypeDropdown(entity, enemyType);
        const def = enemyDatabase.getEnemy(enemyType);
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

      case 'trigger':
        this.addTargetsArrayField(entity, 'door,gate,trap_launcher');
        this.addSignalModeField(entity, (entity.signalMode as string) ?? 'momentary',
          ['toggle', 'momentary', 'one_shot', 'timed'], (val) => {
            entity.signalMode = val;
            this.onEntityChanged?.();
            this.refresh();
          });
        if ((entity.signalMode as string) === 'timed') {
          this.addNumberField('signalDuration', (entity.signalDuration as number) ?? 3, (val) => {
            entity.signalDuration = val;
            this.onEntityChanged?.();
          }, { step: '0.1' });
        }
        this.addSignalDelayField(entity);
        break;

      case 'tripwire':
        this.addTargetsArrayField(entity, 'door,gate,trap_launcher');
        this.addDropdownField('orientation', (entity.orientation as string) ?? 'EW', ['EW', 'NS'], (val) => {
          entity.orientation = val;
          this.onEntityChanged?.();
        });
        this.addNumberField('visibilityThreshold', (entity.visibilityThreshold as number) ?? 8, (val) => {
          entity.visibilityThreshold = val;
          this.onEntityChanged?.();
        });
        this.addSignalDelayField(entity);
        break;

      case 'gate':
        this.addDropdownField('gateType', (entity.gateType as string) ?? 'and',
          ['and', 'or', 'not', 'delay', 'pulse_edge', 'pulse_repeat'], (val) => {
            entity.gateType = val;
            this.onEntityChanged?.();
            this.refresh();
          });
        this.addTargetsArrayField(entity, 'door,gate,trap_launcher');
        if ((entity.gateType as string) === 'delay') {
          this.addNumberField('delay', (entity.delay as number) ?? 1, (val) => {
            entity.delay = val;
            this.onEntityChanged?.();
          }, { step: '0.1' });
        }
        if ((entity.gateType as string) === 'pulse_repeat') {
          this.addNumberField('interval', (entity.interval as number) ?? 1, (val) => {
            entity.interval = val;
            this.onEntityChanged?.();
          }, { step: '0.1' });
        }
        this.addReferencedBySection(entity);
        break;

      case 'trap_launcher':
        this.addDropdownField('facing', (entity.facing as string) ?? 'S',
          ['N', 'S', 'E', 'W'], (val) => {
            entity.facing = val;
            this.onEntityChanged?.();
          });
        this.addDropdownField('projectileType', (entity.projectileType as string) ?? 'dart',
          ['dart', 'arrow', 'fireball'], (val) => {
            entity.projectileType = val;
            this.onEntityChanged?.();
          });
        this.addDropdownField('fireMode', (entity.fireMode as string) ?? 'repeat',
          ['single', 'repeat'], (val) => {
            entity.fireMode = val;
            this.onEntityChanged?.();
            this.refresh();
          });
        this.addNumberField('reloadTime', (entity.reloadTime as number) ?? 3, (val) => {
          entity.reloadTime = val;
          this.onEntityChanged?.();
        }, { step: '0.5', min: '0.5' });
        this.addNumberField('maxRange', (entity.maxRange as number) ?? 20, (val) => {
          entity.maxRange = val;
          this.onEntityChanged?.();
        }, { step: '1', min: '1' });
        this.addReferencedBySection(entity);
        break;

      case 'stairs': {
        this.addDropdownField('direction', (entity.direction as string) ?? 'down', ['up', 'down'], (val) => {
          entity.direction = val;
          this.onEntityChanged?.();
        });
        this.addDropdownField('facing', (entity.facing as string) ?? 'S', ['N', 'S', 'E', 'W'], (val) => {
          entity.facing = val;
          this.onEntityChanged?.();
        });
        this.addPickableField('target', (entity.target as string) ?? '', entity, 'target', (val) => {
          entity.target = val;
          this.onEntityChanged?.();
        }, undefined, 'stairs');
        // "Go to" link for stair target
        const stairTargetId = entity.target as string;
        if (stairTargetId && this.app.dungeon) {
          for (const otherLevel of this.app.dungeon.levels) {
            const targetStair = otherLevel.entities.find(e => e.id === stairTargetId);
            if (targetStair) {
              const goToItem = document.createElement('div');
              goToItem.className = 'inspector-ref-item';
              goToItem.textContent = `stairs @ (${targetStair.col}, ${targetStair.row}) on ${otherLevel.name}`;
              goToItem.title = stairTargetId;
              goToItem.addEventListener('click', () => this.onStairGoTo?.(stairTargetId));
              this.attachHoverHighlight(goToItem, targetStair);
              this.container.appendChild(goToItem);
              break;
            }
          }
        }
        break;
      }

      case 'breakable_wall':
        this.addNumberField('hp', (entity.hp as number) ?? 30, (val) => {
          entity.hp = val;
          this.onEntityChanged?.();
        }, { step: '1', min: '1' });
        break;

      case 'secret_wall': {
        const persistWrapper = document.createElement('div');
        persistWrapper.className = 'inspector-field';
        const persistLbl = document.createElement('label');
        persistLbl.style.display = 'flex';
        persistLbl.style.alignItems = 'center';
        persistLbl.style.gap = '4px';
        const persistCb = document.createElement('input');
        persistCb.type = 'checkbox';
        persistCb.checked = (entity.persistent as boolean) ?? false;
        persistCb.addEventListener('change', () => {
          this.onBeforeDiscreteChange?.();
          entity.persistent = persistCb.checked;
          this.onEntityChanged?.();
        });
        persistLbl.appendChild(persistCb);
        const persistText = document.createElement('span');
        persistText.textContent = 'illusionary (stays visible)';
        persistLbl.appendChild(persistText);
        persistWrapper.appendChild(persistLbl);
        this.container.appendChild(persistWrapper);
        break;
      }

      case 'block':
        // No extra fields beyond type and position
        break;

      case 'chest': {
        this.addDropdownField('state', (entity.state as string) ?? 'closed', ['closed', 'open', 'locked'], (val) => {
          entity.state = val;
          this.onEntityChanged?.();
        });
        this.addPickableField('keyId', (entity.keyId as string) ?? '', entity, 'keyId', (val) => {
          entity.keyId = val;
          this.onEntityChanged?.();
        }, undefined, 'key');
        this.addReferencedBySection(entity);
        {
          const refs = this.app.getReferencingEntities(entity);
          if (refs.length > 1) {
            this.addDropdownField('gateMode', (entity.gateMode as string) ?? 'or', ['or', 'and', 'xor'], (val) => {
              entity.gateMode = val;
              this.onEntityChanged?.();
            });
          }
        }
        break;
      }

      case 'sign':
        this.addDropdownField('wall', (entity.wall as string) ?? 'N', ['N', 'S', 'E', 'W'], (val) => {
          entity.wall = val;
          this.onEntityChanged?.();
        });
        this.addTextareaField('text', (entity.text as string) ?? '', (val) => {
          entity.text = val;
          this.onEntityChanged?.();
        });
        break;
    }
  }

  private addTextareaField(
    label: string,
    value: string,
    onChange: (val: string) => void
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const textarea = document.createElement('textarea');
    textarea.rows = 3;
    textarea.value = value;
    textarea.style.width = '100%';
    textarea.style.boxSizing = 'border-box';
    textarea.style.resize = 'vertical';
    textarea.addEventListener('input', () => {
      this.onBeginTextEdit?.();
      onChange(textarea.value);
    });
    textarea.addEventListener('blur', () => this.onCommitTextEdit?.());
    wrapper.appendChild(textarea);

    this.container.appendChild(wrapper);
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

  private addLabeledDropdownField(
    label: string,
    value: string,
    options: string[],
    labels: string[],
    onChange: (val: string) => void
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const select = document.createElement('select');

    // Empty option
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '(none)';
    if (!value) emptyOpt.selected = true;
    select.appendChild(emptyOpt);

    for (let i = 0; i < options.length; i++) {
      const option = document.createElement('option');
      option.value = options[i];
      option.textContent = labels[i];
      if (options[i] === value) option.selected = true;
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
    onChange: (val: number) => void,
    options?: { step?: string; min?: string },
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    if (options?.step) input.step = options.step;
    if (options?.min) input.min = options.min;
    input.addEventListener('input', () => {
      this.onBeginTextEdit?.();
      const parsed = parseFloat(input.value);
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

  /** Show "Referenced by" section listing entities that target this entity. */
  private addReferencedBySection(entity: Entity): void {
    const refs = this.app.getReferencingEntities(entity);
    if (refs.length === 0) return;
    const refHeader = document.createElement('div');
    refHeader.className = 'inspector-ref-header';
    refHeader.textContent = `Referenced by (${refs.length})`;
    this.container.appendChild(refHeader);
    for (const ref of refs) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '4px';
      row.style.alignItems = 'center';

      const refItem = document.createElement('span');
      refItem.className = 'inspector-ref-item';
      refItem.style.flex = '1';
      refItem.textContent = `${ref.type} @ (${ref.col}, ${ref.row})`;
      refItem.addEventListener('click', () => this.onRefClicked?.(ref));
      this.attachHoverHighlight(refItem, ref);
      row.appendChild(refItem);

      // Remove button: removes this entity's ID from the referencing entity's targets
      const rec = ref as Record<string, unknown>;
      const targets = rec.targets as string[] | undefined;
      if (targets && entity.id && targets.includes(entity.id)) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-pick';
        removeBtn.textContent = '\u00d7';
        removeBtn.style.padding = '0 4px';
        removeBtn.style.minWidth = 'auto';
        removeBtn.addEventListener('click', () => {
          this.onBeforeDiscreteChange?.();
          const idx = targets.indexOf(entity.id!);
          if (idx >= 0) targets.splice(idx, 1);
          this.onEntityChanged?.();
          this.refresh();
        });
        this.attachHoverHighlight(removeBtn, ref);
        row.appendChild(removeBtn);
      }

      this.container.appendChild(row);
    }
  }

  private static SIGNAL_MODE_INFO: Record<string, { label: string; tooltip: string }> = {
    'toggle':    { label: 'toggle', tooltip: 'Each activation flips the signal on/off' },
    'momentary': { label: 'momentary', tooltip: 'Active only while standing on it; deactivates on step-off' },
    'one_shot':  { label: 'one_shot', tooltip: 'Fires once and cannot be re-activated' },
    'timed':     { label: 'timed', tooltip: 'Activates for a set duration, then auto-deactivates' },
  };

  /** Attach mouseenter/mouseleave to highlight an entity on the grid canvas. */
  private attachHoverHighlight(element: HTMLElement, entity: Entity): void {
    element.addEventListener('mouseenter', () => this.onRefHovered?.(entity));
    element.addEventListener('mouseleave', () => this.onRefHovered?.(null));
  }

  /** Signal mode dropdown with display labels and hover tooltips. */
  private addSignalModeField(
    entity: Entity,
    currentValue: string,
    options: string[],
    onChange: (val: string) => void,
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = 'signalMode';
    wrapper.appendChild(lbl);

    const select = document.createElement('select');
    for (const opt of options) {
      const info = Inspector.SIGNAL_MODE_INFO[opt] ?? { label: opt, tooltip: '' };
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = info.label;
      option.title = info.tooltip;
      if (opt === currentValue) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener('change', () => {
      this.onBeforeDiscreteChange?.();
      onChange(select.value);
    });
    wrapper.appendChild(select);

    this.container.appendChild(wrapper);
  }

  /** Checkbox + number field for optional signal activation delay. */
  private addSignalDelayField(entity: Entity): void {
    const hasDelay = (entity.signalDelay as number | undefined) !== undefined;

    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.style.display = 'flex';
    lbl.style.alignItems = 'center';
    lbl.style.gap = '4px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = hasDelay;
    checkbox.title = 'Add a delay before the signal activates';
    checkbox.addEventListener('change', () => {
      this.onBeforeDiscreteChange?.();
      if (checkbox.checked) {
        entity.signalDelay = 1;
      } else {
        delete (entity as Record<string, unknown>).signalDelay;
      }
      this.onEntityChanged?.();
      this.refresh();
    });
    lbl.appendChild(checkbox);

    const text = document.createElement('span');
    text.textContent = 'signalDelay';
    lbl.appendChild(text);
    wrapper.appendChild(lbl);

    if (hasDelay) {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.1';
      input.value = String(entity.signalDelay ?? 1);
      input.style.width = '60px';
      input.addEventListener('input', () => {
        this.onBeginTextEdit?.();
        const parsed = parseFloat(input.value);
        if (!isNaN(parsed) && parsed >= 0) entity.signalDelay = parsed;
      });
      input.addEventListener('blur', () => this.onCommitTextEdit?.());
      wrapper.appendChild(input);
    }

    this.container.appendChild(wrapper);
  }

  private addTargetsArrayField(entity: Entity, validEntityType: string): void {
    const targets = (entity.targets as string[] | undefined) ?? [];

    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = 'targets';
    wrapper.appendChild(lbl);

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '2px';

    for (let i = 0; i < targets.length; i++) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '4px';

      const span = document.createElement('span');
      span.className = 'inspector-ref-item';
      span.style.flex = '1';
      span.style.fontSize = '0.85em';
      span.style.overflow = 'hidden';
      span.style.textOverflow = 'ellipsis';
      const targetId = targets[i];
      // Resolve to show type @ (col, row), fall back to just the ID
      const targetEntity = this.app.level?.entities.find(e => e.id === targetId);
      if (targetEntity) {
        span.textContent = `${targetEntity.type} @ (${targetEntity.col}, ${targetEntity.row})`;
        span.title = targetId;
      } else {
        span.textContent = targetId;
      }
      span.addEventListener('click', () => {
        if (targetEntity) this.onRefClicked?.(targetEntity);
      });
      if (targetEntity) this.attachHoverHighlight(span, targetEntity);
      row.appendChild(span);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-pick';
      removeBtn.textContent = '\u00d7';
      removeBtn.style.padding = '0 4px';
      removeBtn.style.minWidth = 'auto';
      const idx = i;
      removeBtn.addEventListener('click', () => {
        this.onBeforeDiscreteChange?.();
        targets.splice(idx, 1);
        (entity as Record<string, unknown>).targets = targets;
        this.onEntityChanged?.();
        this.refresh();
      });
      if (targetEntity) this.attachHoverHighlight(removeBtn, targetEntity);
      row.appendChild(removeBtn);

      list.appendChild(row);
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-pick';
    addBtn.textContent = targets.length === 0 ? 'Pick Target' : '+ Add Target';
    addBtn.addEventListener('click', () => {
      this.onPickRequested?.(entity, 'targets', undefined, validEntityType);
    });
    list.appendChild(addBtn);

    wrapper.appendChild(list);
    this.container.appendChild(wrapper);
  }

  private addEnemyTypeDropdown(entity: Entity, currentType: string): void {
    const types = enemyDatabase.getAllEnemyIds();

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

  private addEnemyDetails(def: import('../enemies/enemyDatabase').EnemyDef): void {
    const section = document.createElement('div');
    section.className = 'item-details';

    this.addSpritePreview(section, def.sprite.path, 1);

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
