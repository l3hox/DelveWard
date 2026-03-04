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

export const WALKABLE_CELLS = new Set(['.', 'D', 'S', 'U', 'O']);

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
): boolean {
  if (row < 0 || row >= grid.length) return false;
  if (col < 0 || col >= grid[0].length) return false;
  return walkable.has(grid[row][col]);
}

export class PlayerState {
  gridX: number;
  gridZ: number;
  facing: Facing;
  private walkable: Set<string>;

  constructor(col: number, row: number, facing: Facing, walkable?: Set<string>) {
    this.gridX = col;
    this.gridZ = row;
    this.facing = facing;
    this.walkable = walkable ?? WALKABLE_CELLS;
  }

  moveForward(grid: string[]): boolean {
    const [dc, dr] = FACING_DELTA[this.facing];
    const nx = this.gridX + dc;
    const nz = this.gridZ + dr;
    if (!isWalkable(grid, nx, nz, this.walkable)) return false;
    this.gridX = nx;
    this.gridZ = nz;
    return true;
  }

  moveBack(grid: string[]): boolean {
    const [dc, dr] = FACING_DELTA[this.facing];
    const nx = this.gridX - dc;
    const nz = this.gridZ - dr;
    if (!isWalkable(grid, nx, nz, this.walkable)) return false;
    this.gridX = nx;
    this.gridZ = nz;
    return true;
  }

  strafeLeft(grid: string[]): boolean {
    const [dc, dr] = FACING_DELTA[TURN_LEFT[this.facing]];
    const nx = this.gridX + dc;
    const nz = this.gridZ + dr;
    if (!isWalkable(grid, nx, nz, this.walkable)) return false;
    this.gridX = nx;
    this.gridZ = nz;
    return true;
  }

  strafeRight(grid: string[]): boolean {
    const [dc, dr] = FACING_DELTA[TURN_RIGHT[this.facing]];
    const nx = this.gridX + dc;
    const nz = this.gridZ + dr;
    if (!isWalkable(grid, nx, nz, this.walkable)) return false;
    this.gridX = nx;
    this.gridZ = nz;
    return true;
  }

  turnLeft(): void {
    this.facing = TURN_LEFT[this.facing];
  }

  turnRight(): void {
    this.facing = TURN_RIGHT[this.facing];
  }
}
