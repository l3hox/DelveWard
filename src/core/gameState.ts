import type { Entity } from './types';
import type { Facing } from './grid';
import type { DropsOverride } from './lootTable';
import { FACING_DELTA } from './grid';
import { createEnemyInstance } from '../enemies/enemyTypes';
import { enemyDatabase } from '../enemies/enemyDatabase';
import { npcDatabase } from '../npcs/npcDatabase';
import type { EnemyInstance } from '../enemies/enemyTypes';
import { EntityRegistry } from './entities';
import type { ItemEntity, ItemLocation } from './entities';
import { itemDatabase } from './itemDatabase';
import type { ItemDef } from './itemDatabase';
export type { EquipSlot } from './entities';
import type { EquipSlot } from './entities';
import { SignalManager } from './signalManager';
import type { GateMode, GateType, SignalMode } from './signalManager';
import type { StatusEffect } from './statusEffects';
import { removeEffectsByType } from './statusEffects';

export type DoorState = 'open' | 'closed';

export interface DoorInstance {
  id?: string;
  col: number;
  row: number;
  state: DoorState;
  keyId?: string;
  mechanical: boolean;
  gateMode?: GateMode;
}

export interface KeyInstance {
  id?: string;
  col: number;
  row: number;
  keyId: string;
  pickedUp: boolean;
}

export type LeverState = 'up' | 'down';

export interface LeverInstance {
  id?: string;
  col: number;
  row: number;
  targets: string[]; // entity IDs of doors to toggle
  wall: Facing;       // which wall the lever is mounted on
  state: LeverState;
  signalMode?: SignalMode;
  signalDuration?: number;
  signalDelay?: number;
}

export interface PlateInstance {
  id?: string;
  col: number;
  row: number;
  targets: string[]; // entity IDs of doors to open
  activated: boolean;
  signalMode?: SignalMode;
  signalDuration?: number;
  signalDelay?: number;
}

export interface TriggerInstance {
  id?: string;
  col: number;
  row: number;
  targets: string[];
  signalMode: SignalMode;
  signalDuration?: number;
  signalDelay?: number;
  fired: boolean;
}

export type TripwireOrientation = 'EW' | 'NS';

export interface TripwireInstance {
  id?: string;
  col: number;
  row: number;
  targets: string[];
  signalMode: SignalMode;
  signalDuration?: number;
  signalDelay?: number;
  visibilityThreshold: number;
  orientation: TripwireOrientation;
  triggered: boolean;
}

export interface GateInstance {
  id?: string;
  col: number;
  row: number;
  gateType: GateType;
  targets: string[];
  delay?: number;
  interval?: number;
}

export interface StairInstance {
  id?: string;
  col: number;
  row: number;
  direction: 'up' | 'down';
  facing: Facing;
}

export type LauncherFireMode = 'single' | 'repeat';

export interface TrapLauncherInstance {
  id?: string;
  col: number;
  row: number;
  facing: Facing;              // firing direction
  projectileType: string;      // 'dart' | 'arrow' | 'fireball'
  fireMode: LauncherFireMode;  // 'single' = one shot per signal edge, 'repeat' = continuous while active
  reloadTime: number;          // seconds between shots (repeat mode interval)
  nextFireAt: number;          // absolute time for next allowed shot (0 = ready)
  maxRange?: number;           // optional range limit
}

export interface SconceInstance {
  id?: string;
  col: number;
  row: number;
  wall: Facing;
  lit: boolean;
}

export interface BreakableWallInstance {
  id?: string;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  drops?: DropsOverride;
}

export interface SecretWallInstance {
  id?: string;
  col: number;
  row: number;
  opened: boolean;
  persistent: boolean; // illusionary wall: stays visible after opening
}

export interface BlockInstance {
  id?: string;
  col: number;
  row: number;
}

export type ChestState = 'closed' | 'open' | 'locked';

export interface ChestInstance {
  id?: string;
  col: number;
  row: number;
  state: ChestState;
  facing: Facing;
  keyId?: string;
  gateMode?: GateMode;
  targets?: string[];
  drops?: DropsOverride;
}

export interface SignInstance {
  id?: string;
  col: number;
  row: number;
  wall: Facing;
  text: string;
}

export interface NPCInstance {
  id?: string;
  col: number;
  row: number;
  npcId: string;
}

export type FountainState = 'active' | 'used';
export interface FountainInstance {
  id?: string;
  col: number;
  row: number;
  state: FountainState;
  healAmount: number;
}

export interface BookshelfInstance {
  id?: string;
  col: number;
  row: number;
  wall: Facing;
  text: string;
}

export type BuffStat = 'atk' | 'def' | 'str' | 'dex' | 'vit' | 'wis';
export type AltarState = 'active' | 'used';
export interface AltarInstance {
  id?: string;
  col: number;
  row: number;
  state: AltarState;
  buffType: BuffStat;
  buffAmount: number;
  buffDuration: number;
}

export interface BarrelInstance {
  id?: string;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  drops?: DropsOverride;
}

export interface TempBuff {
  stat: BuffStat;
  amount: number;
  remaining: number;
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

// Auto-detect tripwire orientation from adjacent walls (same logic as door orientation).
// Tripwire runs perpendicular to the passage to block it.
// If E/W neighbors are walls → passage runs N-S → wire runs E-W (horizontal).
// If N/S neighbors are walls → passage runs E-W → wire runs N-S (vertical).
function autoDetectTripwireOrientation(col: number, row: number, grid?: string[]): TripwireOrientation {
  if (!grid) return 'EW';
  const rows = grid.length;
  const northSolid = row - 1 < 0 || grid[row - 1][col] === '#';
  const southSolid = row + 1 >= rows || grid[row + 1][col] === '#';
  return (northSolid && southSolid) ? 'NS' : 'EW';
}

export interface LevelSnapshot {
  doors: Map<string, DoorInstance>;
  keys: Map<string, KeyInstance>;
  levers: Map<string, LeverInstance>;
  plates: Map<string, PlateInstance>;
  triggers: Map<string, TriggerInstance>;
  tripwires: Map<string, TripwireInstance>;
  gates: Map<string, GateInstance>;
  trapLaunchers: Map<string, TrapLauncherInstance>;
  sconces: Map<string, SconceInstance>;
  stairs: Map<string, StairInstance>;
  enemies: Map<string, EnemyInstance>;
  breakableWalls: Map<string, BreakableWallInstance>;
  secretWalls: Map<string, SecretWallInstance>;
  blocks: Map<string, BlockInstance>;
  chests: Map<string, ChestInstance>;
  signs: Map<string, SignInstance>;
  npcs: Map<string, NPCInstance>;
  fountains: Map<string, FountainInstance>;
  bookshelves: Map<string, BookshelfInstance>;
  altars: Map<string, AltarInstance>;
  barrels: Map<string, BarrelInstance>;
  destroyedWalls: Set<string>;
  exploredCells: Set<string>;
  registrySnapshot: ItemEntity[];
  signalState?: ReturnType<SignalManager['saveState']>;
}


export class GameState {
  doors: Map<string, DoorInstance>;
  keys: Map<string, KeyInstance>;
  levers: Map<string, LeverInstance>;
  plates: Map<string, PlateInstance>;
  triggers: Map<string, TriggerInstance>;
  tripwires: Map<string, TripwireInstance>;
  gates: Map<string, GateInstance>;
  trapLaunchers: Map<string, TrapLauncherInstance>;
  sconces: Map<string, SconceInstance>;
  stairs: Map<string, StairInstance>;
  enemies: Map<string, EnemyInstance>;
  breakableWalls: Map<string, BreakableWallInstance>;
  secretWalls: Map<string, SecretWallInstance>;
  blocks: Map<string, BlockInstance>;
  chests: Map<string, ChestInstance>;
  signs: Map<string, SignInstance>;
  npcs: Map<string, NPCInstance>;
  fountains: Map<string, FountainInstance>;
  bookshelves: Map<string, BookshelfInstance>;
  altars: Map<string, AltarInstance>;
  barrels: Map<string, BarrelInstance>;
  tempBuffs: TempBuff[];
  destroyedWalls: Set<string>;
  inventory: Set<string>;

