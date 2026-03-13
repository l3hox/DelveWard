// Item database — typed loader and query module.
// Loads from /data/items.json at runtime via fetch.

export type ItemQuality = 'poor' | 'common' | 'fine' | 'masterwork' | 'enchanted';
export type ItemType = 'weapon' | 'armor' | 'accessory' | 'consumable';
export type WeaponSubtype = 'sword' | 'axe' | 'dagger' | 'mace' | 'spear' | 'staff';
export type ArmorSubtype = 'head' | 'chest' | 'legs' | 'hands' | 'feet' | 'shield';
export type AccessorySubtype = 'ring' | 'amulet';
export type ConsumableSubtype = 'health_potion' | 'mana_potion' | 'torch_oil' | 'antidote' | 'junk';

export interface ItemStats {
  atk?: number;
  def?: number;
  hp?: number;
  mp?: number;
  str?: number;
  dex?: number;
  vit?: number;
  wis?: number;
  critChance?: number;
  dodgeChance?: number;
}

export interface ItemModifier {
  id: string;
  name: string;
  effect: string;
  stats?: ItemStats;
}

export interface ItemRequirements {
  str?: number;
  dex?: number;
  vit?: number;
  wis?: number;
}

// Consumable-only effect payload — torch fuel or cure flags.
export interface ItemEffect {
  torchFuel?: number;
  curePoison?: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  subtype: WeaponSubtype | ArmorSubtype | AccessorySubtype | ConsumableSubtype;
  quality: ItemQuality;
  icon: string;
  weight: number;
  value: number;
  description: string;
  stats: ItemStats;
  modifiers: ItemModifier[];
  requirements: ItemRequirements;
  // Consumable-specific optional fields
  stackable?: boolean;
  stackMax?: number;
  effect?: ItemEffect;
}

// Shape expected from the JSON file.
interface ItemsJsonPayload {
  version: string;
  note: string;
  items: ItemDef[];
}

export class ItemDatabase {
  private items: Map<string, ItemDef>;
  private loaded: boolean;

  constructor() {
    this.items = new Map();
    this.loaded = false;
  }

  async load(): Promise<void> {
    const response = await fetch('/data/items.json');
    if (!response.ok) {
      throw new Error(`Failed to load item database: ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as ItemsJsonPayload;
    this.items = new Map();
    for (const item of payload.items) {
      this.items.set(item.id, item);
    }
    this.loaded = true;
  }

  getItem(id: string): ItemDef | undefined {
    return this.items.get(id);
  }

  getItemsByType(type: ItemType): ItemDef[] {
    const result: ItemDef[] = [];
    for (const item of this.items.values()) {
      if (item.type === type) {
        result.push(item);
      }
    }
    return result;
  }

  getAllItems(): ItemDef[] {
    return [...this.items.values()];
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

export const itemDatabase = new ItemDatabase();
