import type { Entity } from './types';
import type { Facing } from './grid';
import { FACING_DELTA } from './grid';
import { createEnemyInstance, ENEMY_DEFS } from '../enemies/enemyTypes';
import type { EnemyInstance } from '../enemies/enemyTypes';

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

export type LeverState = 'up' | 'down';

export interface LeverInstance {
  col: number;
  row: number;
  targetDoor: string; // "col,row" of the door to toggle
  wall: Facing;       // which wall the lever is mounted on
  state: LeverState;
}

export interface PlateInstance {
  col: number;
  row: number;
  targetDoor: string; // "col,row" of the door to open
  activated: boolean;
}

export interface SconceInstance {
  col: number;
  row: number;
  wall: Facing;
  lit: boolean;
}

export type EquipSlot = 'weapon' | 'armor' | 'ring';

export interface EquipmentItem {
  id: string;
  name: string;
  slot: EquipSlot;
  atkBonus: number;
  defBonus: number;
}

export interface ConsumableItem {
  id: string;
  name: string;
  consumableType: 'health_potion' | 'torch_oil';
  value: number;
}

export function doorKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function parseDoorKey(key: string): [number, number] {
  const [col, row] = key.split(',').map(Number);
  return [col, row];
}

// Scans adjacent cells in N→S→E→W priority order. Falls back to N if no wall found.
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

export interface LevelSnapshot {
  doors: Map<string, DoorInstance>;
  keys: Map<string, KeyInstance>;
  levers: Map<string, LeverInstance>;
  plates: Map<string, PlateInstance>;
  sconces: Map<string, SconceInstance>;
  enemies: Map<string, EnemyInstance>;
  exploredCells: Set<string>;
  groundItems: Map<string, EquipmentItem>;
  groundConsumables: Map<string, ConsumableItem>;
}

export class GameState {
  doors: Map<string, DoorInstance>;
  keys: Map<string, KeyInstance>;
  levers: Map<string, LeverInstance>;
  plates: Map<string, PlateInstance>;
  sconces: Map<string, SconceInstance>;
  enemies: Map<string, EnemyInstance>;
  inventory: Set<string>;
  equipment: Map<EquipSlot, EquipmentItem>;
  backpack: ConsumableItem[];
  groundItems: Map<string, EquipmentItem>;
  groundConsumables: Map<string, ConsumableItem>;

  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  attackCooldown: number;
  torchFuel: number;
  maxTorchFuel: number;
  exploredCells: Set<string>;

  constructor(entities: Entity[], grid?: string[]) {
    this.doors = new Map();
    this.keys = new Map();
    this.levers = new Map();
    this.plates = new Map();
    this.sconces = new Map();
    this.enemies = new Map();
    this.inventory = new Set();
    this.equipment = new Map();
    this.backpack = [];
    this.groundItems = new Map();
    this.groundConsumables = new Map();

    this.hp = 20;
    this.maxHp = 20;
    this.atk = 3;
    this.def = 1;
    this.attackCooldown = 0;
    this.torchFuel = 100;
    this.maxTorchFuel = 100;
    this.exploredCells = new Set();

    this._parseEntities(entities, grid);
  }

