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

  // --- cellOverrides validation ---

  it('accepts valid cellOverrides', () => {
    const level = validateLevel(validLevel({
      cellOverrides: [
        { col: 1, row: 1, wallTexture: 'brick', floorTexture: 'dirt', ceilingTexture: 'wooden_beams' },
      ],
    }), 'test');
    expect(level.cellOverrides).toHaveLength(1);
  });

  it('accepts missing cellOverrides', () => {
    const level = validateLevel(validLevel(), 'test');
    expect(level.cellOverrides).toBeUndefined();
  });

  it('rejects non-array cellOverrides', () => {
    expect(() => validateLevel(validLevel({ cellOverrides: 'bad' }), 'test'))
      .toThrow('"cellOverrides" must be an array');
    expect(() => validateLevel(validLevel({ cellOverrides: {} }), 'test'))
      .toThrow('"cellOverrides" must be an array');
  });

  it('rejects non-object entries in cellOverrides', () => {
    expect(() => validateLevel(validLevel({ cellOverrides: [42] }), 'test'))
      .toThrow('cellOverrides[0] must be an object');
    expect(() => validateLevel(validLevel({ cellOverrides: [null] }), 'test'))
      .toThrow('cellOverrides[0] must be an object');
    expect(() => validateLevel(validLevel({ cellOverrides: [[1, 1]] }), 'test'))
      .toThrow('cellOverrides[0] must be an object');
  });

  it('rejects non-numeric col/row in cellOverrides', () => {
    expect(() => validateLevel(validLevel({
      cellOverrides: [{ col: 'a', row: 1 }],
    }), 'test')).toThrow('must have numeric col and row');
  });

  it('rejects out-of-bounds cellOverrides', () => {
    expect(() => validateLevel(validLevel({
      cellOverrides: [{ col: 10, row: 1 }],
    }), 'test')).toThrow('is out of grid bounds');
    expect(() => validateLevel(validLevel({
      cellOverrides: [{ col: 1, row: 10 }],
    }), 'test')).toThrow('is out of grid bounds');
  });

  it('rejects unknown wallTexture name', () => {
    expect(() => validateLevel(validLevel({
      cellOverrides: [{ col: 1, row: 1, wallTexture: 'marble' }],
    }), 'test')).toThrow('unknown wallTexture "marble"');
  });

  it('rejects unknown floorTexture name', () => {
    expect(() => validateLevel(validLevel({
      cellOverrides: [{ col: 1, row: 1, floorTexture: 'lava' }],
    }), 'test')).toThrow('unknown floorTexture "lava"');
  });

  it('rejects unknown ceilingTexture name', () => {
    expect(() => validateLevel(validLevel({
      cellOverrides: [{ col: 1, row: 1, ceilingTexture: 'glass' }],
    }), 'test')).toThrow('unknown ceilingTexture "glass"');
  });

  it('rejects non-number ceilingHeight', () => {
    expect(() => validateLevel(validLevel({
      cellOverrides: [{ col: 1, row: 1, ceilingHeight: 'high' }],
    }), 'test')).toThrow('ceilingHeight must be a number');
  });
});
