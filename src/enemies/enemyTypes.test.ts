import { describe, it, expect, beforeAll, vi } from 'vitest';
import { enemyDatabase } from './enemyDatabase';
import { createEnemyInstance } from './enemyTypes';
import fs from 'fs';
import path from 'path';

const enemiesJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../public/data/enemies.json'), 'utf-8')
);

beforeAll(async () => {
  // Mock fetch to return the enemies.json payload
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(enemiesJson),
  }));
  await enemyDatabase.load();
});

describe('EnemyDatabase', () => {
  it('loads all 9 enemies', () => {
    expect(enemyDatabase.getAllEnemies()).toHaveLength(9);
  });

  it('getEnemy returns correct stats for rat', () => {
    const rat = enemyDatabase.getEnemy('rat');
    expect(rat).toBeDefined();
    expect(rat!.maxHp).toBe(8);
    expect(rat!.atk).toBe(2);
    expect(rat!.def).toBe(0);
    expect(rat!.aggroRange).toBe(3);
    expect(rat!.moveInterval).toBe(0.6);
    expect(rat!.xp).toBe(10);
  });

  it('getEnemy returns undefined for unknown type', () => {
    expect(enemyDatabase.getEnemy('dragon')).toBeUndefined();
  });

  it('getAllEnemyIds returns all 9 ids', () => {
    const ids = enemyDatabase.getAllEnemyIds();
    expect(ids).toHaveLength(9);
    expect(ids).toContain('rat');
    expect(ids).toContain('troll');
  });

  it('hasBehavior returns true for troll regen', () => {
    expect(enemyDatabase.hasBehavior('troll', 'regen')).toBe(true);
  });

  it('hasBehavior returns false for rat regen', () => {
    expect(enemyDatabase.hasBehavior('rat', 'regen')).toBe(false);
  });

  it('hasBehavior returns true for kobold flee', () => {
    expect(enemyDatabase.hasBehavior('kobold', 'flee')).toBe(true);
  });

  it('hasBehavior returns true for giant_bat erratic', () => {
    expect(enemyDatabase.hasBehavior('giant_bat', 'erratic')).toBe(true);
  });

  it('getBehavior returns correct regen params', () => {
    const regen = enemyDatabase.getBehavior('troll', 'regen');
    expect(regen).toBeDefined();
    expect(regen!.params.hpPerTick).toBe(7);
    expect(regen!.params.tickInterval).toBe(1);
    expect(regen!.params.pauseOnDamage).toBe(3);
  });

  it('getBehavior returns correct flee params', () => {
    const flee = enemyDatabase.getBehavior('kobold', 'flee');
    expect(flee).toBeDefined();
    expect(flee!.params.hpThreshold).toBe(0.3);
    expect(flee!.params.speedMultiplier).toBe(2);
  });

  it('isLoaded returns true after load', () => {
    expect(enemyDatabase.isLoaded()).toBe(true);
  });

  it('each enemy has positive maxHp', () => {
    for (const def of enemyDatabase.getAllEnemies()) {
      expect(def.maxHp).toBeGreaterThan(0);
    }
  });

  it('each enemy has positive atk', () => {
    for (const def of enemyDatabase.getAllEnemies()) {
      expect(def.atk).toBeGreaterThan(0);
    }
  });

  it('each enemy has a sprite path', () => {
    for (const def of enemyDatabase.getAllEnemies()) {
      expect(def.sprite.path).toBeTruthy();
    }
  });
});

describe('createEnemyInstance', () => {
  it('returns correct fields from def', () => {
    const enemy = createEnemyInstance(3, 5, 'rat');
    expect(enemy.col).toBe(3);
    expect(enemy.row).toBe(5);
    expect(enemy.type).toBe('rat');
    expect(enemy.maxHp).toBe(8);
    expect(enemy.atk).toBe(2);
    expect(enemy.def).toBe(0);
    expect(enemy.aggroRange).toBe(3);
    expect(enemy.moveInterval).toBe(0.6);
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

  it('inits regenTimer for regen enemies', () => {
    const troll = createEnemyInstance(1, 1, 'troll');
    expect(troll.regenTimer).toBe(0);
    expect(troll.regenPauseTimer).toBe(0);
  });

  it('does not init regenTimer for non-regen enemies', () => {
    const rat = createEnemyInstance(1, 1, 'rat');
    expect(rat.regenTimer).toBeUndefined();
    expect(rat.regenPauseTimer).toBeUndefined();
  });
});
