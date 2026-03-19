import type { Entity } from '../core/types';
import type { EditorApp } from './EditorApp';
import { enemyDatabase } from '../enemies/enemyDatabase';
import { itemDatabase, type ItemDef, type ItemQuality } from '../core/itemDatabase';
import { getItemImage } from '../rendering/itemSprites';
import { getLootTable } from '../core/lootTable';

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
        this.addPickableField('key', (entity.keyId as string) ?? '', entity, 'keyId', (val) => {
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
        this.addKeyIdPeerSection(entity, 'key');
        break;
      }

      case 'key': {
        this.addPickableField('key', (entity.keyId as string) ?? '', entity, 'keyId', (val) => {
          entity.keyId = val;
          this.onEntityChanged?.();
        }, undefined, 'door,chest');
        const keyPeers = this.app.getKeyIdPeers(entity).filter(e => e.type === 'door' || e.type === 'chest');
        if (keyPeers.length > 0) {
          const unlockHeader = document.createElement('div');
          unlockHeader.className = 'inspector-ref-header';
          unlockHeader.textContent = `Unlocks (${keyPeers.length})`;
          this.container.appendChild(unlockHeader);
          for (const peer of keyPeers) {
            this.addKeyIdPeerItem(entity, peer);
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
        this.addDropsEditor(entity);
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
        this.addDropsEditor(entity);
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
        this.addDropdownField('facing', (entity.facing as string) ?? 'S', ['N', 'S', 'E', 'W'], (val) => {
          entity.facing = val;
          this.onEntityChanged?.();
        });
        this.addDropdownField('state', (entity.state as string) ?? 'closed', ['closed', 'open', 'locked'], (val) => {
          entity.state = val;
          this.onEntityChanged?.();
        });
        this.addPickableField('key', (entity.keyId as string) ?? '', entity, 'keyId', (val) => {
          entity.keyId = val;
          this.onEntityChanged?.();
        }, undefined, 'key');
        this.addTargetsArrayField(entity, 'door,gate,trap_launcher');
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
        this.addKeyIdPeerSection(entity, 'key');
        this.addDropsEditor(entity);
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
    input.autocomplete = 'off';
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
    input.autocomplete = 'off';
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
  private addDropsEditor(entity: Entity): void {
    const rec = entity as Record<string, unknown>;
    const drops = (rec.drops ?? {}) as Record<string, unknown>;
    const guaranteed = (drops.guaranteed ?? []) as Array<{ itemId: string; quality?: ItemQuality }>;
    const extra = (drops.extra ?? []) as Array<{ itemId: string; chance: number; quality?: ItemQuality }>;

    const QUALITIES: ItemQuality[] = ['poor', 'common', 'fine', 'masterwork', 'enchanted'];
    const allItems = itemDatabase.isLoaded() ? itemDatabase.getAllItems() : [];
    const itemIds = allItems.map(i => i.id);

    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const header = document.createElement('label');
    header.textContent = 'drops';
    wrapper.appendChild(header);

    // --- Guaranteed drops ---
    const gLabel = document.createElement('div');
    gLabel.style.cssText = 'color:#8a8; font-size:10px; margin-top:4px; margin-bottom:2px;';
    gLabel.textContent = 'guaranteed';
    wrapper.appendChild(gLabel);

    for (let i = 0; i < guaranteed.length; i++) {
      const drop = guaranteed[i];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; gap:3px; align-items:center; margin-bottom:2px;';

      const sel = this.createItemSelect(drop.itemId, itemIds, allItems, (val) => {
        this.onBeforeDiscreteChange?.();
        drop.itemId = val;
        this.syncDrops(entity, guaranteed, extra);
        this.onEntityChanged?.();
      });
      sel.style.flex = '1';
      sel.style.fontSize = '10px';
      row.appendChild(sel);

      const qSel = document.createElement('select');
      qSel.style.cssText = 'width:70px; font-size:10px; background:#222; color:#ccc; border:1px solid #444;';
      for (const q of QUALITIES) {
        const opt = document.createElement('option');
        opt.value = q;
        opt.textContent = q;
        if ((drop.quality ?? 'common') === q) opt.selected = true;
        qSel.appendChild(opt);
      }
      qSel.addEventListener('change', () => {
        this.onBeforeDiscreteChange?.();
        drop.quality = qSel.value as ItemQuality;
        this.syncDrops(entity, guaranteed, extra);
        this.onEntityChanged?.();
      });
      row.appendChild(qSel);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-pick';
      removeBtn.textContent = '\u00d7';
      removeBtn.style.cssText = 'padding:0 4px; min-width:auto;';
      removeBtn.addEventListener('click', () => {
        this.onBeforeDiscreteChange?.();
        guaranteed.splice(i, 1);
        this.syncDrops(entity, guaranteed, extra);
        this.onEntityChanged?.();
        this.refresh();
      });
      row.appendChild(removeBtn);
      wrapper.appendChild(row);
    }

    const addGBtn = document.createElement('button');
    addGBtn.className = 'btn-add';
    addGBtn.textContent = '+ guaranteed';
    addGBtn.style.cssText = 'font-size:10px; padding:1px 6px; margin-bottom:6px;';
    addGBtn.addEventListener('click', () => {
      this.onBeforeDiscreteChange?.();
      guaranteed.push({ itemId: itemIds[0] ?? '', quality: 'common' });
      this.syncDrops(entity, guaranteed, extra);
      this.onEntityChanged?.();
      this.refresh();
    });
    wrapper.appendChild(addGBtn);

    // --- Extra (chance-based) drops ---
    const eLabel = document.createElement('div');
    eLabel.style.cssText = 'color:#88a; font-size:10px; margin-top:4px; margin-bottom:2px;';
    eLabel.textContent = 'extra (chance-based)';
    wrapper.appendChild(eLabel);

    for (let i = 0; i < extra.length; i++) {
      const drop = extra[i];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; gap:3px; align-items:center; margin-bottom:2px;';

      const sel = this.createItemSelect(drop.itemId, itemIds, allItems, (val) => {
        this.onBeforeDiscreteChange?.();
        drop.itemId = val;
        this.syncDrops(entity, guaranteed, extra);
        this.onEntityChanged?.();
      });
      sel.style.flex = '1';
      sel.style.fontSize = '10px';
      row.appendChild(sel);

      const chanceInput = document.createElement('input');
      chanceInput.type = 'number';
      chanceInput.value = String(drop.chance);
      chanceInput.step = '0.05';
      chanceInput.min = '0';
      chanceInput.max = '1';
      chanceInput.style.cssText = 'width:45px; font-size:10px; background:#222; color:#ccc; border:1px solid #444;';
      chanceInput.title = 'Drop chance (0-1)';
      chanceInput.addEventListener('input', () => {
        this.onBeginTextEdit?.();
        drop.chance = Math.max(0, Math.min(1, parseFloat(chanceInput.value) || 0));
        this.syncDrops(entity, guaranteed, extra);
        this.onEntityChanged?.();
      });
      chanceInput.addEventListener('blur', () => this.onCommitTextEdit?.());
      row.appendChild(chanceInput);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-pick';
      removeBtn.textContent = '\u00d7';
      removeBtn.style.cssText = 'padding:0 4px; min-width:auto;';
      removeBtn.addEventListener('click', () => {
        this.onBeforeDiscreteChange?.();
        extra.splice(i, 1);
        this.syncDrops(entity, guaranteed, extra);
        this.onEntityChanged?.();
        this.refresh();
      });
      row.appendChild(removeBtn);
      wrapper.appendChild(row);
    }

    const addEBtn = document.createElement('button');
    addEBtn.className = 'btn-add';
    addEBtn.textContent = '+ extra';
    addEBtn.style.cssText = 'font-size:10px; padding:1px 6px; margin-bottom:4px;';
    addEBtn.addEventListener('click', () => {
      this.onBeforeDiscreteChange?.();
      extra.push({ itemId: itemIds[0] ?? '', chance: 0.5 });
      this.syncDrops(entity, guaranteed, extra);
      this.onEntityChanged?.();
      this.refresh();
    });
    wrapper.appendChild(addEBtn);

    // --- suppressTable checkbox (enemies only) ---
    if (entity.type === 'enemy') {
      const stRow = document.createElement('div');
      stRow.style.cssText = 'display:flex; align-items:center; gap:4px; margin-top:2px;';
      const stCb = document.createElement('input');
      stCb.type = 'checkbox';
      stCb.checked = (drops.suppressTable as boolean) ?? false;
      stCb.addEventListener('change', () => {
        this.onBeforeDiscreteChange?.();
        if (stCb.checked) {
          drops.suppressTable = true;
        } else {
          delete drops.suppressTable;
        }
        this.syncDrops(entity, guaranteed, extra);
        this.onEntityChanged?.();
        this.refresh();
      });
      stRow.appendChild(stCb);
      const stLabel = document.createElement('span');
      stLabel.style.cssText = 'font-size:10px; color:#888;';
      stLabel.textContent = 'suppress default loot table';
      stRow.appendChild(stLabel);
      wrapper.appendChild(stRow);

      // Show read-only base loot table if not suppressed
      const suppressed = (drops.suppressTable as boolean) ?? false;
      const enemyType = (entity.enemyType as string) ?? '';
      const table = !suppressed ? getLootTable(enemyType) : undefined;
      if (table) {
        const tableSection = document.createElement('div');
        tableSection.style.cssText = 'margin-top:6px; padding:4px 6px; background:#1a1a22; border:1px solid #333; border-radius:3px;';

        const tableHeader = document.createElement('div');
        tableHeader.style.cssText = 'color:#777; font-size:10px; margin-bottom:3px;';
        tableHeader.textContent = 'base loot table';
        tableSection.appendChild(tableHeader);

        const goldLine = document.createElement('div');
        goldLine.style.cssText = 'color:#ccaa44; font-size:10px; margin-bottom:2px;';
        goldLine.textContent = `gold: ${table.gold[0]}–${table.gold[1]}`;
        tableSection.appendChild(goldLine);

        for (const drop of table.drops) {
          const dropLine = document.createElement('div');
          dropLine.style.cssText = 'color:#aaa; font-size:10px;';
          const itemName = itemDatabase.isLoaded() ? (itemDatabase.getItem(drop.itemId)?.name ?? drop.itemId) : drop.itemId;
          const pct = Math.round(drop.chance * 100);
          dropLine.textContent = `${itemName} — ${pct}%${drop.quality ? ` (${drop.quality})` : ''}`;
          tableSection.appendChild(dropLine);
        }

        if (table.drops.length === 0) {
          const noDrops = document.createElement('div');
          noDrops.style.cssText = 'color:#666; font-size:10px; font-style:italic;';
          noDrops.textContent = 'no base drops';
          tableSection.appendChild(noDrops);
        }

        wrapper.appendChild(tableSection);
      }
    }

    this.container.appendChild(wrapper);
  }

  /** Write guaranteed/extra arrays back to entity.drops, cleaning up empty state. */
  private syncDrops(
    entity: Entity,
    guaranteed: Array<{ itemId: string; quality?: ItemQuality }>,
    extra: Array<{ itemId: string; chance: number; quality?: ItemQuality }>,
  ): void {
    const rec = entity as Record<string, unknown>;
    const drops = (rec.drops ?? {}) as Record<string, unknown>;
    if (guaranteed.length > 0) {
      drops.guaranteed = guaranteed;
    } else {
      delete drops.guaranteed;
    }
    if (extra.length > 0) {
      drops.extra = extra;
    } else {
      delete drops.extra;
    }
    if (Object.keys(drops).length > 0) {
      rec.drops = drops;
    } else {
      delete rec.drops;
    }
  }

  /** Create a grouped item select dropdown. */
  private createItemSelect(
    currentId: string,
    itemIds: string[],
    allItems: ItemDef[],
    onChange: (val: string) => void,
  ): HTMLSelectElement {
    const sel = document.createElement('select');
    sel.style.cssText = 'background:#222; color:#ccc; border:1px solid #444;';

    // Group by type
    const groups: Record<string, ItemDef[]> = {};
    for (const item of allItems) {
      const key = `${item.type}/${item.subtype}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    for (const [groupName, items] of Object.entries(groups)) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = groupName;
      for (const item of items) {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        if (item.id === currentId) opt.selected = true;
        optGroup.appendChild(opt);
      }
      sel.appendChild(optGroup);
    }

    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  private addKeyIdPeerSection(entity: Entity, filterType: string): void {
    const keyPeers = this.app.getKeyIdPeers(entity).filter(e => e.type === filterType);
    if (keyPeers.length === 0) return;
    for (const peer of keyPeers) {
      this.addKeyIdPeerItem(entity, peer);
    }
  }

  private addKeyIdPeerItem(entity: Entity, peer: Entity): void {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '4px';
    row.style.alignItems = 'center';

    const refItem = document.createElement('span');
    refItem.className = 'inspector-ref-item';
    refItem.style.flex = '1';
    refItem.textContent = `${peer.type} @ (${peer.col}, ${peer.row})`;
    refItem.addEventListener('click', () => this.onRefClicked?.(peer));
    this.attachHoverHighlight(refItem, peer);
    row.appendChild(refItem);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-pick';
    removeBtn.textContent = '\u00d7';
    removeBtn.style.padding = '0 4px';
    removeBtn.style.minWidth = 'auto';
    removeBtn.addEventListener('click', () => {
      this.onBeforeDiscreteChange?.();
      this.onRefHovered?.(null);
      (entity as Record<string, unknown>).keyId = '';
      (peer as Record<string, unknown>).keyId = '';
      this.onEntityChanged?.();
      this.refresh();
    });
    row.appendChild(removeBtn);

    this.container.appendChild(row);
  }

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
          this.onRefHovered?.(null);
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

  private static readonly BEHAVIOR_TOOLTIPS: Record<string, string> = {
    erratic: 'Moves randomly instead of chasing the player',
    regen: 'Regenerates HP over time when not recently hit',
    flee: 'Runs away when HP drops below a threshold',
    onHit: 'Applies a status effect on successful attack',
  };

  private addEnemyDetails(def: import('../enemies/enemyDatabase').EnemyDef): void {
    const section = document.createElement('div');
    section.className = 'item-details';

    this.addSpritePreview(section, def.sprite.path, 1);

    this.addReadonlyField(section, 'hp', String(def.maxHp));
    this.addReadonlyField(section, 'atk / def', `${def.atk} / ${def.def}`);
    this.addReadonlyField(section, 'aggro range', String(def.aggroRange));
    this.addReadonlyField(section, 'move interval', `${def.moveInterval}s`);
    this.addReadonlyField(section, 'xp', String(def.xp));

    if (def.behaviors.length > 0) {
      const wrapper = document.createElement('div');
      wrapper.className = 'inspector-field readonly-field';
      wrapper.style.flexWrap = 'wrap';

      const lbl = document.createElement('label');
      lbl.textContent = 'behaviors';
      wrapper.appendChild(lbl);

      const tags = document.createElement('div');
      tags.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap;';
      for (const b of def.behaviors) {
        const tag = document.createElement('span');
        tag.textContent = b.type;
        tag.title = Inspector.BEHAVIOR_TOOLTIPS[b.type] ?? b.type;
        tag.style.cssText = 'background: #2a2a3a; color: #aac; font-size: 10px; padding: 1px 5px; border-radius: 3px; cursor: help;';
        tags.appendChild(tag);
      }
      wrapper.appendChild(tags);
      section.appendChild(wrapper);
    }

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
