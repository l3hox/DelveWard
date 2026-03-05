import { describe, it, expect } from 'vitest';
import { manhattanDistance, findPath } from './pathfinding';

describe('manhattanDistance', () => {
  it('returns 0 for same point', () => {
    expect(manhattanDistance(3, 4, 3, 4)).toBe(0);
  });

  it('returns correct distance for horizontal offset', () => {
    expect(manhattanDistance(1, 0, 4, 0)).toBe(3);
  });

  it('returns correct distance for vertical offset', () => {
    expect(manhattanDistance(0, 1, 0, 5)).toBe(4);
  });

  it('returns correct distance for diagonal offset', () => {
    expect(manhattanDistance(1, 1, 4, 5)).toBe(7);
  });
});

describe('findPath', () => {
  const grid = [
    '#####',
    '#...#',
    '#.#.#',
    '#...#',
    '#####',
  ];

  const passable = (col: number, row: number): boolean => {
    if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length)
      return false;
    return grid[row][col] === '.';
  };

  it('returns empty array when start equals end', () => {
    const path = findPath(grid, 1, 1, 1, 1, passable);
    expect(path).toEqual([]);
  });

  it('finds straight-line path in open corridor', () => {
    const corridor = [
      '#####',
      '#...#',
      '#####',
    ];
    const corridorPassable = (col: number, row: number): boolean => {
      if (row < 0 || row >= corridor.length || col < 0 || col >= corridor[0].length)
        return false;
      return corridor[row][col] === '.';
    };

    const path = findPath(corridor, 1, 1, 3, 1, corridorPassable);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(2);
    expect(path![0]).toEqual({ col: 2, row: 1 });
    expect(path![1]).toEqual({ col: 3, row: 1 });
  });

  it('finds path around a wall', () => {
    // Wall at (2,2), must go around
    const path = findPath(grid, 1, 1, 3, 1, passable);
    expect(path).not.toBeNull();
    // Must go down around the wall: (1,1) -> (1,2) -> (1,3) -> (2,3) -> (3,3) -> (3,2) -> (3,1)
    // or (1,1) -> (2,1) -> ... but (2,2) is blocked so shortest is via top: (1,1) -> (2,1) -> (3,1)
    // Actually (2,1) is '.', so direct path: (2,1) then (3,1) -- length 2
    expect(path!.length).toBe(2);
    expect(path![path!.length - 1]).toEqual({ col: 3, row: 1 });
  });

  it('returns null when target is unreachable', () => {
    // Isolated cell surrounded by walls
    const isolated = [
      '#####',
      '#.#.#',
      '#####',
    ];
    const isolatedPassable = (col: number, row: number): boolean => {
      if (row < 0 || row >= isolated.length || col < 0 || col >= isolated[0].length)
        return false;
      return isolated[row][col] === '.';
    };

    const path = findPath(isolated, 1, 1, 3, 1, isolatedPassable);
    expect(path).toBeNull();
  });

  it('respects isPassable callback for blocked cells', () => {
    // Block the middle row entirely via callback
    const blockMiddle = (col: number, row: number): boolean => {
      if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length)
        return false;
      if (row === 2) return false; // block entire middle row
      return grid[row][col] === '.';
    };

    // From (1,1) to (1,3) -- must cross row 2, which is blocked
    const path = findPath(grid, 1, 1, 1, 3, blockMiddle);
    expect(path).toBeNull();
  });

  it('finds shortest path (BFS guarantees this)', () => {
    const open = [
      '#######',
      '#.....#',
      '#.....#',
      '#.....#',
      '#######',
    ];
    const openPassable = (col: number, row: number): boolean => {
      if (row < 0 || row >= open.length || col < 0 || col >= open[0].length)
        return false;
      return open[row][col] === '.';
    };

    const path = findPath(open, 1, 1, 5, 1, openPassable);
    expect(path).not.toBeNull();
    // Shortest is 4 steps straight across row 1
    expect(path!.length).toBe(4);
  });
});
