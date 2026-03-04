import { describe, it, expect } from 'vitest';
import { validateLevel } from './levelLoader';

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
});
