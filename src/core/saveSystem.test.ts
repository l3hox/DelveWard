import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mapToRecord, recordToMap, setToArray, arrayToSet,
  serializeLevelSnapshot, deserializeLevelSnapshot,
  saveToSlot, loadFromSlot, deleteSlot, getSlotMetadata, getAllSlotMetadata,
  SAVE_SLOT_KEYS, AUTOSAVE_KEY,
} from './saveSystem';
import type { SaveData, SlotMetadata } from './saveSystem';
import type { LevelSnapshot } from './gameState';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeEmptySnapshot(): LevelSnapshot {
  return {
    doors:         new Map(),
    keys:          new Map(),
    levers:        new Map(),
    plates:        new Map(),
    triggers:      new Map(),
    tripwires:     new Map(),
    gates:         new Map(),
    trapLaunchers: new Map(),
    sconces:       new Map(),
    stairs:        new Map(),
    enemies:       new Map(),
    breakableWalls: new Map(),
    secretWalls:   new Map(),
    blocks:        new Map(),
    chests:        new Map(),
    signs:         new Map(),
    npcs:          new Map(),
    fountains:     new Map(),
    bookshelves:   new Map(),
    altars:        new Map(),
    barrels:       new Map(),
    thinWalls:     new Map(),
    ramps:         new Map(),
    props:         new Map(),
    pitTraps:      new Map(),
    spawners:      new Map(),
    destroyedWalls: new Set(),
    exploredCells:  new Set(),
    registrySnapshot: [],
    signalState: undefined,
  };
}

function makeMinimalSnapshot(): LevelSnapshot {
  return {
    doors: new Map([
      ['door_1_2', { id: 'door_1_2', col: 1, row: 2, state: 'closed', mechanical: false, keyId: 'key_bronze' }],
      ['door_3_4', { id: 'door_3_4', col: 3, row: 4, state: 'open',   mechanical: true }],
    ]),
    keys: new Map([
      ['key_1_5', { id: 'key_1_5', col: 1, row: 5, keyId: 'key_bronze', pickedUp: false }],
    ]),
    levers:        new Map(),
    plates:        new Map(),
    triggers:      new Map(),
    tripwires:     new Map(),
    gates:         new Map(),
    trapLaunchers: new Map(),
    sconces:       new Map(),
    stairs:        new Map(),
    enemies: new Map([
      ['enemy_2_3', {
        col: 2, row: 3, type: 'rat', hp: 8, maxHp: 10,
        atk: 3, def: 1, aggroRange: 4, moveInterval: 1,
        blocksMovement: true, aiState: 'idle' as const,
        moveTimer: 0,
        statusEffects: [{ type: 'poison' as const, remaining: 3, tickTimer: 0, tickInterval: 1, tickDamage: 2 }],
      }],
    ]),
    breakableWalls: new Map(),
    secretWalls:   new Map(),
    blocks:        new Map(),
    chests:        new Map(),
    signs:         new Map(),
    npcs:          new Map(),
    fountains:     new Map(),
    bookshelves:   new Map(),
    altars:        new Map(),
    barrels:       new Map(),
    thinWalls:     new Map(),
    ramps:         new Map(),
    props:         new Map(),
    pitTraps:      new Map(),
    spawners:      new Map(),
    destroyedWalls: new Set(['5_6', '7_8']),
    exploredCells:  new Set(['0_0', '1_0', '0_1']),
    registrySnapshot: [
      { instanceId: 'item_1', itemId: 'sword_iron', quality: 'common', modifiers: [], location: { kind: 'world', levelId: 'level1', col: 1, row: 1 } },
    ],
    signalState: {
      sources:   [['src_lever_0_0', { entityId: 'src_lever_0_0', targets: [], signalMode: 'toggle' as const, active: false, fired: false, deactivateAt: 0, delayFireAt: 0, delayPending: false }]],
      receivers: [],
      gates:     [],
      now: 42,
    } as LevelSnapshot['signalState'],
  };
}

