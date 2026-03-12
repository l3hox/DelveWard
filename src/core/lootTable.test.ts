import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadLootTables,
  rollQuality,
  rollGold,
  rollLoot,
  getLootTableXp,
  ENCHANTED_MODIFIERS,
} from './lootTable';

// --- Mock loot-tables.json ---

const MOCK_LOOT_TABLES = {
  version: '1.0',
  qualityWeights: {
    poor: 0.10,
    common: 0.50,
    fine: 0.25,
    masterwork: 0.12,
    enchanted: 0.03,
  },
  enemies: {
    rat: {
      xp: 10,
      gold: [1, 3],
      drops: [
        { itemId: 'bone', chance: 0.30 },
        { itemId: 'health_potion_small', chance: 0.10 },
        { itemId: 'torch_oil', chance: 0.05 },
      ],
    },
    goblin: {
      xp: 12,
      gold: [2, 5],
      drops: [
        { itemId: 'bone', chance: 0.25 },
        { itemId: 'dagger_bent_knife', chance: 0.15 },
        { itemId: 'dagger_iron', chance: 0.08, quality: 'poor' as const },
      ],
    },
  },
};

function stubFetchWithTables(): void {
  vi.stubGlobal('fetch', async () => ({
    ok: true,
    json: async () => MOCK_LOOT_TABLES,
  }));
}

// --- loadLootTables ---

describe('loadLootTables', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads without error when fetch succeeds', async () => {
    stubFetchWithTables();
    await expect(loadLootTables()).resolves.toBeUndefined();
  });

  it('throws when fetch returns a non-ok response', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }));
    await expect(loadLootTables()).rejects.toThrow('Failed to load loot tables');
  });
});

// --- rollQuality ---

describe('rollQuality', () => {
  beforeEach(async () => {
    stubFetchWithTables();
    await loadLootTables();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('only returns valid quality tiers', () => {
    const valid = new Set(['poor', 'common', 'fine', 'masterwork', 'enchanted']);
    for (let i = 0; i < 100; i++) {
      expect(valid.has(rollQuality())).toBe(true);
    }
  });

  it('distribution matches weights within statistical bounds over 10k rolls', () => {
    const N = 10_000;
    const counts: Record<string, number> = {
      poor: 0, common: 0, fine: 0, masterwork: 0, enchanted: 0,
    };
    for (let i = 0; i < N; i++) {
      counts[rollQuality()]++;
    }

    // Expected frequencies: poor=10%, common=50%, fine=25%, masterwork=12%, enchanted=3%
    // Allow ±5% absolute tolerance on each tier.
    const tolerance = 0.05;
    expect(counts.poor / N).toBeGreaterThan(0.10 - tolerance);
    expect(counts.poor / N).toBeLessThan(0.10 + tolerance);
    expect(counts.common / N).toBeGreaterThan(0.50 - tolerance);
    expect(counts.common / N).toBeLessThan(0.50 + tolerance);
    expect(counts.fine / N).toBeGreaterThan(0.25 - tolerance);
    expect(counts.fine / N).toBeLessThan(0.25 + tolerance);
    expect(counts.masterwork / N).toBeGreaterThan(0.12 - tolerance);
    expect(counts.masterwork / N).toBeLessThan(0.12 + tolerance);
    expect(counts.enchanted / N).toBeGreaterThan(0.03 - tolerance);
    expect(counts.enchanted / N).toBeLessThan(0.03 + tolerance);
  });

  it('returns "poor" when Math.random returns 0 (first tier)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // With threshold = 0 * 1.0 = 0, first tier (poor, weight 0.10) wins immediately.
    expect(rollQuality()).toBe('poor');
  });

  it('returns "enchanted" when Math.random returns a value just below 1 (last tier)', () => {
    // Total weight = 1.0. threshold just below 1.0 means all tiers subtract out until enchanted.
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    expect(rollQuality()).toBe('enchanted');
  });
});

// --- rollGold ---

describe('rollGold', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('always returns a value within [min, max] inclusive', () => {
    for (let i = 0; i < 500; i++) {
      const result = rollGold(1, 3);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(3);
    }
  });

  it('covers all values in [1, 3] over many rolls', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      seen.add(rollGold(1, 3));
    }
    expect(seen).toContain(1);
    expect(seen).toContain(2);
    expect(seen).toContain(3);
  });

  it('returns min when min === max', () => {
    for (let i = 0; i < 20; i++) {
      expect(rollGold(5, 5)).toBe(5);
    }
  });

  it('returns exactly min when Math.random returns 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(rollGold(1, 10)).toBe(1);
  });

  it('returns exactly max when Math.random returns a value just below 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    expect(rollGold(1, 10)).toBe(10);
  });
});

