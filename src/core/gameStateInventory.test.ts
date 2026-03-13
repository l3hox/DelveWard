/**
 * Tests for the new inventory-management methods added to GameState:
 *   equipFromBackpack, unequipToBackpack, dropItem, useConsumableFromRegistry
 *
 * These methods all require itemDatabase.isLoaded() to return true, so we
 * mock the module here rather than touching the main gameState.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameState } from './gameState';

vi.mock('./itemDatabase', () => {
  const defs: Record<string, object> = {
    sword_iron: {
      id: 'sword_iron', name: 'Iron Sword', type: 'weapon', subtype: 'sword',
      quality: 'common', icon: '', weight: 1, value: 1, description: '',
      stats: { atk: 4 }, modifiers: [], requirements: { str: 3 },
    },
    armor_leather_cap: {
      id: 'armor_leather_cap', name: 'Leather Cap', type: 'armor', subtype: 'head',
      quality: 'common', icon: '', weight: 1, value: 1, description: '',
      stats: { def: 1 }, modifiers: [], requirements: {},
    },
    health_potion: {
      id: 'health_potion', name: 'Health Potion', type: 'consumable', subtype: 'health_potion',
      quality: 'common', icon: '', weight: 1, value: 1, description: '',
      stats: { hp: 20 }, modifiers: [], requirements: {},
    },
    torch_oil: {
      id: 'torch_oil', name: 'Torch Oil', type: 'consumable', subtype: 'torch_oil',
      quality: 'common', icon: '', weight: 1, value: 1, description: '',
      stats: {}, effect: { torchFuel: 30 }, modifiers: [], requirements: {},
    },
    ring_of_power: {
      id: 'ring_of_power', name: 'Ring of Power', type: 'accessory', subtype: 'ring',
      quality: 'fine', icon: '', weight: 1, value: 1, description: '',
      stats: { str: 2 }, modifiers: [], requirements: {},
    },
    heavy_axe: {
      // High STR requirement — used for denied equip tests
      id: 'heavy_axe', name: 'Heavy Axe', type: 'weapon', subtype: 'axe',
      quality: 'common', icon: '', weight: 1, value: 1, description: '',
      stats: { atk: 8 }, modifiers: [], requirements: { str: 20 },
    },
  };
  return {
    itemDatabase: {
      isLoaded: () => true,
      getItem: (id: string) => defs[id],
    },
    // Re-export types so imports in gameState.ts don't break
    ItemDatabase: class {},
  };
});

function makeGs(): GameState {
  return new GameState([], undefined, 'test_level');
}

// ---------------------------------------------------------------------------
// equipFromBackpack
// ---------------------------------------------------------------------------

describe('GameState.equipFromBackpack', () => {
  let gs: GameState;

  beforeEach(() => {
    gs = makeGs();
  });

  it('equips a weapon from backpack slot 0 to the weapon equip slot', () => {
    gs.entityRegistry.createItem('sword_iron', 'common', { kind: 'backpack', slot: 0 });
    const result = gs.equipFromBackpack(0);
    expect(result.success).toBe(true);
    const equipped = gs.entityRegistry.getEquipped('weapon');
    expect(equipped).toBeDefined();
    expect(equipped!.itemId).toBe('sword_iron');
  });

  it('returns false for an out-of-range backpack index', () => {
    const result = gs.equipFromBackpack(5);
    expect(result.success).toBe(false);
  });

  it('returns false with reason when requirements not met', () => {
    gs.str = 1; // heavy_axe requires str 20
    gs.entityRegistry.createItem('heavy_axe', 'common', { kind: 'backpack', slot: 0 });
    const result = gs.equipFromBackpack(0);
    expect(result.success).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('STR');
  });

  it('swaps occupied slot — existing item goes to the backpack slot', () => {
    const existing = gs.entityRegistry.createItem('sword_iron', 'common', { kind: 'equipped', slot: 'weapon' });
    const newItem = gs.entityRegistry.createItem('heavy_axe', 'common', { kind: 'backpack', slot: 3 });

    // Give enough STR so heavy_axe passes requirements check
    gs.str = 25;

    const result = gs.equipFromBackpack(0); // only one backpack item at sorted index 0
    expect(result.success).toBe(true);
    expect(result.swappedToSlot).toBe(3); // existing item should now occupy slot 3

    // New item is equipped
    const equippedNow = gs.entityRegistry.getEquipped('weapon');
    expect(equippedNow!.instanceId).toBe(newItem.instanceId);

    // Old item is in backpack slot 3
    const displaced = gs.entityRegistry.getBackpackItemAt(3);
    expect(displaced).toBeDefined();
    expect(displaced!.instanceId).toBe(existing.instanceId);
  });

  it('recalculates maxHp after equip', () => {
    gs.entityRegistry.createItem('sword_iron', 'common', { kind: 'backpack', slot: 0 });
    const prevMax = gs.maxHp;
    gs.equipFromBackpack(0);
    // maxHp is recalculated; for this item (no VIT bonus) it should stay the same
    expect(gs.maxHp).toBe(prevMax);
  });
});

// ---------------------------------------------------------------------------
// unequipToBackpack
// ---------------------------------------------------------------------------

describe('GameState.unequipToBackpack', () => {
  let gs: GameState;

  beforeEach(() => {
    gs = makeGs();
  });

  it('moves equipped item to first free backpack slot', () => {
    const entity = gs.entityRegistry.createItem('sword_iron', 'common', { kind: 'equipped', slot: 'weapon' });
    const result = gs.unequipToBackpack('weapon');
    expect(result.success).toBe(true);
    expect(gs.entityRegistry.getEquipped('weapon')).toBeUndefined();
    const inBackpack = gs.entityRegistry.getBackpackItems();
    expect(inBackpack.length).toBe(1);
    expect(inBackpack[0].instanceId).toBe(entity.instanceId);
  });

  it('returns false when slot is already empty', () => {
    const result = gs.unequipToBackpack('weapon');
    expect(result.success).toBe(false);
  });

  it('returns false with reason when backpack is full', () => {
    gs.entityRegistry.createItem('sword_iron', 'common', { kind: 'equipped', slot: 'weapon' });
    for (let i = 0; i < 12; i++) {
      gs.entityRegistry.createItem('health_potion', 'common', { kind: 'backpack', slot: i });
    }
    const result = gs.unequipToBackpack('weapon');
    expect(result.success).toBe(false);
    expect(result.reason).toContain('full');
  });

  it('recalculates maxHp after unequip', () => {
    gs.entityRegistry.createItem('sword_iron', 'common', { kind: 'equipped', slot: 'weapon' });
    const prevMax = gs.maxHp;
    gs.unequipToBackpack('weapon');
    expect(gs.maxHp).toBe(prevMax); // sword has no HP bonus
  });
});

// ---------------------------------------------------------------------------
// dropItem
// ---------------------------------------------------------------------------

describe('GameState.dropItem', () => {
  let gs: GameState;

  beforeEach(() => {
    gs = makeGs();
  });

  it('moves an equipped item to the world at the given position', () => {
    const entity = gs.entityRegistry.createItem('sword_iron', 'common', { kind: 'equipped', slot: 'weapon' });
    const result = gs.dropItem(entity.instanceId, 4, 7);
    expect(result).toBe(true);
    const dropped = gs.entityRegistry.getItem(entity.instanceId);
    expect(dropped).toBeDefined();
    expect(dropped!.location.kind).toBe('world');
    if (dropped!.location.kind === 'world') {
      expect(dropped!.location.col).toBe(4);
      expect(dropped!.location.row).toBe(7);
      expect(dropped!.location.levelId).toBe('test_level');
    }
  });

  it('moves a backpack item to the world at the given position', () => {
    const entity = gs.entityRegistry.createItem('health_potion', 'common', { kind: 'backpack', slot: 2 });
    const result = gs.dropItem(entity.instanceId, 1, 1);
    expect(result).toBe(true);
    const dropped = gs.entityRegistry.getItem(entity.instanceId);
    expect(dropped!.location.kind).toBe('world');
  });

  it('returns false for a nonexistent instanceId', () => {
    const result = gs.dropItem('item_9999', 1, 1);
    expect(result).toBe(false);
  });

  it('recalculates maxHp after drop', () => {
    const entity = gs.entityRegistry.createItem('sword_iron', 'common', { kind: 'equipped', slot: 'weapon' });
    const prevMax = gs.maxHp;
    gs.dropItem(entity.instanceId, 0, 0);
    expect(gs.maxHp).toBe(prevMax);
  });
});

// ---------------------------------------------------------------------------
// useConsumableFromRegistry
// ---------------------------------------------------------------------------

describe('GameState.useConsumableFromRegistry', () => {
  let gs: GameState;

  beforeEach(() => {
    gs = makeGs();
  });

  it('health_potion restores hp by the item stats.hp amount', () => {
    gs.hp = 30;
    const entity = gs.entityRegistry.createItem('health_potion', 'common', { kind: 'backpack', slot: 0 });
    const result = gs.useConsumableFromRegistry(entity.instanceId);
    expect(result).toBe(true);
    expect(gs.hp).toBe(50); // 30 + 20
  });

  it('health_potion clamps hp at maxHp', () => {
    gs.hp = gs.maxHp - 5;
    const entity = gs.entityRegistry.createItem('health_potion', 'common', { kind: 'backpack', slot: 0 });
    gs.useConsumableFromRegistry(entity.instanceId);
    expect(gs.hp).toBe(gs.maxHp);
  });

  it('torch_oil restores torchFuel by the item effect.torchFuel amount', () => {
    gs.torchFuel = 50;
    const entity = gs.entityRegistry.createItem('torch_oil', 'common', { kind: 'backpack', slot: 0 });
    const result = gs.useConsumableFromRegistry(entity.instanceId);
    expect(result).toBe(true);
    expect(gs.torchFuel).toBe(80); // 50 + 30
  });

  it('torch_oil clamps torchFuel at maxTorchFuel', () => {
    gs.torchFuel = 90;
    const entity = gs.entityRegistry.createItem('torch_oil', 'common', { kind: 'backpack', slot: 0 });
    gs.useConsumableFromRegistry(entity.instanceId);
    expect(gs.torchFuel).toBe(100);
  });

  it('removes the item from the registry after use', () => {
    const entity = gs.entityRegistry.createItem('health_potion', 'common', { kind: 'backpack', slot: 0 });
    gs.useConsumableFromRegistry(entity.instanceId);
    expect(gs.entityRegistry.getItem(entity.instanceId)).toBeUndefined();
  });

  it('returns false for a nonexistent instanceId', () => {
    const result = gs.useConsumableFromRegistry('item_9999');
    expect(result).toBe(false);
  });

  it('returns false for a non-consumable item', () => {
    const entity = gs.entityRegistry.createItem('sword_iron', 'common', { kind: 'backpack', slot: 0 });
    const result = gs.useConsumableFromRegistry(entity.instanceId);
    expect(result).toBe(false);
  });
});
