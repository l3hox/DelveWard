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
    it('hp defaults to 65/65 (40 + VIT(5) * 5)', () => {
      const gs = new GameState([]);
      expect(gs.hp).toBe(65);
      expect(gs.maxHp).toBe(65);
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

  // --- saveLevelState ---

  describe('saveLevelState', () => {
    it('captures doors, keys, levers, plates, exploredCells', () => {
      const gs = new GameState([
        doorEntity(1, 1, 'closed'),
        { col: 2, row: 2, type: 'key', keyId: 'gold_key' },
        { col: 3, row: 3, type: 'lever', targetDoor: '1,1' },
        { col: 4, row: 4, type: 'pressure_plate', targetDoor: '1,1' },
      ]);
      gs.exploredCells.add('0,0');
      gs.exploredCells.add('1,0');

      const snap = gs.saveLevelState();

      expect(snap.doors.size).toBe(1);
      expect(snap.keys.size).toBe(1);
      expect(snap.levers.size).toBe(1);
      expect(snap.plates.size).toBe(1);
      expect(snap.exploredCells.size).toBe(2);
      expect(snap.exploredCells.has('0,0')).toBe(true);
    });

    it('snapshot is a deep copy — mutating GameState after save does not affect snapshot', () => {
      const gs = new GameState([doorEntity(1, 1, 'closed')]);
      gs.exploredCells.add('1,1');

      const snap = gs.saveLevelState();

      // Mutate the live state
      gs.openDoor(1, 1);
      gs.exploredCells.add('2,2');

      // Snapshot should be unchanged
      expect(snap.doors.get('1,1')!.state).toBe('closed');
      expect(snap.exploredCells.has('2,2')).toBe(false);
    });
  });

  // --- loadLevelState ---

  describe('loadLevelState', () => {
    it('restores doors, keys, levers, plates, exploredCells from snapshot', () => {
      const gs = new GameState([doorEntity(5, 5, 'open')]);
      gs.exploredCells.add('5,5');
      const snap = gs.saveLevelState();

      const gs2 = new GameState([]);
      gs2.loadLevelState(snap);

      expect(gs2.doors.size).toBe(1);
      expect(gs2.getDoor(5, 5)!.state).toBe('open');
      expect(gs2.exploredCells.has('5,5')).toBe(true);
    });

    it('restored state is a deep copy — mutating snapshot after load does not affect GameState', () => {
      const gs = new GameState([doorEntity(1, 1, 'closed')]);
      const snap = gs.saveLevelState();

      const gs2 = new GameState([]);
      gs2.loadLevelState(snap);

      // Mutate the snapshot directly
      snap.doors.get('1,1')!.state = 'open';
      snap.exploredCells.add('9,9');

      // gs2 should be unaffected
      expect(gs2.getDoor(1, 1)!.state).toBe('closed');
      expect(gs2.exploredCells.has('9,9')).toBe(false);
    });
  });

  // --- loadNewLevel ---

  describe('loadNewLevel', () => {
    it('resets doors, keys, levers, plates, exploredCells', () => {
      const gs = new GameState([
        doorEntity(1, 1, 'closed'),
        { col: 2, row: 2, type: 'key', keyId: 'gold_key' },
      ]);
      gs.exploredCells.add('1,1');

      gs.loadNewLevel([]);

      expect(gs.doors.size).toBe(0);
      expect(gs.keys.size).toBe(0);
      expect(gs.exploredCells.size).toBe(0);
    });

    it('parses new entities correctly after reset', () => {
      const gs = new GameState([doorEntity(1, 1, 'closed')]);
      gs.loadNewLevel([doorEntity(9, 9, 'open')]);

      expect(gs.getDoor(1, 1)).toBeUndefined();
      expect(gs.getDoor(9, 9)).toBeDefined();
      expect(gs.getDoor(9, 9)!.state).toBe('open');
    });

    it('preserves hp, torchFuel, and inventory across level load', () => {
      const gs = new GameState([]);
      gs.hp = 15;
      gs.torchFuel = 50;
      gs.addKey('iron_key');

      gs.loadNewLevel([doorEntity(3, 3, 'closed')]);

      expect(gs.hp).toBe(15);
      expect(gs.torchFuel).toBe(50);
      expect(gs.hasKey('iron_key')).toBe(true);
    });
  });

  // --- drainTorchFuel ---

  describe('drainTorchFuel', () => {
    it('drains the correct amount', () => {
      const gs = new GameState([]);
      gs.drainTorchFuel(10);
      expect(gs.torchFuel).toBe(90);
    });

    it('clamps at 0 when draining more than available', () => {
      const gs = new GameState([]);
      gs.drainTorchFuel(200);
      expect(gs.torchFuel).toBe(0);
    });

    it('draining 0 does nothing', () => {
      const gs = new GameState([]);
      gs.drainTorchFuel(0);
      expect(gs.torchFuel).toBe(100);
    });
  });

  // --- Equipment ---

  describe('equipment', () => {
    it('getEffectiveAtk returns base atk + STR bonus with no equipment', () => {
      const gs = new GameState([]);
      // atk = this.atk(3) + floor(STR(5)/2) = 3 + 2 = 5
      expect(gs.getEffectiveAtk()).toBe(5);
    });

    it('getEffectiveDef returns base def + VIT bonus with no equipment', () => {
      const gs = new GameState([]);
      // def = this.def(1) + floor(VIT(5)/4) = 1 + 1 = 2
      expect(gs.getEffectiveDef()).toBe(2);
    });

    it('equipItem equips to correct slot', () => {
      const gs = new GameState([]);
      const sword = { id: 'sword', name: 'Sword', slot: 'weapon' as const, atkBonus: 2, defBonus: 0 };
      const displaced = gs.equipItem(sword);
      expect(displaced).toBeNull();
      expect(gs.equipment.get('weapon')).toBe(sword);
    });

    it('equipItem returns displaced item', () => {
      const gs = new GameState([]);
      const sword1 = { id: 'sword1', name: 'Sword 1', slot: 'weapon' as const, atkBonus: 2, defBonus: 0 };
      const sword2 = { id: 'sword2', name: 'Sword 2', slot: 'weapon' as const, atkBonus: 5, defBonus: 0 };
      gs.equipItem(sword1);
      const displaced = gs.equipItem(sword2);
      expect(displaced).toBe(sword1);
      expect(gs.equipment.get('weapon')).toBe(sword2);
    });

    it('getEffectiveAtk includes weapon bonus and STR bonus', () => {
      const gs = new GameState([]);
      gs.equipItem({ id: 'sword', name: 'Sword', slot: 'weapon', atkBonus: 3, defBonus: 0 });
      // atk = this.atk(3) + floor(STR(5)/2) + atkBonus(3) = 3 + 2 + 3 = 8
      expect(gs.getEffectiveAtk()).toBe(8);
    });

    it('getEffectiveDef includes armor, ring bonuses, and VIT bonus', () => {
      const gs = new GameState([]);
      gs.equipItem({ id: 'shield', name: 'Shield', slot: 'chest', atkBonus: 0, defBonus: 2 });
      gs.equipItem({ id: 'ring', name: 'Ring', slot: 'ring1', atkBonus: 0, defBonus: 1 });
      // def = this.def(1) + floor(VIT(5)/4) + 2 + 1 = 1 + 1 + 2 + 1 = 5
      expect(gs.getEffectiveDef()).toBe(5);
    });

    it('pickupEquipmentAt picks up and auto-equips', () => {
      const gs = new GameState([
        { col: 3, row: 3, type: 'equipment', itemId: 'sword', name: 'Sword', slot: 'weapon', atkBonus: 2, defBonus: 0 },
      ]);
      const item = gs.pickupEquipmentAt(3, 3);
      expect(item).toBeDefined();
      expect(item!.id).toBe('sword');
      expect(gs.equipment.get('weapon')).toBeDefined();
      expect(gs.groundItems.size).toBe(0);
    });

    it('pickupEquipmentAt returns undefined for empty cell', () => {
      const gs = new GameState([]);
      expect(gs.pickupEquipmentAt(5, 5)).toBeUndefined();
    });

    it('equipment persists across loadNewLevel', () => {
      const gs = new GameState([]);
      gs.equipItem({ id: 'sword', name: 'Sword', slot: 'weapon', atkBonus: 2, defBonus: 0 });
      gs.loadNewLevel([]);
      expect(gs.equipment.get('weapon')).toBeDefined();
      expect(gs.equipment.get('weapon')!.id).toBe('sword');
    });

    it('groundItems are reset in loadNewLevel', () => {
      const gs = new GameState([
        { col: 1, row: 1, type: 'equipment', itemId: 'sword', name: 'Sword', slot: 'weapon', atkBonus: 2, defBonus: 0 },
      ]);
      expect(gs.groundItems.size).toBe(1);
      gs.loadNewLevel([]);
      expect(gs.groundItems.size).toBe(0);
    });

    it('constructor parses equipment entities', () => {
      const gs = new GameState([
        { col: 1, row: 1, type: 'equipment', itemId: 'ring', name: 'Ring', slot: 'ring', atkBonus: 1, defBonus: 1 },
      ]);
      expect(gs.groundItems.size).toBe(1);
      expect(gs.groundItems.get('1,1')!.id).toBe('ring');
    });
  });

  // --- Consumables ---

  describe('consumables', () => {
    it('pickupConsumableAt picks up into backpack', () => {
      const gs = new GameState([
        { col: 2, row: 2, type: 'consumable', itemId: 'hp1', name: 'Potion', consumableType: 'health_potion', value: 10 },
      ]);
      const item = gs.pickupConsumableAt(2, 2);
      expect(item).toBeDefined();
      expect(item!.id).toBe('hp1');
      expect(gs.backpack.length).toBe(1);
      expect(gs.groundConsumables.size).toBe(0);
    });

    it('pickupConsumableAt returns undefined when backpack is full', () => {
      const gs = new GameState([
        { col: 1, row: 1, type: 'consumable', itemId: 'hp', name: 'Potion', consumableType: 'health_potion', value: 10 },
      ]);
      // Fill backpack
      for (let i = 0; i < 8; i++) {
        gs.backpack.push({ id: `fill${i}`, name: 'Fill', consumableType: 'health_potion', value: 1 });
      }
      const item = gs.pickupConsumableAt(1, 1);
      expect(item).toBeUndefined();
      expect(gs.groundConsumables.size).toBe(1); // still on ground
    });

    it('pickupConsumableAt returns undefined for empty cell', () => {
      const gs = new GameState([]);
      expect(gs.pickupConsumableAt(5, 5)).toBeUndefined();
    });

    it('useConsumable health_potion restores hp', () => {
      const gs = new GameState([]);
      gs.hp = 10;
      gs.backpack.push({ id: 'hp1', name: 'Potion', consumableType: 'health_potion', value: 5 });
      const used = gs.useConsumable(0);
      expect(used).toBe(true);
      expect(gs.hp).toBe(15);
      expect(gs.backpack.length).toBe(0);
    });

    it('useConsumable health_potion clamps at maxHp', () => {
      const gs = new GameState([]);
      gs.hp = gs.maxHp - 5; // 5 below max
      gs.backpack.push({ id: 'hp1', name: 'Potion', consumableType: 'health_potion', value: 10 });
      gs.useConsumable(0);
      expect(gs.hp).toBe(gs.maxHp);
    });

    it('useConsumable torch_oil restores torchFuel', () => {
      const gs = new GameState([]);
      gs.torchFuel = 50;
      gs.backpack.push({ id: 'oil1', name: 'Oil', consumableType: 'torch_oil', value: 30 });
      const used = gs.useConsumable(0);
      expect(used).toBe(true);
      expect(gs.torchFuel).toBe(80);
      expect(gs.backpack.length).toBe(0);
    });

    it('useConsumable torch_oil clamps at maxTorchFuel', () => {
      const gs = new GameState([]);
      gs.torchFuel = 90;
      gs.backpack.push({ id: 'oil1', name: 'Oil', consumableType: 'torch_oil', value: 30 });
      gs.useConsumable(0);
      expect(gs.torchFuel).toBe(100);
    });

    it('useConsumable returns false for invalid index', () => {
      const gs = new GameState([]);
      expect(gs.useConsumable(0)).toBe(false);
      expect(gs.useConsumable(-1)).toBe(false);
      expect(gs.useConsumable(10)).toBe(false);
    });

    it('backpack persists across loadNewLevel', () => {
      const gs = new GameState([]);
      gs.backpack.push({ id: 'hp1', name: 'Potion', consumableType: 'health_potion', value: 10 });
      gs.loadNewLevel([]);
      expect(gs.backpack.length).toBe(1);
      expect(gs.backpack[0].id).toBe('hp1');
    });

    it('groundConsumables are reset in loadNewLevel', () => {
      const gs = new GameState([
        { col: 1, row: 1, type: 'consumable', itemId: 'hp1', name: 'Potion', consumableType: 'health_potion', value: 10 },
      ]);
      expect(gs.groundConsumables.size).toBe(1);
      gs.loadNewLevel([]);
      expect(gs.groundConsumables.size).toBe(0);
    });

    it('groundItems and groundConsumables are saved/restored in level snapshots', () => {
      const gs = new GameState([
        { col: 1, row: 1, type: 'equipment', itemId: 'sword', name: 'Sword', slot: 'weapon', atkBonus: 2, defBonus: 0 },
        { col: 2, row: 2, type: 'consumable', itemId: 'hp1', name: 'Potion', consumableType: 'health_potion', value: 10 },
      ]);
      const snap = gs.saveLevelState();
      expect(snap.groundItems.size).toBe(1);
      expect(snap.groundConsumables.size).toBe(1);

      // Load into fresh state
      const gs2 = new GameState([]);
      gs2.loadLevelState(snap);
      expect(gs2.groundItems.size).toBe(1);
      expect(gs2.groundConsumables.size).toBe(1);
      expect(gs2.groundItems.get('1,1')!.id).toBe('sword');
      expect(gs2.groundConsumables.get('2,2')!.id).toBe('hp1');
    });

    it('snapshot groundItems is a deep copy', () => {
      const gs = new GameState([
        { col: 1, row: 1, type: 'equipment', itemId: 'sword', name: 'Sword', slot: 'weapon', atkBonus: 2, defBonus: 0 },
      ]);
      const snap = gs.saveLevelState();
      gs.groundItems.delete('1,1');
      expect(snap.groundItems.size).toBe(1);
    });
  });

  // --- Stats & Leveling (Phase B) ---

  describe('xpForLevel', () => {
    it('returns 100 for level 1', () => {
      const gs = new GameState([]);
      expect(gs.xpForLevel(1)).toBe(100);
    });

    it('returns 300 for level 2', () => {
      const gs = new GameState([]);
      expect(gs.xpForLevel(2)).toBe(300);
    });

    it('returns 600 for level 3', () => {
      const gs = new GameState([]);
      expect(gs.xpForLevel(3)).toBe(600);
    });

    it('returns 1000 for level 4', () => {
      const gs = new GameState([]);
      expect(gs.xpForLevel(4)).toBe(1000);
    });

    it('returns 1500 for level 5', () => {
      const gs = new GameState([]);
      expect(gs.xpForLevel(5)).toBe(1500);
    });
  });

  describe('addXp', () => {
    it('accumulates XP without levelling up', () => {
      const gs = new GameState([]);
      const result = gs.addXp(50);
      expect(result).toBe(false);
      expect(gs.xp).toBe(50);
      expect(gs.level).toBe(1);
    });

    it('returns true and increments level when threshold crossed', () => {
      const gs = new GameState([]);
      const result = gs.addXp(100);
      expect(result).toBe(true);
      expect(gs.level).toBe(2);
    });

    it('grants +3 attributePoints on level-up', () => {
      const gs = new GameState([]);
      gs.addXp(100);
      expect(gs.attributePoints).toBe(3);
    });

    it('can level up multiple times from a single addXp call', () => {
      const gs = new GameState([]);
      gs.addXp(600); // enough for levels 1, 2, and 3
      expect(gs.level).toBe(4);
      expect(gs.attributePoints).toBe(9); // 3 per level-up x3
    });

    it('caps at level 15 and returns false at cap', () => {
      const gs = new GameState([]);
      // xpForLevel(15) = 100 * 15 * 16 / 2 = 12000
      gs.addXp(12000);
      expect(gs.level).toBe(15);
      const result = gs.addXp(99999);
      expect(result).toBe(false);
      expect(gs.level).toBe(15);
    });
  });

  describe('allocatePoint', () => {
    it('decrements attributePoints and increments the given stat', () => {
      const gs = new GameState([]);
      gs.attributePoints = 3;
      const result = gs.allocatePoint('str');
      expect(result).toBe(true);
      expect(gs.attributePoints).toBe(2);
      expect(gs.str).toBe(6);
    });

    it('returns false when no points remain', () => {
      const gs = new GameState([]);
      const result = gs.allocatePoint('dex');
      expect(result).toBe(false);
      expect(gs.dex).toBe(5); // unchanged
    });

    it('VIT allocation recalculates maxHp', () => {
      const gs = new GameState([]);
      gs.attributePoints = 1;
      const prevMax = gs.maxHp;
      gs.allocatePoint('vit');
      expect(gs.maxHp).toBe(prevMax + 5); // +5 per VIT point
    });

    it('VIT allocation restores hp to new max when hp was at old max', () => {
      const gs = new GameState([]);
      gs.attributePoints = 1;
      // hp starts at maxHp
      expect(gs.hp).toBe(gs.maxHp);
      gs.allocatePoint('vit');
      expect(gs.hp).toBe(gs.maxHp);
    });

    it('VIT allocation does not change hp when hp was below max', () => {
      const gs = new GameState([]);
      gs.attributePoints = 1;
      gs.hp = 30;
      gs.allocatePoint('vit');
      expect(gs.hp).toBe(30); // unchanged
    });
  });

  describe('getEffectiveStats', () => {
    it('maxHp equals 40 + VIT * 5 with default stats and no equipment', () => {
      const gs = new GameState([]);
      const stats = gs.getEffectiveStats();
      expect(stats.maxHp).toBe(40 + 5 * 5); // 65
    });

    it('critChance base is 5 + floor(DEX / 3)', () => {
      const gs = new GameState([]);
      // DEX=5: 5 + floor(5/3) = 5 + 1 = 6
      const stats = gs.getEffectiveStats();
      expect(stats.critChance).toBe(6);
    });

    it('dodgeChance is 0 when DEX equals 5', () => {
      const gs = new GameState([]);
      const stats = gs.getEffectiveStats();
      expect(stats.dodgeChance).toBe(0);
    });

    it('dodgeChance increases with DEX above 5', () => {
      const gs = new GameState([]);
      gs.dex = 9;
      const stats = gs.getEffectiveStats();
      // floor((9-5)/4) = floor(1) = 1
      expect(stats.dodgeChance).toBe(1);
    });

    it('dodgeChance is capped at 25', () => {
      const gs = new GameState([]);
      gs.dex = 200;
      const stats = gs.getEffectiveStats();
      expect(stats.dodgeChance).toBe(25);
    });
  });
});