function makeComplexSnapshot(): LevelSnapshot {
  return {
    doors: new Map([
      ['door_0_1', { col: 0, row: 1, state: 'closed' as const, mechanical: false }],
    ]),
    keys:  new Map(),
    levers: new Map([
      ['lever_2_2', { id: 'lever_2_2', col: 2, row: 2, targets: ['door_0_1', 'door_5_5'], wall: 'N' as const, state: 'up' as const, signalMode: 'timed' as const, signalDuration: 1.5 }],
    ]),
    plates:  new Map(),
    triggers: new Map(),
    tripwires: new Map(),
    gates:     new Map(),
    trapLaunchers: new Map(),
    sconces:   new Map(),
    stairs:    new Map(),
    enemies: new Map([
      ['enemy_4_4', {
        col: 4, row: 4, type: 'skeleton', hp: 15, maxHp: 20,
        atk: 5, def: 2, aggroRange: 5, moveInterval: 1.5,
        blocksMovement: true, aiState: 'chase' as const,
        moveTimer: 0.3,
        statusEffects: [
          { type: 'burning' as const, remaining: 5, tickTimer: 0, tickInterval: 0.5, tickDamage: 3 },
          { type: 'slow'    as const, remaining: 2, tickTimer: 0, tickInterval: 0,   tickDamage: 0 },
        ],
      }],
    ]),
    breakableWalls: new Map(),
    secretWalls:    new Map(),
    blocks:         new Map(),
    chests:         new Map(),
    signs:          new Map(),
    npcs:           new Map(),
    fountains:      new Map(),
    bookshelves:    new Map(),
    altars:         new Map(),
    barrels:        new Map(),
    thinWalls:      new Map(),
    ramps:          new Map(),
    props:          new Map(),
    pitTraps:       new Map(),
    spawners:       new Map(),
    destroyedWalls: new Set(),
    exploredCells:  new Set(['0_0']),
    registrySnapshot: [],
    signalState: {
      sources:   [['src_lever_2_2', { entityId: 'src_lever_2_2', targets: ['door_0_1'], signalMode: 'timed' as const, active: true, fired: false, duration: 1.5, deactivateAt: 90, delayFireAt: 0, delayPending: false }]],
      receivers: [['rcv_door_0_1',  { entityId: 'rcv_door_0_1', gateMode: 'or' as const, active: true }]],
      gates:     [],
      now: 88.5,
    } as LevelSnapshot['signalState'],
  };
}

function createMinimalSaveData(): SaveData {
  return {
    version: 1,
    timestamp: 1_700_000_000_000,
    dungeonName: 'Test Dungeon',
    currentLevelId: 'level1',
    player: {
      col: 2, row: 3, facing: 'N' as const,
      hp: 25, maxHp: 30,
      str: 10, dex: 10, vit: 10, wis: 10,
      xp: 100, level: 2, attributePoints: 1,
      playerName: 'Hero',
      gold: 50,
      torchFuel: 80, maxTorchFuel: 100,
      hunger: 75, maxHunger: 100,
      statusEffects: [],
    },
    keys: ['key_bronze'],
    entityRegistry: [
      { instanceId: 'item_1', itemId: 'sword_iron', quality: 'common', modifiers: [], location: { kind: 'backpack', slot: 0 } },
    ],
    flags: [],
    levelSnapshots: {},
    levelGrids: {},
  };
}

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------

