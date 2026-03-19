import { describe, it, expect } from 'vitest';
import { interact } from './interaction';
import { PlayerState } from '../core/grid';
import { GameState } from '../core/gameState';
import type { Entity } from '../core/types';

// Grid layout (col, row):
//   01234
// 0 #####
// 1 #...#
// 2 #...#
// 3 #####
const GRID = [
  '#####',
  '#...#',
  '#...#',
  '#####',
];

// Player at (1,2) facing N -> facing cell is (1,1) = '.'
// Player at (2,2) facing N -> facing cell is (2,1) = '.' (door entity may be here)

function closedDoorEntities(): Entity[] {
  return [
    { col: 2, row: 1, type: 'door', state: 'closed' },
  ];
}

function lockedDoorEntities(keyId: string = 'gold_key'): Entity[] {
  return [
    { col: 2, row: 1, type: 'door', state: 'closed', keyId },
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
      { col: 2, row: 1, type: 'door', state: 'closed', id: 'door_1' },
      { col: 1, row: 1, type: 'lever', id: 'lever_1', targets: ['door_1'] },
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
      { col: 2, row: 1, type: 'door', state: 'closed', id: 'door_1' },
      { col: 1, row: 1, type: 'lever', id: 'lever_1', targets: ['door_1'] },
    ]);
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('nothing');
    expect(result.message).toBe('This door is operated by a mechanism.');
    expect(gs.getDoor(2, 1)!.state).toBe('closed');
  });

  it('returns door_locked for a closed keyed door without key', () => {
    const gs = new GameState(lockedDoorEntities());
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('door_locked');
    expect(result.message).toBe('This door is locked.');
    expect(gs.getDoor(2, 1)!.state).toBe('closed');
  });

  it('opens a closed keyed door with the correct key', () => {
    const gs = new GameState(lockedDoorEntities('gold_key'));
    gs.addKey('gold_key');
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('door_opened');
    expect(result.message).toBe('Door opened.');
    expect(gs.getDoor(2, 1)!.state).toBe('open');
  });

  it('does not open a closed keyed door with the wrong key', () => {
    const gs = new GameState(lockedDoorEntities('gold_key'));
    gs.addKey('silver_key');
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, GRID, gs);

    expect(result.type).toBe('door_locked');
    expect(gs.getDoor(2, 1)!.state).toBe('closed');
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

  it('returns nothing when facing a floor cell with no door entity', () => {
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
// 1 #...#    <- lever entity at (2,1), north wall is (2,0)='#'
// 2 #...#    <- door entity may be placed here
// 3 #...#
// 4 #####
const LEVER_GRID = [
  '#####',
  '#...#',
  '#...#',
  '#...#',
  '#####',
];

describe('lever interaction', () => {
  // Lever at (2,1) auto-detects wall='N' (north neighbor is '#')
  // Player must stand ON (2,1) and face N to activate

  it('standing on lever cell facing the wall activates it', () => {
    const entities: Entity[] = [
      { col: 2, row: 2, type: 'door', state: 'closed', id: 'door_1' },
      { col: 2, row: 1, type: 'lever', id: 'lever_1', targets: ['door_1'] },
    ];
    const gs = new GameState(entities, LEVER_GRID);
    // Player at (2,1) facing N -> lever wall is N
    const player = new PlayerState(2, 1, 'N');
    const result = interact(player, LEVER_GRID, gs);

    expect(result.type).toBe('lever_activated');
    expect(result.message).toBe('Lever pulled.');
    expect(result.targets).toEqual(['door_1']);
    expect(gs.getDoor(2, 2)!.state).toBe('open');
  });

  it('standing on lever cell but facing wrong direction returns nothing', () => {
    const entities: Entity[] = [
      { col: 2, row: 2, type: 'door', state: 'closed', id: 'door_1' },
      { col: 2, row: 1, type: 'lever', id: 'lever_1', targets: ['door_1'] },
    ];
    const gs = new GameState(entities, LEVER_GRID);
    // Player at (2,1) facing S -> wrong direction
    const player = new PlayerState(2, 1, 'S');
    const result = interact(player, LEVER_GRID, gs);

    expect(result.type).toBe('nothing');
  });

  it('lever with explicit wall field activates when facing that wall', () => {
    const entities: Entity[] = [
      { col: 2, row: 2, type: 'door', state: 'closed', id: 'door_1' },
      { col: 2, row: 1, type: 'lever', id: 'lever_1', targets: ['door_1'], wall: 'N' },
    ];
    const gs = new GameState(entities, LEVER_GRID);
    const player = new PlayerState(2, 1, 'N');
    const result = interact(player, LEVER_GRID, gs);

    expect(result.type).toBe('lever_activated');
  });

  it('standing on cell with no lever returns nothing', () => {
    const gs = new GameState([], LEVER_GRID);
    const player = new PlayerState(2, 1, 'N');
    const result = interact(player, LEVER_GRID, gs);

    expect(result.type).toBe('nothing');
  });

  it('lever can be toggled repeatedly', () => {
    const entities: Entity[] = [
      { col: 2, row: 2, type: 'door', state: 'closed', id: 'door_1' },
      { col: 2, row: 1, type: 'lever', id: 'lever_1', targets: ['door_1'] },
    ];
    const gs = new GameState(entities, LEVER_GRID);
    const player = new PlayerState(2, 1, 'N');

    // First pull — opens door
    let result = interact(player, LEVER_GRID, gs);
    expect(result.type).toBe('lever_activated');
    expect(gs.getDoor(2, 2)!.state).toBe('open');

    // Second pull — closes door
    result = interact(player, LEVER_GRID, gs);
    expect(result.type).toBe('lever_activated');
    expect(gs.getDoor(2, 2)!.state).toBe('closed');
  });
});

// --- Phase D: block, chest, sign interactions ---

// Grid for Phase D tests
// Player at (2,2) facing N -> facing cell (2,1)
// Player at (2,3) facing N -> facing cell (2,2)
const INTERACT_GRID = [
  '#####',
  '#...#',
  '#...#',
  '#...#',
  '#####',
];

describe('Phase D — block push interaction', () => {
  it('valid push: block at facing cell with empty cell behind it → block_pushed', () => {
    // Player at (2,3) facing N → facing (2,2) → block destination (2,1)
    const gs = new GameState([
      { col: 2, row: 2, type: 'block' },
    ], INTERACT_GRID);
    const player = new PlayerState(2, 3, 'N');
    const result = interact(player, INTERACT_GRID, gs);

    expect(result.type).toBe('block_pushed');
    expect(result.targetCol).toBe(2);
    expect(result.targetRow).toBe(1);
    expect(gs.getBlock(2, 2)).toBeUndefined();
    expect(gs.getBlock(2, 1)).toBeDefined();
  });

  it('blocked by wall: destination is a wall → nothing', () => {
    // Player at (2,2) facing N → facing (2,1) → destination (2,0) = '#'
    const gs = new GameState([
      { col: 2, row: 1, type: 'block' },
    ], INTERACT_GRID);
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, INTERACT_GRID, gs);

    expect(result.type).toBe('nothing');
    expect(gs.getBlock(2, 1)).toBeDefined(); // block not moved
  });

  it('blocked by enemy: destination has an enemy → nothing', () => {
    // Player at (2,3) facing N → facing (2,2) → destination (2,1), enemy at (2,1)
    const gs = new GameState([
      { col: 2, row: 2, type: 'block' },
    ], INTERACT_GRID);
    // Inject a blocking enemy directly — interaction.test.ts has no enemyDatabase mock
    gs.enemies.set('2,1', {
      col: 2, row: 1, type: 'rat', hp: 8, maxHp: 8,
      atk: 2, def: 0, aggroRange: 3, moveInterval: 0.6,
      blocksMovement: true, aiState: 'idle', moveTimer: 0, statusEffects: [],
    });
    const player = new PlayerState(2, 3, 'N');
    const result = interact(player, INTERACT_GRID, gs);

    expect(result.type).toBe('nothing');
    expect(gs.getBlock(2, 2)).toBeDefined(); // block not moved
  });
});

describe('Phase D — chest interaction', () => {
  it('unlocked chest: returns chest_opened', () => {
    // Player at (2,2) facing N → facing (2,1) where chest is
    const gs = new GameState([
      { col: 2, row: 1, type: 'chest', state: 'closed' },
    ], INTERACT_GRID);
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, INTERACT_GRID, gs);

    expect(result.type).toBe('chest_opened');
    expect(gs.getChest(2, 1)!.state).toBe('open');
  });

  it('locked chest with key: returns chest_opened and key consumed', () => {
    const gs = new GameState([
      { col: 2, row: 1, type: 'chest', state: 'locked', keyId: 'gold_key' },
    ], INTERACT_GRID);
    gs.addKey('gold_key');
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, INTERACT_GRID, gs);

    expect(result.type).toBe('chest_opened');
    expect(gs.getChest(2, 1)!.state).toBe('open');
    expect(gs.hasKey('gold_key')).toBe(false);
  });

  it('locked chest without key: returns chest_locked', () => {
    const gs = new GameState([
      { col: 2, row: 1, type: 'chest', state: 'locked', keyId: 'gold_key' },
    ], INTERACT_GRID);
    const player = new PlayerState(2, 2, 'N');
    const result = interact(player, INTERACT_GRID, gs);

    expect(result.type).toBe('chest_locked');
    expect(gs.getChest(2, 1)!.state).toBe('locked');
  });
});

describe('Phase D — sign interaction', () => {
  it('facing sign wall: returns sign_read with text', () => {
    // Player at (2,1) stands on sign cell, facing N (sign mounted on north wall)
    const gs = new GameState([
      { col: 2, row: 1, type: 'sign', wall: 'N', text: 'You found a secret!' },
    ], INTERACT_GRID);
    const player = new PlayerState(2, 1, 'N');
    const result = interact(player, INTERACT_GRID, gs);

    expect(result.type).toBe('sign_read');
    expect(result.message).toBe('You found a secret!');
  });

  it('facing wrong wall: returns nothing', () => {
    const gs = new GameState([
      { col: 2, row: 1, type: 'sign', wall: 'N', text: 'You found a secret!' },
    ], INTERACT_GRID);
    // Player faces S, sign is on N wall
    const player = new PlayerState(2, 1, 'S');
    const result = interact(player, INTERACT_GRID, gs);

    expect(result.type).toBe('nothing');
  });
});
