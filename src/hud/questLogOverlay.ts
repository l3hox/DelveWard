import type { QuestManager } from '../core/questManager';

export class QuestLogOverlay {
  private container: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private visible = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 500;
      background: rgba(0, 0, 0, 0.7);
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: #2a1a0a;
      border: 2px solid #8b6914;
      font-family: 'Courier New', monospace;
      width: 100%;
      max-width: 500px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    `;

    const titleBar = document.createElement('div');
    titleBar.textContent = 'QUEST LOG';
    titleBar.style.cssText = `
      padding: 12px 20px;
      font-size: 14px;
      font-weight: bold;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #e8c84a;
      text-align: center;
      border-bottom: 2px solid #8b6914;
    `;
    panel.appendChild(titleBar);

    this.contentEl = document.createElement('div');
    this.contentEl.style.cssText = `
      overflow-y: auto;
      max-height: 60vh;
    `;
    panel.appendChild(this.contentEl);

    this.container.appendChild(panel);
    this._keyHandler = this._keyHandler.bind(this);
  }

  private _keyHandler(e: KeyboardEvent): void {
    if (!this.visible) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'j' || e.key === 'J') {
      this.hide();
    }
  }

  private _buildContent(questManager: QuestManager): void {
    this.contentEl.innerHTML = '';

    const activeIds = questManager.getActiveQuests();
    const completedIds = questManager.getCompletedQuests();

    // Active quests section
    const activeHeader = document.createElement('div');
    activeHeader.textContent = 'Active Quests';
    activeHeader.style.cssText = `
      color: #e8c84a;
      font-size: 13px;
      font-weight: bold;
      padding: 12px 20px 6px;
    `;
    this.contentEl.appendChild(activeHeader);

    if (activeIds.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No active quests';
      empty.style.cssText = `
        color: #777766;
        font-size: 11px;
        padding: 6px 20px;
        border-bottom: 1px solid #3a2a10;
      `;
      this.contentEl.appendChild(empty);
    } else {
      for (const id of activeIds) {
        const def = questManager.getQuestDef(id);
        if (!def) continue;

        const stageIndex = questManager.getStageIndex(id);
        const stageDef = stageIndex >= 0 ? def.stages[stageIndex] : undefined;

        const entry = document.createElement('div');
        entry.style.cssText = `
          padding: 6px 20px;
          border-bottom: 1px solid #3a2a10;
        `;

        const nameEl = document.createElement('div');
        nameEl.textContent = def.name;
        nameEl.style.cssText = `
          color: #e8c84a;
          font-size: 12px;
        `;
        entry.appendChild(nameEl);

        if (stageDef) {
          const stageEl = document.createElement('div');
          stageEl.textContent = stageDef.description;
          stageEl.style.cssText = `
            color: #c0c0c0;
            font-size: 11px;
            margin-top: 2px;
          `;
          entry.appendChild(stageEl);
        }

        const descEl = document.createElement('div');
        descEl.textContent = def.description;
        descEl.style.cssText = `
          color: #777766;
          font-size: 10px;
          font-style: italic;
          margin-top: 2px;
        `;
        entry.appendChild(descEl);

        this.contentEl.appendChild(entry);
      }
    }

    // Completed quests section — only if there are any
    if (completedIds.length > 0) {
      const completedHeader = document.createElement('div');
      completedHeader.textContent = 'Completed Quests';
      completedHeader.style.cssText = `
        color: #e8c84a;
        font-size: 13px;
        font-weight: bold;
        padding: 12px 20px 6px;
      `;
      this.contentEl.appendChild(completedHeader);

      for (const id of completedIds) {
        const def = questManager.getQuestDef(id);
        const name = def?.name ?? id;

        const entry = document.createElement('div');
        entry.style.cssText = `
          padding: 6px 20px;
          border-bottom: 1px solid #3a2a10;
        `;

        const nameEl = document.createElement('div');
        nameEl.textContent = `\u2713 ${name}`;
        nameEl.style.cssText = `
          color: #6a8a5a;
          font-size: 12px;
        `;
        entry.appendChild(nameEl);

        this.contentEl.appendChild(entry);
      }
    }
  }

  attach(): void {
    document.body.appendChild(this.container);
  }

  show(questManager: QuestManager): void {
    this._buildContent(questManager);
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

  toggle(questManager: QuestManager): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show(questManager);
    }
  }
}
