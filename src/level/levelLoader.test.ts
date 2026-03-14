import { describe, it, expect } from 'vitest';
import { validateLevel, validateDungeon } from './levelLoader';

function validLevel(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test',
    grid: ['###', '#.#', '###'],
    playerStart: { col: 1, row: 1, facing: 'N' },
    entities: [],
    ...overrides,
  };
}

describe('validateLevel', () => {
  it('accepts a valid level', () => {
    const level = validateLevel(validLevel(), 'test');
    expect(level.name).toBe('Test');
    expect(level.grid).toHaveLength(3);
    expect(level.playerStart.facing).toBe('N');
    expect(level.entities).toEqual([]);
  });

  it('rejects non-object data', () => {
    expect(() => validateLevel(null, 'test')).toThrow('is not an object');
    expect(() => validateLevel('string', 'test')).toThrow('is not an object');
    expect(() => validateLevel(42, 'test')).toThrow('is not an object');
  });

  it('rejects missing or non-string name', () => {
    expect(() => validateLevel(validLevel({ name: undefined }), 'test')).toThrow('"name" must be a string');
    expect(() => validateLevel(validLevel({ name: 123 }), 'test')).toThrow('"name" must be a string');
  });

  it('rejects missing or empty grid', () => {
    expect(() => validateLevel(validLevel({ grid: undefined }), 'test')).toThrow('"grid" must be a non-empty array');
    expect(() => validateLevel(validLevel({ grid: [] }), 'test')).toThrow('"grid" must be a non-empty array');
    expect(() => validateLevel(validLevel({ grid: [1, 2] }), 'test')).toThrow('"grid" must be a non-empty array');
  });

  it('rejects grid rows with inconsistent lengths', () => {
    expect(() => validateLevel(validLevel({ grid: ['###', '#.', '###'] }), 'test'))
      .toThrow('all grid rows must be the same length');
  });

  it('rejects unknown cell characters', () => {
    expect(() => validateLevel(validLevel({ grid: ['###', '#X#', '###'] }), 'test'))
      .toThrow("unknown cell character 'X'");
  });

  it('rejects missing or invalid playerStart', () => {
    expect(() => validateLevel(validLevel({ playerStart: null }), 'test')).toThrow('"playerStart" must be an object');
    expect(() => validateLevel(validLevel({ playerStart: 'bad' }), 'test')).toThrow('"playerStart" must be an object');
  });

  it('rejects playerStart with non-numeric col/row', () => {
    expect(() => validateLevel(validLevel({
      playerStart: { col: 'a', row: 1, facing: 'N' },
    }), 'test')).toThrow('must have numeric col and row');
  });

  it('rejects invalid facing', () => {
    expect(() => validateLevel(validLevel({
      playerStart: { col: 1, row: 1, facing: 'X' },
    }), 'test')).toThrow('"playerStart.facing" must be one of');
  });

  it('rejects playerStart out of grid bounds', () => {
    expect(() => validateLevel(validLevel({
      playerStart: { col: 10, row: 1, facing: 'N' },
    }), 'test')).toThrow('is out of grid bounds');
  });

  it('rejects playerStart on a wall cell', () => {
    expect(() => validateLevel(validLevel({
      playerStart: { col: 0, row: 0, facing: 'N' },
    }), 'test')).toThrow('is not a walkable cell');
  });

  it('rejects missing entities', () => {
    expect(() => validateLevel(validLevel({ entities: undefined }), 'test')).toThrow('"entities" must be an array');
    expect(() => validateLevel(validLevel({ entities: 'bad' }), 'test')).toThrow('"entities" must be an array');
  });

  // --- defaults validation ---

  it('accepts valid defaults', () => {
    const level = validateLevel(validLevel({
      defaults: { wallTexture: 'brick', floorTexture: 'dirt', ceilingTexture: 'wooden_beams' },
    }), 'test');
    expect(level.defaults).toEqual({ wallTexture: 'brick', floorTexture: 'dirt', ceilingTexture: 'wooden_beams' });
  });

  it('accepts missing defaults', () => {
    const level = validateLevel(validLevel(), 'test');
    expect(level.defaults).toBeUndefined();
  });

  it('rejects non-object defaults', () => {
    expect(() => validateLevel(validLevel({ defaults: 'bad' }), 'test'))
      .toThrow('"defaults" must be an object');
    expect(() => validateLevel(validLevel({ defaults: [1] }), 'test'))
      .toThrow('"defaults" must be an object');
  });

  it('rejects unknown wallTexture in defaults', () => {
    expect(() => validateLevel(validLevel({
      defaults: { wallTexture: 'marble' },
    }), 'test')).toThrow('defaults has unknown wallTexture "marble"');
  });

  it('rejects unknown floorTexture in defaults', () => {
    expect(() => validateLevel(validLevel({
      defaults: { floorTexture: 'lava' },
    }), 'test')).toThrow('defaults has unknown floorTexture "lava"');
  });

  it('rejects unknown ceilingTexture in defaults', () => {
    expect(() => validateLevel(validLevel({
      defaults: { ceilingTexture: 'glass' },
    }), 'test')).toThrow('defaults has unknown ceilingTexture "glass"');
  });

  // --- areas validation ---

  it('accepts valid areas', () => {
    const level = validateLevel(validLevel({
      areas: [
        { fromCol: 1, toCol: 1, fromRow: 1, toRow: 1, wallTexture: 'brick' },
      ],
    }), 'test');
    expect(level.areas).toHaveLength(1);
  });

  it('accepts missing areas', () => {
    const level = validateLevel(validLevel(), 'test');
    expect(level.areas).toBeUndefined();
  });

  it('rejects non-array areas', () => {
    expect(() => validateLevel(validLevel({ areas: 'bad' }), 'test'))
      .toThrow('"areas" must be an array');
    expect(() => validateLevel(validLevel({ areas: {} }), 'test'))
      .toThrow('"areas" must be an array');
  });

  it('rejects non-object entries in areas', () => {
    expect(() => validateLevel(validLevel({ areas: [42] }), 'test'))
      .toThrow('areas[0] must be an object');
    expect(() => validateLevel(validLevel({ areas: [null] }), 'test'))
      .toThrow('areas[0] must be an object');
    expect(() => validateLevel(validLevel({ areas: [[1, 1]] }), 'test'))
      .toThrow('areas[0] must be an object');
  });

  it('rejects missing coordinate fields in areas', () => {
    expect(() => validateLevel(validLevel({
      areas: [{ fromCol: 1, toCol: 1, fromRow: 1, wallTexture: 'brick' }],
    }), 'test')).toThrow('must have numeric fromCol, toCol, fromRow, toRow');
  });

  it('rejects fromCol > toCol in areas', () => {
    expect(() => validateLevel(validLevel({
      areas: [{ fromCol: 2, toCol: 1, fromRow: 1, toRow: 1, wallTexture: 'brick' }],
    }), 'test')).toThrow('fromCol > toCol or fromRow > toRow');
  });

  it('rejects fromRow > toRow in areas', () => {
    expect(() => validateLevel(validLevel({
      areas: [{ fromCol: 1, toCol: 1, fromRow: 2, toRow: 1, wallTexture: 'brick' }],
    }), 'test')).toThrow('fromCol > toCol or fromRow > toRow');
  });

  it('rejects out-of-bounds areas', () => {
    expect(() => validateLevel(validLevel({
      areas: [{ fromCol: 0, toCol: 10, fromRow: 0, toRow: 0, wallTexture: 'brick' }],
    }), 'test')).toThrow('is out of grid bounds');
    expect(() => validateLevel(validLevel({
      areas: [{ fromCol: 0, toCol: 0, fromRow: 0, toRow: 10, wallTexture: 'brick' }],
    }), 'test')).toThrow('is out of grid bounds');
  });

  it('rejects areas with no textures specified', () => {
    expect(() => validateLevel(validLevel({
      areas: [{ fromCol: 1, toCol: 1, fromRow: 1, toRow: 1 }],
    }), 'test')).toThrow('must specify at least one texture');
  });

  it('rejects unknown wallTexture in areas', () => {
    expect(() => validateLevel(validLevel({
      areas: [{ fromCol: 1, toCol: 1, fromRow: 1, toRow: 1, wallTexture: 'marble' }],
    }), 'test')).toThrow('unknown wallTexture "marble"');
  });

  it('rejects unknown floorTexture in areas', () => {
    expect(() => validateLevel(validLevel({
      areas: [{ fromCol: 1, toCol: 1, fromRow: 1, toRow: 1, floorTexture: 'lava' }],
    }), 'test')).toThrow('unknown floorTexture "lava"');
  });

  it('rejects unknown ceilingTexture in areas', () => {
    expect(() => validateLevel(validLevel({
      areas: [{ fromCol: 1, toCol: 1, fromRow: 1, toRow: 1, ceilingTexture: 'glass' }],
    }), 'test')).toThrow('unknown ceilingTexture "glass"');
  });

  // --- charDefs validation ---

  it('accepts valid walkable charDef', () => {
    const level = validateLevel(validLevel({
      charDefs: [{ char: 'b', solid: false, wallTexture: 'brick', floorTexture: 'stone_tile' }],
      grid: ['###', '#b#', '###'],
    }), 'test');
    expect(level.charDefs).toHaveLength(1);
  });

  it('accepts valid solid charDef', () => {
    const level = validateLevel(validLevel({
      charDefs: [{ char: '@', solid: true, wallTexture: 'wood' }],
      grid: ['###', '#.#', '###'],
    }), 'test');
    expect(level.charDefs).toHaveLength(1);
  });

  it('accepts missing charDefs (backward compat)', () => {
    const level = validateLevel(validLevel(), 'test');
    expect(level.charDefs).toBeUndefined();
  });

  it('rejects non-array charDefs', () => {
    expect(() => validateLevel(validLevel({ charDefs: 'bad' }), 'test'))
      .toThrow('"charDefs" must be an array');
    expect(() => validateLevel(validLevel({ charDefs: {} }), 'test'))
      .toThrow('"charDefs" must be an array');
  });

  it('rejects non-object charDefs entry', () => {
    expect(() => validateLevel(validLevel({ charDefs: [42] }), 'test'))
      .toThrow('charDefs[0] must be an object');
    expect(() => validateLevel(validLevel({ charDefs: [null] }), 'test'))
      .toThrow('charDefs[0] must be an object');
    expect(() => validateLevel(validLevel({ charDefs: [['b']] }), 'test'))
      .toThrow('charDefs[0] must be an object');
  });

  it('rejects multi-char char in charDefs', () => {
    expect(() => validateLevel(validLevel({
      charDefs: [{ char: 'bb', solid: false }],
    }), 'test')).toThrow('charDefs[0].char must be a single character');
  });

  it('rejects built-in char conflict in charDefs', () => {
    expect(() => validateLevel(validLevel({
      charDefs: [{ char: '#', solid: true }],
    }), 'test')).toThrow("charDefs[0].char '#' conflicts with built-in character");
    expect(() => validateLevel(validLevel({
      charDefs: [{ char: '.', solid: false }],
    }), 'test')).toThrow("charDefs[0].char '.' conflicts with built-in character");
    expect(() => validateLevel(validLevel({
      charDefs: [{ char: ' ', solid: true }],
    }), 'test')).toThrow("charDefs[0].char ' ' conflicts with built-in character");
  });

  it('rejects duplicate char in charDefs', () => {
    expect(() => validateLevel(validLevel({
      charDefs: [
        { char: 'b', solid: false },
        { char: 'b', solid: true },
      ],
    }), 'test')).toThrow("charDefs[1].char 'b' is a duplicate");
  });

  it('rejects missing or non-boolean solid in charDefs', () => {
    expect(() => validateLevel(validLevel({
      charDefs: [{ char: 'b' }],
    }), 'test')).toThrow('charDefs[0].solid must be a boolean');
    expect(() => validateLevel(validLevel({
      charDefs: [{ char: 'b', solid: 'yes' }],
    }), 'test')).toThrow('charDefs[0].solid must be a boolean');
  });

  it('rejects unknown texture names in charDefs', () => {
    expect(() => validateLevel(validLevel({
      charDefs: [{ char: 'b', solid: false, wallTexture: 'marble' }],
    }), 'test')).toThrow('charDefs[0] has unknown wallTexture "marble"');
    expect(() => validateLevel(validLevel({
      charDefs: [{ char: 'b', solid: false, floorTexture: 'lava' }],
    }), 'test')).toThrow('charDefs[0] has unknown floorTexture "lava"');
    expect(() => validateLevel(validLevel({
      charDefs: [{ char: 'b', solid: false, ceilingTexture: 'glass' }],
    }), 'test')).toThrow('charDefs[0] has unknown ceilingTexture "glass"');
  });

  it('accepts grid with charDef characters', () => {
    const level = validateLevel(validLevel({
      charDefs: [
        { char: 'b', solid: false, wallTexture: 'brick' },
        { char: '@', solid: true, wallTexture: 'wood' },
      ],
      grid: ['#@#', '#b#', '###'],
      playerStart: { col: 1, row: 1, facing: 'N' },
    }), 'test');
    expect(level.grid[0]).toBe('#@#');
  });

  it('rejects unknown chars in grid even with charDefs', () => {
    expect(() => validateLevel(validLevel({
      charDefs: [{ char: 'b', solid: false }],
      grid: ['###', '#X#', '###'],
    }), 'test')).toThrow("unknown cell character 'X'");
  });

  it('accepts playerStart on walkable charDef cell', () => {
    const level = validateLevel(validLevel({
      charDefs: [{ char: 'b', solid: false, wallTexture: 'brick' }],
      grid: ['###', '#b#', '###'],
      playerStart: { col: 1, row: 1, facing: 'N' },
    }), 'test');
    expect(level.playerStart.col).toBe(1);
  });

  it('rejects playerStart on solid charDef cell', () => {
    expect(() => validateLevel(validLevel({
      charDefs: [{ char: '@', solid: true, wallTexture: 'wood' }],
      grid: ['###', '#@#', '###'],
      playerStart: { col: 1, row: 1, facing: 'N' },
    }), 'test')).toThrow('is not a walkable cell');
  });

  // --- entity validation ---

  function doorLevel(entities: unknown[]) {
    return validLevel({
      grid: ['#####', '#...#', '#...#', '#####'],
      playerStart: { col: 1, row: 1, facing: 'E' },
      entities,
    });
  }

  it('accepts valid door entity', () => {
    const level = validateLevel(doorLevel([
      { col: 2, row: 1, type: 'door', state: 'closed' },
    ]), 'test');
    expect(level.entities).toHaveLength(1);
  });

  it('accepts valid door entity with keyId', () => {
    const level = validateLevel(doorLevel([
      { col: 2, row: 1, type: 'door', state: 'closed', keyId: 'gold_key' },
    ]), 'test');
    expect(level.entities).toHaveLength(1);
  });

  it('rejects door entity with invalid state', () => {
    expect(() => validateLevel(doorLevel([
      { col: 2, row: 1, type: 'door', state: 'broken' },
    ]), 'test')).toThrow('door state must be open or closed');
  });

  it('rejects door entity on non-walkable cell', () => {
    expect(() => validateLevel(validLevel({
      grid: ['#####', '#.#.#', '#...#', '#####'],
      playerStart: { col: 1, row: 1, facing: 'E' },
      entities: [{ col: 2, row: 1, type: 'door', state: 'closed' }],
    }), 'test')).toThrow("door must be on a walkable cell");
  });

  it('accepts valid key entity', () => {
    const level = validateLevel(doorLevel([
      { col: 1, row: 2, type: 'key', keyId: 'gold_key' },
    ]), 'test');
    expect(level.entities).toHaveLength(1);
  });

  it('rejects key entity without keyId', () => {
    expect(() => validateLevel(doorLevel([
      { col: 1, row: 2, type: 'key' },
    ]), 'test')).toThrow('key must have a string keyId');
  });

  it('accepts valid lever entity', () => {
    const level = validateLevel(validLevel({
      grid: ['#####', '#...#', '#...#', '#####'],
      playerStart: { col: 1, row: 1, facing: 'S' },
      entities: [
        { col: 2, row: 1, type: 'door', state: 'closed' },
        { col: 2, row: 2, type: 'lever', targetDoor: '2,1' },
      ],
    }), 'test');
    expect(level.entities).toHaveLength(2);
  });

  it('rejects lever with invalid targetDoor format', () => {
    expect(() => validateLevel(validLevel({
      grid: ['#####', '#...#', '#...#', '#####'],
      playerStart: { col: 1, row: 1, facing: 'S' },
      entities: [{ col: 2, row: 2, type: 'lever', targetDoor: 'bad' }],
    }), 'test')).toThrow('lever must have targetDoor in "col,row" format');
  });

  it('rejects lever targeting position without door entity', () => {
    expect(() => validateLevel(validLevel({
      grid: ['#####', '#...#', '#...#', '#####'],
      playerStart: { col: 1, row: 1, facing: 'S' },
      entities: [{ col: 2, row: 2, type: 'lever', targetDoor: '2,1' }],
    }), 'test')).toThrow("lever targetDoor must reference a door entity");
  });

  it('accepts valid pressure_plate entity', () => {
    const level = validateLevel(doorLevel([
      { col: 2, row: 1, type: 'door', state: 'closed' },
      { col: 1, row: 2, type: 'pressure_plate', targetDoor: '2,1' },
    ]), 'test');
    expect(level.entities).toHaveLength(2);
  });

  it('rejects pressure_plate with missing targetDoor', () => {
    expect(() => validateLevel(doorLevel([
      { col: 1, row: 2, type: 'pressure_plate' },
    ]), 'test')).toThrow('pressure_plate must have targetDoor in "col,row" format');
  });

  it('rejects entity with out-of-bounds position', () => {
    expect(() => validateLevel(doorLevel([
      { col: 20, row: 1, type: 'door', state: 'closed' },
    ]), 'test')).toThrow('is out of grid bounds');
  });

  it('rejects entity without numeric col/row', () => {
    expect(() => validateLevel(doorLevel([
      { col: 'a', row: 1, type: 'door' },
    ]), 'test')).toThrow('must have numeric col and row');
  });

  it('rejects non-object entity', () => {
    expect(() => validateLevel(doorLevel([42]), 'test'))
      .toThrow('entities[0] must be an object');
  });
});