  // Global flags — quest/dialog conditions and world state.
  // Persisted across levels and in save data.
  flags: Set<string>;

  // Index: entity ID → position + type (derived state, rebuilt after parse/load)
  entityById: Map<string, { col: number; row: number; type: string }>;

  // Entity registry — single source of truth for all item instances.
  entityRegistry: EntityRegistry;
  signalManager: SignalManager;
  currentLevelId: string;

  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  attackCooldown: number;
  torchFuel: number;
  maxTorchFuel: number;
  hunger: number;
  maxHunger: number;
  exploredCells: Set<string>;

  // Core RPG attributes (M1).
  // WIS has no mechanical effect in M1 — reserved for M4 mana.
  str: number;
  dex: number;
  vit: number;
  wis: number;

  // Progression
  xp: number;
  level: number;
  attributePoints: number;  // unspent points to allocate
  playerName: string;
  gold: number;

  // Active status effects on the player (global, not per-level)
  playerStatusEffects: StatusEffect[];

  constructor(entities: Entity[], grid?: string[], levelId: string = 'default') {
    this.doors = new Map();
    this.keys = new Map();
    this.levers = new Map();
    this.plates = new Map();
    this.triggers = new Map();
    this.tripwires = new Map();
    this.gates = new Map();
    this.trapLaunchers = new Map();
    this.sconces = new Map();
    this.stairs = new Map();
    this.enemies = new Map();
    this.breakableWalls = new Map();
    this.secretWalls = new Map();
    this.blocks = new Map();
    this.chests = new Map();
    this.signs = new Map();
    this.npcs = new Map();
    this.fountains = new Map();
    this.bookshelves = new Map();
    this.altars = new Map();
    this.barrels = new Map();
    this.tempBuffs = [];
    this.destroyedWalls = new Set();
    this.inventory = new Set();
    this.flags = new Set();
    this.entityById = new Map();

    this.entityRegistry = new EntityRegistry();
    this.signalManager = new SignalManager();
    this.currentLevelId = levelId;

    // Base attributes default to 5
    this.str = 5;
    this.dex = 5;
    this.vit = 5;
    this.wis = 5;

    this.xp = 0;
    this.level = 1;
    this.attributePoints = 0;
    this.playerName = 'Adventurer';
    this.gold = 0;
    this.playerStatusEffects = [];

    this.atk = 3;
    this.def = 1;
    this.attackCooldown = 0;
    this.torchFuel = 200;
    this.maxTorchFuel = 200;
    this.hunger = 100;
    this.maxHunger = 100;
    this.exploredCells = new Set();

    // maxHp derived from VIT: 40 + VIT * 5
    this.maxHp = 40 + this.vit * 5;
    this.hp = this.maxHp;

    this._parseEntities(entities, grid);
  }

