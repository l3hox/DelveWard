import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ItemDatabase } from './itemDatabase';

const itemsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../public/data/items.json'), 'utf-8'),
);

vi.stubGlobal('fetch', async () => ({
  ok: true,
  json: async () => itemsData,
}));

// --- ItemDatabase ---

describe('ItemDatabase', () => {
  let db: ItemDatabase;

  beforeEach(() => {
    db = new ItemDatabase();
  });

  // --- isLoaded ---

  describe('isLoaded', () => {
    it('returns false before load()', () => {
      expect(db.isLoaded()).toBe(false);
    });

    it('returns true after load()', async () => {
      await db.load();
      expect(db.isLoaded()).toBe(true);
    });
  });

  // --- getItem ---

  describe('getItem', () => {
    it('returns undefined before load', () => {
      expect(db.getItem('sword_rusty')).toBeUndefined();
    });

    it('returns the correct item after load', async () => {
      await db.load();
      const item = db.getItem('sword_iron');
      expect(item).toBeDefined();
      expect(item!.id).toBe('sword_iron');
      expect(item!.name).toBe('Iron Sword');
    });

    it('returns undefined for a nonexistent id', async () => {
      await db.load();
      expect(db.getItem('nonexistent')).toBeUndefined();
    });
  });

  // --- getItemsByType ---

  describe('getItemsByType', () => {
    it('returns only weapon items', async () => {
      await db.load();
      const weapons = db.getItemsByType('weapon');
      expect(weapons.length).toBeGreaterThan(0);
      for (const item of weapons) {
        expect(item.type).toBe('weapon');
      }
    });

    it('returns only armor items', async () => {
      await db.load();
      const armors = db.getItemsByType('armor');
      expect(armors.length).toBeGreaterThan(0);
      for (const item of armors) {
        expect(item.type).toBe('armor');
      }
    });

    it('returns only consumable items', async () => {
      await db.load();
      const consumables = db.getItemsByType('consumable');
      expect(consumables.length).toBeGreaterThan(0);
      for (const item of consumables) {
        expect(item.type).toBe('consumable');
      }
    });

    it('returns only accessory items', async () => {
      await db.load();
      const accessories = db.getItemsByType('accessory');
      expect(accessories.length).toBeGreaterThan(0);
      for (const item of accessories) {
        expect(item.type).toBe('accessory');
      }
    });

    it('returns an empty array when no items match', async () => {
      // Use a fresh db with an empty payload to guarantee an empty result
      vi.stubGlobal('fetch', async () => ({
        ok: true,
        json: async () => ({ version: '1.0', note: '', items: [] }),
      }));
      const emptyDb = new ItemDatabase();
      await emptyDb.load();
      expect(emptyDb.getItemsByType('weapon')).toEqual([]);
      // Restore original mock for subsequent tests
      vi.stubGlobal('fetch', async () => ({
        ok: true,
        json: async () => itemsData,
      }));
    });
  });

  // --- Field correctness ---

  describe('item field correctness', () => {
    it('sword_rusty has correct type, subtype, quality, and stats', async () => {
      await db.load();
      const item = db.getItem('sword_rusty');
      expect(item).toBeDefined();
      expect(item!.type).toBe('weapon');
      expect(item!.subtype).toBe('sword');
      expect(item!.quality).toBe('poor');
      expect(item!.stats.atk).toBe(3);
    });

    it('sword_flamebrand has enchanted quality and a modifier', async () => {
      await db.load();
      const item = db.getItem('sword_flamebrand');
      expect(item).toBeDefined();
      expect(item!.quality).toBe('enchanted');
      expect(item!.modifiers.length).toBe(1);
      expect(item!.modifiers[0].id).toBe('fire_damage');
    });

    it('torch_oil has consumable effect fields', async () => {
      await db.load();
      const item = db.getItem('torch_oil');
      expect(item).toBeDefined();
      expect(item!.stackable).toBe(true);
      expect(item!.stackMax).toBe(5);
      expect(item!.effect?.torchFuel).toBe(50);
    });

    it('antidote has curePoison effect', async () => {
      await db.load();
      const item = db.getItem('antidote');
      expect(item).toBeDefined();
      expect(item!.effect?.curePoison).toBe(true);
    });

    it('armor_leather_cap has correct subtype and stats', async () => {
      await db.load();
      const item = db.getItem('armor_leather_cap');
      expect(item).toBeDefined();
      expect(item!.type).toBe('armor');
      expect(item!.subtype).toBe('head');
      expect(item!.stats.def).toBe(1);
    });

    it('ring_of_power has correct accessory fields', async () => {
      await db.load();
      const item = db.getItem('ring_of_power');
      expect(item).toBeDefined();
      expect(item!.type).toBe('accessory');
      expect(item!.subtype).toBe('ring');
      expect(item!.stats.str).toBe(2);
    });

    it('dagger_vipers_fang modifier includes critChance stat', async () => {
      await db.load();
      const item = db.getItem('dagger_vipers_fang');
      expect(item).toBeDefined();
      expect(item!.modifiers[0].stats?.critChance).toBe(15);
    });

    it('sword_iron has str requirement', async () => {
      await db.load();
      const item = db.getItem('sword_iron');
      expect(item!.requirements.str).toBe(3);
    });
  });

  // --- Idempotent load ---

  describe('idempotent load', () => {
    it('load() can be called multiple times without error', async () => {
      await db.load();
      await db.load();
      expect(db.isLoaded()).toBe(true);
    });

    it('getItem works correctly after multiple load() calls', async () => {
      await db.load();
      await db.load();
      const item = db.getItem('sword_iron');
      expect(item).toBeDefined();
      expect(item!.name).toBe('Iron Sword');
    });
  });

  // --- load failure ---

  describe('load failure', () => {
    it('throws when fetch returns a non-ok response', async () => {
      vi.stubGlobal('fetch', async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }));
      const failDb = new ItemDatabase();
      await expect(failDb.load()).rejects.toThrow('Failed to load item database');
      // Restore
      vi.stubGlobal('fetch', async () => ({
        ok: true,
        json: async () => itemsData,
      }));
    });
  });
});
