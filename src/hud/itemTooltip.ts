// Item tooltip renderer for the inventory overlay.
// Draws a semi-transparent panel next to the cursor-selected slot showing item stats,
// comparison deltas vs. the currently equipped item, and requirements.

import type { ItemEntity } from '../core/entities';
import type { GameState } from '../core/gameState';
import { itemDatabase } from '../core/itemDatabase';
import type { ItemDef, ItemStats } from '../core/itemDatabase';
import { HUD_WIDTH } from './hudLayout';

// ---------------------------------------------------------------------------
// Exported helper functions (used by tests and by drawItemTooltip)
// ---------------------------------------------------------------------------

const QUALITY_COLORS: Record<string, string> = {
  poor:       '#999999',
  common:     '#cccccc',
  fine:       '#44cc44',
  masterwork: '#4a9eff',
  enchanted:  '#c844cc',
};

export function getQualityColor(quality: string): string {
  return QUALITY_COLORS[quality] ?? '#cccccc';
}

// All stat keys in display order with their short label.
const STAT_LABELS: Array<{ key: keyof ItemStats; label: string }> = [
  { key: 'atk',        label: 'ATK'   },
  { key: 'def',        label: 'DEF'   },
  { key: 'hp',         label: 'HP'    },
  { key: 'mp',         label: 'MP'    },
  { key: 'str',        label: 'STR'   },
  { key: 'dex',        label: 'DEX'   },
  { key: 'vit',        label: 'VIT'   },
  { key: 'wis',        label: 'WIS'   },
  { key: 'critChance', label: 'CRIT%' },
  { key: 'dodgeChance',label: 'DODGE%'},
];

export interface StatLine {
  label: string;
  value: number;
}

export function getStatLines(itemDef: ItemDef): StatLine[] {
  const result: StatLine[] = [];
  for (const { key, label } of STAT_LABELS) {
    const value = itemDef.stats[key];
    if (value !== undefined && value !== 0) {
      result.push({ label, value });
    }
  }
  return result;
}

export interface DeltaLine {
  label: string;
  delta: number;
}

