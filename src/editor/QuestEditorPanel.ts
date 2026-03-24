import type { QuestDef, QuestStage } from '../core/questManager';
import { itemDatabase } from '../core/itemDatabase';

/**
 * Modal panel for editing a quest definition.
 * Opens as an overlay on top of the dialog editor.
 */
export class QuestEditorPanel {
  private overlay: HTMLDivElement;
  private panel: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private quest: QuestDef | null = null;
  private isNew = false;
  private onSave: ((quest: QuestDef, isNew: boolean) => void) | null = null;
  private onCancel: (() => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 300;
      display: none;
      align-items: center;
      justify-content: center;
    `;
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.cancel();
    });

    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      background: #1a1a1a;
      border: 1px solid #555;
      min-width: 380px;
      max-width: 500px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      font-family: monospace;
      font-size: 12px;
      color: #ccc;
    `;

    const titleBar = document.createElement('div');
    titleBar.style.cssText = `
      padding: 10px 14px 8px;
      border-bottom: 1px solid #333;
      color: #fff;
      font-size: 13px;
      flex-shrink: 0;
    `;
    titleBar.textContent = 'Quest Editor';
    this.panel.appendChild(titleBar);

    this.contentEl = document.createElement('div');
    this.contentEl.style.cssText = `
      padding: 12px 14px;
      overflow-y: auto;
      flex: 1;
    `;
    this.panel.appendChild(this.contentEl);

    const buttonBar = document.createElement('div');
    buttonBar.style.cssText = `
      padding: 8px 14px;
      border-top: 1px solid #333;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      flex-shrink: 0;
    `;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-add';
    saveBtn.textContent = 'Save Quest';
    saveBtn.addEventListener('click', () => this.save());
    buttonBar.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = `
      background: #2a2a2a; color: #ccc; border: 1px solid #555;
      padding: 4px 14px; font-family: monospace; font-size: 12px; cursor: pointer;
    `;
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.cancel());
    buttonBar.appendChild(cancelBtn);