  private _parseEntities(entities: Entity[], grid?: string[]): void {
    for (const e of entities) {
      if (e.type === 'door') {
        const state = (e.state as DoorState) ?? 'closed';
        const keyId = e.keyId as string | undefined;
        this.doors.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          state,
          keyId,
          mechanical: false,
          gateMode: e.gateMode as GateMode | undefined,
        });
      } else if (e.type === 'key') {
        this.keys.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          keyId: e.keyId as string,
          pickedUp: false,
        });
      } else if (e.type === 'lever') {
        const wall = (e.wall as Facing | undefined) ??
          autoDetectLeverWall(e.col, e.row, grid);
        // Support targets[] (new), target (single, M1 compat), and targetDoor (legacy)
        const targets = (e.targets as string[] | undefined) ??
          (e.target ? [e.target as string] : e.targetDoor ? [e.targetDoor as string] : []);
        this.levers.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          targets,
          wall,
          state: 'up',
          signalMode: e.signalMode as SignalMode | undefined,
          signalDuration: e.signalDuration as number | undefined,
          signalDelay: e.signalDelay as number | undefined,
        });
      } else if (e.type === 'pressure_plate') {
        const targets = (e.targets as string[] | undefined) ??
          (e.target ? [e.target as string] : e.targetDoor ? [e.targetDoor as string] : []);
        this.plates.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          targets,
          activated: false,
          signalMode: e.signalMode as SignalMode | undefined,
          signalDuration: e.signalDuration as number | undefined,
          signalDelay: e.signalDelay as number | undefined,
        });
      } else if (e.type === 'trigger') {
        const targets = (e.targets as string[] | undefined) ?? [];
        this.triggers.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          targets,
          signalMode: (e.signalMode as SignalMode) ?? 'momentary',
          signalDuration: e.signalDuration as number | undefined,
          signalDelay: e.signalDelay as number | undefined,
          fired: false,
        });
      } else if (e.type === 'tripwire') {
        const targets = (e.targets as string[] | undefined) ?? [];
        const orientation = (e.orientation as TripwireOrientation | undefined) ??
          autoDetectTripwireOrientation(e.col, e.row, grid);
        this.tripwires.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          targets,
          signalMode: (e.signalMode as SignalMode) ?? 'one_shot',
          signalDuration: e.signalDuration as number | undefined,
          signalDelay: e.signalDelay as number | undefined,
          visibilityThreshold: (e.visibilityThreshold as number) ?? 8,
          orientation,
          triggered: false,
        });
      } else if (e.type === 'gate') {
        const targets = (e.targets as string[] | undefined) ?? [];
        this.gates.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          gateType: (e.gateType as GateType) ?? 'and',
          targets,
          delay: e.delay as number | undefined,
          interval: e.interval as number | undefined,
        });
      } else if (e.type === 'trap_launcher') {
        this.trapLaunchers.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          facing: (e.facing as Facing) ?? 'S',
          projectileType: (e.projectileType as string) ?? 'dart',
          fireMode: (e.fireMode as LauncherFireMode) ?? 'repeat',
          reloadTime: (e.reloadTime as number) ?? 3,
          nextFireAt: 0,
          maxRange: e.maxRange as number | undefined,
        });
      } else if (e.type === 'torch_sconce') {
        const wall = (e.wall as Facing | undefined) ??
          autoDetectLeverWall(e.col, e.row, grid);
        this.sconces.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          wall,
          lit: true,
        });
      } else if (e.type === 'stairs') {
        this.stairs.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          direction: e.direction as 'up' | 'down',
          facing: e.facing as Facing,
        });
      } else if (e.type === 'breakable_wall') {
        const hp = (e.hp as number) ?? 30;
        this.breakableWalls.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          hp,
          maxHp: hp,
          drops: e.drops as DropsOverride | undefined,
        });
      } else if (e.type === 'secret_wall') {
        this.secretWalls.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          opened: false,
          persistent: (e.persistent as boolean) ?? false,
        });
      } else if (e.type === 'block') {
        this.blocks.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
        });
      } else if (e.type === 'chest') {
        this.chests.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          state: (e.state as ChestState) ?? 'closed',
          facing: (e.facing as Facing) ?? 'S',
          keyId: e.keyId as string | undefined,
          gateMode: e.gateMode as GateMode | undefined,
          targets: e.targets as string[] | undefined,
          drops: e.drops as DropsOverride | undefined,
        });
      } else if (e.type === 'sign') {
        const wall = (e.wall as Facing | undefined) ??
          autoDetectLeverWall(e.col, e.row, grid);
        this.signs.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          wall,
          text: (e.text as string) ?? '',
        });
      } else if (e.type === 'npc') {
        const npcId = e.npcId as string;
        if (npcDatabase.getNpc(npcId)) {
          this.npcs.set(doorKey(e.col, e.row), {
            id: e.id as string | undefined,
            col: e.col,
            row: e.row,
            npcId,
          });
        }
      } else if (e.type === 'fountain') {
        this.fountains.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          state: (e.state as FountainState) ?? 'active',
          healAmount: (e.healAmount as number) ?? 20,
        });
      } else if (e.type === 'bookshelf') {
        const wall = (e.wall as Facing | undefined) ??
          autoDetectLeverWall(e.col, e.row, grid);
        this.bookshelves.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          wall,
          text: (e.text as string) ?? '',
        });
      } else if (e.type === 'altar') {
        this.altars.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          state: (e.state as AltarState) ?? 'active',
          buffType: (e.buffType as BuffStat) ?? 'atk',
          buffAmount: (e.buffAmount as number) ?? 5,
          buffDuration: (e.buffDuration as number) ?? 60,
        });
      } else if (e.type === 'barrel') {
        const hp = (e.hp as number) ?? 10;
        this.barrels.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          hp,
          maxHp: hp,
          drops: e.drops as DropsOverride | undefined,
        });
      } else if (e.type === 'enemy') {
        const enemyType = e.enemyType as string;
        if (enemyDatabase.getEnemy(enemyType)) {
          const instance = createEnemyInstance(e.col, e.row, enemyType);
          if (e.drops) {
            instance.drops = e.drops as DropsOverride;
          }
          this.enemies.set(doorKey(e.col, e.row), instance);
        }
      } else if (e.type === 'equipment') {
        const location: ItemLocation = {
          kind: 'world',
          levelId: this.currentLevelId,
          col: e.col,
          row: e.row,
        };
        this.entityRegistry.createItem(e.itemId as string, 'common', location);
      } else if (e.type === 'consumable') {
        const location: ItemLocation = {
          kind: 'world',
          levelId: this.currentLevelId,
          col: e.col,
          row: e.row,
        };
        this.entityRegistry.createItem(e.itemId as string, 'common', location);
      }
    }

    // Mark doors targeted by signal sources as mechanical (resolve via entityById)
    this._rebuildEntityIndex();
    const markMechanical = (targets: string[]) => {
      for (const t of targets) {
        const pos = this.resolveEntityPosition(t);
        if (pos) {
          const door = this.getDoor(pos.col, pos.row);
          if (door) door.mechanical = true;
          // Auto-set gateMode on chests targeted by signal sources
          const chest = this.getChest(pos.col, pos.row);
          if (chest && !chest.gateMode) chest.gateMode = 'or';
        }
      }
    };
    for (const lever of this.levers.values()) markMechanical(lever.targets);
    for (const plate of this.plates.values()) markMechanical(plate.targets);
    for (const trigger of this.triggers.values()) markMechanical(trigger.targets);
    for (const tripwire of this.tripwires.values()) markMechanical(tripwire.targets);
    // Gates target doors indirectly; mark their direct targets
    for (const gate of this.gates.values()) markMechanical(gate.targets);
    for (const chest of this.chests.values()) {
      if (chest.targets) markMechanical(chest.targets);
    }

    this._initSignalManager();
  }

  private _initSignalManager(): void {
    this.signalManager.clear();

    // Register levers and plates as sources
    for (const lever of this.levers.values()) {
      if (lever.id) {
        this.signalManager.registerSource(
          lever.id, lever.targets,
          lever.signalMode ?? 'toggle',
          lever.signalDuration, lever.signalDelay,
        );
      }
    }
    for (const plate of this.plates.values()) {
      if (plate.id) {
        this.signalManager.registerSource(
          plate.id, plate.targets,
          plate.signalMode ?? 'toggle',
          plate.signalDuration, plate.signalDelay,
        );
      }
    }

    // Register triggers and tripwires as sources
    for (const trigger of this.triggers.values()) {
      if (trigger.id) {
        this.signalManager.registerSource(
          trigger.id, trigger.targets,
          trigger.signalMode,
          trigger.signalDuration, trigger.signalDelay,
        );
      }
    }
    for (const tripwire of this.tripwires.values()) {
      if (tripwire.id) {
        this.signalManager.registerSource(
          tripwire.id, tripwire.targets,
          tripwire.signalMode,
          tripwire.signalDuration, tripwire.signalDelay,
        );
      }
    }

    // Register standalone gates
    for (const gate of this.gates.values()) {
      if (gate.id) {
        this.signalManager.registerGate(
          gate.id, gate.gateType, gate.targets,
          gate.delay, gate.interval,
        );
      }
    }

    // Register mechanical doors as receivers
    for (const door of this.doors.values()) {
      if (door.id && door.mechanical) {
        this.signalManager.registerReceiver(door.id, door.gateMode ?? 'or');
      }
    }

    // Register trap launchers as receivers
    for (const launcher of this.trapLaunchers.values()) {
      if (launcher.id) {
        this.signalManager.registerReceiver(launcher.id, 'or');
      }
    }

    // Register chests with gateMode as receivers
    for (const chest of this.chests.values()) {
      if (chest.id && chest.gateMode) {
        this.signalManager.registerReceiver(chest.id, chest.gateMode);
      }
    }

    // Register chests with targets as sources (booby-trapped chests)
    for (const chest of this.chests.values()) {
      if (chest.id && chest.targets && chest.targets.length > 0) {
        this.signalManager.registerSource(chest.id, chest.targets, 'toggle');
      }
    }

    // Wire receiver-changed callback to update door state and fire trap launchers
    this.signalManager.setReceiverChangedCallback((entityId, active) => {
      const pos = this.resolveEntityPosition(entityId);
      if (!pos) return;
      const door = this.getDoor(pos.col, pos.row);
      if (door) {
        door.state = active ? 'open' : 'closed';
        this.onDoorSignalChanged?.(pos.col, pos.row, active);
        return;
      }
      // Check if this receiver is a chest
      const chest = this.chests.get(doorKey(pos.col, pos.row));
      if (chest) {
        if (active) {
          chest.state = 'open';
          this._activateChestSignal(chest);
          this.onChestSignalChanged?.(pos.col, pos.row, true);
        } else {
          chest.state = 'closed';
          this.onChestSignalChanged?.(pos.col, pos.row, false);
        }
        return;
      }
      // Check if this receiver is a trap launcher
      const launcher = this.trapLaunchers.get(doorKey(pos.col, pos.row));
      if (launcher && active && launcher.nextFireAt === 0) {
        this.onLauncherFire?.(launcher);
        if (launcher.fireMode === 'repeat') {
          launcher.nextFireAt = this.signalManager.now + launcher.reloadTime;
        }
      }
      if (launcher && !active) {
        launcher.nextFireAt = 0;  // cancel reload schedule
      }
    });

    // Wire source-deactivated callback to reset timed sources
    this.signalManager.setSourceDeactivatedCallback((entityId) => {
      const pos = this.resolveEntityPosition(entityId);
      if (!pos) return;
      const lever = this.getLever(pos.col, pos.row);
      if (lever && lever.state === 'down') {
        lever.state = 'up';
        this.onLeverReset?.(pos.col, pos.row);
      }
      const plate = this.plates.get(doorKey(pos.col, pos.row));
      if (plate && plate.activated) {
        plate.activated = false;
        this.onPlateReset?.(pos.col, pos.row);
      }
      const trigger = this.triggers.get(doorKey(pos.col, pos.row));
      if (trigger && trigger.fired) {
        trigger.fired = false;
      }
    });
  }

  /** External callback for signal-driven door state changes (for mesh animation). */
  onDoorSignalChanged: ((col: number, row: number, open: boolean) => void) | null = null;

  /** External callback for timed lever auto-reset (for mesh animation). */
  onLeverReset: ((col: number, row: number) => void) | null = null;

  /** External callback for pressure plate reset (for mesh animation). */
  onPlateReset: ((col: number, row: number) => void) | null = null;

  /** External callback for trap launcher firing (wire to ProjectileManager). */
  onLauncherFire: ((launcher: TrapLauncherInstance) => void) | null = null;

  /** External callback for signal-driven chest state changes. */
  onChestSignalChanged: ((col: number, row: number, open: boolean) => void) | null = null;

  private _rebuildEntityIndex(): void {
    this.entityById.clear();
    const register = (inst: { id?: string; col: number; row: number }, type: string) => {
      if (inst.id) this.entityById.set(inst.id, { col: inst.col, row: inst.row, type });
    };
    for (const d of this.doors.values()) register(d, 'door');
    for (const k of this.keys.values()) register(k, 'key');
    for (const l of this.levers.values()) register(l, 'lever');
    for (const p of this.plates.values()) register(p, 'pressure_plate');
    for (const t of this.triggers.values()) register(t, 'trigger');
    for (const tw of this.tripwires.values()) register(tw, 'tripwire');
    for (const g of this.gates.values()) register(g, 'gate');
    for (const tl of this.trapLaunchers.values()) register(tl, 'trap_launcher');
    for (const s of this.sconces.values()) register(s, 'torch_sconce');
    for (const s of this.stairs.values()) register(s, 'stairs');
    for (const bw of this.breakableWalls.values()) register(bw, 'breakable_wall');
    for (const sw of this.secretWalls.values()) register(sw, 'secret_wall');
    for (const b of this.blocks.values()) register(b, 'block');
    for (const c of this.chests.values()) register(c, 'chest');
    for (const s of this.signs.values()) register(s, 'sign');
    for (const n of this.npcs.values()) register(n, 'npc');
    for (const f of this.fountains.values()) register(f, 'fountain');
    for (const bs of this.bookshelves.values()) register(bs, 'bookshelf');
    for (const a of this.altars.values()) register(a, 'altar');
    for (const b of this.barrels.values()) register(b, 'barrel');
  }

  resolveEntityPosition(id: string): { col: number; row: number } | undefined {
    return this.entityById.get(id);
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
    const triggers = new Map<string, TriggerInstance>();
    for (const [k, v] of this.triggers) {
      triggers.set(k, { ...v });
    }
    const tripwires = new Map<string, TripwireInstance>();
    for (const [k, v] of this.tripwires) {
      tripwires.set(k, { ...v });
    }
    const gates = new Map<string, GateInstance>();
    for (const [k, v] of this.gates) {
      gates.set(k, { ...v });
    }
    const trapLaunchers = new Map<string, TrapLauncherInstance>();
    for (const [k, v] of this.trapLaunchers) {
      trapLaunchers.set(k, { ...v });
    }
    const sconces = new Map<string, SconceInstance>();
    for (const [k, v] of this.sconces) {
      sconces.set(k, { ...v });
    }
    const stairs = new Map<string, StairInstance>();
    for (const [k, v] of this.stairs) {
      stairs.set(k, { ...v });
    }
    const enemies = new Map<string, EnemyInstance>();
    for (const [k, v] of this.enemies) {
      enemies.set(k, { ...v, statusEffects: v.statusEffects.map(e => ({ ...e })) });
    }
    const breakableWalls = new Map<string, BreakableWallInstance>();
    for (const [k, v] of this.breakableWalls) {
      breakableWalls.set(k, { ...v });
    }
    const secretWalls = new Map<string, SecretWallInstance>();
    for (const [k, v] of this.secretWalls) {
      secretWalls.set(k, { ...v });
    }
    const blocks = new Map<string, BlockInstance>();
    for (const [k, v] of this.blocks) {
      blocks.set(k, { ...v });
    }
    const chests = new Map<string, ChestInstance>();
    for (const [k, v] of this.chests) {
      chests.set(k, { ...v });
    }
    const signs = new Map<string, SignInstance>();
    for (const [k, v] of this.signs) {
      signs.set(k, { ...v });
    }
    const npcs = new Map<string, NPCInstance>();
    for (const [k, v] of this.npcs) {
      npcs.set(k, { ...v });
    }
    const fountains = new Map<string, FountainInstance>();
    for (const [k, v] of this.fountains) {
      fountains.set(k, { ...v });
    }
    const bookshelves = new Map<string, BookshelfInstance>();
    for (const [k, v] of this.bookshelves) {
      bookshelves.set(k, { ...v });
    }
    const altars = new Map<string, AltarInstance>();
    for (const [k, v] of this.altars) {
      altars.set(k, { ...v });
    }
    const barrels = new Map<string, BarrelInstance>();
    for (const [k, v] of this.barrels) {
      barrels.set(k, { ...v });
    }
    const destroyedWalls = new Set<string>(this.destroyedWalls);
    const exploredCells = new Set<string>(this.exploredCells);
    const registrySnapshot = this.entityRegistry.snapshot();
    const signalState = this.signalManager.saveState();
    return {
      doors, keys, levers, plates, triggers, tripwires, gates, trapLaunchers,
      sconces, stairs, enemies, breakableWalls, secretWalls, blocks, chests, signs,
      npcs, fountains, bookshelves, altars, barrels, destroyedWalls, exploredCells, registrySnapshot,
      signalState,
    };
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
    this.triggers = new Map<string, TriggerInstance>();
    for (const [k, v] of snapshot.triggers) {
      this.triggers.set(k, { ...v });
    }
    this.tripwires = new Map<string, TripwireInstance>();
    for (const [k, v] of snapshot.tripwires) {
      this.tripwires.set(k, { ...v });
    }
    this.gates = new Map<string, GateInstance>();
    for (const [k, v] of snapshot.gates) {
      this.gates.set(k, { ...v });
    }
    this.trapLaunchers = new Map<string, TrapLauncherInstance>();
    for (const [k, v] of snapshot.trapLaunchers) {
      this.trapLaunchers.set(k, { ...v });
    }
    this.sconces = new Map<string, SconceInstance>();
    for (const [k, v] of snapshot.sconces) {
      this.sconces.set(k, { ...v });
    }
    this.stairs = new Map<string, StairInstance>();
    for (const [k, v] of snapshot.stairs) {
      this.stairs.set(k, { ...v });
    }
    this.enemies = new Map<string, EnemyInstance>();
    for (const [k, v] of snapshot.enemies) {
      this.enemies.set(k, { ...v, statusEffects: v.statusEffects.map(e => ({ ...e })) });
    }
    this.breakableWalls = new Map<string, BreakableWallInstance>();
    for (const [k, v] of snapshot.breakableWalls) {
      this.breakableWalls.set(k, { ...v });
    }
    this.secretWalls = new Map<string, SecretWallInstance>();
    for (const [k, v] of snapshot.secretWalls) {
      this.secretWalls.set(k, { ...v });
    }
    this.blocks = new Map<string, BlockInstance>();
    for (const [k, v] of snapshot.blocks) {
      this.blocks.set(k, { ...v });
    }
    this.chests = new Map<string, ChestInstance>();
    for (const [k, v] of snapshot.chests) {
      this.chests.set(k, { ...v });
    }
    this.signs = new Map<string, SignInstance>();
    for (const [k, v] of snapshot.signs) {
      this.signs.set(k, { ...v });
    }
    this.npcs = new Map<string, NPCInstance>();
    if (snapshot.npcs) {
      for (const [k, v] of snapshot.npcs) {
        this.npcs.set(k, { ...v });
      }
    }
    this.fountains = new Map<string, FountainInstance>();
    if (snapshot.fountains) {
      for (const [k, v] of snapshot.fountains) {
        this.fountains.set(k, { ...v });
      }
    }
    this.bookshelves = new Map<string, BookshelfInstance>();
    if (snapshot.bookshelves) {
      for (const [k, v] of snapshot.bookshelves) {
        this.bookshelves.set(k, { ...v });
      }
    }
    this.altars = new Map<string, AltarInstance>();
    if (snapshot.altars) {
      for (const [k, v] of snapshot.altars) {
        this.altars.set(k, { ...v });
      }
    }
    this.barrels = new Map<string, BarrelInstance>();
    if (snapshot.barrels) {
      for (const [k, v] of snapshot.barrels) {
        this.barrels.set(k, { ...v });
      }
    }
    this.destroyedWalls = new Set<string>(snapshot.destroyedWalls);
    this.exploredCells = new Set<string>(snapshot.exploredCells);
    if (snapshot.registrySnapshot) {
      this.entityRegistry.restore(snapshot.registrySnapshot);
    }
    this._rebuildEntityIndex();
    this._initSignalManager();

    // Restore saved signal state (source active flags, timers, gate states)
    // so that signal evaluation works correctly after returning to a level.
    if (snapshot.signalState) {
      this.signalManager.loadState(snapshot.signalState);
    }
  }

  loadNewLevel(entities: Entity[], grid?: string[], levelId?: string): void {
    const oldLevelId = this.currentLevelId;
    if (levelId) this.currentLevelId = levelId;
    this.doors = new Map();
    this.keys = new Map();
    this.levers = new Map();
    this.plates = new Map();
    this.triggers = new Map();
    this.tripwires = new Map();
    this.gates = new Map();
    this.trapLaunchers = new Map();
    this.sconces = new Map();
    this.stairs = new Map();
    this.enemies = new Map();
    this.breakableWalls = new Map();
    this.secretWalls = new Map();
    this.blocks = new Map();
    this.chests = new Map();
    this.signs = new Map();
    this.npcs = new Map();
    this.fountains = new Map();
    this.bookshelves = new Map();
    this.altars = new Map();
    this.barrels = new Map();
    this.destroyedWalls = new Set();
    this.entityById = new Map();
    this.exploredCells = new Set();
    // Clear only ground items for the old level; equipped/backpack items survive transitions.
    this.entityRegistry.clearLevel(oldLevelId);
    this._parseEntities(entities, grid);
  }

  drainTorchFuel(amount: number): void {
    this.torchFuel = Math.max(0, this.torchFuel - amount);
  }

  drainHunger(amount: number): void {
    this.hunger = Math.max(0, this.hunger - amount);
  }

  restoreHunger(amount: number): void {
    this.hunger = Math.min(this.maxHunger, this.hunger + amount);
  }

  getDoor(col: number, row: number): DoorInstance | undefined {
    return this.doors.get(doorKey(col, row));
  }

  getStair(col: number, row: number): StairInstance | undefined {
    return this.stairs.get(doorKey(col, row));
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
    if (door.keyId && !this.hasKey(door.keyId)) return false;
    door.state = 'open';
    return true;
  }

  closeDoor(col: number, row: number): boolean {
    const door = this.getDoor(col, row);
    if (!door) return false;
    if (door.state !== 'open') return false;
    if (door.mechanical) return false;
    if (this.isBlockedByEnemy(col, row)) return false;
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

  activateLever(col: number, row: number): string[] | undefined {
    const lever = this.levers.get(doorKey(col, row));
    if (!lever) return undefined;
    lever.state = lever.state === 'up' ? 'down' : 'up';
    // Route through SignalManager if source is registered, else direct toggle
    if (lever.id && this.signalManager.getSource(lever.id)) {
      const isDown = lever.state === 'down';
      this.signalManager.setSourceActive(lever.id, isDown);
    } else {
      for (const t of lever.targets) {
        const pos = this.resolveEntityPosition(t);
        if (pos) this.toggleDoor(pos.col, pos.row);
      }
    }
    return lever.targets;
  }

  activatePressurePlate(col: number, row: number): string[] | undefined {
    const plate = this.plates.get(doorKey(col, row));
    if (!plate) return undefined;
    const mode = plate.signalMode ?? 'toggle';

    if (mode === 'toggle') {
      // Toggle: flip on each step-on
      plate.activated = !plate.activated;
      if (plate.id && this.signalManager.getSource(plate.id)) {
        this.signalManager.setSourceActive(plate.id, plate.activated);
      }
      if (!plate.activated) this.onPlateReset?.(col, row);
      return plate.targets;
    }

    // All other modes: activate on first step-on only
    if (plate.activated) return undefined;
    plate.activated = true;
    if (plate.id && this.signalManager.getSource(plate.id)) {
      this.signalManager.setSourceActive(plate.id, true);
      // Timed plates: clear the timer — countdown starts on step-off, not step-on
      if (mode === 'timed') {
        const source = this.signalManager.getSource(plate.id);
        if (source) source.deactivateAt = 0;
      }
    } else {
      for (const t of plate.targets) {
        const pos = this.resolveEntityPosition(t);
        if (pos) {
          const door = this.getDoor(pos.col, pos.row);
          if (door && door.state === 'closed') {
            door.state = 'open';
          }
        }
      }
    }
    return plate.targets;
  }

  /** Deactivate a pressure plate when the player steps off.
   *  Momentary: deactivates immediately. Timed: starts the countdown timer. */
  deactivatePressurePlate(col: number, row: number): void {
    const plate = this.plates.get(doorKey(col, row));
    if (!plate || !plate.activated) return;
    const mode = plate.signalMode ?? 'toggle';
    if (mode === 'momentary') {
      plate.activated = false;
      if (plate.id && this.signalManager.getSource(plate.id)) {
        this.signalManager.deactivateSource(plate.id);
      }
      this.onPlateReset?.(col, row);
    } else if (mode === 'timed') {
      // Start the timed countdown — signal stays active until timer expires
      const source = plate.id ? this.signalManager.getSource(plate.id) : undefined;
      if (source && source.active && source.duration) {
        source.deactivateAt = this.signalManager.now + source.duration;
      }
    }
  }

  /** Activate a trigger at the given position (called on player move). */
  activateTrigger(col: number, row: number): boolean {
    const trigger = this.triggers.get(doorKey(col, row));
    if (!trigger) return false;
    const mode = trigger.signalMode ?? 'momentary';

    if (mode === 'toggle') {
      trigger.fired = !trigger.fired;
      if (trigger.id && this.signalManager.getSource(trigger.id)) {
        this.signalManager.setSourceActive(trigger.id, trigger.fired);
      }
      return true;
    }

    // All other modes: activate on first step-on only
    if (mode === 'one_shot' && trigger.fired) return false;
    if (trigger.fired) return false;
    trigger.fired = true;
    if (trigger.id && this.signalManager.getSource(trigger.id)) {
      this.signalManager.setSourceActive(trigger.id, true);
      // Timed triggers: clear timer — countdown starts on step-off
      if (mode === 'timed') {
        const source = this.signalManager.getSource(trigger.id);
        if (source) source.deactivateAt = 0;
      }
    }
    return true;
  }

  /** Deactivate a trigger when the player steps off.
   *  Momentary: deactivates immediately. Timed: starts the countdown timer. */
  deactivateTrigger(col: number, row: number): void {
    const trigger = this.triggers.get(doorKey(col, row));
    if (!trigger || !trigger.fired) return;
    const mode = trigger.signalMode ?? 'momentary';
    if (mode === 'momentary') {
      trigger.fired = false;
      if (trigger.id && this.signalManager.getSource(trigger.id)) {
        this.signalManager.deactivateSource(trigger.id);
      }
    } else if (mode === 'timed') {
      // Start the timed countdown — signal stays active until timer expires
      const source = trigger.id ? this.signalManager.getSource(trigger.id) : undefined;
      if (source && source.active && source.duration) {
        source.deactivateAt = this.signalManager.now + source.duration;
      }
    }
  }

  /** Activate a tripwire at the given position (called on player move). */
  activateTripwire(col: number, row: number): boolean {
    const tripwire = this.tripwires.get(doorKey(col, row));
    if (!tripwire || tripwire.triggered) return false;
    tripwire.triggered = true;
    if (tripwire.id && this.signalManager.getSource(tripwire.id)) {
      this.signalManager.setSourceActive(tripwire.id, true);
    }
    return true;
  }

  /** Tick trap launchers using absolute-time scheduling (repeat mode only). */
  tickTrapLaunchers(): void {
    const now = this.signalManager.now;
    for (const launcher of this.trapLaunchers.values()) {
      if (launcher.fireMode !== 'repeat') continue;
      if (launcher.nextFireAt > 0 && now >= launcher.nextFireAt && launcher.id) {
        if (this.signalManager.isReceiverActive(launcher.id)) {
          launcher.nextFireAt = launcher.nextFireAt + launcher.reloadTime;  // drift-free
          this.onLauncherFire?.(launcher);
        } else {
          launcher.nextFireAt = 0;
        }
      }
    }
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

  // --- Breakable wall helpers ---

  getBreakableWall(col: number, row: number): BreakableWallInstance | undefined {
    return this.breakableWalls.get(doorKey(col, row));
  }

  damageBreakableWall(
    col: number, row: number, damage: number, grid: string[],
  ): { destroyed: boolean; drops?: DropsOverride } {
    const wall = this.breakableWalls.get(doorKey(col, row));
    if (!wall) return { destroyed: false };
    wall.hp = Math.max(0, wall.hp - damage);
    if (wall.hp <= 0) {
      this.breakableWalls.delete(doorKey(col, row));
      grid[row] = grid[row].substring(0, col) + '.' + grid[row].substring(col + 1);
      this.destroyedWalls.add(doorKey(col, row));
      return { destroyed: true, drops: wall.drops };
    }
    return { destroyed: false };
  }

  // --- Secret wall helpers ---

  getSecretWall(col: number, row: number): SecretWallInstance | undefined {
    return this.secretWalls.get(doorKey(col, row));
  }

  openSecretWall(col: number, row: number, grid: string[]): { opened: boolean; persistent: boolean } {
    const wall = this.secretWalls.get(doorKey(col, row));
    if (!wall || wall.opened) return { opened: false, persistent: false };
    wall.opened = true;
    grid[row] = grid[row].substring(0, col) + '.' + grid[row].substring(col + 1);
    this.destroyedWalls.add(doorKey(col, row));
    return { opened: true, persistent: wall.persistent };
  }

  // --- Block helpers ---

  getBlock(col: number, row: number): BlockInstance | undefined {
    return this.blocks.get(doorKey(col, row));
  }

  isBlockAt(col: number, row: number): boolean {
    return this.blocks.has(doorKey(col, row));
  }

  pushBlock(fromCol: number, fromRow: number, toCol: number, toRow: number): boolean {
    const key = doorKey(fromCol, fromRow);
    const block = this.blocks.get(key);
    if (!block) return false;
    this.blocks.delete(key);
    block.col = toCol;
    block.row = toRow;
    this.blocks.set(doorKey(toCol, toRow), block);
    // Check and activate pressure plate at destination
    this.activatePressurePlate(toCol, toRow);
    return true;
  }

  // --- Chest helpers ---

  getChest(col: number, row: number): ChestInstance | undefined {
    return this.chests.get(doorKey(col, row));
  }

  openChest(col: number, row: number): { opened: boolean; locked?: boolean; drops?: DropsOverride } {
    const chest = this.chests.get(doorKey(col, row));
    if (!chest) return { opened: false };
    if (chest.state === 'open') return { opened: false };
    if (chest.state === 'locked' || chest.keyId) {
      if (chest.keyId && this.hasKey(chest.keyId)) {
        this.inventory.delete(chest.keyId);
        chest.state = 'open';
        this._activateChestSignal(chest);
        return { opened: true, drops: chest.drops };
      }
      return { opened: false, locked: true };
    }
    chest.state = 'open';
    this._activateChestSignal(chest);
    return { opened: true, drops: chest.drops };
  }

  private _activateChestSignal(chest: ChestInstance): void {
    if (chest.id && chest.targets && chest.targets.length > 0) {
      this.signalManager.setSourceActive(chest.id, true);
    }
  }

  // --- Sign helpers ---

  getSign(col: number, row: number): SignInstance | undefined {
    return this.signs.get(doorKey(col, row));
  }

  getSignOnWall(col: number, row: number, wall: Facing): SignInstance | undefined {
    const sign = this.signs.get(doorKey(col, row));
    if (sign && sign.wall === wall) return sign;
    return undefined;
  }

  // --- NPC helpers ---

  getNpc(col: number, row: number): NPCInstance | undefined {
    return this.npcs.get(doorKey(col, row));
  }

  isNpcAt(col: number, row: number): boolean {
    return this.npcs.has(doorKey(col, row));
  }

  // --- Fountain helpers ---

  getFountain(col: number, row: number): FountainInstance | undefined {
    return this.fountains.get(doorKey(col, row));
  }

  useFountain(col: number, row: number): { healed: boolean; healAmount: number } {
    const fountain = this.fountains.get(doorKey(col, row));
    if (!fountain || fountain.state === 'used') return { healed: false, healAmount: 0 };
    this.hp = Math.min(this.maxHp, this.hp + fountain.healAmount);
    fountain.state = 'used';
    return { healed: true, healAmount: fountain.healAmount };
  }

  // --- Bookshelf helpers ---

  getBookshelfOnWall(col: number, row: number, wall: Facing): BookshelfInstance | undefined {
    const shelf = this.bookshelves.get(doorKey(col, row));
    if (shelf && shelf.wall === wall) return shelf;
    return undefined;
  }

  // --- Altar helpers ---

  getAltar(col: number, row: number): AltarInstance | undefined {
    return this.altars.get(doorKey(col, row));
  }

  useAltar(col: number, row: number): { activated: boolean; buffType: BuffStat; buffAmount: number; buffDuration: number } {
    const altar = this.altars.get(doorKey(col, row));
    if (!altar || altar.state === 'used') return { activated: false, buffType: 'atk', buffAmount: 0, buffDuration: 0 };
    altar.state = 'used';
    this.addTempBuff(altar.buffType, altar.buffAmount, altar.buffDuration);
    return { activated: true, buffType: altar.buffType, buffAmount: altar.buffAmount, buffDuration: altar.buffDuration };
  }

  // --- Barrel helpers ---

  getBarrel(col: number, row: number): BarrelInstance | undefined {
    return this.barrels.get(doorKey(col, row));
  }

  isBarrelAt(col: number, row: number): boolean {
    return this.barrels.has(doorKey(col, row));
  }

  damageBarrel(col: number, row: number, damage: number): { destroyed: boolean; drops?: DropsOverride } {
    const barrel = this.barrels.get(doorKey(col, row));
    if (!barrel) return { destroyed: false };
    barrel.hp = Math.max(0, barrel.hp - damage);
    if (barrel.hp <= 0) {
      this.barrels.delete(doorKey(col, row));
      return { destroyed: true, drops: barrel.drops };
    }
    return { destroyed: false };
  }

  // --- Temp buff helpers ---

  addTempBuff(stat: BuffStat, amount: number, duration: number): void {
    // Same-stat refresh: replace existing buff of same stat type
    this.tempBuffs = this.tempBuffs.filter(b => b.stat !== stat);
    this.tempBuffs.push({ stat, amount, remaining: duration });
  }

  tickTempBuffs(delta: number): void {
    for (const buff of this.tempBuffs) {
      buff.remaining -= delta;
    }
    this.tempBuffs = this.tempBuffs.filter(b => b.remaining > 0);
  }

  getTempBuffTotal(stat: BuffStat): number {
    let total = 0;
    for (const buff of this.tempBuffs) {
      if (buff.stat === stat) total += buff.amount;
    }
    return total;
  }

  // --- Flag helpers ---

  hasFlag(flag: string): boolean {
    return this.flags.has(flag);
  }

  setFlag(flag: string): void {
    this.flags.add(flag);
  }

  removeFlag(flag: string): void {
    this.flags.delete(flag);
  }

  // --- Enemy helpers ---

  getEnemy(col: number, row: number): EnemyInstance | undefined {
    return this.enemies.get(doorKey(col, row));
  }

  isEnemyAt(col: number, row: number): boolean {
    return this.enemies.has(doorKey(col, row));
  }

  isBlockedByEnemy(col: number, row: number): boolean {
    const enemy = this.enemies.get(doorKey(col, row));
    if (!enemy) return false;
    return enemy.blocksMovement;
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
    // Pause regen on hit
    if (enemy.regenPauseTimer !== undefined) {
      enemy.regenPauseTimer = (enemyDatabase.getBehavior(enemy.type, 'regen')?.params.pauseOnDamage as number | undefined) ?? 3;
    }
    if (enemy.hp <= 0) {
      this.enemies.delete(doorKey(col, row));
      return true; // killed
    }
    return false;
  }

  // --- Equipment & Consumable helpers ---

  /**
   * Aggregate all derived stats from base attributes + equipped items.
   *
   * Derived formulas (M1):
   *   atk        = weapon.stats.atk + floor(STR / 2)
   *   def        = sum(equipped armor def) + floor(VIT / 4)
   *   maxHp      = 40 + VIT * 5 + sum(equipped items hp bonus)
   *   critChance = 5 + floor(DEX / 3) + weapon critChance bonus    [percentage]
   *   dodgeChance= floor((DEX - 5) / 4)  [min 0, cap 25]           [percentage]
   */
  getEffectiveStats(): {
    atk: number;
    def: number;
    maxHp: number;
    critChance: number;
    dodgeChance: number;
    effectiveStr: number;
    effectiveDex: number;
    effectiveVit: number;
    effectiveWis: number;
  } {
    let bonusStr = 0;
    let bonusDex = 0;
    let bonusVit = 0;
    let bonusWis = 0;
    let weaponAtk = 0;
    let armorDef = 0;
    let hpBonus = 0;
    let weaponCrit = 0;

    if (itemDatabase.isLoaded()) {
      for (const [, entity] of this.entityRegistry.getAllEquipped()) {
        const itemDef = itemDatabase.getItem(entity.itemId);
        if (!itemDef) continue;
        if (itemDef.stats.str) bonusStr += itemDef.stats.str;
        if (itemDef.stats.dex) bonusDex += itemDef.stats.dex;
        if (itemDef.stats.vit) bonusVit += itemDef.stats.vit;
        if (itemDef.stats.wis) bonusWis += itemDef.stats.wis;
        if (itemDef.stats.atk) weaponAtk += itemDef.stats.atk;
        if (itemDef.stats.def) armorDef += itemDef.stats.def;
        if (itemDef.stats.hp) hpBonus += itemDef.stats.hp;
        if (itemDef.stats.critChance) weaponCrit += itemDef.stats.critChance;
      }
    }

    const effStr = this.str + bonusStr + this.getTempBuffTotal('str');
    const effDex = this.dex + bonusDex + this.getTempBuffTotal('dex');
    const effVit = this.vit + bonusVit + this.getTempBuffTotal('vit');
    const effWis = this.wis + bonusWis + this.getTempBuffTotal('wis');

    const strBonus = Math.floor(effStr / 2);
    const vitDefBonus = Math.floor(effVit / 4);
    const baseCrit = 5 + Math.floor(effDex / 3);
    const dodge = Math.max(0, Math.min(25, Math.floor((effDex - 5) / 4)));

    return {
      atk: weaponAtk + strBonus + this.getTempBuffTotal('atk'),
      def: armorDef + vitDefBonus + this.getTempBuffTotal('def'),
      maxHp: 40 + effVit * 5 + hpBonus,
      critChance: baseCrit + weaponCrit,
      dodgeChance: dodge,
      effectiveStr: effStr,
      effectiveDex: effDex,
      effectiveVit: effVit,
      effectiveWis: effWis,
    };
  }

  getEffectiveAtk(): number {
    return this.getEffectiveStats().atk;
  }

  getEffectiveDef(): number {
    return this.getEffectiveStats().def;
  }

  /**
   * Return the ItemDef for the currently equipped weapon, or undefined if none/DB not loaded.
   */
  getEquippedWeaponDef(): ItemDef | undefined {
    if (!itemDatabase.isLoaded()) return undefined;
    const weaponEntity = this.entityRegistry.getEquipped('weapon');
    if (!weaponEntity) return undefined;
    return itemDatabase.getItem(weaponEntity.itemId);
  }

  /**
   * Check if the player meets the requirements to equip an item.
   * Uses effective attributes (base + item bonuses) for the check.
   */
  canEquipItem(itemDef: ItemDef): { allowed: boolean; reason?: string } {
    const reqs = itemDef.requirements;
    if (!reqs) return { allowed: true };

    // Use effective stats (which include item attribute bonuses)
    const stats = this.getEffectiveStats();

    if (reqs.str && stats.effectiveStr < reqs.str) {
      return { allowed: false, reason: `Requires ${reqs.str} STR (you have ${stats.effectiveStr})` };
    }
    if (reqs.dex && stats.effectiveDex < reqs.dex) {
      return { allowed: false, reason: `Requires ${reqs.dex} DEX (you have ${stats.effectiveDex})` };
    }
    if (reqs.vit && stats.effectiveVit < reqs.vit) {
      return { allowed: false, reason: `Requires ${reqs.vit} VIT (you have ${stats.effectiveVit})` };
    }
    if (reqs.wis && stats.effectiveWis < reqs.wis) {
      return { allowed: false, reason: `Requires ${reqs.wis} WIS (you have ${stats.effectiveWis})` };
    }

    return { allowed: true };
  }

  // --- XP and leveling ---

  /**
   * Total XP required to reach level n.
   * Formula: 100 * n * (n + 1) / 2
   * L1: 100, L2: 300, L3: 600, L4: 1000, L5: 1500
   */
  xpForLevel(n: number): number {
    return 100 * n * (n + 1) / 2;
  }

  /**
   * Add XP and trigger level-ups if thresholds are crossed.
   * Returns true if at least one level-up occurred.
   * Level cap: 15.
   */
  addXp(amount: number): boolean {
    const LEVEL_CAP = 15;
    if (this.level >= LEVEL_CAP) return false;

    this.xp += amount;
    let levelled = false;

    while (this.level < LEVEL_CAP && this.xp >= this.xpForLevel(this.level)) {
      this.level++;
      this.attributePoints += 3;
      // Recalculate maxHp on level-up — attribute points may have been spent on VIT
      this.maxHp = this.getEffectiveStats().maxHp;
      levelled = true;
    }

    return levelled;
  }

  /**
   * Spend one attributePoint to increment the given stat.
   * Returns false when no points remain.
   * VIT allocation recalculates maxHp and restores HP to new max if HP was at old max.
   */
  allocatePoint(stat: 'str' | 'dex' | 'vit' | 'wis'): boolean {
    if (this.attributePoints <= 0) return false;

    this.attributePoints--;

    if (stat === 'vit') {
      const wasAtMax = this.hp === this.maxHp;
      this.vit++;
      this.maxHp = this.getEffectiveStats().maxHp;
      if (wasAtMax) this.hp = this.maxHp;
    } else if (stat === 'str') {
      this.str++;
    } else if (stat === 'dex') {
      this.dex++;
    } else {
      // wis — no M1 mechanical effect, but still tracked
      this.wis++;
    }

    return true;
  }

  /**
   * Apply a pre-built attribute allocation from character creation.
   * Sets str/dex/vit/wis directly and recalculates maxHp.
   * Does not consume attributePoints.
   */
  applyCharacterSetup(str: number, dex: number, vit: number, wis: number, name: string): void {
    this.str = str;
    this.dex = dex;
    this.vit = vit;
    this.wis = wis;
    this.playerName = name;
    this.maxHp = this.getEffectiveStats().maxHp;
    this.hp = this.maxHp;
  }

  /**
   * Equip an item from backpack to the appropriate equipment slot.
   * If the target slot is occupied, swap items.
   * backpackIndex is a positional index into the sorted backpack list (getBackpackItems()).
   */
  equipFromBackpack(backpackIndex: number): { success: boolean; reason?: string; swappedToSlot?: number } {
    const backpackItems = this.entityRegistry.getBackpackItems();
    if (backpackIndex < 0 || backpackIndex >= backpackItems.length) return { success: false };

    const entity = backpackItems[backpackIndex];
    if (!itemDatabase.isLoaded()) return { success: false };
    const itemDef = itemDatabase.getItem(entity.itemId);
    if (!itemDef) return { success: false };

    const targetSlot: EquipSlot = _subtypeToEquipSlot(itemDef.subtype as string, this);

    const check = this.canEquipItem(itemDef);
    if (!check.allowed) return { success: false, reason: check.reason };

    // Actual backpack slot number from entity location
    const backpackSlot = (entity.location as { kind: 'backpack'; slot: number }).slot;

    // If target slot is occupied, swap existing item to the backpack slot
    const existing = this.entityRegistry.getEquipped(targetSlot);
    if (existing) {
      this.entityRegistry.moveItem(existing.instanceId, { kind: 'backpack', slot: backpackSlot });
    }

    this.entityRegistry.moveItem(entity.instanceId, { kind: 'equipped', slot: targetSlot });
    this.maxHp = this.getEffectiveStats().maxHp;

    return { success: true, swappedToSlot: existing ? backpackSlot : undefined };
  }

  /**
   * Unequip an item from equipment slot to first free backpack slot.
   */
  unequipToBackpack(equipSlot: EquipSlot): { success: boolean; reason?: string } {
    const entity = this.entityRegistry.getEquipped(equipSlot);
    if (!entity) return { success: false };

    const slot = this.entityRegistry.nextBackpackSlot();
    if (slot === null) return { success: false, reason: 'Backpack is full' };

    this.entityRegistry.moveItem(entity.instanceId, { kind: 'backpack', slot });
    this.maxHp = this.getEffectiveStats().maxHp;

    return { success: true };
  }

  /**
   * Drop an item from inventory to the ground at the given position.
   */
  dropItem(instanceId: string, col: number, row: number): boolean {
    const entity = this.entityRegistry.getItem(instanceId);
    if (!entity) return false;

    this.entityRegistry.moveItem(instanceId, {
      kind: 'world',
      levelId: this.currentLevelId,
      col,
      row,
    });

    this.maxHp = this.getEffectiveStats().maxHp;
    return true;
  }

  /**
   * Use a consumable from backpack using the registry + item database.
   */
  useConsumableFromRegistry(instanceId: string): boolean {
    const entity = this.entityRegistry.getItem(instanceId);
    if (!entity) return false;

    if (!itemDatabase.isLoaded()) return false;
    const itemDef = itemDatabase.getItem(entity.itemId);
    if (!itemDef || itemDef.type !== 'consumable') return false;

    if (itemDef.subtype === 'health_potion') {
      this.hp = Math.min(this.maxHp, this.hp + (itemDef.stats.hp ?? 0));
    } else if (itemDef.subtype === 'torch_oil') {
      this.torchFuel = Math.min(this.maxTorchFuel, this.torchFuel + (itemDef.effect?.torchFuel ?? 0));
    }
    if (itemDef.effect?.restoreHunger) {
      this.restoreHunger(itemDef.effect.restoreHunger);
    }
    if (itemDef.effect?.curePoison) {
      this.playerStatusEffects = removeEffectsByType(this.playerStatusEffects, 'poison');
    }

    this.entityRegistry.removeItem(instanceId);
    return true;
  }

  pickupEquipmentAt(col: number, row: number): { item?: { name: string }; denied?: string } {
    const worldEntities = this.entityRegistry.getGroundItems(this.currentLevelId, col, row);
    const equipEntity = worldEntities.find((e) => {
      if (!itemDatabase.isLoaded()) return true;
      const def = itemDatabase.getItem(e.itemId);
      return def && def.type !== 'consumable';
    });
    if (!equipEntity) return {};

    if (itemDatabase.isLoaded()) {
      const itemDef = itemDatabase.getItem(equipEntity.itemId);
      if (itemDef) {
        const check = this.canEquipItem(itemDef);
        if (!check.allowed) {
          return { denied: check.reason };
        }
      }
    }

    const slot = itemDatabase.isLoaded()
      ? _subtypeToEquipSlot(itemDatabase.getItem(equipEntity.itemId)!.subtype as string, this)
      : 'weapon';

    const existing = this.entityRegistry.getEquipped(slot);
    if (existing) {
      const backpackSlot = this.entityRegistry.nextBackpackSlot();
      if (backpackSlot === null) return { denied: 'Backpack is full' };
      this.entityRegistry.moveItem(existing.instanceId, { kind: 'backpack', slot: backpackSlot });
    }
    this.entityRegistry.moveItem(equipEntity.instanceId, { kind: 'equipped', slot });

    const name = itemDatabase.isLoaded()
      ? (itemDatabase.getItem(equipEntity.itemId)?.name ?? equipEntity.itemId)
      : equipEntity.itemId;

    return { item: { name } };
  }

  pickupConsumableAt(col: number, row: number): { name: string } | undefined {
    const slot = this.entityRegistry.nextBackpackSlot();
    if (slot === null) return undefined;

    const worldEntities = this.entityRegistry.getGroundItems(this.currentLevelId, col, row);
    const consumableEntity = worldEntities.find((e) => {
      if (!itemDatabase.isLoaded()) return true;
      const def = itemDatabase.getItem(e.itemId);
      return def && def.type === 'consumable';
    });
    if (!consumableEntity) return undefined;

    this.entityRegistry.moveItem(consumableEntity.instanceId, { kind: 'backpack', slot });

    const name = itemDatabase.isLoaded()
      ? (itemDatabase.getItem(consumableEntity.itemId)?.name ?? consumableEntity.itemId)
      : consumableEntity.itemId;

    return { name };
  }

  useConsumable(index: number): boolean {
    const backpackItems = this.entityRegistry.getBackpackItems();
    if (index < 0 || index >= backpackItems.length) return false;
    const entity = backpackItems[index];

    if (itemDatabase.isLoaded()) {
      const itemDef = itemDatabase.getItem(entity.itemId);
      if (!itemDef || itemDef.type !== 'consumable') return false;
      if (itemDef.subtype === 'health_potion') {
        this.hp = Math.min(this.maxHp, this.hp + (itemDef.stats.hp ?? 0));
      } else if (itemDef.subtype === 'torch_oil') {
        this.torchFuel = Math.min(this.maxTorchFuel, this.torchFuel + (itemDef.effect?.torchFuel ?? 0));
      }
      if (itemDef.effect?.restoreHunger) {
        this.restoreHunger(itemDef.effect.restoreHunger);
      }
      if (itemDef.effect?.curePoison) {
        this.playerStatusEffects = removeEffectsByType(this.playerStatusEffects, 'poison');
      }
    }

    this.entityRegistry.removeItem(entity.instanceId);
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

  /** Return all player character state for serialization. */
  getPlayerState(): {
    hp: number; maxHp: number;
    str: number; dex: number; vit: number; wis: number;
    xp: number; level: number; attributePoints: number;
    playerName: string; gold: number;
    torchFuel: number; maxTorchFuel: number;
    hunger: number; maxHunger: number;
    statusEffects: StatusEffect[];
    tempBuffs: TempBuff[];
  } {
    return {
      hp: this.hp,
      maxHp: this.maxHp,
      str: this.str,
      dex: this.dex,
      vit: this.vit,
      wis: this.wis,
      xp: this.xp,
      level: this.level,
      attributePoints: this.attributePoints,
      playerName: this.playerName,
      gold: this.gold,
      torchFuel: this.torchFuel,
      maxTorchFuel: this.maxTorchFuel,
      hunger: this.hunger,
      maxHunger: this.maxHunger,
      statusEffects: this.playerStatusEffects.map(e => ({ ...e })),
      tempBuffs: this.tempBuffs.map(b => ({ ...b })),
    };
  }

  /** Restore player character state from deserialized save data. */
  restorePlayerState(state: {
    hp: number; maxHp: number;
    str: number; dex: number; vit: number; wis: number;
    xp: number; level: number; attributePoints: number;
    playerName: string; gold: number;
    torchFuel: number; maxTorchFuel: number;
    hunger?: number; maxHunger?: number;
    statusEffects: StatusEffect[];
    tempBuffs?: TempBuff[];
  }): void {
    this.hp = state.hp;
    this.maxHp = state.maxHp;
    this.str = state.str;
    this.dex = state.dex;
    this.vit = state.vit;
    this.wis = state.wis;
    this.xp = state.xp;
    this.level = state.level;
    this.attributePoints = state.attributePoints;
    this.playerName = state.playerName;
    this.gold = state.gold;
    this.torchFuel = state.torchFuel;
    this.maxTorchFuel = state.maxTorchFuel;
    this.hunger = state.hunger ?? 100;
    this.maxHunger = state.maxHunger ?? 100;
    this.playerStatusEffects = state.statusEffects.map(e => ({ ...e }));
    this.tempBuffs = (state.tempBuffs ?? []).map(b => ({ ...b }));
  }

  /** Return picked up keys for serialization. */
  getPickedUpKeys(): string[] {
    return Array.from(this.inventory);
  }

  /** Restore picked up keys from save data. */
  restorePickedUpKeys(keys: string[]): void {
    this.inventory = new Set(keys);
  }
}

// Module-level helper used by equipFromBackpack.
// Kept here to avoid a circular dependency with inventoryOverlay.ts.
function _subtypeToEquipSlot(subtype: string, gameState: GameState): EquipSlot {
  const weaponSubtypes = new Set(['sword', 'axe', 'dagger', 'mace', 'spear', 'staff']);
  if (weaponSubtypes.has(subtype)) return 'weapon';

  const armorSlots: Record<string, EquipSlot> = {
    head: 'head', chest: 'chest', legs: 'legs', hands: 'hands', feet: 'feet', shield: 'shield',
  };
  if (armorSlots[subtype]) return armorSlots[subtype];

  if (subtype === 'ring') {
    return gameState.entityRegistry.getEquipped('ring1') ? 'ring2' : 'ring1';
  }
  if (subtype === 'amulet') return 'amulet';

  return 'weapon'; // fallback
}
