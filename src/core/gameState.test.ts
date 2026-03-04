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
});
