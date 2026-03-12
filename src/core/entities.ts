// Entity registry and item location model.
// Owns all item instances (ground, backpack, equipped) as a single source of truth.

import type { ItemQuality } from './itemDatabase';

// EquipSlot — 10-slot system (replaces 3-slot definition in gameState.ts once migrated).
export type EquipSlot =
  | 'weapon'
  | 'head'
  | 'chest'
  | 'legs'
  | 'hands'
  | 'feet'
  | 'shield'
  | 'ring1'
  | 'ring2'
  | 'amulet';

// ItemLocation — discriminant union covering all three states an item can occupy.
export type ItemLocation =
  | { kind: 'world'; levelId: string; col: number; row: number }
  | { kind: 'backpack'; slot: number }
  | { kind: 'equipped'; slot: EquipSlot };

// ItemEntity — a concrete instance of an item definition.
// itemId references ItemDef.id in the item database.
// modifiers holds ItemModifier.id values applied to enchanted-tier items.
export interface ItemEntity {
  instanceId: string;
  itemId: string;
  quality: ItemQuality;
  modifiers: string[];
  location: ItemLocation;
}

const BACKPACK_MAX_SLOTS = 12;

export class EntityRegistry {
  private items: Map<string, ItemEntity>;
  private _nextId: number;

  constructor() {
    this.items = new Map();
    this._nextId = 0;
  }

  // Create a new item instance, register it, and return it.
  createItem(
    itemId: string,
    quality: ItemQuality,
    location: ItemLocation,
    modifiers: string[] = [],
  ): ItemEntity {
    const instanceId = `item_${this._nextId++}`;
    const entity: ItemEntity = { instanceId, itemId, quality, modifiers, location };
    this.items.set(instanceId, entity);
    return entity;
  }

  // Register an existing ItemEntity (e.g. restored from snapshot).
  addItem(entity: ItemEntity): void {
    this.items.set(entity.instanceId, entity);
  }

  removeItem(instanceId: string): void {
    this.items.delete(instanceId);
  }

  getItem(instanceId: string): ItemEntity | undefined {
    return this.items.get(instanceId);
  }

  // Mutate an item's location in place.
  moveItem(instanceId: string, location: ItemLocation): void {
    const entity = this.items.get(instanceId);
    if (!entity) return;
    entity.location = location;
  }

  // Items sitting on the ground at a specific cell.
  getGroundItems(levelId: string, col: number, row: number): ItemEntity[] {
    const result: ItemEntity[] = [];
    for (const entity of this.items.values()) {
      const loc = entity.location;
      if (
        loc.kind === 'world' &&
        loc.levelId === levelId &&
        loc.col === col &&
        loc.row === row
      ) {
        result.push(entity);
      }
    }
    return result;
  }

  // All ground items in a level — used by renderers to build scene objects.
  getAllGroundItemsForLevel(levelId: string): ItemEntity[] {
    const result: ItemEntity[] = [];
    for (const entity of this.items.values()) {
      if (entity.location.kind === 'world' && entity.location.levelId === levelId) {
        result.push(entity);
      }
    }
    return result;
  }

  // Backpack items sorted by slot index (ascending).
  getBackpackItems(): ItemEntity[] {
    const result: ItemEntity[] = [];
    for (const entity of this.items.values()) {
      if (entity.location.kind === 'backpack') {
        result.push(entity);
      }
    }
    result.sort((a, b) => {
      const slotA = (a.location as { kind: 'backpack'; slot: number }).slot;
      const slotB = (b.location as { kind: 'backpack'; slot: number }).slot;
      return slotA - slotB;
    });
    return result;
  }

  // Item occupying a specific backpack slot, or undefined if the slot is empty.
  getBackpackItemAt(slot: number): ItemEntity | undefined {
    for (const entity of this.items.values()) {
      if (entity.location.kind === 'backpack' && entity.location.slot === slot) {
        return entity;
      }
    }
    return undefined;
  }

  // First free backpack slot index in range [0, BACKPACK_MAX_SLOTS).
  // Returns null when the backpack is full.
  nextBackpackSlot(): number | null {
    const occupied = new Set<number>();
    for (const entity of this.items.values()) {
      if (entity.location.kind === 'backpack') {
        occupied.add(entity.location.slot);
      }
    }
    for (let i = 0; i < BACKPACK_MAX_SLOTS; i++) {
      if (!occupied.has(i)) return i;
    }
    return null;
  }

  // Item equipped in the given slot, or undefined.
  getEquipped(slot: EquipSlot): ItemEntity | undefined {
    for (const entity of this.items.values()) {
      if (entity.location.kind === 'equipped' && entity.location.slot === slot) {
        return entity;
      }
    }
    return undefined;
  }

  // All equipped items keyed by slot.
  getAllEquipped(): Map<EquipSlot, ItemEntity> {
    const result = new Map<EquipSlot, ItemEntity>();
    for (const entity of this.items.values()) {
      if (entity.location.kind === 'equipped') {
        result.set(entity.location.slot, entity);
      }
    }
    return result;
  }

  // Drop all ground items belonging to a level (called on level transition).
  clearLevel(levelId: string): void {
    for (const [id, entity] of this.items) {
      if (entity.location.kind === 'world' && entity.location.levelId === levelId) {
        this.items.delete(id);
      }
    }
  }

  // Remove all items — full game reset.
  clear(): void {
    this.items.clear();
    this._nextId = 0;
  }

  // Snapshot returns a deep copy of every item for save/load.
  snapshot(): ItemEntity[] {
    const result: ItemEntity[] = [];
    for (const entity of this.items.values()) {
      result.push({
        ...entity,
        modifiers: [...entity.modifiers],
        location: { ...entity.location },
      });
    }
    return result;
  }

  // Restore from snapshot — replaces current state entirely.
  // _nextId is set to max(parsed numeric ids) + 1 to prevent future collisions.
  restore(items: ItemEntity[]): void {
    this.items.clear();
    let maxId = -1;
    for (const entity of items) {
      this.items.set(entity.instanceId, {
        ...entity,
        modifiers: [...entity.modifiers],
        location: { ...entity.location },
      });
      // instanceId format: "item_N" — extract N to track the highest issued id.
      const numeric = parseInt(entity.instanceId.replace('item_', ''), 10);
      if (!isNaN(numeric) && numeric > maxId) {
        maxId = numeric;
      }
    }
    this._nextId = maxId + 1;
  }
}
