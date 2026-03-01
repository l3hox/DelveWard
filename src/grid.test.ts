import { describe, it, expect } from 'vitest';
import {
  isWalkable,
  PlayerState,
  WALKABLE_CELLS,
  TURN_LEFT,
  TURN_RIGHT,
  FACING_DELTA,
  type Facing,
} from './grid';

// Simple 5x5 grid: walls around the edge, floor inside
//   01234
// 0 #####
// 1 #...#
// 2 #...#
// 3 #...#
// 4 #####
const GRID = [
  '#####',
  '#...#',
  '#...#',
  '#...#',
  '#####',
];

// --- isWalkable ---

describe('isWalkable', () => {
  it('returns true for floor cells', () => {
    expect(isWalkable(GRID, 1, 1)).toBe(true);
    expect(isWalkable(GRID, 2, 2)).toBe(true);
    expect(isWalkable(GRID, 3, 3)).toBe(true);
  });

  it('returns false for wall cells', () => {
    expect(isWalkable(GRID, 0, 0)).toBe(false);
    expect(isWalkable(GRID, 4, 4)).toBe(false);
    expect(isWalkable(GRID, 2, 0)).toBe(false);
  });

  it('returns false for out-of-bounds coordinates', () => {
    expect(isWalkable(GRID, -1, 2)).toBe(false);
    expect(isWalkable(GRID, 2, -1)).toBe(false);
    expect(isWalkable(GRID, 5, 2)).toBe(false);
    expect(isWalkable(GRID, 2, 5)).toBe(false);
  });

  it('recognizes all walkable cell types', () => {
    const specialGrid = ['#D#', '#S#', '#U#', '#O#'];
    expect(isWalkable(specialGrid, 1, 0)).toBe(true); // Door
    expect(isWalkable(specialGrid, 1, 1)).toBe(true); // Stairs down
    expect(isWalkable(specialGrid, 1, 2)).toBe(true); // Stairs up
    expect(isWalkable(specialGrid, 1, 3)).toBe(true); // Object
  });
});

// --- WALKABLE_CELLS ---

describe('WALKABLE_CELLS', () => {
  it('contains exactly the expected cell types', () => {
    expect(WALKABLE_CELLS).toEqual(new Set(['.', 'D', 'S', 'U', 'O']));
  });

  it('does not include walls or void', () => {
    expect(WALKABLE_CELLS.has('#')).toBe(false);
    expect(WALKABLE_CELLS.has(' ')).toBe(false);
  });
});

// --- Turn tables ---

describe('turn tables', () => {
  it('full left rotation cycles back to start', () => {
    let f: Facing = 'N';
    f = TURN_LEFT[f]; expect(f).toBe('W');
    f = TURN_LEFT[f]; expect(f).toBe('S');
    f = TURN_LEFT[f]; expect(f).toBe('E');
    f = TURN_LEFT[f]; expect(f).toBe('N');
  });

  it('full right rotation cycles back to start', () => {
    let f: Facing = 'N';
    f = TURN_RIGHT[f]; expect(f).toBe('E');
    f = TURN_RIGHT[f]; expect(f).toBe('S');
    f = TURN_RIGHT[f]; expect(f).toBe('W');
    f = TURN_RIGHT[f]; expect(f).toBe('N');
  });

  it('left then right is identity', () => {
    for (const facing of ['N', 'E', 'S', 'W'] as Facing[]) {
      expect(TURN_RIGHT[TURN_LEFT[facing]]).toBe(facing);
    }
  });
});

// --- FACING_DELTA ---

describe('FACING_DELTA', () => {
  it('N moves row -1', () => expect(FACING_DELTA['N']).toEqual([0, -1]));
  it('S moves row +1', () => expect(FACING_DELTA['S']).toEqual([0, 1]));
  it('E moves col +1', () => expect(FACING_DELTA['E']).toEqual([1, 0]));
  it('W moves col -1', () => expect(FACING_DELTA['W']).toEqual([-1, 0]));
});

// --- PlayerState ---

describe('PlayerState', () => {
  it('initializes at given position and facing', () => {
    const p = new PlayerState(2, 3, 'S');
    expect(p.gridX).toBe(2);
    expect(p.gridZ).toBe(3);
    expect(p.facing).toBe('S');
  });

  it('moveForward into open cell succeeds', () => {
    const p = new PlayerState(2, 2, 'N');
    expect(p.moveForward(GRID)).toBe(true);
    expect(p.gridX).toBe(2);
    expect(p.gridZ).toBe(1);
  });

  it('moveForward into wall fails and position unchanged', () => {
    const p = new PlayerState(1, 1, 'N');
    expect(p.moveForward(GRID)).toBe(false);
    expect(p.gridX).toBe(1);
    expect(p.gridZ).toBe(1);
  });

  it('moveBack into open cell succeeds', () => {
    const p = new PlayerState(2, 2, 'N');
    expect(p.moveBack(GRID)).toBe(true);
    expect(p.gridX).toBe(2);
    expect(p.gridZ).toBe(3);
  });

  it('moveBack into wall fails', () => {
    const p = new PlayerState(1, 3, 'N');
    expect(p.moveBack(GRID)).toBe(false);
    expect(p.gridZ).toBe(3);
  });

  it('strafeLeft moves perpendicular', () => {
    const p = new PlayerState(2, 2, 'N'); // left of N is W → col-1
    expect(p.strafeLeft(GRID)).toBe(true);
    expect(p.gridX).toBe(1);
    expect(p.gridZ).toBe(2);
  });

  it('strafeRight moves perpendicular', () => {
    const p = new PlayerState(2, 2, 'N'); // right of N is E → col+1
    expect(p.strafeRight(GRID)).toBe(true);
    expect(p.gridX).toBe(3);
    expect(p.gridZ).toBe(2);
  });

  it('strafe into wall fails', () => {
    const p = new PlayerState(1, 1, 'S'); // left of S is E → col+1 = 2 (ok), right of S is W → col 0 (wall)
    expect(p.strafeRight(GRID)).toBe(false);
    expect(p.gridX).toBe(1);
  });

  it('turnLeft changes facing without moving', () => {
    const p = new PlayerState(2, 2, 'N');
    p.turnLeft();
    expect(p.facing).toBe('W');
    expect(p.gridX).toBe(2);
    expect(p.gridZ).toBe(2);
  });

  it('turnRight changes facing without moving', () => {
    const p = new PlayerState(2, 2, 'N');
    p.turnRight();
    expect(p.facing).toBe('E');
    expect(p.gridX).toBe(2);
    expect(p.gridZ).toBe(2);
  });

  it('walk a path: forward, turn right, forward', () => {
    const p = new PlayerState(1, 3, 'N');
    expect(p.moveForward(GRID)).toBe(true); // (1,2)
    p.turnRight();                           // facing E
    expect(p.moveForward(GRID)).toBe(true); // (2,2)
    expect(p.gridX).toBe(2);
    expect(p.gridZ).toBe(2);
    expect(p.facing).toBe('E');
  });
});
