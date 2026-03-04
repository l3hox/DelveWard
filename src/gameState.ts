import type { Entity } from './types';
import type { Facing } from './grid';

export type DoorState = 'open' | 'closed' | 'locked';

export interface DoorInstance {
  col: number;
  row: number;
  state: DoorState;
  keyId?: string;
  mechanical: boolean;
}

export interface KeyInstance {
  col: number;
  row: number;
  keyId: string;
  pickedUp: boolean;
}

export interface LeverInstance {
  col: number;
  row: number;
  targetDoor: string; // "col,row" of the door to toggle
  wall: Facing;       // which wall the lever is mounted on
  toggled: boolean;
}

export interface PlateInstance {
  col: number;
  row: number;
  targetDoor: string; // "col,row" of the door to open
  activated: boolean;
}

function doorKey(col: number, row: number): string {
  return `${col},${row}`;
}

function autoDetectLeverWall(col: number, row: number, grid?: string[]): Facing {
  if (!grid) return 'N';
  const rows = grid.length;
  const cols = grid[0].length;
  if (row - 1 >= 0 && grid[row - 1][col] === '#') return 'N';
  if (row + 1 < rows && grid[row + 1][col] === '#') return 'S';
  if (col + 1 < cols && grid[row][col + 1] === '#') return 'E';
  if (col - 1 >= 0 && grid[row][col - 1] === '#') return 'W';
  return 'N';
}

export class GameState {
  doors: Map<string, DoorInstance>;
  keys: Map<string, KeyInstance>;
  levers: Map<string, LeverInstance>;
  plates: Map<string, PlateInstance>;
  inventory: Set<string>;

  constructor(entities: Entity[], grid?: string[]) {
    this.doors = new Map();
    this.keys = new Map();
    this.levers = new Map();
    this.plates = new Map();
    this.inventory = new Set();

    for (const e of entities) {
      if (e.type === 'door') {
        const state = (e.state as DoorState) ?? 'closed';
        const keyId = e.keyId as string | undefined;
        this.doors.set(doorKey(e.col, e.row), {
          col: e.col,
          row: e.row,
          state,
          keyId,
          mechanical: false,
        });
      } else if (e.type === 'key') {
        this.keys.set(doorKey(e.col, e.row), {
          col: e.col,
          row: e.row,
          keyId: e.keyId as string,
          pickedUp: false,
        });
      } else if (e.type === 'lever') {
        const wall = (e.wall as Facing | undefined) ??
          autoDetectLeverWall(e.col, e.row, grid);
        this.levers.set(doorKey(e.col, e.row), {
          col: e.col,
          row: e.row,
          targetDoor: e.targetDoor as string,
          wall,
          toggled: false,
        });
      } else if (e.type === 'pressure_plate') {
        this.plates.set(doorKey(e.col, e.row), {
          col: e.col,
          row: e.row,
          targetDoor: e.targetDoor as string,
          activated: false,
        });
      }
    }

    // Mark doors targeted by levers/plates as mechanical
    for (const lever of this.levers.values()) {
      const door = this.doors.get(lever.targetDoor);
      if (door) door.mechanical = true;
    }
    for (const plate of this.plates.values()) {
      const door = this.doors.get(plate.targetDoor);
      if (door) door.mechanical = true;
    }

    // Auto-create doors for D cells with no entity
    if (grid) {
      for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
          if (grid[row][col] === 'D') {
            const key = doorKey(col, row);
            if (!this.doors.has(key)) {
              this.doors.set(key, {
                col,
                row,
                state: 'closed',
                mechanical: false,
              });
            }
          }
        }
      }
    }
  }

  getDoor(col: number, row: number): DoorInstance | undefined {
    return this.doors.get(doorKey(col, row));
  }

  isDoorOpen(col: number, row: number): boolean {
    const door = this.getDoor(col, row);
    if (!door) return true;
    return door.state === 'open';
  }

  openDoor(col: number, row: number): boolean {
    const door = this.getDoor(col, row);
    if (!door) return false;
    if (door.state !== 'closed') return false;
    if (door.mechanical) return false;
    door.state = 'open';
    return true;
  }

  unlockDoor(col: number, row: number): boolean {
    const door = this.getDoor(col, row);
    if (!door) return false;
    if (door.state !== 'locked') return false;
    if (!door.keyId || !this.hasKey(door.keyId)) return false;
    door.state = 'closed';
    return true;
  }

  closeDoor(col: number, row: number): boolean {
    const door = this.getDoor(col, row);
    if (!door) return false;
    if (door.state !== 'open') return false;
    if (door.mechanical) return false;
    door.state = 'closed';
    return true;
  }

  toggleDoor(col: number, row: number): void {
    const door = this.getDoor(col, row);
    if (!door) return;
    if (door.state === 'open') {
      door.state = 'closed';
    } else if (door.state === 'closed') {
      door.state = 'open';
    }
  }

  addKey(keyId: string): void {
    this.inventory.add(keyId);
  }

  hasKey(keyId: string): boolean {
    return this.inventory.has(keyId);
  }

  pickupKeyAt(col: number, row: number): string | undefined {
    const key = this.keys.get(doorKey(col, row));
    if (!key || key.pickedUp) return undefined;
    key.pickedUp = true;
    this.addKey(key.keyId);
    return key.keyId;
  }

  getLever(col: number, row: number): LeverInstance | undefined {
    return this.levers.get(doorKey(col, row));
  }

  activateLever(col: number, row: number): string | undefined {
    const lever = this.levers.get(doorKey(col, row));
    if (!lever || lever.toggled) return undefined;
    lever.toggled = true;
    const [dc, dr] = lever.targetDoor.split(',').map(Number);
    this.toggleDoor(dc, dr);
    return lever.targetDoor;
  }

  activatePressurePlate(col: number, row: number): string | undefined {
    const plate = this.plates.get(doorKey(col, row));
    if (!plate || plate.activated) return undefined;
    plate.activated = true;
    const [dc, dr] = plate.targetDoor.split(',').map(Number);
    // Bypass openDoor check — mechanisms can always operate their doors
    const door = this.getDoor(dc, dr);
    if (door && door.state === 'closed') {
      door.state = 'open';
    }
    return plate.targetDoor;
  }
}