    this.panel.appendChild(buttonBar);
    this.overlay.appendChild(this.panel);
  }

  attach(): void {
    document.body.appendChild(this.overlay);
  }

  setOnSave(cb: (quest: QuestDef, isNew: boolean) => void): void {
    this.onSave = cb;
  }

  setOnCancel(cb: () => void): void {
    this.onCancel = cb;
  }

  open(quest: QuestDef, isNew: boolean): void {
    this.quest = JSON.parse(JSON.stringify(quest)) as QuestDef;
    this.isNew = isNew;
    this.rebuild();
    this.overlay.style.display = 'flex';
  }

  close(): void {
    this.overlay.style.display = 'none';
    this.quest = null;
  }

  isOpen(): boolean {
    return this.overlay.style.display !== 'none';
  }

  private save(): void {
    if (!this.quest) return;
    if (!this.quest.id.trim()) {
      alert('Quest ID is required.');
      return;
    }
    if (!this.quest.name.trim()) {
      alert('Quest name is required.');
      return;
    }
    this.onSave?.(this.quest, this.isNew);
  }

  private cancel(): void {
    this.close();
    this.onCancel?.();
  }

  private rebuild(): void {
    const el = this.contentEl;
    el.innerHTML = '';
    if (!this.quest) return;
    const quest = this.quest;

    // --- ID ---
    this.addField(el, 'id', quest.id, (val) => { quest.id = val; }, this.isNew);

    // --- Name ---
    this.addField(el, 'name', quest.name, (val) => { quest.name = val; });

    // --- Description ---
    this.addTextarea(el, 'description', quest.description, (val) => { quest.description = val; });

    // --- Stages ---
    const stagesHeader = document.createElement('div');
    stagesHeader.style.cssText = 'color: #fff; font-size: 13px; margin-top: 12px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #333;';
    stagesHeader.textContent = 'Stages';
    el.appendChild(stagesHeader);

    for (let i = 0; i < quest.stages.length; i++) {
      this.buildStageSection(el, quest.stages, i);
    }

    const addStageBtn = document.createElement('button');
    addStageBtn.className = 'btn-add';
    addStageBtn.textContent = 'Add Stage';
    addStageBtn.style.marginTop = '6px';
    addStageBtn.addEventListener('click', () => {
      quest.stages.push({ description: '' });
      this.rebuild();
    });
    el.appendChild(addStageBtn);
  }

  private buildStageSection(parent: HTMLElement, stages: QuestStage[], index: number): void {
    const stage = stages[index];
    const block = document.createElement('div');
    block.style.cssText = 'border: 1px solid #444; padding: 6px; margin-bottom: 6px; background: #111;';

    // Header row
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;';

    const title = document.createElement('span');
    title.style.cssText = 'color: #aaa; font-size: 11px;';
    title.textContent = `Stage ${index + 1}`;
    header.appendChild(title);

    if (stages.length > 1) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.style.fontSize = '10px';
      removeBtn.style.padding = '2px 6px';
      removeBtn.addEventListener('click', () => {
        stages.splice(index, 1);
        this.rebuild();
      });
      header.appendChild(removeBtn);
    }
    block.appendChild(header);

    // Description
    this.addTextarea(block, 'description', stage.description, (val) => { stage.description = val; });

    // Rewards
    if (!stage.rewards) stage.rewards = {};
    const rewards = stage.rewards;

    const rewardsLabel = document.createElement('div');
    rewardsLabel.style.cssText = 'color: #888; font-size: 11px; margin-top: 6px; margin-bottom: 3px;';
    rewardsLabel.textContent = 'rewards';
    block.appendChild(rewardsLabel);

    const rewardsRow = document.createElement('div');
    rewardsRow.style.cssText = 'display: flex; gap: 8px;';

    this.addSmallNumberField(rewardsRow, 'xp', rewards.xp ?? 0, (val) => { rewards.xp = val || undefined; });
    this.addSmallNumberField(rewardsRow, 'gold', rewards.gold ?? 0, (val) => { rewards.gold = val || undefined; });

    block.appendChild(rewardsRow);

    // Reward items
    const itemsLabel = document.createElement('div');
    itemsLabel.style.cssText = 'color: #888; font-size: 11px; margin-top: 6px; margin-bottom: 3px;';
    itemsLabel.textContent = 'reward items';
    block.appendChild(itemsLabel);

    if (!rewards.items) rewards.items = [];
    for (let j = 0; j < rewards.items.length; j++) {
      const itemRow = document.createElement('div');
      itemRow.style.cssText = 'display: flex; align-items: center; gap: 4px; margin-bottom: 2px;';

      const items = itemDatabase.getAllItems();
      if (items.length > 0) {
        const select = document.createElement('select');
        select.style.cssText = 'flex: 1; background: #222; color: #ccc; border: 1px solid #444; padding: 2px 4px; font-family: monospace; font-size: 11px;';
        for (const item of items) {
          const opt = document.createElement('option');
          opt.value = item.id;
          opt.textContent = `${item.name} (${item.id})`;
          if (item.id === rewards.items![j]) opt.selected = true;
          select.appendChild(opt);
        }
        select.addEventListener('change', () => { rewards.items![j] = select.value; });
        itemRow.appendChild(select);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = rewards.items[j];
        input.style.cssText = 'flex: 1; background: #222; color: #ccc; border: 1px solid #444; padding: 2px 4px; font-family: monospace; font-size: 11px;';
        input.addEventListener('input', () => { rewards.items![j] = input.value; });
        itemRow.appendChild(input);
      }

      const removeItemBtn = document.createElement('span');
      removeItemBtn.textContent = '\u00d7';
      removeItemBtn.style.cssText = 'color: #cc6666; cursor: pointer; font-size: 14px;';
      removeItemBtn.addEventListener('click', () => { rewards.items!.splice(j, 1); this.rebuild(); });
      itemRow.appendChild(removeItemBtn);

      block.appendChild(itemRow);
    }

    const addItemBtn = document.createElement('button');
    addItemBtn.className = 'btn-add';
    addItemBtn.textContent = '+ item';
    addItemBtn.style.cssText = 'font-size: 10px; padding: 2px 6px; margin-top: 2px;';
    addItemBtn.addEventListener('click', () => {
      const items = itemDatabase.getAllItems();
      rewards.items!.push(items.length > 0 ? items[0].id : '');
      this.rebuild();
    });
    block.appendChild(addItemBtn);

    // Reward flags
    const flagsLabel = document.createElement('div');
    flagsLabel.style.cssText = 'color: #888; font-size: 11px; margin-top: 6px; margin-bottom: 3px;';
    flagsLabel.textContent = 'reward flags';
    block.appendChild(flagsLabel);

    if (!rewards.flags) rewards.flags = [];
    for (let j = 0; j < rewards.flags.length; j++) {
      const flagRow = document.createElement('div');
      flagRow.style.cssText = 'display: flex; align-items: center; gap: 4px; margin-bottom: 2px;';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = rewards.flags[j];
      input.style.cssText = 'flex: 1; background: #222; color: #ccc; border: 1px solid #444; padding: 2px 4px; font-family: monospace; font-size: 11px;';
      input.addEventListener('input', () => { rewards.flags![j] = input.value; });
      flagRow.appendChild(input);

      const removeFlagBtn = document.createElement('span');
      removeFlagBtn.textContent = '\u00d7';
      removeFlagBtn.style.cssText = 'color: #cc6666; cursor: pointer; font-size: 14px;';
      removeFlagBtn.addEventListener('click', () => { rewards.flags!.splice(j, 1); this.rebuild(); });
      flagRow.appendChild(removeFlagBtn);

      block.appendChild(flagRow);
    }

    const addFlagBtn = document.createElement('button');
    addFlagBtn.className = 'btn-add';
    addFlagBtn.textContent = '+ flag';
    addFlagBtn.style.cssText = 'font-size: 10px; padding: 2px 6px; margin-top: 2px;';
    addFlagBtn.addEventListener('click', () => { rewards.flags!.push(''); this.rebuild(); });
    block.appendChild(addFlagBtn);

    parent.appendChild(block);
  }

  // -------------------------------------------------------------------------
  // Field helpers
  // -------------------------------------------------------------------------

  private addField(parent: HTMLElement, label: string, value: string, onChange: (val: string) => void, editable = true): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.autocomplete = 'off';
    if (!editable) {
      input.readOnly = true;
      input.style.opacity = '0.6';
    }
    input.addEventListener('input', () => onChange(input.value));
    wrapper.appendChild(input);

    parent.appendChild(wrapper);
  }

  private addTextarea(parent: HTMLElement, label: string, value: string, onChange: (val: string) => void): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const textarea = document.createElement('textarea');
    textarea.rows = 2;
    textarea.value = value;
    textarea.style.cssText = 'width: 100%; box-sizing: border-box; resize: vertical; background: #222; color: #ccc; border: 1px solid #444; font-family: monospace; font-size: 12px; padding: 4px 6px;';
    textarea.addEventListener('input', () => onChange(textarea.value));
    wrapper.appendChild(textarea);

    parent.appendChild(wrapper);
  }

  private addSmallNumberField(parent: HTMLElement, label: string, value: number, onChange: (val: number) => void): void {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; align-items: center; gap: 4px;';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.style.cssText = 'color: #888; font-size: 11px;';
    wrapper.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.style.cssText = 'width: 60px; background: #222; color: #ccc; border: 1px solid #444; padding: 2px 4px; font-family: monospace; font-size: 11px;';
    input.addEventListener('input', () => {
      const parsed = parseInt(input.value, 10);
      if (!isNaN(parsed)) onChange(parsed);
    });
    wrapper.appendChild(input);

    parent.appendChild(wrapper);
  }
}