export function getComparisonDeltas(
  itemDef: ItemDef,
  equippedDef: ItemDef | undefined,
): DeltaLine[] {
  if (!equippedDef) return [];

  const result: DeltaLine[] = [];
  for (const { key, label } of STAT_LABELS) {
    const newVal = itemDef.stats[key] ?? 0;
    const oldVal = equippedDef.stats[key] ?? 0;
    const delta = newVal - oldVal;
    if (delta !== 0) {
      result.push({ label, delta });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Subtype → equip slot mapping (no GameState dependency needed here because we
// only use it for comparison: if both items have the same subtype they occupy
// the same slot, so we treat ring as ring1 for look-up purposes).
// ---------------------------------------------------------------------------

function _subtypeToEquipSlotForComparison(subtype: string): string {
  const weaponSubtypes = new Set(['sword', 'axe', 'dagger', 'mace', 'spear', 'staff']);
  if (weaponSubtypes.has(subtype)) return 'weapon';

  const armorSlots: Record<string, string> = {
    head: 'head', chest: 'chest', legs: 'legs', hands: 'hands', feet: 'feet', shield: 'shield',
  };
  if (armorSlots[subtype]) return armorSlots[subtype];

  if (subtype === 'ring') return 'ring1';  // check ring1 first for comparison
  if (subtype === 'amulet') return 'amulet';

  return 'weapon';
}

// ---------------------------------------------------------------------------
// Main draw function
// ---------------------------------------------------------------------------

const TOOLTIP_WIDTH  = 150;
const TOOLTIP_PADDING = 6;
const LINE_HEIGHT    = 11;
const FONT_SIZE      = 9;
const FONT           = `${FONT_SIZE}px monospace`;

export function drawItemTooltip(
  ctx: CanvasRenderingContext2D,
  itemEntity: ItemEntity,
  gameState: GameState,
  x: number,
  y: number,
): void {
  if (!itemDatabase.isLoaded()) return;

  const itemDef = itemDatabase.getItem(itemEntity.itemId);
  if (!itemDef) return;

  // --- Resolve comparison item ---
  const equippedSlot = _subtypeToEquipSlotForComparison(itemDef.subtype as string);
  const equippedEntity = gameState.entityRegistry.getEquipped(equippedSlot as import('../core/entities').EquipSlot);
  // Don't compare an equipped item against itself.
  const isCurrentlyEquipped = equippedEntity?.instanceId === itemEntity.instanceId;
  const equippedDef = (equippedEntity && !isCurrentlyEquipped)
    ? itemDatabase.getItem(equippedEntity.itemId)
    : undefined;

  // --- Build content lines ---
  // Each line is rendered as { text, color, indent }
  interface TooltipLine {
    text: string;
    color: string;
    indent?: boolean;
  }

  const lines: TooltipLine[] = [];

  // 1. Item name (quality-colored)
  lines.push({ text: itemDef.name, color: getQualityColor(itemDef.quality) });

  // 2. Type / subtype
  const typeLabel = itemDef.type.charAt(0).toUpperCase() + itemDef.type.slice(1);
  const subtypeLabel = (itemDef.subtype as string).replace(/_/g, ' ');
  const typeText = itemDef.type === 'consumable'
    ? typeLabel
    : `${typeLabel} - ${subtypeLabel.charAt(0).toUpperCase() + subtypeLabel.slice(1)}`;
  lines.push({ text: typeText, color: '#666666' });

  // 3. Stat lines
  const statLines = getStatLines(itemDef);
  for (const { label, value } of statLines) {
    const sign = value > 0 ? '+' : '';
    lines.push({ text: `${label} ${sign}${value}`, color: '#44cc44' });
  }

  // 4. Comparison deltas (only for equippable items with a slot occupant)
  const canEquip = itemDef.type !== 'consumable';
  if (canEquip && equippedDef) {
    const deltas = getComparisonDeltas(itemDef, equippedDef);
    if (deltas.length > 0) {
      lines.push({ text: 'vs equipped:', color: '#555555' });
      for (const { label, delta } of deltas) {
        const sign = delta > 0 ? '+' : '';
        const color = delta > 0 ? '#44cc44' : '#cc4444';
        lines.push({ text: `  ${sign}${delta} ${label}`, color, indent: true });
      }
    }
  }

  // 5. Requirements
  const reqs = itemDef.requirements;
  if (reqs) {
    const reqEntries: Array<{ stat: string; val: number }> = [];
    if (reqs.str) reqEntries.push({ stat: 'STR', val: reqs.str });
    if (reqs.dex) reqEntries.push({ stat: 'DEX', val: reqs.dex });
    if (reqs.vit) reqEntries.push({ stat: 'VIT', val: reqs.vit });
    if (reqs.wis) reqEntries.push({ stat: 'WIS', val: reqs.wis });

    if (reqEntries.length > 0) {
      const effectiveStats = gameState.getEffectiveStats();
      const statValues: Record<string, number> = {
        STR: effectiveStats.effectiveStr,
        DEX: effectiveStats.effectiveDex,
        VIT: effectiveStats.effectiveVit,
        WIS: effectiveStats.effectiveWis,
      };

      for (const { stat, val } of reqEntries) {
        const met = statValues[stat] >= val;
        const color = met ? '#555555' : '#cc4444';
        lines.push({ text: `Req: ${stat} ${val}`, color });
      }
    }
  }

  // 6. Description
  if (itemDef.description) {
    // Word-wrap description to fit within tooltip width.
    const descWords = itemDef.description.split(' ');
    const maxChars = Math.floor((TOOLTIP_WIDTH - TOOLTIP_PADDING * 2) / (FONT_SIZE * 0.6));
    let currentLine = '';
    for (const word of descWords) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length <= maxChars) {
        currentLine = candidate;
      } else {
        if (currentLine) lines.push({ text: currentLine, color: '#555555' });
        currentLine = word;
      }
    }
    if (currentLine) lines.push({ text: currentLine, color: '#555555' });
  }

  // --- Calculate box dimensions ---
  const boxH = TOOLTIP_PADDING * 2 + lines.length * LINE_HEIGHT;

  // --- Edge detection: flip to left if tooltip goes off the right edge ---
  const adjustedX = (x + TOOLTIP_WIDTH > HUD_WIDTH) ? x - TOOLTIP_WIDTH - 4 : x;

  // --- Draw background ---
  ctx.save();
  ctx.fillStyle = 'rgba(10, 8, 12, 0.92)';
  ctx.fillRect(adjustedX, y, TOOLTIP_WIDTH, boxH);
  ctx.strokeStyle = '#2a2230';
  ctx.lineWidth = 1;
  ctx.strokeRect(adjustedX + 0.5, y + 0.5, TOOLTIP_WIDTH - 1, boxH - 1);

  // --- Draw text lines ---
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let lineY = y + TOOLTIP_PADDING;
  for (const line of lines) {
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, adjustedX + TOOLTIP_PADDING, lineY, TOOLTIP_WIDTH - TOOLTIP_PADDING * 2);
    lineY += LINE_HEIGHT;
  }

  ctx.restore();
}
