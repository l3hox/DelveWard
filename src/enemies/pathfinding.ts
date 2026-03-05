// BFS grid pathfinding — pure logic, no Three.js

export function manhattanDistance(
  c1: number, r1: number,
  c2: number, r2: number,
): number {
  return Math.abs(c1 - c2) + Math.abs(r1 - r2);
}

const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export interface PathCell {
  col: number;
  row: number;
}

/**
 * BFS shortest path from (fromCol, fromRow) to (toCol, toRow).
 * Returns array of cells from first step to destination, or null if unreachable.
 * isPassable checks walkability + closed doors + other blockers.
 */
export function findPath(
  grid: string[],
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  isPassable: (col: number, row: number) => boolean,
): PathCell[] | null {
  if (fromCol === toCol && fromRow === toRow) return [];

  const rows = grid.length;
  const cols = grid[0].length;
  const visited = new Set<string>();
  const parent = new Map<string, string>();

  const key = (c: number, r: number) => `${c},${r}`;
  const startKey = key(fromCol, fromRow);
  const goalKey = key(toCol, toRow);

  visited.add(startKey);
  const queue: [number, number][] = [[fromCol, fromRow]];

  while (queue.length > 0) {
    const [c, r] = queue.shift()!;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;

      const nk = key(nc, nr);
      if (visited.has(nk)) continue;
      visited.add(nk);

      // Goal cell is always reachable (we path TO the player, not onto them)
      const passable = nk === goalKey || isPassable(nc, nr);
      if (!passable) continue;

      parent.set(nk, key(c, r));

      if (nc === toCol && nr === toRow) {
        // Reconstruct path
        const path: PathCell[] = [];
        let cur = goalKey;
        while (cur !== startKey) {
          const [pc, pr] = cur.split(',').map(Number);
          path.push({ col: pc, row: pr });
          cur = parent.get(cur)!;
        }
        path.reverse();
        return path;
      }

      queue.push([nc, nr]);
    }
  }

  return null;
}
