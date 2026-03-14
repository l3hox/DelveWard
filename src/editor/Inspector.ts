import type { Entity } from '../core/types';
import type { EditorApp } from './EditorApp';
import { ENEMY_DEFS } from '../enemies/enemyTypes';

export class Inspector {
  private container: HTMLElement;
  private app: EditorApp;
  private onEntityChanged: (() => void) | null = null;
  private onDelete: (() => void) | null = null;
  private onPickRequested: ((entity: Entity, field: string, validChar?: string, validEntityType?: string, coordinateMode?: boolean) => void) | null = null;
  private onRefClicked: ((entity: Entity) => void) | null = null;

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

  setPickRequestedCallback(cb: (entity: Entity, field: string, validChar?: string, validEntityType?: string, coordinateMode?: boolean) => void): void {
    this.onPickRequested = cb;
  }

  setRefClickedCallback(cb: (entity: Entity) => void): void {
    this.onRefClicked = cb;
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
          ...this.app.getReferencingEntities(entity.col, entity.row),
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
        this.addPickableField('targetDoor', (entity.targetDoor as string) ?? '', entity, 'targetDoor', (val) => {
          entity.targetDoor = val;
          this.onEntityChanged?.();
        }, undefined, 'door', true);
        break;

      case 'pressure_plate':
        this.addPickableField('targetDoor', (entity.targetDoor as string) ?? '', entity, 'targetDoor', (val) => {
          entity.targetDoor = val;
          this.onEntityChanged?.();
        }, undefined, 'door', true);
        break;

      case 'torch_sconce':
        this.addDropdownField('wall', (entity.wall as string) ?? 'N', ['N', 'S', 'E', 'W'], (val) => {
          entity.wall = val;
          this.onEntityChanged?.();
        });
        break;

      case 'enemy':
        this.addDropdownField(
          'enemyType',
          (entity.enemyType as string) ?? Object.keys(ENEMY_DEFS)[0] ?? '',
          Object.keys(ENEMY_DEFS),
          (val) => {
            entity.enemyType = val;
            this.onEntityChanged?.();
          }
        );
        break;

      case 'equipment':
        this.addTextField('itemId', (entity.itemId as string) ?? '', (val) => {
          entity.itemId = val;
          this.onEntityChanged?.();
        });
        break;

      case 'consumable':
        this.addTextField('itemId', (entity.itemId as string) ?? '', (val) => {
          entity.itemId = val;
          this.onEntityChanged?.();
        });
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
    select.addEventListener('change', () => onChange(select.value));
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
    input.addEventListener('input', () => onChange(input.value));
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
      const parsed = parseInt(input.value, 10);
      if (!isNaN(parsed)) onChange(parsed);
    });
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
    coordinateMode?: boolean,
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
    input.addEventListener('input', () => onChange(input.value));
    row.appendChild(input);

    const pickBtn = document.createElement('button');
    const isPickingThis =
      this.app.pickMode !== null &&
      this.app.pickMode.entity === entity &&
      this.app.pickMode.field === field;
    pickBtn.className = isPickingThis ? 'btn-pick active' : 'btn-pick';
    pickBtn.textContent = isPickingThis ? 'Picking...' : 'Pick';
    pickBtn.addEventListener('click', () => this.onPickRequested?.(entity, field, validChar, validEntityType, coordinateMode));
    row.appendChild(pickBtn);

    wrapper.appendChild(row);
    this.container.appendChild(wrapper);
  }
}
