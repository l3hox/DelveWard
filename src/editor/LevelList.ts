import type { EditorApp } from './EditorApp';

export class LevelList {
  private container: HTMLElement;
  private app: EditorApp;

  onLevelSwitch: ((index: number) => void) | null = null;
  onAddLevel: (() => void) | null = null;
  onRemoveLevel: ((index: number) => void) | null = null;
  onMoveLevel: ((from: number, to: number) => void) | null = null;
  onDungeonNameChanged: (() => void) | null = null;
  onBeginTextEdit: (() => void) | null = null;
  onCommitTextEdit: (() => void) | null = null;

  constructor(container: HTMLElement, app: EditorApp) {
    this.container = container;
    this.app = app;
  }

  refresh(): void {
    this.container.innerHTML = '';

    if (!this.app.dungeon) {
      this.container.classList.remove('visible');
      return;
    }

    this.container.classList.add('visible');
    const dungeon = this.app.dungeon;

    // Dungeon name field
    const nameField = document.createElement('div');
    nameField.className = 'level-list-name-field';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Dungeon Name';
    nameField.appendChild(nameLabel);
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = dungeon.name;
    nameInput.addEventListener('input', () => {
      this.onBeginTextEdit?.();
      dungeon.name = nameInput.value;
      this.onDungeonNameChanged?.();
    });
    nameInput.addEventListener('blur', () => this.onCommitTextEdit?.());
    nameField.appendChild(nameInput);
    this.container.appendChild(nameField);

    // "Levels" header
    const header = document.createElement('div');
    header.className = 'level-list-header';
    header.textContent = 'Levels';
    this.container.appendChild(header);

    // Scrollable list
    const scroll = document.createElement('div');
    scroll.className = 'level-list-scroll';

    for (let i = 0; i < dungeon.levels.length; i++) {
      const level = dungeon.levels[i];
      const entry = document.createElement('div');
      entry.className = 'level-entry';
      if (i === this.app.activeLevelIndex) entry.classList.add('active');

      const name = document.createElement('span');
      name.className = 'level-entry-name';
      name.textContent = level.name;
      entry.appendChild(name);

      const id = document.createElement('span');
      id.className = 'level-entry-id';
      id.textContent = `(${level.id ?? '?'})`;
      entry.appendChild(id);

      const actions = document.createElement('div');
      actions.className = 'level-entry-actions';

      // Move up
      if (i > 0) {
        const upBtn = document.createElement('button');
        upBtn.textContent = '\u25B2';
        upBtn.title = 'Move up';
        upBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onMoveLevel?.(i, i - 1);
        });
        actions.appendChild(upBtn);
      }

      // Move down
      if (i < dungeon.levels.length - 1) {
        const downBtn = document.createElement('button');
        downBtn.textContent = '\u25BC';
        downBtn.title = 'Move down';
        downBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onMoveLevel?.(i, i + 1);
        });
        actions.appendChild(downBtn);
      }

      // Remove (only if >1 level)
      if (dungeon.levels.length > 1) {
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '\u00D7';
        removeBtn.title = 'Remove level';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onRemoveLevel?.(i);
        });
        actions.appendChild(removeBtn);
      }

      entry.appendChild(actions);

      entry.addEventListener('click', () => {
        if (i !== this.app.activeLevelIndex) {
          this.onLevelSwitch?.(i);
        }
      });

      scroll.appendChild(entry);
    }

    this.container.appendChild(scroll);

    // Add Level button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add';
    addBtn.textContent = 'Add Level';
    addBtn.addEventListener('click', () => this.onAddLevel?.());
    this.container.appendChild(addBtn);
  }
}
