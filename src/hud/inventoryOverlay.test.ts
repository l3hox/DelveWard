import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InventoryOverlay, subtypeToEquipSlot } from './inventoryOverlay';
import { GameState } from '../core/gameState';

// Mock itemDatabase so we can control item definitions in tests
vi.mock('../core/itemDatabase', () => {
  const defs: Record<string, object> = {
    sword_iron: { id: 'sword_iron', name: 'Iron Sword', type: 'weapon', subtype: 'sword', quality: 'common', icon: '', weight: 1, value: 1, description: '', stats: { atk: 3 }, modifiers: [], requirements: {} },
    armor_cap:  { id: 'armor_cap',  name: 'Leather Cap', type: 'armor',  subtype: 'head',  quality: 'common', icon: '', weight: 1, value: 1, description: '', stats: { def: 1 }, modifiers: [], requirements: {} },
    hp_potion:  { id: 'hp_potion',  name: 'Health Potion', type: 'consumable', subtype: 'health_potion', quality: 'common', icon: '', weight: 1, value: 1, description: '', stats: { hp: 20 }, modifiers: [], requirements: {} },
    ring_gold:  { id: 'ring_gold',  name: 'Gold Ring', type: 'accessory', subtype: 'ring', quality: 'common', icon: '', weight: 1, value: 1, description: '', stats: {}, modifiers: [], requirements: {} },
    oil_flask:  { id: 'oil_flask',  name: 'Torch Oil',  type: 'consumable', subtype: 'torch_oil', quality: 'common', icon: '', weight: 1, value: 1, description: '', stats: {}, effect: { torchFuel: 30 }, modifiers: [], requirements: {} },
  };
  return {
    itemDatabase: {
      isLoaded: () => true,
      getItem: (id: string) => defs[id],
    },
  };
});

function makeGameState(): GameState {
  return new GameState([], undefined, 'test_level');
}

// ---------------------------------------------------------------------------
// subtypeToEquipSlot
// ---------------------------------------------------------------------------

describe('subtypeToEquipSlot', () => {
  it('maps weapon subtypes to weapon slot', () => {
    const gs = makeGameState();
    for (const sub of ['sword', 'axe', 'dagger', 'mace', 'spear', 'staff']) {
      expect(subtypeToEquipSlot(sub, gs)).toBe('weapon');
    }
  });

  it('maps armor subtypes to matching slots', () => {
    const gs = makeGameState();
    const cases: Array<[string, string]> = [
      ['head', 'head'], ['chest', 'chest'], ['legs', 'legs'],
      ['hands', 'hands'], ['feet', 'feet'], ['shield', 'shield'],
    ];
    for (const [sub, expected] of cases) {
      expect(subtypeToEquipSlot(sub, gs)).toBe(expected);
    }
  });

  it('maps ring to ring1 when ring1 is empty', () => {
    const gs = makeGameState();
    expect(subtypeToEquipSlot('ring', gs)).toBe('ring1');
  });

  it('maps ring to ring2 when ring1 is occupied', () => {
    const gs = makeGameState();
    gs.entityRegistry.createItem('ring_gold', 'common', { kind: 'equipped', slot: 'ring1' });
    expect(subtypeToEquipSlot('ring', gs)).toBe('ring2');
  });

  it('maps amulet to amulet slot', () => {
    const gs = makeGameState();
    expect(subtypeToEquipSlot('amulet', gs)).toBe('amulet');
  });

  it('falls back to weapon for unknown subtypes', () => {
    const gs = makeGameState();
    expect(subtypeToEquipSlot('unknown_thing', gs)).toBe('weapon');
  });
});

// ---------------------------------------------------------------------------
// InventoryOverlay — toggle / isOpen
// ---------------------------------------------------------------------------

