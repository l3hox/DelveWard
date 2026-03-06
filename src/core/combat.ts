// Pure combat logic — no Three.js

import type { GameState } from './gameState';
import type { PlayerState } from './grid';
import { getFacingCell } from './grid';

export const PLAYER_ATTACK_COOLDOWN = 0.8; // seconds

export interface CombatResult {
  type: 'miss' | 'hit' | 'kill' | 'no_target' | 'cooldown';
  damage?: number;
  targetCol?: number;
  targetRow?: number;
  enemyType?: string;
}

export interface EnemyAttackResult {
  type: 'hit';
  damage: number;
  enemyType: string;
}

/**
 * Calculate damage: max(1, ATK - DEF + random(-1..+1))
 * Always deals at least 1 damage.
 */
export function calculateDamage(atk: number, def: number): number {
  const roll = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
  return Math.max(1, atk - def + roll);
}

/**
 * Player attacks the cell they're facing.
 * Returns what happened.
 */
export function playerAttack(
  playerState: PlayerState,
  gameState: GameState,
): CombatResult {
  if (gameState.attackCooldown > 0) {
    return { type: 'cooldown' };
  }

  const { col, row } = getFacingCell(playerState);
  const enemy = gameState.getEnemy(col, row);
  if (!enemy) {
    // Still trigger cooldown on whiff to prevent spam
    gameState.attackCooldown = PLAYER_ATTACK_COOLDOWN;
    return { type: 'no_target' };
  }

  const damage = calculateDamage(gameState.getEffectiveAtk(), enemy.def);
  const killed = gameState.damageEnemy(col, row, damage);

  gameState.attackCooldown = PLAYER_ATTACK_COOLDOWN;

  return {
    type: killed ? 'kill' : 'hit',
    damage,
    targetCol: col,
    targetRow: row,
    enemyType: enemy.type,
  };
}

/**
 * Enemy attacks the player. Called when enemy AI emits an attack action.
 */
export function enemyAttackPlayer(
  gameState: GameState,
  enemyAtk: number,
): EnemyAttackResult {
  const damage = calculateDamage(enemyAtk, gameState.getEffectiveDef());
  gameState.hp = Math.max(0, gameState.hp - damage);
  return { type: 'hit', damage, enemyType: '' };
}
