// Projectile system — owns all active projectiles, handles movement, collision, lifecycle.
// Projectiles are transient runtime objects (not level entities).
// Positions are fractional (float) — projectiles move through the grid in real-time.

import type { Facing } from './grid';
import { FACING_DELTA } from './grid';

export interface Projectile {
  id: string;
  col: number;          // fractional position (float)
  row: number;          // fractional position (float)
  direction: Facing;    // N, E, S, W
  speed: number;        // cells per second
  damage: number;
  damageType: 'physical' | 'fire';
  statusEffect?: string;  // stub for Phase C ('burning')
  source: 'trap';       // M4 adds 'player' | 'enemy'
  projectileType: string; // 'dart' | 'arrow' | 'fireball'
  traveled: number;     // cells traveled so far
  maxRange: number;
}

// Projectile type -> stats lookup
export const PROJECTILE_STATS: Record<
  string,
  { speed: number; damage: number; damageType: 'physical' | 'fire'; maxRange: number; statusEffect?: string }
> = {
  dart:     { speed: 8, damage: 3, damageType: 'physical', maxRange: 20 },
  arrow:    { speed: 6, damage: 5, damageType: 'physical', maxRange: 15 },
  fireball: { speed: 4, damage: 8, damageType: 'fire',     maxRange: 10, statusEffect: 'burning' },
};

export type HitType = 'wall' | 'door' | 'player' | 'enemy';

export type ProjectileHitCallback = (
  projectile: Projectile,
  col: number,
  row: number,
  hitType: HitType,
) => void;

export class ProjectileManager {
  private projectiles = new Map<string, Projectile>();
  private nextId = 1;
  private onHit: ProjectileHitCallback | null = null;

  setHitCallback(cb: ProjectileHitCallback): void {
    this.onHit = cb;
  }

  spawn(opts: {
    col: number;
    row: number;
    direction: Facing;
    projectileType: string;
    source?: 'trap';
    maxRange?: number;
  }): Projectile {
    const stats = PROJECTILE_STATS[opts.projectileType];
    if (!stats) {
      throw new Error(`Unknown projectile type: '${opts.projectileType}'`);
    }

    const id = `proj_${this.nextId++}`;
    // Offset spawn toward the wall the launcher is mounted on (wall edge)
    const WALL_OFFSET = 0.45;
    const dirOffsets: Record<string, [number, number]> = {
      N: [0, WALL_OFFSET], S: [0, -WALL_OFFSET], E: [-WALL_OFFSET, 0], W: [WALL_OFFSET, 0],
    };
    const [dCol, dRow] = dirOffsets[opts.direction] ?? [0, 0];

    const projectile: Projectile = {
      id,
      col: opts.col + 0.5 + dCol,
      row: opts.row + 0.5 + dRow,
      direction: opts.direction,
      speed: stats.speed,
      damage: stats.damage,
      damageType: stats.damageType,
      statusEffect: stats.statusEffect,
      source: opts.source ?? 'trap',
      projectileType: opts.projectileType,
      traveled: 0,
      maxRange: opts.maxRange ?? stats.maxRange,
    };

    this.projectiles.set(id, projectile);
    return projectile;
  }

  update(
    delta: number,
    isWalkable: (col: number, row: number) => boolean,
    isDoorOpen: (col: number, row: number) => boolean,
    playerCol: number,
    playerRow: number,
    isEnemyAt?: (col: number, row: number) => boolean,
    isBlockAt?: (col: number, row: number) => boolean,
  ): void {
    const toRemove: string[] = [];

    for (const projectile of this.projectiles.values()) {
      const [dcol, drow] = FACING_DELTA[projectile.direction];
      const moveDist = projectile.speed * delta;

      // Walk every integer cell boundary crossed during this tick.
      // This prevents fast projectiles (large delta) from tunnelling through cells.
      const startCol = projectile.col;
      const startRow = projectile.row;
      const endCol = startCol + dcol * moveDist;
      const endRow = startRow + drow * moveDist;

      // Collect the sequence of integer cells entered along the path.
      // Movement is axis-aligned (only one dimension changes), so we step
      // through each integer boundary in that axis.
      const cells = this.cellsOnPath(startCol, startRow, endCol, endRow);

      let hit = false;
      let distanceToHit = moveDist; // default: full move

      for (const [cellCol, cellRow, distAtEntry] of cells) {
        const hitType = this.checkCellCollision(
          cellCol, cellRow,
          isWalkable, isDoorOpen,
          playerCol, playerRow,
          isEnemyAt,
          isBlockAt,
        );
        if (hitType !== null) {
          // Place the projectile at the boundary it collided with.
          const fraction = distAtEntry / moveDist;
          projectile.col = startCol + dcol * moveDist * fraction;
          projectile.row = startRow + drow * moveDist * fraction;
          projectile.traveled += distAtEntry;
          this.onHit?.(projectile, cellCol, cellRow, hitType);
          toRemove.push(projectile.id);
          hit = true;
          distanceToHit = distAtEntry;
          break;
        }
      }

      if (hit) continue;

      // No collision — commit full movement.
      projectile.col = endCol;
      projectile.row = endRow;
      projectile.traveled += moveDist;

      // Range expiry — no callback, just remove.
      if (projectile.traveled >= projectile.maxRange) {
        toRemove.push(projectile.id);
      }
    }

    for (const id of toRemove) {
      this.projectiles.delete(id);
    }
  }

