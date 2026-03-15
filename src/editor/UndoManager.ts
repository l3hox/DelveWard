import type { DungeonLevel } from '../core/types';

export class UndoManager {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private pending: string | null = null;
  private maxSize = 100;

  init(_level: DungeonLevel): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
  }

  snapshot(level: DungeonLevel): void {
    this.pushUndo(JSON.stringify(level));
    this.redoStack = [];
  }

  beginBatch(level: DungeonLevel): void {
    if (this.pending !== null) return;
    this.pending = JSON.stringify(level);
  }

  commitBatch(level: DungeonLevel): void {
    if (this.pending === null) return;
    const current = JSON.stringify(level);
    if (current !== this.pending) {
      this.pushUndo(this.pending);
      this.redoStack = [];
    }
    this.pending = null;
  }

  cancelBatch(): void {
    this.pending = null;
  }

  undo(currentLevel: DungeonLevel): DungeonLevel | null {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push(JSON.stringify(currentLevel));
    const snapshot = this.undoStack.pop()!;
    return JSON.parse(snapshot) as DungeonLevel;
  }

  redo(currentLevel: DungeonLevel): DungeonLevel | null {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push(JSON.stringify(currentLevel));
    const snapshot = this.redoStack.pop()!;
    return JSON.parse(snapshot) as DungeonLevel;
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

  private pushUndo(snapshot: string): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
  }
}