function makeMockStorage() {
  const store: Record<string, string> = {};
  return {
    store,
    mock: {
      getItem:    vi.fn((key: string) => store[key] ?? null),
      setItem:    vi.fn((key: string, value: string) => { store[key] = value; }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Conversion helpers
// ---------------------------------------------------------------------------

describe('mapToRecord / recordToMap', () => {
  it('round-trips a map with multiple string entries', () => {
    const original = new Map([['a', 1], ['b', 2], ['c', 3]]);
    const record = mapToRecord(original);
    const restored = recordToMap(record);
    expect(restored).toEqual(original);
  });

  it('round-trips an empty map', () => {
    const original = new Map<string, number>();
    expect(recordToMap(mapToRecord(original))).toEqual(original);
  });

  it('mapToRecord produces a plain object with matching keys', () => {
    const m = new Map([['x', 'hello'], ['y', 'world']]);
    expect(mapToRecord(m)).toEqual({ x: 'hello', y: 'world' });
  });

  it('recordToMap produces a Map with matching entries', () => {
    const result = recordToMap({ p: 10, q: 20 });
    expect(result.get('p')).toBe(10);
    expect(result.get('q')).toBe(20);
    expect(result.size).toBe(2);
  });
});

describe('setToArray / arrayToSet', () => {
  it('round-trips a set with multiple entries', () => {
    const original = new Set(['alpha', 'beta', 'gamma']);
    const arr = setToArray(original);
    const restored = arrayToSet(arr);
    expect(restored).toEqual(original);
  });

  it('round-trips an empty set', () => {
    const original = new Set<string>();
    expect(arrayToSet(setToArray(original))).toEqual(original);
  });

  it('setToArray produces a plain array', () => {
    const arr = setToArray(new Set(['x', 'y']));
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toHaveLength(2);
    expect(arr).toContain('x');
    expect(arr).toContain('y');
  });
});

// ---------------------------------------------------------------------------
// 2. serializeLevelSnapshot / deserializeLevelSnapshot round-trip
// ---------------------------------------------------------------------------

describe('serializeLevelSnapshot / deserializeLevelSnapshot', () => {
  it('round-trips the minimal snapshot — Maps have same entries', () => {
    const original = makeMinimalSnapshot();
    const restored = deserializeLevelSnapshot(serializeLevelSnapshot(original));

    expect(restored.doors).toEqual(original.doors);
    expect(restored.keys).toEqual(original.keys);
    expect(restored.enemies).toEqual(original.enemies);
  });

  it('round-trips destroyedWalls and exploredCells as Sets', () => {
    const original = makeMinimalSnapshot();
    const restored = deserializeLevelSnapshot(serializeLevelSnapshot(original));

    expect(restored.destroyedWalls).toEqual(original.destroyedWalls);
    expect(restored.exploredCells).toEqual(original.exploredCells);
  });

  it('round-trips registrySnapshot', () => {
    const original = makeMinimalSnapshot();
    const restored = deserializeLevelSnapshot(serializeLevelSnapshot(original));

    expect(restored.registrySnapshot).toEqual(original.registrySnapshot);
  });

  it('round-trips signalState (tuple-array format)', () => {
    const original = makeMinimalSnapshot();
    const restored = deserializeLevelSnapshot(serializeLevelSnapshot(original));

    expect(restored.signalState).toEqual(original.signalState);
  });

  it('round-trips enemy statusEffects', () => {
    const original = makeMinimalSnapshot();
    const enemyKey = 'enemy_2_3';
    const restored = deserializeLevelSnapshot(serializeLevelSnapshot(original));

    expect(restored.enemies.get(enemyKey)?.statusEffects).toEqual(
      original.enemies.get(enemyKey)?.statusEffects,
    );
  });

  it('serialized form contains plain arrays, not Sets or Maps', () => {
    const serialized = serializeLevelSnapshot(makeMinimalSnapshot());

    expect(Array.isArray(serialized.destroyedWalls)).toBe(true);
    expect(Array.isArray(serialized.exploredCells)).toBe(true);
    expect(serialized.doors).not.toBeInstanceOf(Map);
  });
});

// ---------------------------------------------------------------------------
// 3. JSON stringify / parse round-trip
// ---------------------------------------------------------------------------

describe('JSON stringify / parse round-trip', () => {
  it('survives JSON.stringify + JSON.parse with no data loss', () => {
    const original = makeMinimalSnapshot();
    const serialized = serializeLevelSnapshot(original);
    const viaParse = JSON.parse(JSON.stringify(serialized));
    const restored = deserializeLevelSnapshot(viaParse);

    expect(restored.doors).toEqual(original.doors);
    expect(restored.keys).toEqual(original.keys);
    expect(restored.enemies).toEqual(original.enemies);
    expect(restored.destroyedWalls).toEqual(original.destroyedWalls);
    expect(restored.exploredCells).toEqual(original.exploredCells);
    expect(restored.registrySnapshot).toEqual(original.registrySnapshot);
    expect(restored.signalState).toEqual(original.signalState);
  });

  it('preserves enemy statusEffects through JSON round-trip', () => {
    const original = makeMinimalSnapshot();
    const viaParse = JSON.parse(JSON.stringify(serializeLevelSnapshot(original)));
    const restored = deserializeLevelSnapshot(viaParse);

    expect(restored.enemies.get('enemy_2_3')?.statusEffects).toEqual(
      original.enemies.get('enemy_2_3')?.statusEffects,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Slot management with mocked localStorage
// ---------------------------------------------------------------------------

describe('saveToSlot / loadFromSlot', () => {
  beforeEach(() => {
    const { mock } = makeMockStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: mock, writable: true, configurable: true });
  });

  it('round-trips a SaveData through a slot', () => {
    const data = createMinimalSaveData();
    const key = SAVE_SLOT_KEYS[0];

    expect(saveToSlot(key, data)).toBe(true);
    const loaded = loadFromSlot(key);

    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(1);
    expect(loaded?.player.playerName).toBe('Hero');
    expect(loaded?.dungeonName).toBe('Test Dungeon');
    expect(loaded?.keys).toEqual(['key_bronze']);
  });

  it('loadFromSlot returns null for an empty slot', () => {
    expect(loadFromSlot('delveward_save_99')).toBeNull();
  });

  it('loadFromSlot returns null for invalid JSON', () => {
    (globalThis.localStorage as typeof globalThis.localStorage).setItem('delveward_save_bad', '{ not valid json %%');
    expect(loadFromSlot('delveward_save_bad')).toBeNull();
  });

  it('loadFromSlot returns null when version is not 1', () => {
    const bad = { ...createMinimalSaveData(), version: 2 };
    (globalThis.localStorage as typeof globalThis.localStorage).setItem('delveward_save_v2', JSON.stringify(bad));
    expect(loadFromSlot('delveward_save_v2')).toBeNull();
  });

  it('saveToSlot returns false when setItem throws (quota exceeded)', () => {
    (globalThis.localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(saveToSlot(SAVE_SLOT_KEYS[0], createMinimalSaveData())).toBe(false);
  });
});

describe('deleteSlot', () => {
  beforeEach(() => {
    const { mock } = makeMockStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: mock, writable: true, configurable: true });
  });

  it('removes the entry so loadFromSlot returns null afterwards', () => {
    const key = SAVE_SLOT_KEYS[1];
    saveToSlot(key, createMinimalSaveData());
    expect(loadFromSlot(key)).not.toBeNull();

    deleteSlot(key);
    expect(loadFromSlot(key)).toBeNull();
  });

  it('does not throw when deleting a slot that was never set', () => {
    expect(() => deleteSlot('delveward_save_nonexistent')).not.toThrow();
  });
});

describe('getSlotMetadata', () => {
  beforeEach(() => {
    const { mock } = makeMockStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: mock, writable: true, configurable: true });
  });

  it('returns correct metadata fields for a saved slot', () => {
    const data = createMinimalSaveData();
    const key = SAVE_SLOT_KEYS[2];
    saveToSlot(key, data);

    const meta = getSlotMetadata(key);
    expect(meta).not.toBeNull();
    expect(meta?.playerName).toBe('Hero');
    expect(meta?.levelId).toBe('level1');
    expect(meta?.characterLevel).toBe(2);
    expect(meta?.dungeonName).toBe('Test Dungeon');
    expect(meta?.savedAt).toBe(1_700_000_000_000);
  });

  it('returns null for an empty slot', () => {
    expect(getSlotMetadata('delveward_save_empty')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    (globalThis.localStorage as typeof globalThis.localStorage).setItem('delveward_save_bad2', 'oops');
    expect(getSlotMetadata('delveward_save_bad2')).toBeNull();
  });

  it('returns null when version is not 1', () => {
    const bad = { ...createMinimalSaveData(), version: 99 };
    (globalThis.localStorage as typeof globalThis.localStorage).setItem('delveward_save_badv', JSON.stringify(bad));
    expect(getSlotMetadata('delveward_save_badv')).toBeNull();
  });
});

describe('getAllSlotMetadata', () => {
  beforeEach(() => {
    const { mock } = makeMockStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: mock, writable: true, configurable: true });
  });

  it('returns an entry for each of the 5 manual slots plus autosave (6 keys total)', () => {
    const result = getAllSlotMetadata();
    const expectedKeys = [...SAVE_SLOT_KEYS, AUTOSAVE_KEY];

    expect(Object.keys(result)).toHaveLength(6);
    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
    }
  });

  it('returns null for empty slots and non-null for populated slots', () => {
    const key = SAVE_SLOT_KEYS[3];
    saveToSlot(key, createMinimalSaveData());

    const result = getAllSlotMetadata();

    expect(result[key]).not.toBeNull();
    expect((result[key] as SlotMetadata).playerName).toBe('Hero');

    for (const k of Object.keys(result)) {
      if (k !== key) expect(result[k]).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Version validation (covered inline above; explicit group for clarity)
// ---------------------------------------------------------------------------

describe('version validation', () => {
  beforeEach(() => {
    const { mock } = makeMockStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: mock, writable: true, configurable: true });
  });

  it('loadFromSlot rejects version 0', () => {
    const bad = { ...createMinimalSaveData(), version: 0 };
    (globalThis.localStorage as typeof globalThis.localStorage).setItem('v0', JSON.stringify(bad));
    expect(loadFromSlot('v0')).toBeNull();
  });

  it('loadFromSlot rejects version 2', () => {
    const bad = { ...createMinimalSaveData(), version: 2 };
    (globalThis.localStorage as typeof globalThis.localStorage).setItem('v2', JSON.stringify(bad));
    expect(loadFromSlot('v2')).toBeNull();
  });

  it('loadFromSlot accepts version 1', () => {
    const key = SAVE_SLOT_KEYS[0];
    saveToSlot(key, createMinimalSaveData());
    expect(loadFromSlot(key)?.version).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Empty state snapshot
// ---------------------------------------------------------------------------

describe('empty LevelSnapshot round-trip', () => {
  it('serializes and deserializes with all Maps empty', () => {
    const empty = makeEmptySnapshot();
    const restored = deserializeLevelSnapshot(serializeLevelSnapshot(empty));

    expect(restored.doors.size).toBe(0);
    expect(restored.enemies.size).toBe(0);
    expect(restored.levers.size).toBe(0);
    expect(restored.destroyedWalls.size).toBe(0);
    expect(restored.exploredCells.size).toBe(0);
    expect(restored.registrySnapshot).toEqual([]);
    expect(restored.signalState).toBeUndefined();
  });

  it('survives JSON stringify/parse when all collections are empty', () => {
    const empty = makeEmptySnapshot();
    const viaParse = JSON.parse(JSON.stringify(serializeLevelSnapshot(empty)));
    const restored = deserializeLevelSnapshot(viaParse);

    expect(restored.doors.size).toBe(0);
    expect(restored.destroyedWalls.size).toBe(0);
    expect(restored.signalState).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. Complex state snapshot
// ---------------------------------------------------------------------------

describe('complex LevelSnapshot round-trip', () => {
  it('preserves enemy with multiple statusEffects', () => {
    const complex = makeComplexSnapshot();
    const restored = deserializeLevelSnapshot(serializeLevelSnapshot(complex));
    const enemy = restored.enemies.get('enemy_4_4');

    expect(enemy?.statusEffects).toHaveLength(2);
    expect(enemy?.statusEffects[0].type).toBe('burning');
    expect(enemy?.statusEffects[1].type).toBe('slow');
  });

  it('preserves lever with multiple targets', () => {
    const complex = makeComplexSnapshot();
    const restored = deserializeLevelSnapshot(serializeLevelSnapshot(complex));
    const lever = restored.levers.get('lever_2_2');

    expect(lever?.targets).toEqual(['door_0_1', 'door_5_5']);
    expect(lever?.signalMode).toBe('timed');
    expect(lever?.signalDuration).toBe(1.5);
  });

  it('preserves signalState with sources and receivers', () => {
    const complex = makeComplexSnapshot();
    const restored = deserializeLevelSnapshot(serializeLevelSnapshot(complex));
    const ss = restored.signalState as ReturnType<import('./signalManager').SignalManager['saveState']>;

    expect(ss.sources).toHaveLength(1);
    expect(ss.receivers).toHaveLength(1);
    expect(ss.now).toBe(88.5);
    expect(ss.sources[0][0]).toBe('src_lever_2_2');
  });

  it('survives JSON stringify/parse for complex state', () => {
    const complex = makeComplexSnapshot();
    const viaParse = JSON.parse(JSON.stringify(serializeLevelSnapshot(complex)));
    const restored = deserializeLevelSnapshot(viaParse);

    expect(restored.enemies.get('enemy_4_4')?.hp).toBe(15);
    expect(restored.levers.get('lever_2_2')?.targets).toEqual(['door_0_1', 'door_5_5']);
    expect((restored.signalState as ReturnType<import('./signalManager').SignalManager['saveState']>).now).toBe(88.5);
  });
});