  // Returns all integer cells entered along the path from (startCol,startRow)
  // to (endCol,endRow), in traversal order. Movement is axis-aligned.
  // Each entry is [cellCol, cellRow, distanceTraveledAtEntry].
  //
  // The start cell (cell the projectile is currently in) is included when the
  // path begins exactly at an integer boundary — which handles spawn-in-cell
  // player/enemy detection.  All newly-entered cells are included.
  private cellsOnPath(
    startCol: number,
    startRow: number,
    endCol: number,
    endRow: number,
  ): [number, number, number][] {
    const result: [number, number, number][] = [];

    const dcol = endCol - startCol;
    const drow = endRow - startRow;
    const totalDist = Math.abs(dcol) || Math.abs(drow);

    if (totalDist === 0) return result;

    // Collect boundary crossings along the moving axis.
    // For each integer boundary the projectile crosses, record the cell entered
    // and how far along the path (0..totalDist) the crossing occurs.
    const crossings: [number, number, number][] = []; // [cellCol, cellRow, dist]

    if (dcol !== 0) {
      // Moving horizontally
      const step = dcol > 0 ? 1 : -1;
      const firstBoundary = dcol > 0 ? Math.ceil(startCol) : Math.floor(startCol);
      for (let b = firstBoundary; ; b += step) {
        const dist = Math.abs(b - startCol);
        if (dist > totalDist + 1e-9) break;
        const cellCol = dcol > 0 ? b : b - 1;
        const cellRow = Math.floor(startRow);
        crossings.push([cellCol, cellRow, dist]);
        if (crossings.length > 100) break; // safety guard
      }
    } else {
      // Moving vertically
      const step = drow > 0 ? 1 : -1;
      const firstBoundary = drow > 0 ? Math.ceil(startRow) : Math.floor(startRow);
      for (let b = firstBoundary; ; b += step) {
        const dist = Math.abs(b - startRow);
        if (dist > totalDist + 1e-9) break;
        const cellCol = Math.floor(startCol);
        const cellRow = drow > 0 ? b : b - 1;
        crossings.push([cellCol, cellRow, dist]);
        if (crossings.length > 100) break; // safety guard
      }
    }

    // Include the spawn/current cell at dist=0 for spawn-in-cell checks.
    const startCellCol = Math.floor(startCol);
    const startCellRow = Math.floor(startRow);
    const alreadyHasStart = crossings.length > 0 && crossings[0][2] === 0;
    if (!alreadyHasStart) {
      result.push([startCellCol, startCellRow, 0]);
    }

    for (const c of crossings) {
      result.push(c);
    }

    return result;
  }

  getAll(): Projectile[] {
    return Array.from(this.projectiles.values());
  }

  removeById(id: string): void {
    this.projectiles.delete(id);
  }

  clear(): void {
    this.projectiles.clear();
  }

  saveState(): Projectile[] {
    return Array.from(this.projectiles.values()).map((p) => ({ ...p }));
  }

  loadState(projectiles: Projectile[]): void {
    this.projectiles.clear();
    for (const p of projectiles) {
      this.projectiles.set(p.id, { ...p });
    }
  }

  // Returns the HitType if a collision is detected in the given cell, null otherwise.
  // Wall and door checks take priority over entity checks.
  private checkCellCollision(
    col: number,
    row: number,
    isWalkable: (col: number, row: number) => boolean,
    isDoorOpen: (col: number, row: number) => boolean,
    playerCol: number,
    playerRow: number,
    isEnemyAt?: (col: number, row: number) => boolean,
    isBlockAt?: (col: number, row: number) => boolean,
  ): HitType | null {
    if (!isWalkable(col, row)) return 'wall';
    if (!isDoorOpen(col, row)) return 'door';
    if (isBlockAt?.(col, row)) return 'wall'; // blocks stop projectiles like walls
    if (col === playerCol && row === playerRow) return 'player';
    if (isEnemyAt?.(col, row)) return 'enemy';
    return null;
  }
}
