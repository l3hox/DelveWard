import { describe, it, expect } from 'vitest';
import { interact } from './interaction';
import { PlayerState } from './grid';
import { GameState } from './gameState';
import type { Entity } from './types';

// Grid layout (col, row):
//   01234
// 0 #####
// 1 #.D.#
// 2 #...#
// 3 #####
const GRID = [
  '#####',
  '#.D.#',
  '#...#',
  '#####',
];

// Player at (1,2) facing N -> facing cell is (1,1) = '.'
// Player at (2,2) facing N -> facing cell is (2,1) = 'D'

function closedDoorEntities(): Entity[] {
  return [
    { col: 2, row: 1, type: 'door', state: 'closed' },
  ];
}

function lockedDoorEntities(keyId: string = 'gold_key'): Entity[] {
  return [
    { col: 2, row: 1, type: 'door', state: 'locked', keyId },
  ];
}

function openDoorEntities(): Entity[] {
  return [
    { col: 2, row: 1, type: 'door', state: 'open' },
  ];
}

describe('interact', () => {
  // --- Door interactions ---

  it('opens a closed door', () => {
    const gs = new GameState(closedDoorEntities());
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('door_opened');
    expect(result.message).toBe('Door opened.');
    expect(gs.getDoor(2, 1)!.state).toBe('open');
  });

  it('returns nothing for an already open door', () => {
    const gs = new GameState(openDoorEntities());
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('nothing');
    expect(result.message).toBeUndefined();
  });

  it('returns door_locked for a locked door without key', () => {
    const gs = new GameState(lockedDoorEntities());
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('door_locked');
    expect(result.message).toBe('This door is locked.');
    expect(gs.getDoor(2, 1)!.state).toBe('locked');
  });

  it('unlocks and opens a locked door with the correct key', () => {
    const gs = new GameState(lockedDoorEntities('gold_key'));
    gs.addKey('gold_key');
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('door_unlocked');
    expect(result.message).toBe('Door unlocked and opened.');
    expect(gs.getDoor(2, 1)!.state).toBe('open');
  });

  it('does not unlock a locked door with the wrong key', () => {
    const gs = new GameState(lockedDoorEntities('gold_key'));
    gs.addKey('silver_key');
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('door_locked');
    expect(gs.getDoor(2, 1)!.state).toBe('locked');
  });

  // --- Non-door interactions ---

  it('returns nothing when facing a wall', () => {
    const gs = new GameState([]);
    // Player at (1,1) facing N -> facing cell is (1,0) = '#'
    const player = new PlayerState(1, 1, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('nothing');
  });

  it('returns nothing when facing out of bounds', () => {
    const gs = new GameState([]);
    // Player at (0,0) facing N -> facing cell is (0,-1) = out of bounds
    const player = new PlayerState(0, 0, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('nothing');
  });

  it('returns nothing for a D cell with no door entity', () => {
    // No entities registered — the D cell at (2,1) has no GameState door
    const gs = new GameState([]);
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('nothing');
  });

  it('returns nothing when facing a floor cell', () => {
    const gs = new GameState([]);
    // Player at (1,2) facing N -> facing cell is (1,1) = '.'
    const player = new PlayerState(1, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('nothing');
  });

  // --- State verification ---

  it('opened door becomes walkable via isDoorOpen', () => {
    const gs = new GameState(closedDoorEntities());
    expect(gs.isDoorOpen(2, 1)).toBe(false);

    const player = new PlayerState(2, 2, 'N');
    interact(player, GRID, gs);

    expect(gs.isDoorOpen(2, 1)).toBe(true);
  });
});

// --- Lever interaction ---

// Grid layout (col, row):
//   01234
// 0 #####
// 1 #.O.#
// 2 #.D.#
// 3 #...#
// 4 #####
const LEVER_GRID = [
  '#####',
  '#.O.#',
  '#.D.#',
  '#...#',
  '#####',
];

describe('lever interaction', () => {
  it('facing a lever on O cell activates it', () => {
    const entities: Entity[] = [
      { col: 2, row: 2, type: 'door', state: 'closed' },
      { col: 2, row: 1, type: 'lever', targetDoor: '2,2' },
    ];
    const gs = new GameState(entities);
    // Player at (2,2) facing N -> facing cell is (2,1) = 'O'
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, LEVER_GRID, gs);

    expect(result.type).toBe('lever_activated');
    expect(result.message).toBe('Lever pulled.');
    expect(result.targetDoor).toBe('2,2');
    // Door should be toggled open
    expect(gs.getDoor(2, 2)!.state).toBe('open');
  });

  it('facing an O cell with no lever returns nothing', () => {
    const gs = new GameState([]);
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, LEVER_GRID, gs);

    expect(result.type).toBe('nothing');
  });

  it('facing an already toggled lever returns nothing', () => {
    const entities: Entity[] = [
      { col: 2, row: 2, type: 'door', state: 'closed' },
      { col: 2, row: 1, type: 'lever', targetDoor: '2,2' },
    ];
    const gs = new GameState(entities);
    const player = new PlayerState(2, 2, 'N');

    // First activation
    interact(player, LEVER_GRID, gs);

    // Second activation should return nothing
    const result = interact(player, LEVER_GRID, gs);
    expect(result.type).toBe('nothing');
  });
});