// --- rollLoot ---

describe('rollLoot', () => {
  beforeEach(async () => {
    stubFetchWithTables();
    await loadLootTables();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Unknown enemy type ---

  it('returns { gold: 0, items: [] } for an unknown enemy type', () => {
    const result = rollLoot('dragon_king');
    expect(result).toEqual({ gold: 0, items: [] });
  });

  // --- Basic roll ---

  it('gold for "rat" is always within [1, 3]', () => {
    for (let i = 0; i < 100; i++) {
      const { gold } = rollLoot('rat');
      expect(gold).toBeGreaterThanOrEqual(1);
      expect(gold).toBeLessThanOrEqual(3);
    }
  });

  it('all item qualities returned for "rat" are valid tiers', () => {
    const valid = new Set(['poor', 'common', 'fine', 'masterwork', 'enchanted']);
    // Force all base-table drops to succeed so we always get items.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { items } = rollLoot('rat');
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(valid.has(item.quality)).toBe(true);
    }
  });

  it('all item itemIds returned for "rat" are from the table', () => {
    const knownIds = new Set(['bone', 'health_potion_small', 'torch_oil']);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { items } = rollLoot('rat');
    for (const item of items) {
      expect(knownIds.has(item.itemId)).toBe(true);
    }
  });

  it('returns no items when Math.random returns a value above all chances', () => {
    // All "rat" drops have chance <= 0.30, so random > 0.30 suppresses all.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { items } = rollLoot('rat');
    expect(items).toHaveLength(0);
  });

  // --- Guaranteed items ---

  it('guaranteed items always appear', () => {
    // Force Math.random to suppress all probabilistic drops.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = rollLoot('rat', {
      guaranteed: [{ itemId: 'sword_iron' }],
    });
    const found = result.items.find(i => i.itemId === 'sword_iron');
    expect(found).toBeDefined();
  });

  it('guaranteed item uses forced quality when specified', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = rollLoot('rat', {
      guaranteed: [{ itemId: 'sword_iron', quality: 'masterwork' }],
    });
    const item = result.items.find(i => i.itemId === 'sword_iron');
    expect(item).toBeDefined();
    expect(item!.quality).toBe('masterwork');
  });

  it('guaranteed item gets rollQuality() result when quality is not forced', () => {
    // Force rollQuality to return 'fine' by controlling Math.random.
    // Weights: poor=0.10, common=0.50, fine=0.25, masterwork=0.12, enchanted=0.03
    // total=1.0; threshold for fine: > 0.60 (poor+common) and < 0.85 (poor+common+fine).
    vi.spyOn(Math, 'random').mockReturnValue(0.61);
    const result = rollLoot('rat', {
      guaranteed: [{ itemId: 'sword_iron' }],
    });
    const item = result.items.find(i => i.itemId === 'sword_iron');
    expect(item).toBeDefined();
    expect(item!.quality).toBe('fine');
  });

  it('multiple guaranteed items all appear', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = rollLoot('rat', {
      guaranteed: [
        { itemId: 'sword_iron', quality: 'common' },
        { itemId: 'bone', quality: 'poor' },
      ],
    });
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    expect(result.items.find(i => i.itemId === 'sword_iron')).toBeDefined();
    expect(result.items.find(i => i.itemId === 'bone')).toBeDefined();
  });

  // --- suppressTable ---

  it('suppressTable: no base table items appear, only guaranteed', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // Would normally trigger all table drops.
    const result = rollLoot('rat', {
      guaranteed: [{ itemId: 'sword_iron', quality: 'common' }],
      suppressTable: true,
    });
    // Only the guaranteed item — no bone / health_potion_small / torch_oil from table.
    expect(result.items).toHaveLength(1);
    expect(result.items[0].itemId).toBe('sword_iron');
  });

  it('suppressTable with no guaranteed yields empty items', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = rollLoot('rat', { suppressTable: true });
    expect(result.items).toHaveLength(0);
  });

  // --- Extra drops ---

  it('extra drops are rolled and can appear alongside base table drops', () => {
    // Force all drops to succeed (random = 0 < any chance).
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = rollLoot('rat', {
      extra: [{ itemId: 'ring_of_power', chance: 0.99 }],
    });
    const extra = result.items.find(i => i.itemId === 'ring_of_power');
    expect(extra).toBeDefined();
    // Base table items should also be present.
    const bone = result.items.find(i => i.itemId === 'bone');
    expect(bone).toBeDefined();
  });

  it('extra drops are suppressed when their chance roll fails', () => {
    // Random = 0.99 suppresses all table drops and extra drops with low chance.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = rollLoot('rat', {
      extra: [{ itemId: 'ring_of_power', chance: 0.01 }],
    });
    const extra = result.items.find(i => i.itemId === 'ring_of_power');
    expect(extra).toBeUndefined();
  });

  it('extra drops appear with suppressTable and no guaranteed', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = rollLoot('rat', {
      suppressTable: true,
      extra: [{ itemId: 'amulet_of_fortitude', chance: 0.50 }],
    });
    // Only the extra item should appear.
    expect(result.items.length).toBe(1);
    expect(result.items[0].itemId).toBe('amulet_of_fortitude');
  });

  // --- Enchanted quality gets a modifier ---

  it('enchanted item receives exactly one modifier from ENCHANTED_MODIFIERS', () => {
    // Force rollQuality to land on enchanted.
    // total weight = 1.0; enchanted starts at cumulative 0.97.
    // We need random() > 0.97 to reach enchanted after subtracting poor+common+fine+masterwork.
    vi.spyOn(Math, 'random').mockReturnValue(0.98);
    const result = rollLoot('rat', {
      guaranteed: [{ itemId: 'sword_iron' }],
      suppressTable: true,
    });
    const item = result.items.find(i => i.itemId === 'sword_iron');
    expect(item).toBeDefined();
    expect(item!.quality).toBe('enchanted');
    expect(item!.modifiers).toHaveLength(1);
    expect(ENCHANTED_MODIFIERS).toContain(item!.modifiers[0] as typeof ENCHANTED_MODIFIERS[number]);
  });

  it('non-enchanted items have an empty modifiers array', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = rollLoot('rat', {
      guaranteed: [{ itemId: 'sword_iron', quality: 'common' }],
      suppressTable: true,
    });
    const item = result.items[0];
    expect(item.quality).toBe('common');
    expect(item.modifiers).toHaveLength(0);
  });

  it('base table drop with forced quality "poor" has no modifier', () => {
    // goblin has dagger_iron with quality: "poor" baked in.
    vi.spyOn(Math, 'random').mockReturnValue(0); // all drops succeed
    const result = rollLoot('goblin');
    const dagger = result.items.find(i => i.itemId === 'dagger_iron');
    expect(dagger).toBeDefined();
    expect(dagger!.quality).toBe('poor');
    expect(dagger!.modifiers).toHaveLength(0);
  });
});

// --- getLootTableXp ---

describe('getLootTableXp', () => {
  beforeEach(async () => {
    stubFetchWithTables();
    await loadLootTables();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the correct XP for "rat"', () => {
    expect(getLootTableXp('rat')).toBe(10);
  });

  it('returns the correct XP for "goblin"', () => {
    expect(getLootTableXp('goblin')).toBe(12);
  });

  it('returns 0 for an unknown enemy type', () => {
    expect(getLootTableXp('beholder')).toBe(0);
  });
});

// --- ENCHANTED_MODIFIERS constant ---

describe('ENCHANTED_MODIFIERS', () => {
  it('is a non-empty array', () => {
    expect(ENCHANTED_MODIFIERS.length).toBeGreaterThan(0);
  });

  it('contains expected modifiers', () => {
    expect(ENCHANTED_MODIFIERS).toContain('fire_damage');
    expect(ENCHANTED_MODIFIERS).toContain('life_steal');
    expect(ENCHANTED_MODIFIERS).toContain('torch_range');
  });
});
