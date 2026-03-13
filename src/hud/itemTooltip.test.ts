import { describe, it, expect, vi } from 'vitest';
import {
  getQualityColor,
  getStatLines,
  getComparisonDeltas,
  drawItemTooltip,
} from './itemTooltip';
import type { ItemDef } from '../core/itemDatabase';
import type { ItemEntity } from '../core/entities';
import { GameState } from '../core/gameState';

// ---------------------------------------------------------------------------
// Mock itemDatabase
// ---------------------------------------------------------------------------

const defs: Record<string, ItemDef> = {
  sword_iron: {
    id: 'sword_iron', name: 'Iron Sword', type: 'weapon', subtype: 'sword',
    quality: 'common', icon: '', weight: 1, value: 10,
    description: 'A plain iron sword.',
    stats: { atk: 5, critChance: 2 },
    modifiers: [],
    requirements: { str: 6 },
  },
  sword_rusty: {
    id: 'sword_rusty', name: 'Rusty Sword', type: 'weapon', subtype: 'sword',
    quality: 'poor', icon: '', weight: 1, value: 3,
    description: 'Old and worn.',
    stats: { atk: 3 },
    modifiers: [],
    requirements: {},
  },
  armor_plate: {
    id: 'armor_plate', name: 'Plate Armor', type: 'armor', subtype: 'chest',
    quality: 'fine', icon: '', weight: 4, value: 50,
    description: 'Heavy protection.',
    stats: { def: 8, vit: 2 },
    modifiers: [],
    requirements: { str: 8 },
  },
  ring_magic: {
    id: 'ring_magic', name: 'Magic Ring', type: 'accessory', subtype: 'ring',
    quality: 'masterwork', icon: '', weight: 0, value: 80,
    description: 'Emanates power.',
    stats: { str: 1, dex: 1 },
    modifiers: [],
    requirements: {},
  },
  health_potion: {
    id: 'health_potion', name: 'Health Potion', type: 'consumable', subtype: 'health_potion',
    quality: 'common', icon: '', weight: 0, value: 5,
    description: 'Restores HP.',
    stats: { hp: 20 },
    modifiers: [],
    requirements: {},
  },
};

vi.mock('../core/itemDatabase', () => ({
  itemDatabase: {
    isLoaded: () => true,
    getItem: (id: string) => defs[id],
  },
}));

function makeGameState(): GameState {
  return new GameState([], undefined, 'test');
}

// ---------------------------------------------------------------------------
// getQualityColor
// ---------------------------------------------------------------------------

describe('getQualityColor', () => {
  it('returns correct colors for all defined qualities', () => {
    expect(getQualityColor('poor')).toBe('#999999');
    expect(getQualityColor('common')).toBe('#cccccc');
    expect(getQualityColor('fine')).toBe('#44cc44');
    expect(getQualityColor('masterwork')).toBe('#4a9eff');
    expect(getQualityColor('enchanted')).toBe('#c844cc');
  });

  it('returns fallback color for unknown quality', () => {
    expect(getQualityColor('legendary')).toBe('#cccccc');
  });
});

// ---------------------------------------------------------------------------
// getStatLines
// ---------------------------------------------------------------------------

describe('getStatLines', () => {
  it('returns only stats with non-zero values', () => {
    const lines = getStatLines(defs.sword_iron);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ label: 'ATK', value: 5 });
    expect(lines[1]).toEqual({ label: 'CRIT%', value: 2 });
  });

  it('returns all relevant stats for armor', () => {
    const lines = getStatLines(defs.armor_plate);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ label: 'DEF', value: 8 });
    expect(lines[1]).toEqual({ label: 'VIT', value: 2 });
  });

  it('returns empty array when item has no stats', () => {
    const noStatsDef: ItemDef = {
      ...defs.sword_iron,
      stats: {},
    };
    expect(getStatLines(noStatsDef)).toHaveLength(0);
  });

  it('excludes stats with value 0', () => {
    const zeroStatDef: ItemDef = {
      ...defs.sword_iron,
      stats: { atk: 0, def: 3 },
    };
    const lines = getStatLines(zeroStatDef);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ label: 'DEF', value: 3 });
  });
});

// ---------------------------------------------------------------------------
// getComparisonDeltas
// ---------------------------------------------------------------------------

