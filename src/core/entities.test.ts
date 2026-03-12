import { describe, it, expect, beforeEach } from 'vitest';
import { EntityRegistry } from './entities';
import type { ItemEntity, ItemLocation, EquipSlot } from './entities';

// --- EntityRegistry ---

describe('EntityRegistry', () => {
  let reg: EntityRegistry;

  beforeEach(() => {
    reg = new EntityRegistry();
  });

  // --- createItem ---

  describe('createItem', () => {
    it('returns an entity with instanceId matching item_N pattern', () => {
      const entity = reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 1, row: 1 });
      expect(entity.instanceId).toMatch(/^item_\d+$/);
    });

    it('increments instanceId on each call', () => {
      const a = reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      const b = reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 1, row: 1 });
      const numA = parseInt(a.instanceId.replace('item_', ''), 10);
      const numB = parseInt(b.instanceId.replace('item_', ''), 10);
      expect(numB).toBe(numA + 1);
    });

    it('stores the provided itemId', () => {
      const entity = reg.createItem('axe_hand', 'fine', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      expect(entity.itemId).toBe('axe_hand');
    });

    it('stores the provided quality', () => {
      const entity = reg.createItem('axe_hand', 'masterwork', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      expect(entity.quality).toBe('masterwork');
    });

    it('stores the provided location', () => {
      const loc: ItemLocation = { kind: 'world', levelId: 'dungeon1', col: 3, row: 5 };
      const entity = reg.createItem('dagger_iron', 'common', loc);
      expect(entity.location).toEqual(loc);
    });

    it('defaults modifiers to empty array', () => {
      const entity = reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      expect(entity.modifiers).toEqual([]);
    });

    it('stores provided modifiers', () => {
      const entity = reg.createItem('sword_flamebrand', 'enchanted', { kind: 'world', levelId: 'l1', col: 0, row: 0 }, ['fire_damage']);
      expect(entity.modifiers).toEqual(['fire_damage']);
    });
  });

  // --- addItem / getItem ---

  describe('addItem / getItem', () => {
    it('addItem followed by getItem returns the same entity', () => {
      const entity: ItemEntity = {
        instanceId: 'item_99',
        itemId: 'sword_iron',
        quality: 'common',
        modifiers: [],
        location: { kind: 'world', levelId: 'l1', col: 1, row: 1 },
      };
      reg.addItem(entity);
      expect(reg.getItem('item_99')).toBe(entity);
    });

    it('getItem returns undefined for an unknown instanceId', () => {
      expect(reg.getItem('item_9999')).toBeUndefined();
    });
  });

  // --- removeItem ---

  describe('removeItem', () => {
    it('item is gone after removal', () => {
      const entity = reg.createItem('dagger_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      reg.removeItem(entity.instanceId);
      expect(reg.getItem(entity.instanceId)).toBeUndefined();
    });

    it('removing a nonexistent id does not throw', () => {
      expect(() => reg.removeItem('item_999')).not.toThrow();
    });
  });

  // --- moveItem ---

  describe('moveItem', () => {
    it('updates the item location', () => {
      const entity = reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      const newLoc: ItemLocation = { kind: 'backpack', slot: 3 };
      reg.moveItem(entity.instanceId, newLoc);
      expect(reg.getItem(entity.instanceId)!.location).toEqual(newLoc);
    });

    it('does not throw for a nonexistent instanceId', () => {
      expect(() => reg.moveItem('item_999', { kind: 'backpack', slot: 0 })).not.toThrow();
    });
  });

  // --- getGroundItems ---

  describe('getGroundItems', () => {
    it('returns only items at the specified cell', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 2, row: 3 });
      reg.createItem('dagger_iron', 'common', { kind: 'world', levelId: 'l1', col: 5, row: 7 });
      const items = reg.getGroundItems('l1', 2, 3);
      expect(items.length).toBe(1);
      expect(items[0].itemId).toBe('sword_iron');
    });

    it('returns multiple items at the same cell', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 1, row: 1 });
      reg.createItem('dagger_iron', 'common', { kind: 'world', levelId: 'l1', col: 1, row: 1 });
      expect(reg.getGroundItems('l1', 1, 1).length).toBe(2);
    });

    it('returns empty array when no items at cell', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      expect(reg.getGroundItems('l1', 9, 9)).toEqual([]);
    });

    it('does not include items from a different level', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l2', col: 1, row: 1 });
      expect(reg.getGroundItems('l1', 1, 1)).toEqual([]);
    });

    it('does not include backpack or equipped items', () => {
      reg.createItem('sword_iron', 'common', { kind: 'backpack', slot: 0 });
      reg.createItem('dagger_iron', 'common', { kind: 'equipped', slot: 'weapon' });
      expect(reg.getGroundItems('l1', 0, 0)).toEqual([]);
    });
  });

  // --- getAllGroundItemsForLevel ---

  describe('getAllGroundItemsForLevel', () => {
    it('returns all world items for the given level', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      reg.createItem('dagger_iron', 'common', { kind: 'world', levelId: 'l1', col: 1, row: 1 });
      reg.createItem('axe_hand', 'common', { kind: 'world', levelId: 'l2', col: 0, row: 0 });
      const items = reg.getAllGroundItemsForLevel('l1');
      expect(items.length).toBe(2);
    });

    it('excludes items from other levels', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l2', col: 0, row: 0 });
      expect(reg.getAllGroundItemsForLevel('l1')).toEqual([]);
    });

    it('excludes backpack and equipped items', () => {
      reg.createItem('sword_iron', 'common', { kind: 'backpack', slot: 0 });
      reg.createItem('dagger_iron', 'common', { kind: 'equipped', slot: 'weapon' });
      expect(reg.getAllGroundItemsForLevel('l1')).toEqual([]);
    });
  });

  // --- getBackpackItems ---

  describe('getBackpackItems', () => {
    it('returns backpack items sorted by slot ascending', () => {
      reg.createItem('sword_iron', 'common', { kind: 'backpack', slot: 5 });
      reg.createItem('dagger_iron', 'common', { kind: 'backpack', slot: 2 });
      reg.createItem('axe_hand', 'common', { kind: 'backpack', slot: 0 });
      const items = reg.getBackpackItems();
      expect(items.map((e) => (e.location as { slot: number }).slot)).toEqual([0, 2, 5]);
    });

    it('returns empty array when no backpack items', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      expect(reg.getBackpackItems()).toEqual([]);
    });

    it('excludes equipped and world items', () => {
      reg.createItem('sword_iron', 'common', { kind: 'equipped', slot: 'weapon' });
      reg.createItem('dagger_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      expect(reg.getBackpackItems()).toEqual([]);
    });
  });

  // --- getBackpackItemAt ---

  describe('getBackpackItemAt', () => {
    it('returns the item at the specified slot', () => {
      const entity = reg.createItem('sword_iron', 'common', { kind: 'backpack', slot: 4 });
      const found = reg.getBackpackItemAt(4);
      expect(found).toBeDefined();
      expect(found!.instanceId).toBe(entity.instanceId);
    });

    it('returns undefined for an empty slot', () => {
      reg.createItem('sword_iron', 'common', { kind: 'backpack', slot: 0 });
      expect(reg.getBackpackItemAt(7)).toBeUndefined();
    });
  });

  // --- nextBackpackSlot ---

  describe('nextBackpackSlot', () => {
    it('returns 0 for an empty registry', () => {
      expect(reg.nextBackpackSlot()).toBe(0);
    });

    it('skips occupied slots', () => {
      reg.createItem('sword_iron', 'common', { kind: 'backpack', slot: 0 });
      reg.createItem('dagger_iron', 'common', { kind: 'backpack', slot: 1 });
      expect(reg.nextBackpackSlot()).toBe(2);
    });

    it('returns the first gap in occupied slots', () => {
      reg.createItem('sword_iron', 'common', { kind: 'backpack', slot: 0 });
      reg.createItem('dagger_iron', 'common', { kind: 'backpack', slot: 2 });
      expect(reg.nextBackpackSlot()).toBe(1);
    });

    it('returns null when all 12 slots are full', () => {
      for (let i = 0; i < 12; i++) {
        reg.createItem('sword_iron', 'common', { kind: 'backpack', slot: i });
      }
      expect(reg.nextBackpackSlot()).toBeNull();
    });

    it('does not count world or equipped items as occupying backpack slots', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      reg.createItem('dagger_iron', 'common', { kind: 'equipped', slot: 'weapon' });
      expect(reg.nextBackpackSlot()).toBe(0);
    });
  });

  // --- getEquipped / getAllEquipped ---

  describe('getEquipped', () => {
    it('returns the item equipped in the given slot', () => {
      const entity = reg.createItem('sword_iron', 'common', { kind: 'equipped', slot: 'weapon' });
      const found = reg.getEquipped('weapon');
      expect(found).toBeDefined();
      expect(found!.instanceId).toBe(entity.instanceId);
    });

    it('returns undefined when nothing is equipped in the slot', () => {
      expect(reg.getEquipped('weapon')).toBeUndefined();
    });
  });

  describe('getAllEquipped', () => {
    it('returns all equipped items keyed by slot', () => {
      reg.createItem('sword_iron', 'common', { kind: 'equipped', slot: 'weapon' });
      reg.createItem('armor_leather_cap', 'common', { kind: 'equipped', slot: 'head' });
      const map = reg.getAllEquipped();
      expect(map.size).toBe(2);
      expect(map.has('weapon')).toBe(true);
      expect(map.has('head')).toBe(true);
    });

    it('returns an empty map when nothing is equipped', () => {
      reg.createItem('sword_iron', 'common', { kind: 'backpack', slot: 0 });
      expect(reg.getAllEquipped().size).toBe(0);
    });
  });

  // --- clearLevel ---

  describe('clearLevel', () => {
    it('removes world items for the given level', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      reg.createItem('dagger_iron', 'common', { kind: 'world', levelId: 'l1', col: 1, row: 1 });
      reg.clearLevel('l1');
      expect(reg.getAllGroundItemsForLevel('l1')).toEqual([]);
    });

    it('does not remove items from other levels', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l2', col: 0, row: 0 });
      reg.clearLevel('l1');
      expect(reg.getAllGroundItemsForLevel('l2').length).toBe(1);
    });

    it('does not remove backpack items', () => {
      const entity = reg.createItem('sword_iron', 'common', { kind: 'backpack', slot: 0 });
      reg.clearLevel('l1');
      expect(reg.getItem(entity.instanceId)).toBeDefined();
    });

    it('does not remove equipped items', () => {
      const entity = reg.createItem('sword_iron', 'common', { kind: 'equipped', slot: 'weapon' });
      reg.clearLevel('l1');
      expect(reg.getItem(entity.instanceId)).toBeDefined();
    });
  });

  // --- clear ---

  describe('clear', () => {
    it('removes all items', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      reg.createItem('dagger_iron', 'common', { kind: 'backpack', slot: 0 });
      reg.createItem('axe_hand', 'common', { kind: 'equipped', slot: 'weapon' });
      reg.clear();
      expect(reg.getAllGroundItemsForLevel('l1')).toEqual([]);
      expect(reg.getBackpackItems()).toEqual([]);
      expect(reg.getAllEquipped().size).toBe(0);
    });

    it('resets _nextId so the next createItem starts from item_0', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      reg.clear();
      const entity = reg.createItem('dagger_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      expect(entity.instanceId).toBe('item_0');
    });
  });

  // --- snapshot / restore ---

  describe('snapshot / restore', () => {
    it('snapshot returns a copy of all items', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      reg.createItem('dagger_iron', 'fine', { kind: 'backpack', slot: 2 });
      const snap = reg.snapshot();
      expect(snap.length).toBe(2);
    });

    it('snapshot is a deep copy — mutating returned array does not affect registry', () => {
      const entity = reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      const snap = reg.snapshot();
      snap[0].itemId = 'tampered';
      expect(reg.getItem(entity.instanceId)!.itemId).toBe('sword_iron');
    });

    it('restore produces identical state', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 1, row: 2 });
      reg.createItem('dagger_iron', 'fine', { kind: 'backpack', slot: 0 }, ['crit_bonus']);
      reg.createItem('axe_hand', 'masterwork', { kind: 'equipped', slot: 'weapon' });
      const snap = reg.snapshot();

      const reg2 = new EntityRegistry();
      reg2.restore(snap);

      const snap2 = reg2.snapshot();
      // Sort both by instanceId for stable comparison
      snap.sort((a, b) => a.instanceId.localeCompare(b.instanceId));
      snap2.sort((a, b) => a.instanceId.localeCompare(b.instanceId));
      expect(snap2).toEqual(snap);
    });

    it('restore sets _nextId above the highest restored id', () => {
      // Create items with ids item_0, item_1, item_2
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      reg.createItem('dagger_iron', 'common', { kind: 'world', levelId: 'l1', col: 1, row: 0 });
      reg.createItem('axe_hand', 'common', { kind: 'world', levelId: 'l1', col: 2, row: 0 });
      const snap = reg.snapshot(); // items are item_0 through item_2

      const reg2 = new EntityRegistry();
      reg2.restore(snap);

      // The next item created should not collide with item_0..item_2
      const newEntity = reg2.createItem('mace_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      const num = parseInt(newEntity.instanceId.replace('item_', ''), 10);
      expect(num).toBeGreaterThan(2);
    });

    it('restore replaces current state entirely', () => {
      reg.createItem('sword_iron', 'common', { kind: 'world', levelId: 'l1', col: 0, row: 0 });
      const snap = reg.snapshot();

      // Add extra item after snapshot
      reg.createItem('dagger_iron', 'common', { kind: 'world', levelId: 'l1', col: 1, row: 1 });
      expect(reg.getAllGroundItemsForLevel('l1').length).toBe(2);

      reg.restore(snap);
      expect(reg.getAllGroundItemsForLevel('l1').length).toBe(1);
    });
  });
});
