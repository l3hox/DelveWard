import type { DungeonLevel } from '../core/types';

interface UndoEntry {
  levelIndex: number;
  snapshot: string;
}

export interface UndoResult {
  level: DungeonLevel;
  levelIndex: number;
}

export class UndoManager {
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private pending: UndoEntry | null = null;
  private maxSize = 100;

  init(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
  }

  snapshot(level: DungeonLevel, levelIndex = 0): void {
    this.pushUndo({ levelIndex, snapshot: JSON.stringify(level) });
    this.redoStack = [];
  }

  beginBatch(level: DungeonLevel, levelIndex = 0): void {
    if (this.pending !== null) return;
    this.pending = { levelIndex, snapshot: JSON.stringify(level) };
  }

  commitBatch(level: DungeonLevel): void {
    if (this.pending === null) return;
    const current = JSON.stringify(level);
    if (current !== this.pending.snapshot) {
      this.pushUndo(this.pending);
      this.redoStack = [];
    }
    this.pending = null;
  }

  cancelBatch(): void {
    this.pending = null;
  }

  undo(currentLevel: DungeonLevel): UndoResult | null {
    if (this.undoStack.length === 0) return null;
    const entry = this.undoStack.pop()!;
    this.redoStack.push({ levelIndex: entry.levelIndex, snapshot: JSON.stringify(currentLevel) });
    return { level: JSON.parse(entry.snapshot) as DungeonLevel, levelIndex: entry.levelIndex };
  }

  redo(currentLevel: DungeonLevel): UndoResult | null {
    if (this.redoStack.length === 0) return null;
    const entry = this.redoStack.pop()!;
    this.undoStack.push({ levelIndex: entry.levelIndex, snapshot: JSON.stringify(currentLevel) });
    return { level: JSON.parse(entry.snapshot) as DungeonLevel, levelIndex: entry.levelIndex };
  }

  get undoLevelIndex(): number | null {
    if (this.undoStack.length === 0) return null;
    return this.undoStack[this.undoStack.length - 1].levelIndex;
  }

  get redoLevelIndex(): number | null {
    if (this.redoStack.length === 0) return null;
    return this.redoStack[this.redoStack.length - 1].levelIndex;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }

  private pushUndo(entry: UndoEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
  }
}
