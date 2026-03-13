import { INVENTORY } from './hudLayout';
import { HUD_COLORS } from './hudColors';
import { drawPixelText } from './hudFont';
import { PLAYER_ATTACK_COOLDOWN } from '../core/combat';
import { itemDatabase } from '../core/itemDatabase';
import type { GameState } from '../core/gameState';
import type { EquipSlot } from '../core/gameState';
import { getItemImage } from '../rendering/itemSprites';

const SLOT_SIZE = 24;
const SLOT_GAP = 4;

// 10-slot equipment layout — two rows of 5.
const EQUIP_SLOTS_ROW1: EquipSlot[] = ['weapon', 'head', 'chest', 'legs', 'hands'];
const EQUIP_SLOTS_ROW2: EquipSlot[] = ['shield', 'feet', 'ring1', 'ring2', 'amulet'];
const EQUIP_LABELS_ROW1 = ['W', 'H', 'C', 'L', 'G'] as const;
const EQUIP_LABELS_ROW2 = ['S', 'F', 'R', 'R', 'A'] as const;

// Slot accent colors for equipped indicators.
const EQUIP_COLORS: Partial<Record<EquipSlot, string>> = {
  weapon: '#C0C0C0',
  head:   '#8B6914',
  chest:  '#4682B4',
  legs:   '#5C7A5C',
  hands:  '#7A5C5C',
  feet:   '#5C5C7A',
  shield: '#4682B4',
  ring1:  '#DAA520',
  ring2:  '#DAA520',
  amulet: '#9B59B6',
};

const CONSUMABLE_COLORS: Record<string, string> = {
  health_potion: '#CC3333',
  torch_oil:     '#CC9900',
};

export function drawInventoryPanel(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
): void {
  const { x, y, w, h } = INVENTORY;

  // Background
  ctx.fillStyle = HUD_COLORS.panelBg;
  ctx.fillRect(x, y, w, h);

  // Key count + gold (top row)
  const keyCount = gameState.inventory.size;
  drawKeyIcon(ctx, x + 6, y + 6, HUD_COLORS.keyIcon);
  drawPixelText(ctx, `x${keyCount}`, x + 20, y + 8, HUD_COLORS.textPrimary, 2);

  // Gold — right side of top row
  ctx.fillStyle = '#DAA520';
  ctx.beginPath();
  ctx.arc(x + w - 50, y + 11, 4, 0, Math.PI * 2);
  ctx.fill();
  drawPixelText(ctx, String(gameState.gold) + 'G', x + w - 42, y + 8, '#DAA520', 2);

  // Attack cooldown ratio — used to overlay the weapon slot.
  const attackCooldown = gameState.attackCooldown;

  // Equipment row 1 (5 slots)
  const equipY1 = y + 28;
  for (let i = 0; i < EQUIP_SLOTS_ROW1.length; i++) {
    const sx = x + 6 + i * (SLOT_SIZE + SLOT_GAP);
    const slot = EQUIP_SLOTS_ROW1[i];
    const label = EQUIP_LABELS_ROW1[i];
    drawSlot(ctx, sx, equipY1, label);

    const entity = gameState.entityRegistry.getEquipped(slot);
    if (entity) {
      _drawItemIcon(ctx, entity.itemId, sx, equipY1, SLOT_SIZE, EQUIP_COLORS[slot] ?? '#888');
    }
  }

  // Weapon cooldown overlay on weapon slot (index 0 in row 1)
  if (attackCooldown > 0) {
    const cooldownRatio = attackCooldown / PLAYER_ATTACK_COOLDOWN;
    const wx = x + 6;
    const fillH = Math.ceil(SLOT_SIZE * cooldownRatio);
    ctx.fillStyle = 'rgba(200, 60, 60, 0.45)';
    ctx.fillRect(wx, equipY1 + (SLOT_SIZE - fillH), SLOT_SIZE, fillH);
  }

  // Equipment row 2 (5 slots)
  const equipY2 = equipY1 + SLOT_SIZE + SLOT_GAP;
  for (let i = 0; i < EQUIP_SLOTS_ROW2.length; i++) {
    const sx = x + 6 + i * (SLOT_SIZE + SLOT_GAP);
    const slot = EQUIP_SLOTS_ROW2[i];
    const label = EQUIP_LABELS_ROW2[i];
    drawSlot(ctx, sx, equipY2, label);

    const entity = gameState.entityRegistry.getEquipped(slot);
    if (entity) {
      _drawItemIcon(ctx, entity.itemId, sx, equipY2, SLOT_SIZE, EQUIP_COLORS[slot] ?? '#888');
    }
  }

  // Backpack: 12 slots, 4 columns x 3 rows
  const backpackY = equipY2 + SLOT_SIZE + SLOT_GAP + 4;
  const backpackItems = gameState.entityRegistry.getBackpackItems();

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const slotIndex = row * 4 + col;
      const sx = x + 6 + col * (SLOT_SIZE + SLOT_GAP);
      const slotY = backpackY + row * (SLOT_SIZE + SLOT_GAP);
      drawSlot(ctx, sx, slotY);

      // Find item in this backpack slot position (by sorted order).
      if (slotIndex < backpackItems.length) {
        const entity = backpackItems[slotIndex];
        let fallbackColor = '#888';
        const def = itemDatabase.getItem(entity.itemId);
        if (def?.type === 'consumable') {
          fallbackColor = CONSUMABLE_COLORS[def.subtype as string] ?? '#888';
        }
        _drawItemIcon(ctx, entity.itemId, sx, slotY, SLOT_SIZE, fallbackColor);
      }
    }
  }

  // Border
  ctx.strokeStyle = HUD_COLORS.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function _drawItemIcon(
  ctx: CanvasRenderingContext2D,
  itemId: string,
  sx: number,
  sy: number,
  slotSize: number,
  fallbackColor: string,
): void {
  const padding = 2;
  const iconSize = slotSize - padding * 2;
  const def = itemDatabase.isLoaded() ? itemDatabase.getItem(itemId) : null;
  const icon = def?.icon;
  const img = icon ? getItemImage(icon) : null;

  if (img) {
    ctx.drawImage(img, sx + padding, sy + padding, iconSize, iconSize);
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(sx + 4, sy + 4, slotSize - 8, slotSize - 8);
    const label = def?.name?.charAt(0).toUpperCase() ?? itemId.charAt(0).toUpperCase();
    drawPixelText(ctx, label, sx + 8, sy + 7, '#000', 2);
  }
}

function drawSlot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label?: string,
): void {
  ctx.fillStyle = HUD_COLORS.slotBg;
  ctx.fillRect(x, y, SLOT_SIZE, SLOT_SIZE);
  ctx.strokeStyle = HUD_COLORS.slotBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, SLOT_SIZE - 1, SLOT_SIZE - 1);

  if (label) {
    drawPixelText(ctx, label, x + 8, y + 7, HUD_COLORS.slotLabel, 2);
  }
}

function drawKeyIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  // Key head (circle-ish)
  ctx.fillRect(x + 1, y, 3, 1);
  ctx.fillRect(x, y + 1, 1, 3);
  ctx.fillRect(x + 4, y + 1, 1, 3);
  ctx.fillRect(x + 1, y + 4, 3, 1);
  // Shaft
  ctx.fillRect(x + 5, y + 2, 5, 1);
  // Teeth
  ctx.fillRect(x + 8, y + 3, 1, 2);
  ctx.fillRect(x + 10, y + 3, 1, 2);
}
