import { describe, it, expect } from 'vitest';
import {
  isWalkable,
  buildWalkableSet,
  PlayerState,
  getFacingCell,
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

  it('returns false for void cells', () => {
    const voidGrid = ['# #', '#.#'];
    expect(isWalkable(voidGrid, 1, 0)).toBe(false); // void
    expect(isWalkable(voidGrid, 1, 1)).toBe(true);  // floor
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
    expect(p.gridZ).toBe(1);
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

  it('moveForward from edge into OOB fails', () => {
    // 1-cell grid: player on the only floor cell
    const tinyGrid = ['.'];
    const p = new PlayerState(0, 0, 'N');
    expect(p.moveForward(tinyGrid)).toBe(false);
    expect(p.gridX).toBe(0);
    expect(p.gridZ).toBe(0);
  });

  it('moves onto custom walkable chars when walkable set provided', () => {
    const customGrid = [
      '#####',
      '#.b.#',
      '#####',
    ];
    const walkable = buildWalkableSet([{ char: 'b', solid: false }]);
    const p = new PlayerState(1, 1, 'E', walkable);
    expect(p.moveForward(customGrid)).toBe(true);
    expect(p.gridX).toBe(2);
  });

  it('cannot move onto solid charDef chars', () => {
    const customGrid = [
      '#####',
      '#.@.#',
      '#####',
    ];
    const walkable = buildWalkableSet([{ char: '@', solid: true }]);
    const p = new PlayerState(1, 1, 'E', walkable);
    expect(p.moveForward(customGrid)).toBe(false);
    expect(p.gridX).toBe(1);
  });
});

// --- buildWalkableSet ---

describe('buildWalkableSet', () => {
  it('returns WALKABLE_CELLS when no charDefs provided', () => {
    expect(buildWalkableSet()).toBe(WALKABLE_CELLS);
    expect(buildWalkableSet([])).toBe(WALKABLE_CELLS);
  });

  it('adds walkable charDef chars to the set', () => {
    const set = buildWalkableSet([
      { char: 'b', solid: false },
      { char: 'm', solid: false },
    ]);
    expect(set.has('b')).toBe(true);
    expect(set.has('m')).toBe(true);
    expect(set.has('.')).toBe(true); // built-in still present
  });

  it('does not add solid charDef chars', () => {
    const set = buildWalkableSet([
      { char: '@', solid: true },
      { char: 'b', solid: false },
    ]);
    expect(set.has('@')).toBe(false);
    expect(set.has('b')).toBe(true);
  });
});

// --- isWalkable with custom set ---

describe('isWalkable with custom walkable set', () => {
  it('uses custom set when provided', () => {
    const customGrid = ['#b#'];
    const walkable = new Set(['.', 'b']);
    expect(isWalkable(customGrid, 1, 0, walkable)).toBe(true);
    expect(isWalkable(customGrid, 0, 0, walkable)).toBe(false);
  });
});

// --- Door-aware walkability ---

const DOOR_GRID = [
  '#####',
  '#.D.#',
  '#...#',
  '#####',
];

describe('isWalkable with isDoorOpen callback', () => {
  it('D cell with isDoorOpen returning true is walkable', () => {
    expect(isWalkable(DOOR_GRID, 2, 1, WALKABLE_CELLS, () => true)).toBe(true);
  });

  it('D cell with isDoorOpen returning false is not walkable', () => {
    expect(isWalkable(DOOR_GRID, 2, 1, WALKABLE_CELLS, () => false)).toBe(false);
  });

  it('D cell with no callback is walkable (default behavior)', () => {
    expect(isWalkable(DOOR_GRID, 2, 1)).toBe(true);
  });

  it('callback is not called for non-D cells', () => {
    let called = false;
    const cb = () => { called = true; return false; };
    // floor cell — should be walkable regardless, callback should not be called
    expect(isWalkable(DOOR_GRID, 1, 1, WALKABLE_CELLS, cb)).toBe(true);
    expect(called).toBe(false);
  });
});

describe('PlayerState with isDoorOpen', () => {
  it('can walk through open door', () => {
    const p = new PlayerState(1, 1, 'E', WALKABLE_CELLS, () => true);
    expect(p.moveForward(DOOR_GRID)).toBe(true);
    expect(p.gridX).toBe(2);
  });

  it('cannot walk through closed door', () => {
    const p = new PlayerState(1, 1, 'E', WALKABLE_CELLS, () => false);
    expect(p.moveForward(DOOR_GRID)).toBe(false);
    expect(p.gridX).toBe(1);
  });
});

// --- getFacingCell ---

describe('getFacingCell', () => {
  it('returns cell to the north', () => {
    const p = new PlayerState(3, 3, 'N');
    expect(getFacingCell(p)).toEqual({ col: 3, row: 2 });
  });

  it('returns cell to the east', () => {
    const p = new PlayerState(3, 3, 'E');
    expect(getFacingCell(p)).toEqual({ col: 4, row: 3 });
  });

  it('returns cell to the south', () => {
    const p = new PlayerState(3, 3, 'S');
    expect(getFacingCell(p)).toEqual({ col: 3, row: 4 });
  });

  it('returns cell to the west', () => {
    const p = new PlayerState(3, 3, 'W');
    expect(getFacingCell(p)).toEqual({ col: 2, row: 3 });
  });
});
