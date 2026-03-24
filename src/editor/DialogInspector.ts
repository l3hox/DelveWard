import type { DialogEditorState } from './DialogEditorState';
import type { DialogNode, DialogCondition, DialogEffect } from '../core/dialogManager';
import { itemDatabase } from '../core/itemDatabase';
import { npcDatabase } from '../npcs/npcDatabase';
import { getQuestIds } from './dialogIO';

export class DialogInspector {
  private container: HTMLElement;

  /** Tracks which collapsible sections are expanded, keyed by section identity string. */
  private expandedSections = new Set<string>();

  state: DialogEditorState | null = null;
  onBeforeDiscreteChange: (() => void) | null = null;
  onBeginTextEdit: (() => void) | null = null;
  onCommitTextEdit: (() => void) | null = null;
  onNodeChanged: (() => void) | null = null;
  onNodeDeleted: (() => void) | null = null;
  onNewNode: ((callback: (newId: string) => void) => void) | null = null;
  onEditQuest: ((questId: string) => void) | null = null;
  onNewQuest: ((callback: (questId: string) => void) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  refresh(): void {
    this.container.innerHTML = '';

    if (!this.state || !this.state.tree) {
      this.showPlaceholder('Select a node to edit');
      return;
    }

    const nodeId = this.state.selectedNodeId;
    if (!nodeId || !this.state.tree.nodes[nodeId]) {
      this.showPlaceholder('Select a node to edit');
      return;
    }

    const node = this.state.tree.nodes[nodeId];
    const tree = this.state.tree;

    // --- NPC sprite + name ---
    const npcId = this.state.npcId;
    if (npcId) {
      const def = npcDatabase.getNpc(npcId);
      if (def) {
        const sprite = document.createElement('img');
        sprite.src = def.sprite.path;
        sprite.className = 'sprite-preview';
        sprite.style.display = 'block';
        sprite.style.margin = '0 auto 4px';
        sprite.onload = () => {
          sprite.style.width = `${sprite.naturalWidth}px`;
          sprite.style.height = `${sprite.naturalHeight}px`;
        };
        this.container.appendChild(sprite);

        const npcName = document.createElement('div');
        npcName.style.textAlign = 'center';
        npcName.style.color = '#888';
        npcName.style.fontSize = '11px';
        npcName.style.marginBottom = '8px';
        npcName.textContent = def.name;
        this.container.appendChild(npcName);
      }
    }

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'inspector-header';
    header.textContent = `Node: ${nodeId}`;
    this.container.appendChild(header);

    // --- Node ID field ---
    {
      const wrapper = document.createElement('div');
      wrapper.className = 'inspector-field';

      const lbl = document.createElement('label');
      lbl.textContent = 'id';
      wrapper.appendChild(lbl);

      const input = document.createElement('input');
      input.type = 'text';
      input.value = nodeId;
      input.autocomplete = 'off';

      let editing = false;
      input.addEventListener('input', () => {
        if (!editing) {
          this.onBeginTextEdit?.();
          editing = true;
        }
      });
      input.addEventListener('blur', () => {
        editing = false;
        const newId = input.value.trim();
        if (newId && newId !== nodeId) {
          const ok = this.state!.renameNode(nodeId, newId);
          if (!ok) {
            alert(`Cannot rename: node "${newId}" already exists.`);
            this.refresh();
            return;
          }
          this.onNodeChanged?.();
          this.refresh();
          return;
        }
        this.onCommitTextEdit?.();
      });
      wrapper.appendChild(input);
      this.container.appendChild(wrapper);
    }

    // --- Start node checkbox ---
    {
      const wrapper = document.createElement('div');
      wrapper.className = 'inspector-field checkbox-field';

      const lbl = document.createElement('label');
      lbl.style.display = 'flex';
      lbl.style.alignItems = 'center';
      lbl.style.gap = '4px';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = nodeId === tree.startNode;
      cb.addEventListener('change', () => {
        this.onBeforeDiscreteChange?.();
        this.state!.setStartNode(nodeId);
        this.onNodeChanged?.();
        this.refresh();
      });
      lbl.appendChild(cb);

      const span = document.createElement('span');
      span.textContent = 'Start node';
      lbl.appendChild(span);

      wrapper.appendChild(lbl);
      this.container.appendChild(wrapper);
    }

    // --- Speaker field ---
    this.addTextField(this.container, 'speaker', node.speaker ?? '', (val) => {
      this.state!.updateNode(nodeId, { speaker: val });
      this.onNodeChanged?.();
    });

    // --- Text field (textarea) ---
    {
      const wrapper = document.createElement('div');
      wrapper.className = 'inspector-field';

      const lbl = document.createElement('label');
      lbl.textContent = 'text';
      wrapper.appendChild(lbl);

      const textarea = document.createElement('textarea');
      textarea.rows = 4;
      textarea.value = node.text;
      textarea.style.width = '100%';
      textarea.style.boxSizing = 'border-box';
      textarea.style.resize = 'vertical';
      textarea.style.background = '#222';
      textarea.style.color = '#ccc';
      textarea.style.border = '1px solid #444';
      textarea.style.fontFamily = 'monospace';
      textarea.style.fontSize = '12px';
      textarea.style.padding = '4px 6px';

      let editing = false;
      textarea.addEventListener('input', () => {
        if (!editing) {
          this.onBeginTextEdit?.();
          editing = true;
        }
        this.state!.updateNode(nodeId, { text: textarea.value });
        this.onNodeChanged?.();
      });
      textarea.addEventListener('blur', () => {
        editing = false;
        this.onCommitTextEdit?.();
      });
      wrapper.appendChild(textarea);
      this.container.appendChild(wrapper);
    }

    // --- Type toggle ---
    const currentType = node.choices ? 'choices' : 'linear';
    this.addDropdown(
      this.container,
      'type',
      currentType,
      [
        { value: 'choices', label: 'Choices' },
        { value: 'linear', label: 'Linear' },
      ],
      (val) => {
        this.onBeforeDiscreteChange?.();
        if (val === 'choices') {
          node.choices = [{ text: '', next: null }];
          delete node.next;
        } else {
          node.next = null;
          delete node.choices;
        }
        this.onNodeChanged?.();
        this.refresh();
      }
    );

    // --- Choices or linear next ---
    if (node.choices) {
      this.buildChoicesSection(node, nodeId);
    } else {
      this.buildLinearNextSection(node, nodeId);
    }

    // --- Node Effects ---
    const nodeEffects = node.effects ?? [];
    this.buildExpandableSection(`node:effects`, 'Effects', nodeEffects.length, (sectionContainer) => {
      if (!node.effects) node.effects = [];
      this.addEffectList(sectionContainer, node.effects, `node:effects`, () => {
        this.onNodeChanged?.();
      });
    });

    // --- Node Conditions ---
    const nodeConditions = node.conditions ?? [];
    this.buildExpandableSection(`node:conditions`, 'Conditions', nodeConditions.length, (sectionContainer) => {
      if (!node.conditions) node.conditions = [];
      this.addConditionList(sectionContainer, node.conditions, `node:conditions`, () => {
        this.onNodeChanged?.();
      });
    });

    // --- Delete Node button ---
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = 'Delete Node';
    deleteBtn.style.marginTop = '8px';
    deleteBtn.addEventListener('click', () => {
      this.onBeforeDiscreteChange?.();
      this.state!.removeNode(nodeId);
      this.onNodeDeleted?.();
      this.refresh();
    });
    this.container.appendChild(deleteBtn);
  }

  // -------------------------------------------------------------------------
  // Choices section
  // -------------------------------------------------------------------------

  private buildChoicesSection(node: DialogNode, nodeId: string): void {
    const allNodeIds = Object.keys(this.state!.tree!.nodes);
    const choices = node.choices!;

    for (let i = 0; i < choices.length; i++) {
      const choice = choices[i];
      const sectionKey = `choice:${i}`;
      const preview = `${i + 1}. ${(choice.text || '(empty)').substring(0, 30)}${choice.text.length > 30 ? '...' : ''}`;

      const choiceBlock = document.createElement('div');
      choiceBlock.style.border = '1px solid #444';
      choiceBlock.style.marginTop = '6px';
      choiceBlock.style.background = '#1a1a1a';

      // Collapsible header
      const choiceHeader = document.createElement('button');
      choiceHeader.style.width = '100%';
      choiceHeader.style.textAlign = 'left';
      choiceHeader.style.background = '#2a2a2a';
      choiceHeader.style.border = 'none';
      choiceHeader.style.borderBottom = '1px solid #444';
      choiceHeader.style.color = '#ccc';
      choiceHeader.style.padding = '4px 6px';
      choiceHeader.style.cursor = 'pointer';
      choiceHeader.style.fontSize = '11px';
      choiceHeader.style.display = 'flex';
      choiceHeader.style.alignItems = 'center';
      choiceHeader.style.gap = '6px';

      const expanded = this.expandedSections.has(sectionKey);
      const arrow = document.createElement('span');
      arrow.textContent = expanded ? '\u25BC' : '\u25B6';
      arrow.style.fontSize = '9px';
      arrow.style.flexShrink = '0';
      choiceHeader.appendChild(arrow);

      const titleSpan = document.createElement('span');
      titleSpan.style.flex = '1';
      titleSpan.style.overflow = 'hidden';
      titleSpan.style.textOverflow = 'ellipsis';
      titleSpan.style.whiteSpace = 'nowrap';
      titleSpan.textContent = preview;
      choiceHeader.appendChild(titleSpan);

      const removeBtn = document.createElement('span');
      removeBtn.textContent = '\u00d7';
      removeBtn.style.color = '#cc6666';
      removeBtn.style.fontSize = '14px';
      removeBtn.style.flexShrink = '0';
      removeBtn.style.padding = '0 2px';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onBeforeDiscreteChange?.();
        choices.splice(i, 1);
        this.expandedSections.delete(sectionKey);
        this.onNodeChanged?.();
        this.refresh();
      });
      choiceHeader.appendChild(removeBtn);

      const choiceBody = document.createElement('div');
      choiceBody.style.padding = '6px';
      choiceBody.style.display = expanded ? 'block' : 'none';

      choiceHeader.addEventListener('click', () => {
        const nowExpanded = choiceBody.style.display === 'none';
        choiceBody.style.display = nowExpanded ? 'block' : 'none';
        arrow.textContent = nowExpanded ? '\u25BC' : '\u25B6';
        if (nowExpanded) {
          this.expandedSections.add(sectionKey);
        } else {
          this.expandedSections.delete(sectionKey);
        }
      });

      // Choice text
      this.addTextField(choiceBody, 'text', choice.text, (val) => {
        choice.text = val;
        this.onNodeChanged?.();
      });

      // Choice next dropdown
      const nextOptions: Array<{ value: string; label: string }> = [
        { value: '', label: 'End Dialog' },
        ...allNodeIds.filter(id => id !== nodeId).map(id => ({ value: id, label: id })),
        { value: '__new__', label: '+ new node' },
      ];
      this.addDropdown(choiceBody, 'next', choice.next ?? '', nextOptions, (val) => {
        if (val === '__new__') {
          this.onNewNode?.((newId) => {
            choice.next = newId;
            this.onNodeChanged?.();
            this.refresh();
          });
          return;
        }
        this.onBeforeDiscreteChange?.();
        choice.next = val === '' ? null : val;
        this.onNodeChanged?.();
      });

      // Choice conditions
      const choiceConditions = choice.conditions ?? [];
      this.buildExpandableSection(`choice:${i}:conditions`, 'Conditions', choiceConditions.length, (sectionContainer) => {
        if (!choice.conditions) choice.conditions = [];
        this.addConditionList(sectionContainer, choice.conditions, `choice:${i}:conditions`, () => {
          this.onNodeChanged?.();
        });
      }, choiceBody);

      // Choice effects
      const choiceEffects = choice.effects ?? [];
      this.buildExpandableSection(`choice:${i}:effects`, 'Effects', choiceEffects.length, (sectionContainer) => {
        if (!choice.effects) choice.effects = [];
        this.addEffectList(sectionContainer, choice.effects, `choice:${i}:effects`, () => {
          this.onNodeChanged?.();
        });
      }, choiceBody);

      choiceBlock.appendChild(choiceHeader);
      choiceBlock.appendChild(choiceBody);
      this.container.appendChild(choiceBlock);
    }