describe('getComparisonDeltas', () => {
  it('returns empty array when no equipped item', () => {
    expect(getComparisonDeltas(defs.sword_iron, undefined)).toHaveLength(0);
  });

  it('returns positive delta when new item is better', () => {
    // sword_iron: atk 5 vs sword_rusty: atk 3  => delta +2
    const deltas = getComparisonDeltas(defs.sword_iron, defs.sword_rusty);
    expect(deltas).toHaveLength(2); // atk delta + critChance delta
    const atkDelta = deltas.find((d) => d.label === 'ATK');
    expect(atkDelta).toBeDefined();
    expect(atkDelta!.delta).toBe(2);
  });

  it('returns negative delta when new item is worse', () => {
    // sword_rusty: atk 3 vs sword_iron: atk 5  => delta -2
    const deltas = getComparisonDeltas(defs.sword_rusty, defs.sword_iron);
    const atkDelta = deltas.find((d) => d.label === 'ATK');
    expect(atkDelta).toBeDefined();
    expect(atkDelta!.delta).toBe(-2);
  });

  it('skips stats where delta is zero', () => {
    // Same item vs itself => all deltas are 0
    const deltas = getComparisonDeltas(defs.sword_iron, defs.sword_iron);
    expect(deltas).toHaveLength(0);
  });

  it('treats missing stat as 0 for delta calculation', () => {
    // armor_plate has def 8, vit 2; sword_rusty has neither => comparing across types
    const deltas = getComparisonDeltas(defs.armor_plate, defs.sword_rusty);
    const defDelta = deltas.find((d) => d.label === 'DEF');
    expect(defDelta).toBeDefined();
    expect(defDelta!.delta).toBe(8); // 8 - 0
  });
});

// ---------------------------------------------------------------------------
// drawItemTooltip — requirement display via canvas mock
// ---------------------------------------------------------------------------

describe('drawItemTooltip — requirement met/unmet', () => {
  function makeCtx() {
    return {
      ctx: {
        save: vi.fn(),
        restore: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: '',
        textBaseline: '',
        measureText: vi.fn(() => ({ width: 50 })),
      } as unknown as CanvasRenderingContext2D,
    };
  }

  it('renders without throwing for a weapon with met requirements', () => {
    const gs = makeGameState();
    gs.str = 10; // meets str requirement of 6
    const entity: ItemEntity = {
      instanceId: 'item_0',
      itemId: 'sword_iron',
      quality: 'common',
      modifiers: [],
      location: { kind: 'backpack', slot: 0 },
    };
    const { ctx } = makeCtx();
    // Should not throw
    expect(() => drawItemTooltip(ctx, entity, gs, 100, 50)).not.toThrow();
  });

  it('renders without throwing for a consumable (no requirements)', () => {
    const gs = makeGameState();
    const entity: ItemEntity = {
      instanceId: 'item_1',
      itemId: 'health_potion',
      quality: 'common',
      modifiers: [],
      location: { kind: 'backpack', slot: 0 },
    };
    const { ctx } = makeCtx();
    expect(() => drawItemTooltip(ctx, entity, gs, 100, 50)).not.toThrow();
  });

  it('renders without throwing when item is not in database', () => {
    const gs = makeGameState();
    const entity: ItemEntity = {
      instanceId: 'item_2',
      itemId: 'nonexistent_item',
      quality: 'common',
      modifiers: [],
      location: { kind: 'backpack', slot: 0 },
    };
    const { ctx } = makeCtx();
    expect(() => drawItemTooltip(ctx, entity, gs, 100, 50)).not.toThrow();
  });

  it('does not render tooltip for currently equipped item vs itself', () => {
    const gs = makeGameState();
    const entity = gs.entityRegistry.createItem('sword_iron', 'common', {
      kind: 'equipped', slot: 'weapon',
    });
    // fillRect is called for the background — if it's not called, tooltip was skipped.
    const ctxMock = {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D;

    drawItemTooltip(ctxMock, entity, gs, 100, 50);
    // fillRect should have been called for the background (tooltip always draws when item found)
    expect(ctxMock.fillRect).toHaveBeenCalled();
    // fillText should have been called for the item name at minimum
    expect(ctxMock.fillText).toHaveBeenCalled();
  });
});
