// Pure game logic — no Three.js dependency

export type Facing = 'N' | 'E' | 'S' | 'W';

// Camera Y rotation for each facing direction (Three.js camera faces -Z by default = North)
export const FACING_ANGLE: Record<Facing, number> = {
  N: 0,
  E: -Math.PI / 2,
  S: Math.PI,
  W: Math.PI / 2,
};

// [dcol, drow] per facing
export const FACING_DELTA: Record<Facing, [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

export const TURN_LEFT: Record<Facing, Facing> = { N: 'W', W: 'S', S: 'E', E: 'N' };
export const TURN_RIGHT: Record<Facing, Facing> = { N: 'E', E: 'S', S: 'W', W: 'N' };

export const WALKABLE_CELLS = new Set(['.']);

export function buildWalkableSet(
  charDefs?: Array<{ char: string; solid: boolean }>,
): Set<string> {
  if (!charDefs || charDefs.length === 0) return WALKABLE_CELLS;
  const set = new Set(WALKABLE_CELLS);
  for (const def of charDefs) {
    if (!def.solid) set.add(def.char);
  }
  return set;
}

export function isWalkable(
  grid: string[],
  col: number,
  row: number,
  walkable: Set<string> = WALKABLE_CELLS,
  isDoorOpen?: (col: number, row: number) => boolean,
  isBlocked?: (col: number, row: number) => boolean,
): boolean {
  if (row < 0 || row >= grid.length) return false;
  if (col < 0 || col >= grid[0].length) return false;
  const cell = grid[row][col];
  if (!walkable.has(cell)) return false;
  if (isDoorOpen && !isDoorOpen(col, row)) return false;
  if (isBlocked && isBlocked(col, row)) return false;
  return true;
}

export class PlayerState {
  col: number;
  row: number;
  facing: Facing;
  private walkable: Set<string>;
  private isDoorOpen?: (col: number, row: number) => boolean;
  private isBlocked?: (col: number, row: number) => boolean;

  constructor(
    col: number,
    row: number,
    facing: Facing,
    walkable?: Set<string>,
    isDoorOpen?: (col: number, row: number) => boolean,
    isBlocked?: (col: number, row: number) => boolean,
  ) {
    this.col = col;
    this.row = row;
    this.facing = facing;
    this.walkable = walkable ?? WALKABLE_CELLS;
    this.isDoorOpen = isDoorOpen;
    this.isBlocked = isBlocked;
  }

  moveForward(grid: string[]): boolean {
    const [dc, dr] = FACING_DELTA[this.facing];
    const nc = this.col + dc;
    const nr = this.row + dr;
    if (!isWalkable(grid, nc, nr, this.walkable, this.isDoorOpen, this.isBlocked)) return false;
    this.col = nc;
    this.row = nr;
    return true;
  }

  moveBack(grid: string[]): boolean {
    const [dc, dr] = FACING_DELTA[this.facing];
    const nc = this.col - dc;
    const nr = this.row - dr;
    if (!isWalkable(grid, nc, nr, this.walkable, this.isDoorOpen, this.isBlocked)) return false;
    this.col = nc;
    this.row = nr;
    return true;
  }

  strafeLeft(grid: string[]): boolean {
    const [dc, dr] = FACING_DELTA[TURN_LEFT[this.facing]];
    const nc = this.col + dc;
    const nr = this.row + dr;
    if (!isWalkable(grid, nc, nr, this.walkable, this.isDoorOpen, this.isBlocked)) return false;
    this.col = nc;
    this.row = nr;
    return true;
  }

  strafeRight(grid: string[]): boolean {
    const [dc, dr] = FACING_DELTA[TURN_RIGHT[this.facing]];
    const nc = this.col + dc;
    const nr = this.row + dr;
    if (!isWalkable(grid, nc, nr, this.walkable, this.isDoorOpen, this.isBlocked)) return false;
    this.col = nc;
    this.row = nr;
    return true;
  }

  turnLeft(): void {
    this.facing = TURN_LEFT[this.facing];
  }

  turnRight(): void {
    this.facing = TURN_RIGHT[this.facing];
  }
}

export function getFacingCell(state: PlayerState): { col: number; row: number } {
  const [dc, dr] = FACING_DELTA[state.facing];
  return { col: state.col + dc, row: state.row + dr };
}
