// Loot table loader and roller — pure logic, no Three.js.
// Loads from /data/loot-tables.json at runtime via fetch.

import type { ItemQuality } from './itemDatabase';

export interface LootTableDrop {
  itemId: string;
  chance: number;
  quality?: ItemQuality;
}

export interface LootTableEntry {
  xp: number;
  gold: [number, number];
  drops: LootTableDrop[];
}

export interface DropsOverride {
  guaranteed?: Array<{ itemId: string; quality?: ItemQuality }>;
  extra?: LootTableDrop[];
  suppressTable?: boolean;
}

export interface LootRollResult {
  gold: number;
  items: Array<{ itemId: string; quality: ItemQuality; modifiers: string[] }>;
}

export const ENCHANTED_MODIFIERS = [
  'fire_damage',
  'life_steal',
  'bonus_str',
  'bonus_dex',
  'hp_regen',
  'crit_bonus',
  'def_boost',
  'torch_range',
] as const;

// Shape expected from the JSON file.
interface LootTablesJsonPayload {
  version: string;
  qualityWeights: Record<string, number>;
  enemies: Record<string, LootTableEntry>;
}

// Module-level state — populated by loadLootTables().
let lootTableMap: Map<string, LootTableEntry> = new Map();
let qualityWeights: Record<ItemQuality, number> = {
  poor: 0.10,
  common: 0.50,
  fine: 0.25,
  masterwork: 0.12,
  enchanted: 0.03,
};

export async function loadLootTables(): Promise<void> {
  const response = await fetch('/data/loot-tables.json');
  if (!response.ok) {
    throw new Error(`Failed to load loot tables: ${response.status} ${response.statusText}`);
  }
  const payload = (await response.json()) as LootTablesJsonPayload;

  qualityWeights = payload.qualityWeights as Record<ItemQuality, number>;

  lootTableMap = new Map();
  for (const [enemyType, entry] of Object.entries(payload.enemies)) {
    lootTableMap.set(enemyType, entry);
  }
}

/**
 * Weighted random quality draw using the loaded qualityWeights table.
 * Iterates through tiers accumulating weight until the random threshold is crossed.
 */
export function rollQuality(): ItemQuality {
  const tiers = Object.entries(qualityWeights) as Array<[ItemQuality, number]>;
  const total = tiers.reduce((sum, [, w]) => sum + w, 0);
  let threshold = Math.random() * total;
  for (const [tier, weight] of tiers) {
    threshold -= weight;
    if (threshold < 0) return tier;
  }
  // Fallback: last tier (handles floating-point edge where threshold lands exactly on total).
  return tiers[tiers.length - 1][0];
}

/**
 * Random integer in [min, max] inclusive.
 */
export function rollGold(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Full loot roll for a given enemy type.
 * Returns gold: 0, items: [] if the enemy type is unknown.
 */
export function rollLoot(enemyType: string, dropsOverride?: DropsOverride): LootRollResult {
  const entry = lootTableMap.get(enemyType);
  if (!entry) {
    return { gold: 0, items: [] };
  }

  const gold = rollGold(entry.gold[0], entry.gold[1]);
  const items: LootRollResult['items'] = [];

  // 1. Guaranteed items from override — always added.
  if (dropsOverride?.guaranteed) {
    for (const g of dropsOverride.guaranteed) {
      const quality = g.quality ?? rollQuality();
      const modifiers = quality === 'enchanted' ? [pickEnchantedModifier()] : [];
      items.push({ itemId: g.itemId, quality, modifiers });
    }
  }

  // 2. Base table drops — skipped when suppressTable is set.
  if (!dropsOverride?.suppressTable) {
    for (const drop of entry.drops) {
      if (Math.random() < drop.chance) {
        const quality = drop.quality ?? rollQuality();
        const modifiers = quality === 'enchanted' ? [pickEnchantedModifier()] : [];
        items.push({ itemId: drop.itemId, quality, modifiers });
      }
    }
  }

  // 3. Extra drops from override — rolled independently like base drops.
  if (dropsOverride?.extra) {
    for (const drop of dropsOverride.extra) {
      if (Math.random() < drop.chance) {
        const quality = drop.quality ?? rollQuality();
        const modifiers = quality === 'enchanted' ? [pickEnchantedModifier()] : [];
        items.push({ itemId: drop.itemId, quality, modifiers });
      }
    }
  }

  return { gold, items };
}

/**
 * Returns the XP value for a given enemy type, or 0 if not found.
 * Useful for the kill handler.
 */
export function getLootTableXp(enemyType: string): number {
  return lootTableMap.get(enemyType)?.xp ?? 0;
}

// --- Private helpers ---

function pickEnchantedModifier(): string {
  const idx = Math.floor(Math.random() * ENCHANTED_MODIFIERS.length);
  return ENCHANTED_MODIFIERS[idx];
}
