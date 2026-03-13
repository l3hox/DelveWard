import type { Entity } from './types';
import type { Facing } from './grid';
import type { DropsOverride } from './lootTable';
import { FACING_DELTA } from './grid';
import { createEnemyInstance, ENEMY_DEFS } from '../enemies/enemyTypes';
import type { EnemyInstance } from '../enemies/enemyTypes';
import { EntityRegistry } from './entities';
import type { ItemEntity, ItemLocation } from './entities';
import { itemDatabase } from './itemDatabase';
import type { ItemDef } from './itemDatabase';
export type { EquipSlot } from './entities';
import type { EquipSlot } from './entities';

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
  registrySnapshot: ItemEntity[];
}


export class GameState {
  doors: Map<string, DoorInstance>;
  keys: Map<string, KeyInstance>;
  levers: Map<string, LeverInstance>;
  plates: Map<string, PlateInstance>;
  sconces: Map<string, SconceInstance>;
  enemies: Map<string, EnemyInstance>;
  inventory: Set<string>;

  // Entity registry — single source of truth for all item instances.
  entityRegistry: EntityRegistry;
  currentLevelId: string;

  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  attackCooldown: number;
  torchFuel: number;
  maxTorchFuel: number;
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

  constructor(entities: Entity[], grid?: string[], levelId: string = 'default') {
    this.doors = new Map();
    this.keys = new Map();
    this.levers = new Map();
    this.plates = new Map();
    this.sconces = new Map();
    this.enemies = new Map();
    this.inventory = new Set();

    this.entityRegistry = new EntityRegistry();
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

    this.atk = 3;
    this.def = 1;
    this.attackCooldown = 0;
    this.torchFuel = 100;
    this.maxTorchFuel = 100;
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
    const registrySnapshot = this.entityRegistry.snapshot();
    return {
      doors, keys, levers, plates, sconces, enemies,
      exploredCells, registrySnapshot,
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
    this.sconces = new Map<string, SconceInstance>();
    for (const [k, v] of snapshot.sconces) {
      this.sconces.set(k, { ...v });
    }
    this.enemies = new Map<string, EnemyInstance>();
    for (const [k, v] of snapshot.enemies) {
      this.enemies.set(k, { ...v });
    }
    this.exploredCells = new Set<string>(snapshot.exploredCells);
    if (snapshot.registrySnapshot) {
      this.entityRegistry.restore(snapshot.registrySnapshot);
    }
  }

  loadNewLevel(entities: Entity[], grid?: string[], levelId?: string): void {
    const oldLevelId = this.currentLevelId;
    if (levelId) this.currentLevelId = levelId;
    this.doors = new Map();
    this.keys = new Map();
    this.levers = new Map();
    this.plates = new Map();
    this.sconces = new Map();
    this.enemies = new Map();
    this.exploredCells = new Set();
    // Clear only ground items for the old level; equipped/backpack items survive transitions.
    this.entityRegistry.clearLevel(oldLevelId);
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
    // Pause troll regen on hit
    if (enemy.regenPauseTimer !== undefined) {
      enemy.regenPauseTimer = 3;
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

    const effStr = this.str + bonusStr;
    const effDex = this.dex + bonusDex;
    const effVit = this.vit + bonusVit;
    const effWis = this.wis + bonusWis;

    const strBonus = Math.floor(effStr / 2);
    const vitDefBonus = Math.floor(effVit / 4);
    const baseCrit = 5 + Math.floor(effDex / 3);
    const dodge = Math.max(0, Math.min(25, Math.floor((effDex - 5) / 4)));

    return {
      atk: weaponAtk + strBonus,
      def: armorDef + vitDefBonus,
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
    if (existing) this.entityRegistry.removeItem(existing.instanceId);
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
