import { describe, it, expect } from 'vitest';
import { calculateDamage, playerAttack, enemyAttackPlayer, PLAYER_ATTACK_COOLDOWN } from './combat';
import { GameState } from './gameState';
import { PlayerState } from './grid';
import type { Facing } from './grid';

function makePlayer(col: number, row: number, facing: Facing): PlayerState {
  return new PlayerState(col, row, facing);
}

function makeGameStateWithEnemy(): GameState {
  const gs = new GameState([
    { col: 3, row: 1, type: 'enemy', enemyType: 'rat' },
  ], [
    '#####',
    '#...#',
    '#...#',
    '#####',
  ]);
  return gs;
}

describe('calculateDamage', () => {
  it('always deals at least 1 damage', () => {
    // ATK 1, DEF 10 — should still be 1
    for (let i = 0; i < 50; i++) {
      expect(calculateDamage(1, 10)).toBe(1);
    }
  });

  it('deals expected damage when ATK > DEF', () => {
    const results = new Set<number>();
    for (let i = 0; i < 100; i++) {
      results.add(calculateDamage(5, 2));
    }
    // 5 - 2 + (-1..+1) = 2, 3, or 4
    expect(results).toContain(2);
    expect(results).toContain(3);
    expect(results).toContain(4);
    expect(results.size).toBeLessThanOrEqual(3);
  });
});

describe('playerAttack', () => {
  it('hits enemy in facing cell', () => {
    const gs = makeGameStateWithEnemy();
    // Player at (2,1) facing E → attacks (3,1) where rat is
    const player = makePlayer(2, 1, 'E');
    const result = playerAttack(player, gs);
    expect(result.type === 'hit' || result.type === 'kill').toBe(true);
    expect(result.damage).toBeGreaterThan(0);
    expect(result.targetCol).toBe(3);
    expect(result.targetRow).toBe(1);
  });

  it('returns no_target when no enemy in facing cell', () => {
    const gs = makeGameStateWithEnemy();
    const player = makePlayer(2, 1, 'W'); // facing wall, no enemy
    const result = playerAttack(player, gs);
    expect(result.type).toBe('no_target');
  });

  it('sets cooldown after attack', () => {
    const gs = makeGameStateWithEnemy();
    const player = makePlayer(2, 1, 'E');
    playerAttack(player, gs);
    expect(gs.attackCooldown).toBe(PLAYER_ATTACK_COOLDOWN);
  });

  it('returns cooldown when on cooldown', () => {
    const gs = makeGameStateWithEnemy();
    gs.attackCooldown = 0.5;
    const player = makePlayer(2, 1, 'E');
    const result = playerAttack(player, gs);
    expect(result.type).toBe('cooldown');
  });

  it('can kill an enemy', () => {
    const gs = makeGameStateWithEnemy();
    const player = makePlayer(2, 1, 'E');
    gs.atk = 100; // overkill
    const result = playerAttack(player, gs);
    expect(result.type).toBe('kill');
    expect(gs.getEnemy(3, 1)).toBeUndefined();
  });
});

describe('enemyAttackPlayer', () => {
  it('reduces player hp', () => {
    const gs = new GameState([], ['#.#']);
    const startHp = gs.hp;
    const result = enemyAttackPlayer(gs, 3);
    expect(gs.hp).toBeLessThan(startHp);
    expect(result.damage).toBeGreaterThan(0);
  });

  it('does not reduce hp below 0', () => {
    const gs = new GameState([], ['#.#']);
    gs.hp = 1;
    enemyAttackPlayer(gs, 100);
    expect(gs.hp).toBe(0);
  });
});
