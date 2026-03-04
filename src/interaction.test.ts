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

  it('closes an open non-mechanical door', () => {
    const gs = new GameState(openDoorEntities());
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('door_closed');
    expect(result.message).toBe('Door closed.');
    expect(gs.getDoor(2, 1)!.state).toBe('closed');
  });

  it('cannot close a mechanical door', () => {
    const gs = new GameState([
      { col: 2, row: 1, type: 'door', state: 'closed' },
      { col: 1, row: 1, type: 'lever', targetDoor: '2,1' },
    ]);
    // Open via lever (makes it mechanical)
    gs.activateLever(1, 1);
    expect(gs.getDoor(2, 1)!.state).toBe('open');

    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);
    expect(result.type).toBe('nothing');
  });

  it('open -> close -> open cycle works', () => {
    const gs = new GameState(closedDoorEntities());
    const player = new PlayerState(2, 2, 'N');

    // Open
    let result = interact(player, GRID, gs);
    expect(result.type).toBe('door_opened');

    // Close
    result = interact(player, GRID, gs);
    expect(result.type).toBe('door_closed');

    // Open again
    result = interact(player, GRID, gs);
    expect(result.type).toBe('door_opened');
    expect(gs.getDoor(2, 1)!.state).toBe('open');
  });

  it('cannot open a closed mechanical door', () => {
    const gs = new GameState([
      { col: 2, row: 1, type: 'door', state: 'closed' },
      { col: 1, row: 1, type: 'lever', targetDoor: '2,1' },
    ]);
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('nothing');
    expect(result.message).toBe('This door is operated by a mechanism.');
    expect(gs.getDoor(2, 1)!.state).toBe('closed');
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

  it('returns nothing for a D cell with no door entity (no grid)', () => {
    // No entities registered, no grid — the D cell at (2,1) has no GameState door
    const gs = new GameState([]);
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('nothing');
  });

  it('opens auto-created door from grid D cell', () => {
    // GameState with grid auto-creates door for D cell
    const gs = new GameState([], GRID);
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('door_opened');
    expect(gs.getDoor(2, 1)!.state).toBe('open');
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
// 1 #.O.#    <- lever at (2,1), north wall is (2,0)='#'
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
  // Lever at (2,1) auto-detects wall='N' (north neighbor is '#')
  // Player must stand ON (2,1) and face N to activate

  it('standing on lever cell facing the wall activates it', () => {
    const entities: Entity[] = [
      { col: 2, row: 2, type: 'door', state: 'closed' },
      { col: 2, row: 1, type: 'lever', targetDoor: '2,2' },
    ];
    const gs = new GameState(entities, LEVER_GRID);
    // Player at (2,1) facing N -> lever wall is N
    const player = new PlayerState(2, 1, 'N');
    const result = interact(player, LEVER_GRID, gs);

    expect(result.type).toBe('lever_activated');
    expect(result.message).toBe('Lever pulled.');
    expect(result.targetDoor).toBe('2,2');
    expect(gs.getDoor(2, 2)!.state).toBe('open');
  });

  it('standing on lever cell but facing wrong direction returns nothing', () => {
    const entities: Entity[] = [
      { col: 2, row: 2, type: 'door', state: 'closed' },
      { col: 2, row: 1, type: 'lever', targetDoor: '2,2' },
    ];
    const gs = new GameState(entities, LEVER_GRID);
    // Player at (2,1) facing S -> wrong direction
    const player = new PlayerState(2, 1, 'S');
    const result = interact(player, LEVER_GRID, gs);

    expect(result.type).toBe('nothing');
  });

  it('lever with explicit wall field activates when facing that wall', () => {
    const entities: Entity[] = [
      { col: 2, row: 2, type: 'door', state: 'closed' },
      { col: 2, row: 1, type: 'lever', targetDoor: '2,2', wall: 'N' },
    ];
    const gs = new GameState(entities, LEVER_GRID);
    const player = new PlayerState(2, 1, 'N');
    const result = interact(player, LEVER_GRID, gs);

    expect(result.type).toBe('lever_activated');
  });

  it('standing on O cell with no lever returns nothing', () => {
    const gs = new GameState([], LEVER_GRID);
    const player = new PlayerState(2, 1, 'N');
    const result = interact(player, LEVER_GRID, gs);

    expect(result.type).toBe('nothing');
  });

  it('already toggled lever returns nothing', () => {
    const entities: Entity[] = [
      { col: 2, row: 2, type: 'door', state: 'closed' },
      { col: 2, row: 1, type: 'lever', targetDoor: '2,2' },
    ];
    const gs = new GameState(entities, LEVER_GRID);
    const player = new PlayerState(2, 1, 'N');

    // First activation
    interact(player, LEVER_GRID, gs);

    // Second should return nothing
    const result = interact(player, LEVER_GRID, gs);
    expect(result.type).toBe('nothing');
  });
});
