import { describe, it, expect } from 'vitest';
import { GameState } from './gameState';
import type { Entity } from './types';

function doorEntity(
  col: number,
  row: number,
  state: string = 'closed',
  keyId?: string,
): Entity {
  const e: Entity = { col, row, type: 'door', state };
  if (keyId) e.keyId = keyId;
  return e;
}

describe('GameState', () => {
  // --- Constructor ---

  it('extracts door entities into doors map', () => {
    const gs = new GameState([
      doorEntity(1, 2, 'closed'),
      doorEntity(3, 4, 'locked', 'gold_key'),
    ]);
    expect(gs.doors.size).toBe(2);
    expect(gs.getDoor(1, 2)).toBeDefined();
    expect(gs.getDoor(3, 4)).toBeDefined();
  });

  it('ignores non-door entities', () => {
    const gs = new GameState([
      { col: 1, row: 1, type: 'enemy' },
      doorEntity(2, 2, 'closed'),
      { col: 3, row: 3, type: 'key', keyId: 'silver_key' },
    ]);
    expect(gs.doors.size).toBe(1);
  });

  it('defaults door state to closed when not specified', () => {
    const gs = new GameState([{ col: 1, row: 1, type: 'door' }]);
    const door = gs.getDoor(1, 1);
    expect(door).toBeDefined();
    expect(door!.state).toBe('closed');
  });

  it('inventory starts empty', () => {
    const gs = new GameState([]);
    expect(gs.inventory.size).toBe(0);
  });

  // --- getDoor ---

  it('getDoor returns correct instance', () => {
    const gs = new GameState([doorEntity(5, 6, 'locked', 'key1')]);
    const door = gs.getDoor(5, 6);
    expect(door).toBeDefined();
    expect(door!.col).toBe(5);
    expect(door!.row).toBe(6);
    expect(door!.state).toBe('locked');
    expect(door!.keyId).toBe('key1');
  });

  it('getDoor returns undefined for non-existent door', () => {
    const gs = new GameState([doorEntity(1, 1)]);
    expect(gs.getDoor(9, 9)).toBeUndefined();
  });

  // --- isDoorOpen ---

  it('isDoorOpen returns true for open doors', () => {
    const gs = new GameState([doorEntity(1, 1, 'open')]);
    expect(gs.isDoorOpen(1, 1)).toBe(true);
  });

  it('isDoorOpen returns false for closed doors', () => {
    const gs = new GameState([doorEntity(1, 1, 'closed')]);
    expect(gs.isDoorOpen(1, 1)).toBe(false);
  });

  it('isDoorOpen returns false for locked doors', () => {
    const gs = new GameState([doorEntity(1, 1, 'locked', 'key1')]);
    expect(gs.isDoorOpen(1, 1)).toBe(false);
  });

  it('isDoorOpen returns true when no door entity at position', () => {
    const gs = new GameState([]);
    expect(gs.isDoorOpen(5, 5)).toBe(true);
  });

  // --- openDoor ---

  it('openDoor: closed -> open returns true', () => {
    const gs = new GameState([doorEntity(1, 1, 'closed')]);
    expect(gs.openDoor(1, 1)).toBe(true);
    expect(gs.getDoor(1, 1)!.state).toBe('open');
  });

  it('openDoor: already open returns false', () => {
    const gs = new GameState([doorEntity(1, 1, 'open')]);
    expect(gs.openDoor(1, 1)).toBe(false);
  });

  it('openDoor: locked returns false', () => {
    const gs = new GameState([doorEntity(1, 1, 'locked', 'key1')]);
    expect(gs.openDoor(1, 1)).toBe(false);
    expect(gs.getDoor(1, 1)!.state).toBe('locked');
  });

  it('openDoor: mechanical door returns false', () => {
    const gs = new GameState([
      doorEntity(3, 2, 'closed'),
      { col: 1, row: 1, type: 'lever', targetDoor: '3,2' },
    ]);
    expect(gs.openDoor(3, 2)).toBe(false);
    expect(gs.getDoor(3, 2)!.state).toBe('closed');
  });

  // --- unlockDoor ---

  it('unlockDoor: locked -> closed with correct key returns true', () => {
    const gs = new GameState([doorEntity(1, 1, 'locked', 'gold_key')]);
    gs.addKey('gold_key');
    expect(gs.unlockDoor(1, 1)).toBe(true);
    expect(gs.getDoor(1, 1)!.state).toBe('closed');
  });

  it('unlockDoor: locked but wrong key returns false', () => {
    const gs = new GameState([doorEntity(1, 1, 'locked', 'gold_key')]);
    gs.addKey('silver_key');
    expect(gs.unlockDoor(1, 1)).toBe(false);
    expect(gs.getDoor(1, 1)!.state).toBe('locked');
  });

  it('unlockDoor: not locked returns false', () => {
    const gs = new GameState([doorEntity(1, 1, 'closed')]);
    expect(gs.unlockDoor(1, 1)).toBe(false);
  });

  // --- toggleDoor ---

  it('toggleDoor: open -> closed', () => {
    const gs = new GameState([doorEntity(1, 1, 'open')]);
    gs.toggleDoor(1, 1);
    expect(gs.getDoor(1, 1)!.state).toBe('closed');
  });

  it('toggleDoor: closed -> open', () => {
    const gs = new GameState([doorEntity(1, 1, 'closed')]);
    gs.toggleDoor(1, 1);
    expect(gs.getDoor(1, 1)!.state).toBe('open');
  });

  it('toggleDoor: locked stays locked', () => {
    const gs = new GameState([doorEntity(1, 1, 'locked', 'key1')]);
    gs.toggleDoor(1, 1);
    expect(gs.getDoor(1, 1)!.state).toBe('locked');
  });

  // --- closeDoor ---

  it('closeDoor: open -> closed returns true', () => {
    const gs = new GameState([doorEntity(1, 1, 'open')]);
    expect(gs.closeDoor(1, 1)).toBe(true);
    expect(gs.getDoor(1, 1)!.state).toBe('closed');
  });

  it('closeDoor: closed returns false', () => {
    const gs = new GameState([doorEntity(1, 1, 'closed')]);
    expect(gs.closeDoor(1, 1)).toBe(false);
  });

  it('closeDoor: locked returns false', () => {
    const gs = new GameState([doorEntity(1, 1, 'locked', 'key1')]);
    expect(gs.closeDoor(1, 1)).toBe(false);
  });

  it('closeDoor: no door returns false', () => {
    const gs = new GameState([]);
    expect(gs.closeDoor(9, 9)).toBe(false);
  });

  it('closeDoor: mechanical door returns false', () => {
    const gs = new GameState([
      doorEntity(3, 2, 'closed'),
      { col: 1, row: 1, type: 'lever', targetDoor: '3,2' },
    ]);
    // Open via lever
    gs.activateLever(1, 1);
    expect(gs.getDoor(3, 2)!.state).toBe('open');
    expect(gs.closeDoor(3, 2)).toBe(false);
  });

  // --- mechanical flag ---

  it('door targeted by lever is marked mechanical', () => {
    const gs = new GameState([
      doorEntity(5, 3, 'closed'),
      { col: 2, row: 1, type: 'lever', targetDoor: '5,3' },
    ]);
    expect(gs.getDoor(5, 3)!.mechanical).toBe(true);
  });

  it('door targeted by pressure plate is marked mechanical', () => {
    const gs = new GameState([
      doorEntity(5, 3, 'closed'),
      { col: 2, row: 2, type: 'pressure_plate', targetDoor: '5,3' },
    ]);
    expect(gs.getDoor(5, 3)!.mechanical).toBe(true);
  });

  it('door without lever/plate is not mechanical', () => {
    const gs = new GameState([doorEntity(1, 1, 'closed')]);
    expect(gs.getDoor(1, 1)!.mechanical).toBe(false);
  });

  // --- auto-created doors from grid ---

  describe('auto-door creation from grid', () => {
    const grid = [
      '#####',
      '#.D.#',
      '#...#',
      '#####',
    ];

    it('D cell without entity gets auto-created door', () => {
      const gs = new GameState([], grid);
      const door = gs.getDoor(2, 1);
      expect(door).toBeDefined();
      expect(door!.state).toBe('closed');
      expect(door!.mechanical).toBe(false);
    });

    it('D cell with entity is not overwritten', () => {
      const gs = new GameState([doorEntity(2, 1, 'locked', 'key1')], grid);
      const door = gs.getDoor(2, 1);
      expect(door!.state).toBe('locked');
      expect(door!.keyId).toBe('key1');
    });

    it('auto-created door is openable', () => {
      const gs = new GameState([], grid);
      expect(gs.openDoor(2, 1)).toBe(true);
      expect(gs.getDoor(2, 1)!.state).toBe('open');
    });

    it('no grid parameter keeps backward compat', () => {
      const gs = new GameState([]);
      expect(gs.doors.size).toBe(0);
    });
  });

  // --- addKey / hasKey ---

  it('addKey and hasKey', () => {
    const gs = new GameState([]);
    expect(gs.hasKey('gold_key')).toBe(false);
    gs.addKey('gold_key');
    expect(gs.hasKey('gold_key')).toBe(true);
  });

  // --- Key pickup ---

  describe('key pickup', () => {
    it('pickupKeyAt returns keyId and adds to inventory', () => {
      const gs = new GameState([
        { col: 3, row: 2, type: 'key', keyId: 'gold_key' },
      ]);
      const result = gs.pickupKeyAt(3, 2);
      expect(result).toBe('gold_key');
      expect(gs.hasKey('gold_key')).toBe(true);
    });

    it('pickupKeyAt returns undefined for already picked up key', () => {
      const gs = new GameState([
        { col: 3, row: 2, type: 'key', keyId: 'gold_key' },
      ]);
      gs.pickupKeyAt(3, 2);
      const result = gs.pickupKeyAt(3, 2);
      expect(result).toBeUndefined();
    });

    it('pickupKeyAt returns undefined when no key at position', () => {
      const gs = new GameState([]);
      const result = gs.pickupKeyAt(5, 5);
      expect(result).toBeUndefined();
    });

    it('constructor extracts key entities', () => {
      const gs = new GameState([
        { col: 1, row: 1, type: 'key', keyId: 'silver_key' },
        { col: 2, row: 3, type: 'key', keyId: 'gold_key' },
      ]);
      expect(gs.keys.size).toBe(2);
      expect(gs.keys.get('1,1')).toBeDefined();
      expect(gs.keys.get('2,3')).toBeDefined();
      expect(gs.keys.get('1,1')!.keyId).toBe('silver_key');
    });
  });

  // --- Lever activation ---

  describe('lever activation', () => {
    it('activateLever toggles target door and returns targetDoor', () => {
      const gs = new GameState([
        doorEntity(5, 3, 'closed'),
        { col: 2, row: 1, type: 'lever', targetDoor: '5,3' },
      ]);
      const result = gs.activateLever(2, 1);
      expect(result).toBe('5,3');
      expect(gs.getDoor(5, 3)!.state).toBe('open');
    });

    it('activateLever toggles lever state up -> down -> up', () => {
      const gs = new GameState([
        doorEntity(5, 3, 'closed'),
        { col: 2, row: 1, type: 'lever', targetDoor: '5,3' },
      ]);
      expect(gs.getLever(2, 1)!.state).toBe('up');
      gs.activateLever(2, 1);
      expect(gs.getLever(2, 1)!.state).toBe('down');
      gs.activateLever(2, 1);
      expect(gs.getLever(2, 1)!.state).toBe('up');
    });

    it('activateLever is repeatable — toggles door back', () => {
      const gs = new GameState([
        doorEntity(5, 3, 'closed'),
        { col: 2, row: 1, type: 'lever', targetDoor: '5,3' },
      ]);
      gs.activateLever(2, 1);
      expect(gs.getDoor(5, 3)!.state).toBe('open');
      gs.activateLever(2, 1);
      expect(gs.getDoor(5, 3)!.state).toBe('closed');
    });

    it('activateLever returns undefined when no lever at position', () => {
      const gs = new GameState([]);
      const result = gs.activateLever(9, 9);
      expect(result).toBeUndefined();
    });

    it('constructor extracts lever entities', () => {
      const gs = new GameState([
        { col: 2, row: 1, type: 'lever', targetDoor: '5,3' },
        { col: 4, row: 6, type: 'lever', targetDoor: '7,8' },
      ]);
      expect(gs.levers.size).toBe(2);
      expect(gs.levers.get('2,1')).toBeDefined();
      expect(gs.levers.get('4,6')).toBeDefined();
      expect(gs.levers.get('2,1')!.targetDoor).toBe('5,3');
    });
  });

  // --- Pressure plate activation ---

  describe('pressure plate activation', () => {
    it('activatePressurePlate opens target door and returns targetDoor', () => {
      const gs = new GameState([
        doorEntity(5, 3, 'closed'),
        { col: 2, row: 2, type: 'pressure_plate', targetDoor: '5,3' },
      ]);
      const result = gs.activatePressurePlate(2, 2);
      expect(result).toBe('5,3');
      expect(gs.getDoor(5, 3)!.state).toBe('open');
    });

    it('activatePressurePlate returns undefined for already activated plate', () => {
      const gs = new GameState([
        doorEntity(5, 3, 'closed'),
        { col: 2, row: 2, type: 'pressure_plate', targetDoor: '5,3' },
      ]);
      gs.activatePressurePlate(2, 2);
      const result = gs.activatePressurePlate(2, 2);
      expect(result).toBeUndefined();
    });

    it('activatePressurePlate returns undefined when no plate at position', () => {
      const gs = new GameState([]);
      const result = gs.activatePressurePlate(9, 9);
      expect(result).toBeUndefined();
    });

    it('constructor extracts pressure_plate entities', () => {
      const gs = new GameState([
        { col: 3, row: 3, type: 'pressure_plate', targetDoor: '5,3' },
      ]);
      expect(gs.plates.size).toBe(1);
      expect(gs.plates.get('3,3')).toBeDefined();
      expect(gs.plates.get('3,3')!.targetDoor).toBe('5,3');
    });

    it('plate opens a closed door', () => {
      const gs = new GameState([
        doorEntity(4, 2, 'closed'),
        { col: 1, row: 3, type: 'pressure_plate', targetDoor: '4,2' },
      ]);
      expect(gs.isDoorOpen(4, 2)).toBe(false);
      gs.activatePressurePlate(1, 3);
      expect(gs.isDoorOpen(4, 2)).toBe(true);
    });
  });

  // --- toggleDoor edge cases ---

  describe('toggleDoor', () => {
    it('does nothing for non-existent door', () => {
      const gs = new GameState([]);
      // Should not throw
      gs.toggleDoor(99, 99);
    });
  });

  // --- autoDetectLeverWall ---

  describe('autoDetectLeverWall', () => {
    // Auto-detection checks N, S, E, W in priority order, falls back to N
    const grid = [
      '#####',
      '#...#',
      '#...#',
      '#...#',
      '#####',
    ];

    it('detects N wall when wall is to the north', () => {
      // Cell (2,1) has wall at row 0 to the north
      const gs = new GameState([
        { col: 2, row: 1, type: 'lever', targetDoor: '1,1' },
      ], grid);
      expect(gs.levers.get('2,1')!.wall).toBe('N');
    });

    it('detects S wall when wall is to the south', () => {
      // Cell (2,3) has wall at row 4 to the south
      const gs = new GameState([
        { col: 2, row: 3, type: 'lever', targetDoor: '1,1' },
      ], grid);
      expect(gs.levers.get('2,3')!.wall).toBe('S');
    });

    it('detects E wall when wall is to the east', () => {
      // Cell (3,2) has wall at col 4 to the east, no wall N or S
      const gs = new GameState([
        { col: 3, row: 2, type: 'lever', targetDoor: '1,1' },
      ], grid);
      expect(gs.levers.get('3,2')!.wall).toBe('E');
    });

    it('detects W wall when wall is to the west', () => {
      // Cell (1,2) has wall at col 0 to the west, no wall N or S
      const gs = new GameState([
        { col: 1, row: 2, type: 'lever', targetDoor: '1,1' },
      ], grid);
      expect(gs.levers.get('1,2')!.wall).toBe('W');
    });

    it('falls back to N when no adjacent walls', () => {
      // Cell (2,2) is surrounded by floor on all sides
      const gs = new GameState([
        { col: 2, row: 2, type: 'lever', targetDoor: '1,1' },
      ], grid);
      expect(gs.levers.get('2,2')!.wall).toBe('N');
    });

    it('falls back to N when no grid provided', () => {
      const gs = new GameState([
        { col: 2, row: 2, type: 'lever', targetDoor: '1,1' },
      ]);
      expect(gs.levers.get('2,2')!.wall).toBe('N');
    });
  });

  // --- HP and torch fuel ---

  describe('hp and torchFuel defaults', () => {
    it('hp defaults to 20/20', () => {
      const gs = new GameState([]);
      expect(gs.hp).toBe(20);
      expect(gs.maxHp).toBe(20);
    });

    it('torchFuel defaults to 100/100', () => {
      const gs = new GameState([]);
      expect(gs.torchFuel).toBe(100);
      expect(gs.maxTorchFuel).toBe(100);
    });

    it('exploredCells starts empty', () => {
      const gs = new GameState([]);
      expect(gs.exploredCells.size).toBe(0);
    });
  });

  // --- revealAround ---

  describe('revealAround', () => {
    const grid = [
      '#####',
      '#...#',
      '#...#',
      '#...#',
      '#####',
    ];

    it('reveals current cell', () => {
      const gs = new GameState([]);
      gs.revealAround(2, 2, 'N', grid);
      expect(gs.exploredCells.has('2,2')).toBe(true);
    });

    it('reveals 4 adjacent cells', () => {
      const gs = new GameState([]);
      gs.revealAround(2, 2, 'N', grid);
      expect(gs.exploredCells.has('2,1')).toBe(true); // N
      expect(gs.exploredCells.has('2,3')).toBe(true); // S
      expect(gs.exploredCells.has('1,2')).toBe(true); // W
      expect(gs.exploredCells.has('3,2')).toBe(true); // E
    });

    it('reveals line-of-sight forward (N) until wall', () => {
      const gs = new GameState([]);
      gs.revealAround(2, 3, 'N', grid);
      // Forward from (2,3) facing N: (2,2), (2,1), (2,0)=#wall
      expect(gs.exploredCells.has('2,2')).toBe(true);
      expect(gs.exploredCells.has('2,1')).toBe(true);
      expect(gs.exploredCells.has('2,0')).toBe(true); // wall itself is revealed
    });

    it('reveals line-of-sight forward (E) until wall', () => {
      const gs = new GameState([]);
      gs.revealAround(1, 2, 'E', grid);
      // Forward from (1,2) facing E: (2,2), (3,2), (4,2)=#wall
      expect(gs.exploredCells.has('2,2')).toBe(true);
      expect(gs.exploredCells.has('3,2')).toBe(true);
      expect(gs.exploredCells.has('4,2')).toBe(true);
    });

    it('stops at wall — does not reveal beyond', () => {
      const narrowGrid = [
        '#######',
        '#.#...#',
        '#######',
      ];
      const gs = new GameState([]);
      gs.revealAround(1, 1, 'E', narrowGrid);
      // Forward from (1,1) facing E: (2,1)=# wall — stops
      expect(gs.exploredCells.has('2,1')).toBe(true);
      expect(gs.exploredCells.has('3,1')).toBe(false);
    });

    it('does not reveal out-of-bounds cells', () => {
      const gs = new GameState([]);
      gs.revealAround(0, 0, 'N', grid);
      // Adjacent N would be (0,-1) — out of bounds, should not crash
      expect(gs.exploredCells.has('0,0')).toBe(true);
      expect(gs.exploredCells.has('0,-1')).toBe(false);
    });

    it('accumulates explored cells across multiple calls', () => {
      const gs = new GameState([]);
      gs.revealAround(1, 1, 'N', grid);
      const firstCount = gs.exploredCells.size;
      gs.revealAround(3, 3, 'S', grid);
      expect(gs.exploredCells.size).toBeGreaterThan(firstCount);
    });

    it('does not duplicate cells in set', () => {
      const gs = new GameState([]);
      gs.revealAround(2, 2, 'N', grid);
      const count = gs.exploredCells.size;
      gs.revealAround(2, 2, 'N', grid);
      expect(gs.exploredCells.size).toBe(count);
    });

    it('reveals line-of-sight south', () => {
      const gs = new GameState([]);
      gs.revealAround(2, 1, 'S', grid);
      // Forward S from (2,1): (2,2), (2,3), (2,4)=#wall
      expect(gs.exploredCells.has('2,2')).toBe(true);
      expect(gs.exploredCells.has('2,3')).toBe(true);
      expect(gs.exploredCells.has('2,4')).toBe(true);
    });

    it('reveals line-of-sight west', () => {
      const gs = new GameState([]);
      gs.revealAround(3, 2, 'W', grid);
      // Forward W from (3,2): (2,2), (1,2), (0,2)=#wall
      expect(gs.exploredCells.has('2,2')).toBe(true);
      expect(gs.exploredCells.has('1,2')).toBe(true);
      expect(gs.exploredCells.has('0,2')).toBe(true);
    });
  });
});
