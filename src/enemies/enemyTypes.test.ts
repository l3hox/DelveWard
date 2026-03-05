import { describe, it, expect } from 'vitest';
import { ENEMY_DEFS, createEnemyInstance } from './enemyTypes';

describe('ENEMY_DEFS', () => {
  it('has rat, skeleton, and orc defined', () => {
    expect(ENEMY_DEFS).toHaveProperty('rat');
    expect(ENEMY_DEFS).toHaveProperty('skeleton');
    expect(ENEMY_DEFS).toHaveProperty('orc');
  });

  it('each def has positive maxHp', () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      expect(def.maxHp).toBeGreaterThan(0);
    }
  });

  it('each def has positive damage', () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      expect(def.damage).toBeGreaterThan(0);
    }
  });

  it('each def has positive aggroRange', () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      expect(def.aggroRange).toBeGreaterThan(0);
    }
  });

  it('each def has positive moveInterval', () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      expect(def.moveInterval).toBeGreaterThan(0);
    }
  });
});

describe('createEnemyInstance', () => {
  it('returns correct fields from def', () => {
    const enemy = createEnemyInstance(3, 5, 'rat');
    expect(enemy.col).toBe(3);
    expect(enemy.row).toBe(5);
    expect(enemy.type).toBe('rat');
    expect(enemy.maxHp).toBe(ENEMY_DEFS.rat.maxHp);
    expect(enemy.damage).toBe(ENEMY_DEFS.rat.damage);
    expect(enemy.aggroRange).toBe(ENEMY_DEFS.rat.aggroRange);
    expect(enemy.moveInterval).toBe(ENEMY_DEFS.rat.moveInterval);
  });

  it('starts with hp equal to maxHp', () => {
    const enemy = createEnemyInstance(1, 1, 'skeleton');
    expect(enemy.hp).toBe(enemy.maxHp);
  });

  it('starts with aiState idle and moveTimer 0', () => {
    const enemy = createEnemyInstance(1, 1, 'orc');
    expect(enemy.aiState).toBe('idle');
    expect(enemy.moveTimer).toBe(0);
  });

  it('throws for unknown enemy type', () => {
    expect(() => createEnemyInstance(1, 1, 'dragon')).toThrow(
      'Unknown enemy type: dragon',
    );
  });
});