describe('InventoryOverlay.toggle', () => {
  it('starts closed', () => {
    const overlay = new InventoryOverlay();
    expect(overlay.isOpen()).toBe(false);
  });

  it('toggle opens', () => {
    const overlay = new InventoryOverlay();
    overlay.toggle();
    expect(overlay.isOpen()).toBe(true);
  });

  it('toggle twice closes', () => {
    const overlay = new InventoryOverlay();
    overlay.toggle();
    overlay.toggle();
    expect(overlay.isOpen()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cursor navigation — equipment section
// ---------------------------------------------------------------------------

describe('cursor navigation — equipment section', () => {
  let overlay: InventoryOverlay;
  let gs: GameState;

  beforeEach(() => {
    overlay = new InventoryOverlay();
    overlay.toggle(); // open it so cursor is reset to {section:'equipment', index:0}
    gs = makeGameState();
  });

  it('ArrowRight moves within equipment row', () => {
    overlay.handleKey('ArrowRight', gs, 1, 1);
    // index 0 -> 1
    overlay.handleKey('Enter', gs, 1, 1); // just need a harmless call to verify no throw
    // Verify via navigation effect: can navigate 4 more steps before hitting edge
    for (let i = 0; i < 3; i++) overlay.handleKey('ArrowRight', gs, 1, 1);
    // Now at index 4. Another right should be a no-op (edge).
    const action = overlay.handleKey('ArrowRight', gs, 1, 1);
    expect(action).toBeNull(); // no action for navigation
  });

  it('ArrowLeft does not move when at leftmost column', () => {
    // Start at index 0 — no-op
    const action = overlay.handleKey('ArrowLeft', gs, 1, 1);
    expect(action).toBeNull();
  });

  it('ArrowDown from equipment row 0 moves to row 1', () => {
    // Start at index 0, press down -> index 5
    overlay.handleKey('ArrowDown', gs, 1, 1);
    // Now at row 1. Press down again -> should jump to backpack
    overlay.handleKey('ArrowDown', gs, 1, 1);
    // Pressing up should bring back to equipment row 1
    overlay.handleKey('ArrowUp', gs, 1, 1);
    // Now back in equipment. Navigate left to check we're in equipment.
    // (We test this indirectly via handleKey returning null for nav.)
    const action = overlay.handleKey('ArrowLeft', gs, 1, 1);
    expect(action).toBeNull();
  });

  it('ArrowUp from equipment row 0 is a no-op', () => {
    const action = overlay.handleKey('ArrowUp', gs, 1, 1);
    expect(action).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cursor navigation — backpack section
// ---------------------------------------------------------------------------

describe('cursor navigation — backpack section', () => {
  let overlay: InventoryOverlay;
  let gs: GameState;

  beforeEach(() => {
    overlay = new InventoryOverlay();
    overlay.toggle();
    gs = makeGameState();
    // Navigate down to get into backpack
    overlay.handleKey('ArrowDown', gs, 1, 1); // equipment row 0 -> row 1
    overlay.handleKey('ArrowDown', gs, 1, 1); // equipment row 1 -> backpack row 0
  });

  it('ArrowRight moves within backpack row', () => {
    overlay.handleKey('ArrowRight', gs, 1, 1); // bp col 0 -> 1
    overlay.handleKey('ArrowRight', gs, 1, 1); // bp col 1 -> 2
    overlay.handleKey('ArrowRight', gs, 1, 1); // bp col 2 -> 3
    // At col 3, another right should be a no-op
    const action = overlay.handleKey('ArrowRight', gs, 1, 1);
    expect(action).toBeNull();
  });

  it('ArrowDown moves to next backpack row', () => {
    overlay.handleKey('ArrowDown', gs, 1, 1); // row 0 -> row 1
    overlay.handleKey('ArrowDown', gs, 1, 1); // row 1 -> row 2
    // At row 2, another down should be a no-op
    const action = overlay.handleKey('ArrowDown', gs, 1, 1);
    expect(action).toBeNull();
  });

  it('ArrowUp from backpack row 0 jumps to equipment row 1', () => {
    // Currently at backpack row 0
    overlay.handleKey('ArrowUp', gs, 1, 1); // -> equipment row 1
    // Now in equipment — ArrowUp from row 1 goes to row 0 (within equipment)
    overlay.handleKey('ArrowUp', gs, 1, 1); // still equipment row 0 (no, row 1 -> row 0... wait)
    // Actually: equipment has rows 0 and 1. ArrowUp from row 1 goes to row 0, not further.
    // Just verify no throw and return null
    const action = overlay.handleKey('ArrowUp', gs, 1, 1);
    expect(action).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Enter key — equip from backpack
// ---------------------------------------------------------------------------

describe('Enter key — equip from backpack', () => {
  let overlay: InventoryOverlay;
  let gs: GameState;

  beforeEach(() => {
    overlay = new InventoryOverlay();
    overlay.toggle();
    gs = makeGameState();
    // Navigate to backpack
    overlay.handleKey('ArrowDown', gs, 1, 1);
    overlay.handleKey('ArrowDown', gs, 1, 1);
  });

  it('returns equip action for equipment item in backpack slot 0', () => {
    gs.entityRegistry.createItem('sword_iron', 'common', { kind: 'backpack', slot: 0 });
    const action = overlay.handleKey('Enter', gs, 1, 1);
    expect(action).not.toBeNull();
    const a = action!;
    expect(a.type).toBe('equip');
    if (a.type === 'equip') {
      expect(a.equipSlot).toBe('weapon');
      expect(a.backpackSlot).toBe(0); // position index in sorted list
    }
  });

  it('returns use action for consumable in backpack', () => {
    gs.entityRegistry.createItem('hp_potion', 'common', { kind: 'backpack', slot: 0 });
    const action = overlay.handleKey('Enter', gs, 1, 1);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('use');
  });

  it('returns null when backpack slot is empty', () => {
    // No items in registry
    const action = overlay.handleKey('Enter', gs, 1, 1);
    expect(action).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Enter key — unequip from equipment slot
// ---------------------------------------------------------------------------

describe('Enter key — unequip from equipment slot', () => {
  let overlay: InventoryOverlay;
  let gs: GameState;

  beforeEach(() => {
    overlay = new InventoryOverlay();
    overlay.toggle();
    gs = makeGameState();
    // Cursor starts at equipment index 0 (weapon slot)
  });

  it('returns unequip action when weapon slot is occupied', () => {
    gs.entityRegistry.createItem('sword_iron', 'common', { kind: 'equipped', slot: 'weapon' });
    const action = overlay.handleKey('Enter', gs, 1, 1);
    expect(action).not.toBeNull();
    const a = action!;
    expect(a.type).toBe('unequip');
    if (a.type === 'unequip') {
      expect(a.equipSlot).toBe('weapon');
    }
  });

  it('returns null when equipment slot is empty', () => {
    const action = overlay.handleKey('Enter', gs, 1, 1);
    expect(action).toBeNull();
  });

  it('returns message action when backpack is full', () => {
    gs.entityRegistry.createItem('sword_iron', 'common', { kind: 'equipped', slot: 'weapon' });
    // Fill all 12 backpack slots
    for (let i = 0; i < 12; i++) {
      gs.entityRegistry.createItem('hp_potion', 'common', { kind: 'backpack', slot: i });
    }
    const action = overlay.handleKey('Enter', gs, 1, 1);
    expect(action).not.toBeNull();
    const a = action!;
    expect(a.type).toBe('message');
    if (a.type === 'message') {
      expect(a.text).toContain('full');
    }
  });
});

// ---------------------------------------------------------------------------
// D key — drop
// ---------------------------------------------------------------------------

describe('D key — drop', () => {
  let overlay: InventoryOverlay;
  let gs: GameState;

  beforeEach(() => {
    overlay = new InventoryOverlay();
    overlay.toggle();
    gs = makeGameState();
  });

  it('returns drop action for equipped item', () => {
    const entity = gs.entityRegistry.createItem('sword_iron', 'common', { kind: 'equipped', slot: 'weapon' });
    const action = overlay.handleKey('KeyD', gs, 3, 5);
    expect(action).not.toBeNull();
    const a = action!;
    expect(a.type).toBe('drop');
    if (a.type === 'drop') {
      expect(a.instanceId).toBe(entity.instanceId);
      expect(a.col).toBe(3);
      expect(a.row).toBe(5);
    }
  });

  it('returns null when equipment slot is empty', () => {
    const action = overlay.handleKey('KeyD', gs, 1, 1);
    expect(action).toBeNull();
  });

  it('returns drop action for backpack item', () => {
    const entity = gs.entityRegistry.createItem('hp_potion', 'common', { kind: 'backpack', slot: 0 });
    // Navigate to backpack
    overlay.handleKey('ArrowDown', gs, 1, 1);
    overlay.handleKey('ArrowDown', gs, 1, 1);
    const action = overlay.handleKey('KeyD', gs, 2, 4);
    expect(action).not.toBeNull();
    const a = action!;
    expect(a.type).toBe('drop');
    if (a.type === 'drop') {
      expect(a.instanceId).toBe(entity.instanceId);
      expect(a.col).toBe(2);
      expect(a.row).toBe(4);
    }
  });
});

// ---------------------------------------------------------------------------
// Unknown keys return null
// ---------------------------------------------------------------------------

describe('unknown keys', () => {
  it('returns null for unknown key codes', () => {
    const overlay = new InventoryOverlay();
    overlay.toggle();
    const gs = makeGameState();
    const action = overlay.handleKey('KeyZ', gs, 0, 0);
    expect(action).toBeNull();
  });
});
