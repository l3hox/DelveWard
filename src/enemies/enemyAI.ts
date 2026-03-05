// Enemy AI turn execution — pure logic, no Three.js

import type { EnemyInstance } from './enemyTypes';
import type { GameState } from '../core/gameState';
import { doorKey } from '../core/gameState';
import { findPath, manhattanDistance } from './pathfinding';
import { isWalkable } from '../core/grid';

export type EnemyActionType = 'idle' | 'move' | 'attack';

export interface EnemyAction {
  enemyKey: string;
  type: EnemyActionType;
  fromCol: number;
  fromRow: number;
  toCol?: number;
  toRow?: number;
}

const DEAGGRO_BUFFER = 2;

export function executeEnemyTurns(
  gameState: GameState,
  playerCol: number,
  playerRow: number,
  grid: string[],
  walkable: Set<string>,
  isDoorOpen: (col: number, row: number) => boolean,
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
    enemy.turnCounter++;

    const dist = manhattanDistance(enemy.col, enemy.row, playerCol, playerRow);

    // State transitions
    if (enemy.aiState === 'idle' && dist <= enemy.aggroRange) {
      enemy.aiState = 'chase';
    } else if (enemy.aiState === 'chase' && dist > enemy.aggroRange + DEAGGRO_BUFFER) {
      enemy.aiState = 'idle';
    }

    // Attack if adjacent
    if (enemy.aiState === 'chase' && dist <= 1) {
      enemy.aiState = 'attack';
    } else if (enemy.aiState === 'attack' && dist > 1) {
      enemy.aiState = 'chase';
    }

    // Skip turn if speed gating
    if (enemy.turnCounter % enemy.speed !== 0) {
      actions.push({
        enemyKey: key,
        type: 'idle',
        fromCol: enemy.col,
        fromRow: enemy.row,
      });
      continue;
    }

    if (enemy.aiState === 'attack') {
      actions.push({
        enemyKey: key,
        type: 'attack',
        fromCol: enemy.col,
        fromRow: enemy.row,
      });
      continue;
    }

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
        // Don't step onto player's cell
        const step = path[0];
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

    actions.push({
      enemyKey: key,
      type: 'idle',
      fromCol: enemy.col,
      fromRow: enemy.row,
    });
  }

  return actions;
}