  private _parseEntities(entities: Entity[], grid?: string[]): void {
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
          state: 'up',
        });
      } else if (e.type === 'pressure_plate') {
        this.plates.set(doorKey(e.col, e.row), {
          col: e.col,
          row: e.row,
          targetDoor: e.targetDoor as string,
          activated: false,
        });
      } else if (e.type === 'torch_sconce') {
        const wall = (e.wall as Facing | undefined) ??
          autoDetectLeverWall(e.col, e.row, grid);
        this.sconces.set(doorKey(e.col, e.row), {
          col: e.col,
          row: e.row,
          wall,
          lit: true,
        });
      } else if (e.type === 'enemy') {
        const enemyType = e.enemyType as string;
        if (ENEMY_DEFS[enemyType]) {
          const instance = createEnemyInstance(e.col, e.row, enemyType);
          this.enemies.set(doorKey(e.col, e.row), instance);
        }
      } else if (e.type === 'equipment') {
        this.groundItems.set(doorKey(e.col, e.row), {
          id: e.itemId as string,
          name: e.name as string,
          slot: e.slot as EquipSlot,
          atkBonus: e.atkBonus as number,
          defBonus: e.defBonus as number,
        });
      } else if (e.type === 'consumable') {
        this.groundConsumables.set(doorKey(e.col, e.row), {
          id: e.itemId as string,
          name: e.name as string,
          consumableType: e.consumableType as 'health_potion' | 'torch_oil',
          value: e.value as number,
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

  saveLevelState(): LevelSnapshot {
    const doors = new Map<string, DoorInstance>();
    for (const [k, v] of this.doors) {
      doors.set(k, { ...v });
    }
    const keys = new Map<string, KeyInstance>();
    for (const [k, v] of this.keys) {
      keys.set(k, { ...v });
    }
    const levers = new Map<string, LeverInstance>();
    for (const [k, v] of this.levers) {
      levers.set(k, { ...v });
    }
    const plates = new Map<string, PlateInstance>();
    for (const [k, v] of this.plates) {
      plates.set(k, { ...v });
    }
    const sconces = new Map<string, SconceInstance>();
    for (const [k, v] of this.sconces) {
      sconces.set(k, { ...v });
    }
    const enemies = new Map<string, EnemyInstance>();
    for (const [k, v] of this.enemies) {
      enemies.set(k, { ...v });
    }
    const exploredCells = new Set<string>(this.exploredCells);
    const groundItems = new Map<string, EquipmentItem>();
    for (const [k, v] of this.groundItems) {
      groundItems.set(k, { ...v });
    }
    const groundConsumables = new Map<string, ConsumableItem>();
    for (const [k, v] of this.groundConsumables) {
      groundConsumables.set(k, { ...v });
    }
    return { doors, keys, levers, plates, sconces, enemies, exploredCells, groundItems, groundConsumables };
  }

  loadLevelState(snapshot: LevelSnapshot): void {
    this.doors = new Map<string, DoorInstance>();
    for (const [k, v] of snapshot.doors) {
      this.doors.set(k, { ...v });
    }
    this.keys = new Map<string, KeyInstance>();
    for (const [k, v] of snapshot.keys) {
      this.keys.set(k, { ...v });
    }
    this.levers = new Map<string, LeverInstance>();
    for (const [k, v] of snapshot.levers) {
      this.levers.set(k, { ...v });
    }
    this.plates = new Map<string, PlateInstance>();
    for (const [k, v] of snapshot.plates) {
      this.plates.set(k, { ...v });
    }
    this.sconces = new Map<string, SconceInstance>();
    for (const [k, v] of snapshot.sconces) {
      this.sconces.set(k, { ...v });
    }
    this.enemies = new Map<string, EnemyInstance>();
    for (const [k, v] of snapshot.enemies) {
      this.enemies.set(k, { ...v });
    }
    this.exploredCells = new Set<string>(snapshot.exploredCells);
    this.groundItems = new Map<string, EquipmentItem>();
    for (const [k, v] of snapshot.groundItems) {
      this.groundItems.set(k, { ...v });
    }
    this.groundConsumables = new Map<string, ConsumableItem>();
    for (const [k, v] of snapshot.groundConsumables) {
      this.groundConsumables.set(k, { ...v });
    }
  }

  loadNewLevel(entities: Entity[], grid?: string[]): void {
    this.doors = new Map();
    this.keys = new Map();
    this.levers = new Map();
    this.plates = new Map();
    this.sconces = new Map();
    this.enemies = new Map();
    this.exploredCells = new Set();
    this.groundItems = new Map();
    this.groundConsumables = new Map();
    this._parseEntities(entities, grid);
  }

  drainTorchFuel(amount: number): void {
    this.torchFuel = Math.max(0, this.torchFuel - amount);
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
    if (!lever) return undefined;
    lever.state = lever.state === 'up' ? 'down' : 'up';
    const [dc, dr] = parseDoorKey(lever.targetDoor);
    this.toggleDoor(dc, dr);
    return lever.targetDoor;
  }

  activatePressurePlate(col: number, row: number): string | undefined {
    const plate = this.plates.get(doorKey(col, row));
    if (!plate || plate.activated) return undefined;
    plate.activated = true;
    const [dc, dr] = parseDoorKey(plate.targetDoor);
    // Bypass openDoor check — mechanisms can always operate their doors
    const door = this.getDoor(dc, dr);
    if (door && door.state === 'closed') {
      door.state = 'open';
    }
    return plate.targetDoor;
  }

  getSconce(col: number, row: number): SconceInstance | undefined {
    return this.sconces.get(doorKey(col, row));
  }

  takeSconceTorch(col: number, row: number): boolean {
    const sconce = this.sconces.get(doorKey(col, row));
    if (!sconce || !sconce.lit) return false;
    sconce.lit = false;
    this.torchFuel = this.maxTorchFuel;
    return true;
  }

  // --- Enemy helpers ---

  getEnemy(col: number, row: number): EnemyInstance | undefined {
    return this.enemies.get(doorKey(col, row));
  }

  isEnemyAt(col: number, row: number): boolean {
    return this.enemies.has(doorKey(col, row));
  }

  moveEnemy(fromCol: number, fromRow: number, toCol: number, toRow: number): void {
    const key = doorKey(fromCol, fromRow);
    const enemy = this.enemies.get(key);
    if (!enemy) return;
    this.enemies.delete(key);
    enemy.col = toCol;
    enemy.row = toRow;
    this.enemies.set(doorKey(toCol, toRow), enemy);
  }

  damageEnemy(col: number, row: number, amount: number): boolean {
    const enemy = this.getEnemy(col, row);
    if (!enemy) return false;
    enemy.hp -= amount;
    if (enemy.hp <= 0) {
      this.enemies.delete(doorKey(col, row));
      return true; // killed
    }
    return false;
  }

  // --- Equipment & Consumable helpers ---

  getEffectiveAtk(): number {
    let total = this.atk;
    for (const item of this.equipment.values()) {
      total += item.atkBonus;
    }
    return total;
  }

  getEffectiveDef(): number {
    let total = this.def;
    for (const item of this.equipment.values()) {
      total += item.defBonus;
    }
    return total;
  }

  equipItem(item: EquipmentItem): EquipmentItem | null {
    const displaced = this.equipment.get(item.slot) ?? null;
    this.equipment.set(item.slot, item);
    return displaced;
  }

  pickupEquipmentAt(col: number, row: number): EquipmentItem | undefined {
    const key = doorKey(col, row);
    const item = this.groundItems.get(key);
    if (!item) return undefined;
    this.groundItems.delete(key);
    this.equipItem(item);
    return item;
  }

  pickupConsumableAt(col: number, row: number): ConsumableItem | undefined {
    if (this.backpack.length >= 8) return undefined;
    const key = doorKey(col, row);
    const item = this.groundConsumables.get(key);
    if (!item) return undefined;
    this.groundConsumables.delete(key);
    this.backpack.push(item);
    return item;
  }

  useConsumable(index: number): boolean {
    if (index < 0 || index >= this.backpack.length) return false;
    const item = this.backpack[index];
    if (item.consumableType === 'health_potion') {
      this.hp = Math.min(this.maxHp, this.hp + item.value);
    } else if (item.consumableType === 'torch_oil') {
      this.torchFuel = Math.min(this.maxTorchFuel, this.torchFuel + item.value);
    }
    this.backpack.splice(index, 1);
    return true;
  }

  /** Mark current cell + 4 adjacent + line-of-sight forward as explored */
  revealAround(col: number, row: number, facing: Facing, grid: string[]): void {
    const rows = grid.length;
    const cols = grid[0].length;

    const markIfInBounds = (c: number, r: number): void => {
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        this.exploredCells.add(doorKey(c, r));
      }
    };

    // Current cell + 4 adjacent
    markIfInBounds(col, row);
    markIfInBounds(col, row - 1);
    markIfInBounds(col, row + 1);
    markIfInBounds(col - 1, row);
    markIfInBounds(col + 1, row);

    // Line-of-sight forward: walk forward until hitting a wall
    const [dc, dr] = FACING_DELTA[facing];
    let c = col + dc;
    let r = row + dr;
    while (r >= 0 && r < rows && c >= 0 && c < cols) {
      markIfInBounds(c, r);
      if (grid[r][c] === '#') break; // wall stops line-of-sight
      c += dc;
      r += dr;
    }
  }
}