// --- stair entity validation ---

describe('stair entity validation', () => {
  function stairLevel(entities: unknown[]) {
    return validLevel({
      grid: ['#####', '#...#', '#...#', '#...#', '#####'],
      playerStart: { col: 1, row: 1, facing: 'S' },
      entities,
    });
  }

  it('accepts valid stairs-down entity', () => {
    const level = validateLevel(stairLevel([
      { col: 2, row: 1, type: 'stairs', direction: 'down', targetLevel: 'level2', targetCol: 1, targetRow: 3 },
    ]), 'test');
    expect(level.entities).toHaveLength(1);
  });

  it('accepts valid stairs-up entity', () => {
    const level = validateLevel(stairLevel([
      { col: 2, row: 3, type: 'stairs', direction: 'up', targetLevel: 'level1', targetCol: 1, targetRow: 1 },
    ]), 'test');
    expect(level.entities).toHaveLength(1);
  });

  it('rejects stairs entity on non-walkable cell', () => {
    expect(() => validateLevel(validLevel({
      grid: ['#####', '#.#.#', '#...#', '#####'],
      playerStart: { col: 1, row: 1, facing: 'E' },
      entities: [{ col: 2, row: 1, type: 'stairs', direction: 'down', targetLevel: 'level2', targetCol: 1, targetRow: 1 }],
    }), 'test')).toThrow('stairs must be on a walkable cell');
  });

  it('rejects stairs without direction', () => {
    expect(() => validateLevel(stairLevel([
      { col: 2, row: 1, type: 'stairs', targetLevel: 'level2', targetCol: 1, targetRow: 3 },
    ]), 'test')).toThrow('stairs must have direction "up" or "down"');
  });

  it('rejects stairs with invalid direction', () => {
    expect(() => validateLevel(stairLevel([
      { col: 2, row: 1, type: 'stairs', direction: 'left', targetLevel: 'level2', targetCol: 1, targetRow: 3 },
    ]), 'test')).toThrow('stairs must have direction "up" or "down"');
  });

  it('rejects stairs without targetLevel', () => {
    expect(() => validateLevel(stairLevel([
      { col: 2, row: 1, type: 'stairs', direction: 'down', targetCol: 1, targetRow: 3 },
    ]), 'test')).toThrow('stairs must have a string targetLevel');
  });

  it('rejects stairs without targetCol/targetRow', () => {
    expect(() => validateLevel(stairLevel([
      { col: 2, row: 1, type: 'stairs', direction: 'down', targetLevel: 'level2' },
    ]), 'test')).toThrow('stairs must have numeric targetCol and targetRow');
  });
});

