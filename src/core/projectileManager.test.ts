import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectileManager, PROJECTILE_STATS } from './projectileManager';
import type { Projectile, HitType } from './projectileManager';

// Simple 5x5 grid: walls on edges, open floor inside (cols 1-3, rows 1-3).
const isWalkable = (col: number, row: number) =>
  col >= 1 && col <= 3 && row >= 1 && row <= 3;

// No doors by default — every cell is open.
const isDoorOpen = (_col: number, _row: number) => true;

// No enemies by default.
const noEnemies = (_col: number, _row: number) => false;

// Player parked far away so it doesn't interfere unless a test moves it.
const FAR = 99;

describe('ProjectileManager', () => {
  let pm: ProjectileManager;

  beforeEach(() => {
    pm = new ProjectileManager();
  });

  // --- spawn ---

  describe('spawn()', () => {
    it('creates a projectile with stats from PROJECTILE_STATS', () => {
      const p = pm.spawn({ col: 2, row: 2, direction: 'N', projectileType: 'dart' });

      expect(p.projectileType).toBe('dart');
      expect(p.speed).toBe(PROJECTILE_STATS.dart.speed);
      expect(p.damage).toBe(PROJECTILE_STATS.dart.damage);
      expect(p.damageType).toBe(PROJECTILE_STATS.dart.damageType);
      expect(p.maxRange).toBe(PROJECTILE_STATS.dart.maxRange);
    });

    it('spawns at wall edge offset toward launcher (opposite of firing direction)', () => {
      const e = pm.spawn({ col: 2, row: 3, direction: 'E', projectileType: 'arrow' });
      expect(e.col).toBeCloseTo(2.05, 5); // offset toward west wall (launcher side)
      expect(e.row).toBeCloseTo(3.5, 5);

      const pm2 = new ProjectileManager();
      const n = pm2.spawn({ col: 5, row: 5, direction: 'N', projectileType: 'dart' });
      expect(n.col).toBeCloseTo(5.5, 5);
      expect(n.row).toBeCloseTo(5.95, 5); // offset toward south wall
    });

    it('assigns a unique id per projectile', () => {
      const a = pm.spawn({ col: 1, row: 1, direction: 'N', projectileType: 'dart' });
      const b = pm.spawn({ col: 1, row: 1, direction: 'S', projectileType: 'dart' });
      expect(a.id).not.toBe(b.id);
    });

    it('initializes traveled to 0', () => {
      const p = pm.spawn({ col: 1, row: 1, direction: 'N', projectileType: 'dart' });
      expect(p.traveled).toBe(0);
    });

    it('applies maxRange override when provided', () => {
      const p = pm.spawn({ col: 1, row: 1, direction: 'N', projectileType: 'dart', maxRange: 5 });
      expect(p.maxRange).toBe(5);
    });

    it('carries statusEffect from PROJECTILE_STATS (fireball)', () => {
      const p = pm.spawn({ col: 1, row: 1, direction: 'E', projectileType: 'fireball' });
      expect(p.statusEffect).toBe('burning');
    });

    it('throws for an unknown projectile type', () => {
      expect(() => pm.spawn({ col: 1, row: 1, direction: 'N', projectileType: 'laser' })).toThrow();
    });
  });

  // --- movement ---

  describe('movement', () => {
    it('dart moving N travels 1 cell in 1/speed seconds', () => {
      // Dart speed = 8. After 0.125s it should have moved exactly 1 cell north.
      const p = pm.spawn({ col: 2, row: 2, direction: 'N', projectileType: 'dart' });
      const startRow = p.row; // 2.5

      pm.update(0.125, isWalkable, isDoorOpen, FAR, FAR, noEnemies);

      const [p2] = pm.getAll();
      expect(p2.row).toBeCloseTo(startRow - 1, 5);
      expect(p2.col).toBeCloseTo(2.5, 5);
    });

    it('advances traveled by speed * delta', () => {
      pm.spawn({ col: 2, row: 2, direction: 'E', projectileType: 'dart' });

      pm.update(0.1, isWalkable, isDoorOpen, FAR, FAR, noEnemies);

      const [p] = pm.getAll();
      expect(p.traveled).toBeCloseTo(PROJECTILE_STATS.dart.speed * 0.1, 5);
    });
  });

  // --- wall collision ---

  describe('wall collision', () => {
    it('removes projectile and fires callback with wall when entering a wall cell', () => {
      const cb = vi.fn();
      pm.setHitCallback(cb);

      // Start at col=1, row=2 facing W. After moving left it will hit col=0 (wall).
      pm.spawn({ col: 1, row: 2, direction: 'W', projectileType: 'dart' });

      // Advance enough to cross into col=0.
      pm.update(0.2, isWalkable, isDoorOpen, FAR, FAR, noEnemies);

      expect(pm.getAll()).toHaveLength(0);
      expect(cb).toHaveBeenCalledOnce();
      const [proj, col, row, hitType] = cb.mock.calls[0] as [Projectile, number, number, HitType];
      expect(hitType).toBe('wall');
      expect(col).toBe(0);
      expect(proj.projectileType).toBe('dart');
    });
  });

  // --- door collision ---

  describe('door collision', () => {
    it('removes projectile and fires callback with door for closed door', () => {
      const cb = vi.fn();
      pm.setHitCallback(cb);

      // All doors closed except far away — block at col=2.
      const closedDoor = (col: number, _row: number) => col !== 2;

      pm.spawn({ col: 1, row: 2, direction: 'E', projectileType: 'dart' });

      pm.update(0.2, isWalkable, closedDoor, FAR, FAR, noEnemies);

      expect(pm.getAll()).toHaveLength(0);
      const [, , , hitType] = cb.mock.calls[0] as [Projectile, number, number, HitType];
      expect(hitType).toBe('door');
    });
  });

  // --- range expiry ---

  describe('maxRange expiry', () => {
    it('removes projectile after traveling maxRange cells — no callback fired', () => {
      const cb = vi.fn();
      pm.setHitCallback(cb);

      // Override maxRange to 1 so it expires quickly.
      // Large open space so walls don't interfere: all cells walkable.
      const openField = (_col: number, _row: number) => true;
      pm.spawn({ col: 2, row: 2, direction: 'N', projectileType: 'dart', maxRange: 1 });

      // Advance 0.2s — dart at speed 8 travels 1.6 cells, past maxRange=1.
      pm.update(0.2, openField, isDoorOpen, FAR, FAR, noEnemies);

      expect(pm.getAll()).toHaveLength(0);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  // --- player collision ---

  describe('player collision', () => {
    it('fires player hit when projectile enters the player cell', () => {
      const cb = vi.fn();
      pm.setHitCallback(cb);

      const openField = (_col: number, _row: number) => true;

      // Dart at col=1,row=2 facing E. Player is at col=2,row=2.
      pm.spawn({ col: 1, row: 2, direction: 'E', projectileType: 'dart' });

      pm.update(0.2, openField, isDoorOpen, 2, 2, noEnemies);

      expect(pm.getAll()).toHaveLength(0);
      const [, , , hitType] = cb.mock.calls[0] as [Projectile, number, number, HitType];
      expect(hitType).toBe('player');
    });
  });

  // --- directional movement ---

  describe('facing directions', () => {
    const openField = (_col: number, _row: number) => true;

    it.each([
      ['N', 5, 5, 5, 4],   // row decreases
      ['S', 5, 5, 5, 6],   // row increases
      ['E', 5, 5, 6, 5],   // col increases
      ['W', 5, 5, 4, 5],   // col decreases
    ] as const)('facing %s moves from (%d,%d) toward (%d,%d)', (dir, spawnCol, spawnRow, expectCol, expectRow) => {
      pm.spawn({ col: spawnCol, row: spawnRow, direction: dir, projectileType: 'dart', maxRange: 99 });

      // 0.125s at speed 8 = exactly 1 cell
      pm.update(0.125, openField, isDoorOpen, FAR, FAR, noEnemies);

      const [p] = pm.getAll();
      expect(Math.floor(p.col)).toBe(expectCol);
      expect(Math.floor(p.row)).toBe(expectRow);
    });
  });

  // --- clear ---

  describe('clear()', () => {
    it('removes all projectiles', () => {
      pm.spawn({ col: 1, row: 1, direction: 'N', projectileType: 'dart' });
      pm.spawn({ col: 2, row: 2, direction: 'S', projectileType: 'arrow' });
      expect(pm.getAll()).toHaveLength(2);

      pm.clear();

      expect(pm.getAll()).toHaveLength(0);
    });
  });

  // --- saveState / loadState ---

  describe('saveState() / loadState()', () => {
    it('roundtrip preserves all projectile fields', () => {
      const p = pm.spawn({ col: 2, row: 1, direction: 'S', projectileType: 'fireball' });

      const snapshot = pm.saveState();
      const pm2 = new ProjectileManager();
      pm2.loadState(snapshot);

      const [restored] = pm2.getAll();
      expect(restored.id).toBe(p.id);
      expect(restored.col).toBe(p.col);
      expect(restored.row).toBe(p.row);
      expect(restored.direction).toBe(p.direction);
      expect(restored.speed).toBe(p.speed);
      expect(restored.damage).toBe(p.damage);
      expect(restored.damageType).toBe(p.damageType);
      expect(restored.statusEffect).toBe(p.statusEffect);
      expect(restored.projectileType).toBe(p.projectileType);
      expect(restored.traveled).toBe(p.traveled);
      expect(restored.maxRange).toBe(p.maxRange);
    });

    it('loadState replaces existing state', () => {
      pm.spawn({ col: 1, row: 1, direction: 'N', projectileType: 'dart' });
      const snapshot = pm.saveState();

      const pm2 = new ProjectileManager();
      pm2.spawn({ col: 3, row: 3, direction: 'W', projectileType: 'arrow' });
      pm2.spawn({ col: 2, row: 2, direction: 'E', projectileType: 'arrow' });
      expect(pm2.getAll()).toHaveLength(2);

      pm2.loadState(snapshot);
      expect(pm2.getAll()).toHaveLength(1);
    });

    it('snapshot is independent — mutating returned array does not affect manager', () => {
      pm.spawn({ col: 1, row: 1, direction: 'N', projectileType: 'dart' });
      const snapshot = pm.saveState();

      snapshot[0].damage = 9999;

      const [original] = pm.getAll();
      expect(original.damage).toBe(PROJECTILE_STATS.dart.damage);
    });
  });

  // --- hit callback ---

  describe('hit callback', () => {
    it('callback receives correct hit type, cell coords, and projectile reference', () => {
      const hits: Array<{ proj: Projectile; col: number; row: number; hitType: HitType }> = [];
      pm.setHitCallback((proj, col, row, hitType) => hits.push({ proj, col, row, hitType }));

      // Dart facing north from (2,1) — next cell is (2,0) which is a wall.
      pm.spawn({ col: 2, row: 1, direction: 'N', projectileType: 'dart' });

      pm.update(0.2, isWalkable, isDoorOpen, FAR, FAR, noEnemies);

      expect(hits).toHaveLength(1);
      expect(hits[0].hitType).toBe('wall');
      expect(hits[0].col).toBe(2);
      expect(hits[0].row).toBe(0);
      expect(hits[0].proj.projectileType).toBe('dart');
    });

    it('enemy hit fires callback with enemy type', () => {
      const cb = vi.fn();
      pm.setHitCallback(cb);
      const openField = (_col: number, _row: number) => true;

      // Enemy at (3,5). Dart at (2,5) facing E.
      const hasEnemy = (col: number, row: number) => col === 3 && row === 5;
      pm.spawn({ col: 2, row: 5, direction: 'E', projectileType: 'dart' });

      pm.update(0.2, openField, isDoorOpen, FAR, FAR, hasEnemy);

      expect(pm.getAll()).toHaveLength(0);
      const [, , , hitType] = cb.mock.calls[0] as [Projectile, number, number, HitType];
      expect(hitType).toBe('enemy');
    });
  });
});