    // Add Choice button
    const addChoiceBtn = document.createElement('button');
    addChoiceBtn.className = 'btn-add';
    addChoiceBtn.textContent = 'Add Choice';
    addChoiceBtn.style.marginTop = '6px';
    addChoiceBtn.addEventListener('click', () => {
      this.onBeforeDiscreteChange?.();
      choices.push({ text: '', next: null });
      // Auto-expand the new choice
      this.expandedSections.add(`choice:${choices.length - 1}`);
      this.onNodeChanged?.();
      this.refresh();
    });
    this.container.appendChild(addChoiceBtn);
  }

  // -------------------------------------------------------------------------
  // Linear next section
  // -------------------------------------------------------------------------

  private buildLinearNextSection(node: DialogNode, nodeId: string): void {
    const allNodeIds = Object.keys(this.state!.tree!.nodes);
    const nextOptions: Array<{ value: string; label: string }> = [
      { value: '', label: 'End Dialog' },
      ...allNodeIds.filter(id => id !== nodeId).map(id => ({ value: id, label: id })),
      { value: '__new__', label: '+ new node' },
    ];
    this.addDropdown(this.container, 'next', node.next ?? '', nextOptions, (val) => {
      if (val === '__new__') {
        this.onNewNode?.((newId) => {
          node.next = newId;
          this.onNodeChanged?.();
          this.refresh();
        });
        return;
      }
      this.onBeforeDiscreteChange?.();
      node.next = val === '' ? null : val;
      this.onNodeChanged?.();
    });
  }

  // -------------------------------------------------------------------------
  // Condition sub-editor
  // -------------------------------------------------------------------------

  private addConditionList(
    parent: HTMLElement,
    conditions: DialogCondition[],
    sectionKey: string,
    onUpdate: () => void
  ): void {
    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i];
      const row = document.createElement('div');
      row.style.border = '1px solid #333';
      row.style.padding = '4px';
      row.style.marginBottom = '4px';
      row.style.background = '#111';

      // Type dropdown
      const typeOptions: Array<{ value: string; label: string }> = [
        { value: 'hasFlag', label: 'hasFlag' },
        { value: 'hasItem', label: 'hasItem' },
        { value: 'questStage', label: 'questStage' },
        { value: 'statCheck', label: 'statCheck' },
      ];
      this.addDropdown(row, 'type', condition.type, typeOptions, (val) => {
        this.onBeforeDiscreteChange?.();
        condition.type = val as DialogCondition['type'];
        // Clear stale fields and set defaults for new type
        delete condition.flag;
        delete condition.itemId;
        delete condition.questId;
        delete condition.stage;
        delete condition.stat;
        delete condition.min;
        if (condition.type === 'hasFlag') condition.flag = '';
        else if (condition.type === 'hasItem') { const items = itemDatabase.getAllItems(); condition.itemId = items.length > 0 ? items[0].id : ''; }
        else if (condition.type === 'questStage') { const qids = getQuestIds(); condition.questId = qids.length > 0 ? qids[0] : ''; condition.stage = 'undiscovered'; }
        else if (condition.type === 'statCheck') { condition.stat = ''; condition.min = 0; }
        this.expandedSections.add(sectionKey);
        onUpdate();
        this.refresh();
      });

      // Type-specific fields
      if (condition.type === 'hasFlag') {
        this.addTextField(row, 'flag', condition.flag ?? '', (val) => {
          condition.flag = val;
          onUpdate();
        });
      } else if (condition.type === 'hasItem') {
        const items = itemDatabase.getAllItems();
        if (items.length > 0) {
          const itemOptions: Array<{ value: string; label: string }> = items.map(item => ({
            value: item.id,
            label: `${item.name} (${item.id})`,
          }));
          this.addDropdown(row, 'itemId', condition.itemId ?? '', itemOptions, (val) => {
            this.onBeforeDiscreteChange?.();
            condition.itemId = val;
            onUpdate();
          });
        } else {
          this.addTextField(row, 'itemId', condition.itemId ?? '', (val) => {
            condition.itemId = val;
            onUpdate();
          });
        }
      } else if (condition.type === 'questStage') {
        this.addQuestIdField(row, condition.questId ?? '', (val) => {
          condition.questId = val;
          onUpdate();
        });
        const stageOptions: Array<{ value: string; label: string }> = [
          { value: 'undiscovered', label: 'undiscovered' },
          { value: 'active', label: 'active' },
          { value: 'complete', label: 'complete' },
          { value: 'failed', label: 'failed' },
        ];
        this.addDropdown(row, 'stage', condition.stage ?? 'undiscovered', stageOptions, (val) => {
          this.onBeforeDiscreteChange?.();
          condition.stage = val;
          onUpdate();
        });
      } else if (condition.type === 'statCheck') {
        this.addTextField(row, 'stat', condition.stat ?? '', (val) => {
          condition.stat = val;
          onUpdate();
        });
        this.addNumberField(row, 'min', condition.min ?? 0, (val) => {
          condition.min = val;
          onUpdate();
        });
      }

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.style.marginTop = '4px';
      removeBtn.style.fontSize = '11px';
      removeBtn.addEventListener('click', () => {
        this.onBeforeDiscreteChange?.();
        conditions.splice(i, 1);
        this.expandedSections.add(sectionKey);
        onUpdate();
        this.refresh();
      });
      row.appendChild(removeBtn);

      parent.appendChild(row);
    }

    // Add Condition button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add';
    addBtn.textContent = 'Add Condition';
    addBtn.style.marginTop = '4px';
    addBtn.addEventListener('click', () => {
      this.onBeforeDiscreteChange?.();
      conditions.push({ type: 'hasFlag', flag: '' });
      this.expandedSections.add(sectionKey);
      onUpdate();
      this.refresh();
    });
    parent.appendChild(addBtn);
  }

  // -------------------------------------------------------------------------
  // Effect sub-editor
  // -------------------------------------------------------------------------

  private addEffectList(
    parent: HTMLElement,
    effects: DialogEffect[],
    sectionKey: string,
    onUpdate: () => void
  ): void {
    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i];
      const row = document.createElement('div');
      row.style.border = '1px solid #333';
      row.style.padding = '4px';
      row.style.marginBottom = '4px';
      row.style.background = '#111';

      // Type dropdown
      const typeOptions: Array<{ value: string; label: string }> = [
        { value: 'setFlag', label: 'setFlag' },
        { value: 'giveItem', label: 'giveItem' },
        { value: 'takeItem', label: 'takeItem' },
        { value: 'startQuest', label: 'startQuest' },
        { value: 'advanceQuest', label: 'advanceQuest' },
        { value: 'openShop', label: 'openShop' },
      ];
      this.addDropdown(row, 'type', effect.type, typeOptions, (val) => {
        this.onBeforeDiscreteChange?.();
        effect.type = val as DialogEffect['type'];
        // Clear stale fields and set defaults for new type
        delete effect.flag;
        delete effect.itemId;
        delete effect.questId;
        if (effect.type === 'setFlag') effect.flag = '';
        else if (effect.type === 'giveItem' || effect.type === 'takeItem') { const items = itemDatabase.getAllItems(); effect.itemId = items.length > 0 ? items[0].id : ''; }
        else if (effect.type === 'startQuest' || effect.type === 'advanceQuest') { const qids = getQuestIds(); effect.questId = qids.length > 0 ? qids[0] : ''; }
        this.expandedSections.add(sectionKey);
        onUpdate();
        this.refresh();
      });

      // Type-specific fields
      if (effect.type === 'setFlag') {
        this.addTextField(row, 'flag', effect.flag ?? '', (val) => {
          effect.flag = val;
          onUpdate();
        });
      } else if (effect.type === 'giveItem' || effect.type === 'takeItem') {
        const items = itemDatabase.getAllItems();
        if (items.length > 0) {
          const itemOptions: Array<{ value: string; label: string }> = items.map(item => ({
            value: item.id,
            label: `${item.name} (${item.id})`,
          }));
          this.addDropdown(row, 'itemId', effect.itemId ?? '', itemOptions, (val) => {
            this.onBeforeDiscreteChange?.();
            effect.itemId = val;
            onUpdate();
          });
        } else {
          this.addTextField(row, 'itemId', effect.itemId ?? '', (val) => {
            effect.itemId = val;
            onUpdate();
          });
        }
      } else if (effect.type === 'startQuest' || effect.type === 'advanceQuest') {
        this.addQuestIdField(row, effect.questId ?? '', (val) => {
          effect.questId = val;
          onUpdate();
        });
      }
      // openShop: no additional fields

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.style.marginTop = '4px';
      removeBtn.style.fontSize = '11px';
      removeBtn.addEventListener('click', () => {
        this.onBeforeDiscreteChange?.();
        effects.splice(i, 1);
        this.expandedSections.add(sectionKey);
        onUpdate();
        this.refresh();
      });
      row.appendChild(removeBtn);

      parent.appendChild(row);
    }

    // Add Effect button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add';
    addBtn.textContent = 'Add Effect';
    addBtn.style.marginTop = '4px';
    addBtn.addEventListener('click', () => {
      this.onBeforeDiscreteChange?.();
      effects.push({ type: 'setFlag', flag: '' });
      this.expandedSections.add(sectionKey);
      onUpdate();
      this.refresh();
    });
    parent.appendChild(addBtn);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private showPlaceholder(text: string): void {
    const placeholder = document.createElement('div');
    placeholder.className = 'inspector-placeholder';
    placeholder.textContent = text;
    this.container.appendChild(placeholder);
  }

  /**
   * Builds a collapsible section with a toggle header.
   * Preserves expanded state across refreshes via this.expandedSections.
   */
  private buildExpandableSection(
    key: string,
    title: string,
    itemCount: number,
    buildContent: (inner: HTMLElement) => void,
    appendTo?: HTMLElement
  ): void {
    const target = appendTo ?? this.container;
    const expanded = this.expandedSections.has(key);

    const section = document.createElement('div');
    section.style.marginTop = '6px';

    const countSuffix = itemCount > 0 ? ` (${itemCount})` : '';
    const toggleBtn = document.createElement('button');
    toggleBtn.style.width = '100%';
    toggleBtn.style.textAlign = 'left';
    toggleBtn.style.background = '#2a2a2a';
    toggleBtn.style.border = '1px solid #444';
    toggleBtn.style.color = '#aaa';
    toggleBtn.style.padding = '3px 6px';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.fontSize = '11px';
    toggleBtn.textContent = `${expanded ? '-' : '+'} ${title}${countSuffix}`;

    const inner = document.createElement('div');
    inner.style.padding = '4px';
    inner.style.display = expanded ? 'block' : 'none';

    toggleBtn.addEventListener('click', () => {
      const collapsed = inner.style.display === 'none';
      inner.style.display = collapsed ? 'block' : 'none';
      toggleBtn.textContent = `${collapsed ? '-' : '+'} ${title}${countSuffix}`;
      if (collapsed) {
        this.expandedSections.add(key);
      } else {
        this.expandedSections.delete(key);
      }
    });

    buildContent(inner);
    section.appendChild(toggleBtn);
    section.appendChild(inner);
    target.appendChild(section);
  }

  addDropdown(
    parent: HTMLElement,
    label: string,
    value: string,
    options: Array<{ value: string; label: string }>,
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
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === value) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener('change', () => onChange(select.value));
    wrapper.appendChild(select);

    parent.appendChild(wrapper);
  }

  addTextField(
    parent: HTMLElement,
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

    let editing = false;
    input.addEventListener('input', () => {
      if (!editing) {
        this.onBeginTextEdit?.();
        editing = true;
      }
      onChange(input.value);
    });
    input.addEventListener('blur', () => {
      editing = false;
      this.onCommitTextEdit?.();
    });
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

    let editing = false;
    input.addEventListener('input', () => {
      if (!editing) {
        this.onBeginTextEdit?.();
        editing = true;
      }
      const parsed = parseFloat(input.value);
      if (!isNaN(parsed)) onChange(parsed);
    });
    input.addEventListener('blur', () => {
      editing = false;
      this.onCommitTextEdit?.();
    });
    wrapper.appendChild(input);

    parent.appendChild(wrapper);
  }

  private addQuestIdField(parent: HTMLElement, value: string, onChange: (val: string) => void): void {
    const questIds = getQuestIds();

    if (questIds.length > 0) {
      const wrapper = document.createElement('div');
      wrapper.className = 'inspector-field';

      const lbl = document.createElement('label');
      lbl.textContent = 'questId';
      wrapper.appendChild(lbl);

      const row = document.createElement('div');
      row.style.cssText = 'display: flex; gap: 4px;';

      const select = document.createElement('select');
      select.style.flex = '1';
      for (const id of questIds) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = id;
        if (id === value) opt.selected = true;
        select.appendChild(opt);
      }
      const newOpt = document.createElement('option');
      newOpt.value = '__new__';
      newOpt.textContent = '+ new quest';
      select.appendChild(newOpt);

      select.addEventListener('change', () => {
        if (select.value === '__new__') {
          this.onNewQuest?.((questId) => {
            onChange(questId);
            this.refresh();
          });
          // Reset dropdown to previous value while modal is open
          select.value = value;
          return;
        }
        this.onBeforeDiscreteChange?.();
        onChange(select.value);
      });
      row.appendChild(select);

      // Edit button
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-pick';
      editBtn.textContent = '\u270E';
      editBtn.title = 'Edit quest';
      editBtn.style.padding = '4px 6px';
      editBtn.addEventListener('click', () => {
        const currentId = select.value;
        if (currentId && currentId !== '__new__') {
          this.onEditQuest?.(currentId);
        }
      });
      row.appendChild(editBtn);

      wrapper.appendChild(row);
      parent.appendChild(wrapper);
    } else {
      this.addTextField(parent, 'questId', value, onChange);
    }
  }
}