// --- validateDungeon ---

function validDungeonLevel(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Level ${id}`,
    grid: ['#####', '#...#', '#...#', '#...#', '#####'],
    playerStart: { col: 1, row: 1, facing: 'S' },
    entities: [],
    ...overrides,
  };
}

describe('validateDungeon', () => {
  function validDungeon(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Test Dungeon',
      levels: [
        validDungeonLevel('level1'),
        validDungeonLevel('level2'),
      ],
      ...overrides,
    };
  }

  it('accepts valid dungeon', () => {
    const dungeon = validateDungeon(validDungeon(), 'test');
    expect(dungeon.name).toBe('Test Dungeon');
    expect(dungeon.levels).toHaveLength(2);
    expect(dungeon.levels[0].id).toBe('level1');
  });

  it('rejects non-object data', () => {
    expect(() => validateDungeon(null, 'test')).toThrow('is not an object');
    expect(() => validateDungeon('string', 'test')).toThrow('is not an object');
    expect(() => validateDungeon(42, 'test')).toThrow('is not an object');
  });

  it('rejects missing name', () => {
    expect(() => validateDungeon(validDungeon({ name: undefined }), 'test'))
      .toThrow('"name" must be a string');
    expect(() => validateDungeon(validDungeon({ name: 123 }), 'test'))
      .toThrow('"name" must be a string');
  });

  it('rejects missing or empty levels array', () => {
    expect(() => validateDungeon(validDungeon({ levels: undefined }), 'test'))
      .toThrow('"levels" must be a non-empty array');
    expect(() => validateDungeon(validDungeon({ levels: [] }), 'test'))
      .toThrow('"levels" must be a non-empty array');
    expect(() => validateDungeon(validDungeon({ levels: 'bad' }), 'test'))
      .toThrow('"levels" must be a non-empty array');
  });

  it('rejects duplicate level ids', () => {
    expect(() => validateDungeon(validDungeon({
      levels: [validDungeonLevel('level1'), validDungeonLevel('level1')],
    }), 'test')).toThrow('duplicate level id "level1"');
  });

  it('rejects level without id', () => {
    const levelNoId = { ...validDungeonLevel('level1'), id: undefined };
    expect(() => validateDungeon(validDungeon({
      levels: [levelNoId, validDungeonLevel('level2')],
    }), 'test')).toThrow('must have a non-empty string "id"');
  });

  it('rejects stair with invalid targetLevel', () => {
    expect(() => validateDungeon(validDungeon({
      levels: [
        validDungeonLevel('level1', {
          entities: [
            { col: 2, row: 1, type: 'stairs', direction: 'down', targetLevel: 'nonexistent', targetCol: 1, targetRow: 1 },
          ],
        }),
        validDungeonLevel('level2'),
      ],
    }), 'test')).toThrow('stairs targetLevel "nonexistent" does not match any level id');
  });

  it('rejects stair targeting non-walkable cell', () => {
    expect(() => validateDungeon(validDungeon({
      levels: [
        validDungeonLevel('level1', {
          entities: [
            { col: 2, row: 1, type: 'stairs', direction: 'down', targetLevel: 'level2', targetCol: 0, targetRow: 0 },
          ],
        }),
        validDungeonLevel('level2'),
      ],
    }), 'test')).toThrow('is not walkable on level "level2"');
  });

  it('rejects stair targeting out-of-bounds position', () => {
    expect(() => validateDungeon(validDungeon({
      levels: [
        validDungeonLevel('level1', {
          entities: [
            { col: 2, row: 1, type: 'stairs', direction: 'down', targetLevel: 'level2', targetCol: 99, targetRow: 99 },
          ],
        }),
        validDungeonLevel('level2'),
      ],
    }), 'test')).toThrow('is out of bounds on level "level2"');
  });

  it('accepts stairs with valid cross-references', () => {
    const dungeon = validateDungeon(validDungeon({
      levels: [
        validDungeonLevel('level1', {
          entities: [
            { col: 2, row: 1, type: 'stairs', direction: 'down', targetLevel: 'level2', targetCol: 2, targetRow: 3 },
          ],
        }),
        validDungeonLevel('level2', {
          entities: [
            { col: 2, row: 3, type: 'stairs', direction: 'up', targetLevel: 'level1', targetCol: 2, targetRow: 1 },
          ],
        }),
      ],
    }), 'test');
    expect(dungeon.levels[0].entities).toHaveLength(1);
    expect(dungeon.levels[1].entities).toHaveLength(1);
  });
});
