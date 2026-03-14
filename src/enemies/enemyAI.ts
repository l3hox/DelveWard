// Real-time enemy AI — pure logic, no Three.js

import type { GameState } from '../core/gameState';
import { doorKey } from '../core/gameState';
import { findPath, manhattanDistance } from './pathfinding';
import { isWalkable } from '../core/grid';

export type EnemyActionType = 'idle' | 'move' | 'attack' | 'regen';

export interface EnemyAction {
  enemyKey: string;
  type: EnemyActionType;
  fromCol: number;
  fromRow: number;
  toCol?: number;
  toRow?: number;
}

const DEAGGRO_BUFFER = 2;

// Cardinal directions: N, E, S, W
const CARDINAL_DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * Tick all enemies by delta seconds. Each enemy accumulates time
 * and acts when its moveTimer reaches moveInterval.
 */
export function updateEnemies(
  gameState: GameState,
  playerCol: number,
  playerRow: number,
  grid: string[],
  walkable: Set<string>,
  isDoorOpen: (col: number, row: number) => boolean,
  delta: number,
): EnemyAction[] {
  const actions: EnemyAction[] = [];

  // Track occupied cells (prevent stacking)
  const occupied = new Set<string>();
  for (const enemy of gameState.enemies.values()) {
    occupied.add(doorKey(enemy.col, enemy.row));
  }

  // Process in deterministic order
  const sortedKeys = [...gameState.enemies.keys()].sort();

  for (const key of sortedKeys) {
    const enemy = gameState.enemies.get(key)!;

    const dist = manhattanDistance(enemy.col, enemy.row, playerCol, playerRow);

    // --- Troll HP regen (independent of movement timer) ---
    if (enemy.type === 'troll' && enemy.regenTimer !== undefined && enemy.regenPauseTimer !== undefined) {
      if (enemy.regenPauseTimer > 0) {
        enemy.regenPauseTimer = Math.max(0, enemy.regenPauseTimer - delta);
      } else if (enemy.hp < enemy.maxHp) {
        enemy.regenTimer += delta;
        if (enemy.regenTimer >= 1) {
          enemy.regenTimer -= 1;
          enemy.hp = Math.min(enemy.hp + 7, enemy.maxHp);
          actions.push({ enemyKey: key, type: 'regen', fromCol: enemy.col, fromRow: enemy.row });
        }
      }
    }

    // --- Kobold flee state transitions ---
    // Switch to flee as soon as HP drops below 30%, regardless of current state.
    // The flee movement handler will fall back to 'attack' if actually cornered.
    if (enemy.type === 'kobold' && enemy.hp < enemy.maxHp * 0.3 && enemy.aiState !== 'flee') {
      enemy.aiState = 'flee';
    }

    // State transitions (always evaluated, not gated by timer)
    if (enemy.aiState === 'idle' && dist <= enemy.aggroRange) {
      enemy.aiState = 'chase';
    } else if (enemy.aiState === 'chase' && dist > enemy.aggroRange + DEAGGRO_BUFFER) {
      enemy.aiState = 'idle';
    }

    if (enemy.aiState === 'chase' && dist <= 1) {
      enemy.aiState = 'attack';
    } else if (enemy.aiState === 'attack' && dist > 1) {
      enemy.aiState = enemy.type === 'kobold' && enemy.hp < enemy.maxHp * 0.3
        ? 'flee'
        : 'chase';
    }

    // Flee at double speed; all other states use normal interval
    const effectiveInterval = enemy.aiState === 'flee' ? enemy.moveInterval / 2 : enemy.moveInterval;

    // Accumulate timer
    enemy.moveTimer += delta;
    if (enemy.moveTimer < effectiveInterval) continue;
    enemy.moveTimer = 0;

    if (enemy.aiState === 'attack') {
      actions.push({
        enemyKey: key,
        type: 'attack',
        fromCol: enemy.col,
        fromRow: enemy.row,
      });
      continue;
    }

    // --- Flee movement (kobold) ---
    if (enemy.aiState === 'flee') {
      const isPassable = (col: number, row: number) =>
        !occupied.has(doorKey(col, row)) &&
        isWalkable(grid, col, row, walkable, isDoorOpen);

      // Find the adjacent walkable cell that maximises distance from player
      let bestCell: { col: number; row: number } | null = null;
      let bestDist = -1;
      for (const [dc, dr] of CARDINAL_DIRS) {
        const nc = enemy.col + dc;
        const nr = enemy.row + dr;
        if (!isPassable(nc, nr)) continue;
        const d = manhattanDistance(nc, nr, playerCol, playerRow);
        if (d > bestDist) {
          bestDist = d;
          bestCell = { col: nc, row: nr };
        }
      }

      if (bestCell === null) {
        // Cornered — fight back
        enemy.aiState = 'attack';
        actions.push({
          enemyKey: key,
          type: 'attack',
          fromCol: enemy.col,
          fromRow: enemy.row,
        });
      } else {
        const stepKey = doorKey(bestCell.col, bestCell.row);
        occupied.delete(doorKey(enemy.col, enemy.row));
        occupied.add(stepKey);
        actions.push({
          enemyKey: key,
          type: 'move',
          fromCol: enemy.col,
          fromRow: enemy.row,
          toCol: bestCell.col,
          toRow: bestCell.row,
        });
        gameState.moveEnemy(enemy.col, enemy.row, bestCell.col, bestCell.row);
      }
      continue;
    }

    // --- Chase movement ---
    if (enemy.aiState === 'chase') {
      const isPassable = (col: number, row: number) => {
        if (occupied.has(doorKey(col, row)) && !(col === enemy.col && row === enemy.row)) {
          return false;
        }
        return isWalkable(grid, col, row, walkable, isDoorOpen);
      };

      const path = findPath(
        grid,
        enemy.col, enemy.row,
        playerCol, playerRow,
        isPassable,
      );

      if (path && path.length > 1) {
        let step = path[0];

        // Giant bat: 30% chance of erratic fluttery movement
        if (enemy.type === 'giant_bat' && Math.random() < 0.3) {
          const isPassableForBat = (col: number, row: number) =>
            !occupied.has(doorKey(col, row)) &&
            isWalkable(grid, col, row, walkable, isDoorOpen);

          const candidates: { col: number; row: number }[] = [];
          for (const [dc, dr] of CARDINAL_DIRS) {
            const nc = enemy.col + dc;
            const nr = enemy.row + dr;
            if (isPassableForBat(nc, nr)) {
              candidates.push({ col: nc, row: nr });
            }
          }
          if (candidates.length > 0) {
            step = candidates[Math.floor(Math.random() * candidates.length)];
          }
        }

        const stepKey = doorKey(step.col, step.row);
        if (stepKey !== doorKey(playerCol, playerRow) && !occupied.has(stepKey)) {
          occupied.delete(doorKey(enemy.col, enemy.row));
          occupied.add(stepKey);

          actions.push({
            enemyKey: key,
            type: 'move',
            fromCol: enemy.col,
            fromRow: enemy.row,
            toCol: step.col,
            toRow: step.row,
          });

          gameState.moveEnemy(enemy.col, enemy.row, step.col, step.row);
          continue;
        }
      }
    }

    // Idle or couldn't move — no action emitted
  }

  return actions;
}
