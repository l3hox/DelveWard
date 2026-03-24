import type { DialogTree, DialogNode } from '../core/dialogManager';
import { autoLayoutDialog } from './DialogNodeLayout';

export interface DialogValidationError {
  message: string;
  nodeId?: string;
}

interface PositionMap {
  [id: string]: { x: number; y: number };
}

interface StateSnapshot {
  tree: DialogTree;
  positions: PositionMap;
}

const MAX_UNDO = 100;

export class DialogEditorState {
  tree: DialogTree | null = null;
  npcId: string | null = null;
  selectedNodeId: string | null = null;
  nodePositions: Map<string, { x: number; y: number }> = new Map();
  dirty: boolean = false;
  cleanSnapshot: string = '';

  private undoStack: string[] = [];
  private redoStack: string[] = [];

  loadTree(
    npcId: string,
    tree: DialogTree,
    layout?: Record<string, { x: number; y: number }>
  ): void {
    this.tree = JSON.parse(JSON.stringify(tree)) as DialogTree;
    this.npcId = npcId;
    this.nodePositions = new Map();

    if (layout) {
      for (const [id, pos] of Object.entries(layout)) {
        this.nodePositions.set(id, { ...pos });
      }
    } else {
      this.nodePositions = autoLayoutDialog(this.tree);
    }

    this.selectedNodeId = null;
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.cleanSnapshot = JSON.stringify(this.tree);
  }

  selectNode(id: string | null): void {
    this.selectedNodeId = id;
  }

  deselectNode(): void {
    this.selectedNodeId = null;
  }

  addNode(id?: string): string {
    if (!this.tree) throw new Error('No tree loaded');

    let nodeId = id;
    if (!nodeId) {
      let n = 0;
      while (this.tree.nodes[`node_${n}`] !== undefined) {
        n++;
      }
      nodeId = `node_${n}`;
    }

    const newNode: DialogNode = { text: '', speaker: '' };
    this.tree.nodes[nodeId] = newNode;

    let x = 400;
    let y = 300;
    if (this.selectedNodeId) {
      const selectedPos = this.nodePositions.get(this.selectedNodeId);
      if (selectedPos) {
        x = selectedPos.x + 250;
        y = selectedPos.y;
      }
    }
    this.nodePositions.set(nodeId, { x, y });

    this.selectedNodeId = nodeId;
    return nodeId;
  }

  removeNode(id: string): void {
    if (!this.tree) return;

    delete this.tree.nodes[id];
    this.nodePositions.delete(id);

    for (const node of Object.values(this.tree.nodes)) {
      if (node.next === id) {
        node.next = null;
      }
      if (node.choices) {
        for (const choice of node.choices) {
          if (choice.next === id) {
            choice.next = null;
          }
        }
      }
    }

    if (this.tree.startNode === id) {
      const remaining = Object.keys(this.tree.nodes);
      this.tree.startNode = remaining.length > 0 ? remaining[0] : '';
    }

    if (this.selectedNodeId === id) {
      this.selectedNodeId = null;
    }
  }

  renameNode(oldId: string, newId: string): boolean {
    if (!this.tree) return false;
    if (!newId || newId === oldId) return false;
    if (this.tree.nodes[newId] !== undefined) return false;

    this.tree.nodes[newId] = this.tree.nodes[oldId];
    delete this.tree.nodes[oldId];

    for (const node of Object.values(this.tree.nodes)) {
      if (node.next === oldId) {
        node.next = newId;
      }
      if (node.choices) {
        for (const choice of node.choices) {
          if (choice.next === oldId) {
            choice.next = newId;
          }
        }
      }
    }

    if (this.tree.startNode === oldId) {
      this.tree.startNode = newId;
    }

    const pos = this.nodePositions.get(oldId);
    if (pos) {
      this.nodePositions.set(newId, pos);
      this.nodePositions.delete(oldId);
    }

    if (this.selectedNodeId === oldId) {
      this.selectedNodeId = newId;
    }

    return true;
  }

  updateNode(id: string, changes: Partial<DialogNode>): void {
    if (!this.tree) return;
    Object.assign(this.tree.nodes[id], changes);
  }

  setStartNode(id: string): void {
    if (!this.tree) return;
    this.tree.startNode = id;
  }

  validate(): DialogValidationError[] {
    if (!this.tree) return [];
    const errors: DialogValidationError[] = [];
    const nodes = this.tree.nodes;

    if (!nodes[this.tree.startNode]) {
      errors.push({ message: `startNode '${this.tree.startNode}' does not exist` });
    }

    for (const [id, node] of Object.entries(nodes)) {
      if (!node.text || node.text.trim() === '') {
        errors.push({ message: `Node '${id}' has empty text`, nodeId: id });
      }

      if (node.next != null && !nodes[node.next]) {
        errors.push({
          message: `Node '${id}' references non-existent node '${node.next}'`,
          nodeId: id,
        });
      }

      if (node.choices) {
        for (const choice of node.choices) {
          if (choice.next !== null && !nodes[choice.next]) {
            errors.push({
              message: `Node '${id}' choice references non-existent node '${choice.next}'`,
              nodeId: id,
            });
          }
        }
      }
    }

    const visited = new Set<string>();
    const queue: string[] = [];
    if (nodes[this.tree.startNode]) {
      queue.push(this.tree.startNode);
    }
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const node = nodes[current];
      if (!node) continue;
      if (node.next && nodes[node.next]) {
        queue.push(node.next);
      }
      if (node.choices) {
        for (const choice of node.choices) {
          if (choice.next && nodes[choice.next]) {
            queue.push(choice.next);
          }
        }
      }
    }
    for (const id of Object.keys(nodes)) {
      if (!visited.has(id)) {
        errors.push({ message: `Node '${id}' is unreachable`, nodeId: id });
      }
    }

    return errors;
  }

  getSnapshot(): string {
    return JSON.stringify({
      tree: this.tree,
      positions: Object.fromEntries(this.nodePositions),
    });
  }

  restoreSnapshot(json: string): void {
    const state = JSON.parse(json) as StateSnapshot;
    this.tree = state.tree;
    this.nodePositions = new Map(Object.entries(state.positions));
    if (this.selectedNodeId && !this.tree.nodes[this.selectedNodeId]) {
      this.selectedNodeId = null;
    }
  }

  pushUndo(): void {
    this.undoStack.push(this.getSnapshot());
    if (this.undoStack.length > MAX_UNDO) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(): void {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(this.getSnapshot());
    this.restoreSnapshot(this.undoStack.pop()!);
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(this.getSnapshot());
    this.restoreSnapshot(this.redoStack.pop()!);
  }

  markClean(): void {
    this.cleanSnapshot = JSON.stringify(this.tree);
    this.dirty = false;
  }

  isDirty(): boolean {
    return JSON.stringify(this.tree) !== this.cleanSnapshot;
  }

  updateDirty(): void {
    this.dirty = this.isDirty();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
