// Auto-layout algorithm for dialog node graphs.
// Performs a BFS from startNode to assign depth layers, then spaces nodes
// horizontally by layer and vertically within each layer.

import type { DialogTree } from '../core/dialogManager';

const LAYER_X_START  = 100;
const LAYER_X_GAP    = 300;
const NODE_Y_START   = 100;
const NODE_Y_GAP     = 200;

export function autoLayoutDialog(tree: DialogTree): Map<string, { x: number; y: number }> {
  const { startNode, nodes } = tree;

  // --- BFS to assign depths ---

  const depth = new Map<string, number>();
  const queue: string[] = [];

  if (nodes[startNode] !== undefined) {
    depth.set(startNode, 0);
    queue.push(startNode);
  }

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const node = nodes[id];
    const nextDepth = depth.get(id)! + 1;

    // Collect all outgoing neighbor IDs from this node
    const neighbors: string[] = [];

    if (typeof node.next === 'string' && nodes[node.next] !== undefined) {
      neighbors.push(node.next);
    }

    if (node.choices) {
      for (const choice of node.choices) {
        if (choice.next !== null && choice.next !== undefined && nodes[choice.next] !== undefined) {
          neighbors.push(choice.next);
        }
      }
    }

    for (const neighborId of neighbors) {
      if (!depth.has(neighborId)) {
        depth.set(neighborId, nextDepth);
        queue.push(neighborId);
      }
    }
  }

  // --- Orphan nodes (unreachable by BFS) ---

  const maxDepth = depth.size > 0
    ? Math.max(...depth.values())
    : 0;
  const orphanDepth = depth.size > 0 ? maxDepth + 1 : 0;

  for (const id of Object.keys(nodes)) {
    if (!depth.has(id)) {
      depth.set(id, orphanDepth);
    }
  }

  // --- Group node IDs by layer ---

  const layers = new Map<number, string[]>();

  for (const [id, d] of depth) {
    let layer = layers.get(d);
    if (layer === undefined) {
      layer = [];
      layers.set(d, layer);
    }
    layer.push(id);
  }

  // --- Assign x/y positions ---

  const positions = new Map<string, { x: number; y: number }>();

  for (const [layerIndex, ids] of layers) {
    const x = LAYER_X_START + layerIndex * LAYER_X_GAP;

    for (let i = 0; i < ids.length; i++) {
      const y = NODE_Y_START + i * NODE_Y_GAP;
      positions.set(ids[i], { x, y });
    }
  }

  return positions;
}
