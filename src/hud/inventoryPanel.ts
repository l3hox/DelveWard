import { INVENTORY } from './hudLayout';
import { HUD_COLORS } from './hudColors';
import { drawPixelText } from './hudFont';
import { PLAYER_ATTACK_COOLDOWN } from '../core/combat';
import { itemDatabase } from '../core/itemDatabase';
import type { GameState } from '../core/gameState';
import type { EquipSlot } from '../core/gameState';
import { getItemImage } from '../rendering/itemSprites';
import { drawItemTooltip } from './itemTooltip';
import type { InventoryAction } from './inventoryOverlay';
import { subtypeToEquipSlot } from './inventoryOverlay';

const SLOT_SIZE = 24;
const SLOT_GAP = 4;

// 10-slot equipment layout — two rows of 5.
const EQUIP_SLOTS_ROW1: EquipSlot[] = ['weapon', 'head', 'chest', 'legs', 'hands'];
const EQUIP_SLOTS_ROW2: EquipSlot[] = ['shield', 'feet', 'ring1', 'ring2', 'amulet'];
const EQUIP_LABELS_ROW1 = ['W', 'H', 'C', 'L', 'G'] as const;
const EQUIP_LABELS_ROW2 = ['S', 'F', 'R', 'R', 'A'] as const;

// Flat array matching the two-row layout, indices 0-9.
const EQUIP_SLOTS: EquipSlot[] = [...EQUIP_SLOTS_ROW1, ...EQUIP_SLOTS_ROW2];

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

// ---------------------------------------------------------------------------
// Section / slot types
// ---------------------------------------------------------------------------

type PanelSection = 'equipment' | 'backpack';

interface PanelSlot {
  section: PanelSection;
  index: number;
}

// ---------------------------------------------------------------------------
// Module-level interaction state
// ---------------------------------------------------------------------------

let hoveredSlot: PanelSlot | null = null;

interface PanelDragState {
  source: PanelSlot;
  itemId: string;
  hudX: number;
  hudY: number;
  /** Equipment slot indices this item is allowed to drop into (empty = none). */
  validEquipSlots: Set<number>;
}

let dragState: PanelDragState | null = null;

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

/**
 * Convert HUD-space coordinates to a panel slot, or null if not over any slot.
 * Equipment row 1 = indices 0-4, row 2 = 5-9.  Backpack = 0-11 (slot numbers).
 */
export function panelHitTest(hudX: number, hudY: number): PanelSlot | null {
  const { x, y } = INVENTORY;
  const equipY1 = y + 28;
  const equipY2 = equipY1 + SLOT_SIZE + SLOT_GAP;
  const backpackY = equipY2 + SLOT_SIZE + SLOT_GAP + 4;

  // Equipment row 1 (indices 0-4)
  for (let i = 0; i < 5; i++) {
    const sx = x + 6 + i * (SLOT_SIZE + SLOT_GAP);
    if (hudX >= sx && hudX < sx + SLOT_SIZE && hudY >= equipY1 && hudY < equipY1 + SLOT_SIZE) {
      return { section: 'equipment', index: i };
    }
  }

  // Equipment row 2 (indices 5-9)
  for (let i = 0; i < 5; i++) {
    const sx = x + 6 + i * (SLOT_SIZE + SLOT_GAP);
    if (hudX >= sx && hudX < sx + SLOT_SIZE && hudY >= equipY2 && hudY < equipY2 + SLOT_SIZE) {
      return { section: 'equipment', index: 5 + i };
    }
  }

  // Backpack (slot numbers 0-11, 4 cols x 3 rows)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const slotIndex = row * 4 + col;
      const sx = x + 6 + col * (SLOT_SIZE + SLOT_GAP);
      const slotY = backpackY + row * (SLOT_SIZE + SLOT_GAP);
      if (hudX >= sx && hudX < sx + SLOT_SIZE && hudY >= slotY && hudY < slotY + SLOT_SIZE) {
        return { section: 'backpack', index: slotIndex };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Mouse event handlers
// ---------------------------------------------------------------------------

export function panelHandleMouseMove(hudX: number, hudY: number): void {
  if (dragState) {
    dragState.hudX = hudX;
    dragState.hudY = hudY;
  } else {
    hoveredSlot = panelHitTest(hudX, hudY);
  }
}

export function panelHandleDragStart(hudX: number, hudY: number, gameState: GameState): void {
  const pos = panelHitTest(hudX, hudY);
  if (!pos) return;

  let entity;
  if (pos.section === 'equipment') {
    entity = gameState.entityRegistry.getEquipped(EQUIP_SLOTS[pos.index]);
  } else {
    entity = gameState.entityRegistry.getBackpackItemAt(pos.index);
  }
  if (!entity) return;

  const def = itemDatabase.isLoaded() ? itemDatabase.getItem(entity.itemId) : null;
  if (!def) return;

  const validEquipSlots = new Set<number>();
  if (def.type !== 'consumable' && pos.section === 'backpack') {
    const target = subtypeToEquipSlot(def.subtype as string, gameState);
    const idx = EQUIP_SLOTS.indexOf(target);
    if (idx >= 0) validEquipSlots.add(idx);
    // Rings can go to either slot.
    if (def.subtype === 'ring') {
      validEquipSlots.add(EQUIP_SLOTS.indexOf('ring1'));
      validEquipSlots.add(EQUIP_SLOTS.indexOf('ring2'));
    }
  }

  dragState = { source: pos, itemId: entity.itemId, hudX, hudY, validEquipSlots };
}

export function panelHandleDragEnd(
  hudX: number,
  hudY: number,
  gameState: GameState,
): InventoryAction | null {
  if (!dragState) return null;
  const source = dragState.source;
  const target = panelHitTest(hudX, hudY);
  dragState = null;

  if (!target) return null;
  if (source.section === target.section && source.index === target.index) return null;

  // Backpack -> equipment: equip
  if (source.section === 'backpack' && target.section === 'equipment') {
    const entity = gameState.entityRegistry.getBackpackItemAt(source.index);
    if (!entity) return null;
    const def = itemDatabase.getItem(entity.itemId);
    if (!def || def.type === 'consumable') return null;
    const targetSlot = EQUIP_SLOTS[target.index];
    const correctSlot = subtypeToEquipSlot(def.subtype as string, gameState);
    const isRing = def.subtype === 'ring' && (targetSlot === 'ring1' || targetSlot === 'ring2');
    if (targetSlot !== correctSlot && !isRing) return null;
    // equipFromBackpack takes a sorted-list index, not a slot number.
    const bpItems = gameState.entityRegistry.getBackpackItems();
    const pos = bpItems.findIndex(e => e.instanceId === entity.instanceId);
    if (pos === -1) return null;
    return { type: 'equip', backpackSlot: pos, equipSlot: targetSlot };
  }

  // Equipment -> backpack: unequip to specific slot
  if (source.section === 'equipment' && target.section === 'backpack') {
    const slot = EQUIP_SLOTS[source.index];
    const entity = gameState.entityRegistry.getEquipped(slot);
    if (!entity) return null;
    // Target slot must be empty.
    const existing = gameState.entityRegistry.getBackpackItemAt(target.index);
    if (existing) return null;
    return { type: 'unequip', equipSlot: slot, backpackSlot: target.index };
  }

  // Backpack -> backpack: swap slots
  if (source.section === 'backpack' && target.section === 'backpack') {
    return { type: 'swap', indexA: source.index, indexB: target.index };
  }

  return null;
}

export function panelHandleDblClick(
  hudX: number,
  hudY: number,
  gameState: GameState,
): InventoryAction | null {
  const pos = panelHitTest(hudX, hudY);
  if (!pos) return null;

  if (pos.section === 'equipment') {
    const slot = EQUIP_SLOTS[pos.index];
    const entity = gameState.entityRegistry.getEquipped(slot);
    if (!entity) return null;
    const freeSlot = gameState.entityRegistry.nextBackpackSlot();
    if (freeSlot === null) return { type: 'message', text: 'Backpack is full' };
    return { type: 'unequip', equipSlot: slot, backpackSlot: freeSlot };
  }

  // Backpack slot
  const entity = gameState.entityRegistry.getBackpackItemAt(pos.index);
  if (!entity) return null;
  const def = itemDatabase.getItem(entity.itemId);
  if (!def) return null;

  if (def.type === 'consumable') {
    // processInventoryAction 'use' indexes into the sorted list, not slot numbers.
    const bpItems = gameState.entityRegistry.getBackpackItems();
    const sortedPos = bpItems.findIndex(e => e.instanceId === entity.instanceId);
    if (sortedPos === -1) return null;
    return { type: 'use', backpackSlot: sortedPos };
  }

  const targetSlot = subtypeToEquipSlot(def.subtype as string, gameState);
  const bpItems = gameState.entityRegistry.getBackpackItems();
  const bpPos = bpItems.findIndex(e => e.instanceId === entity.instanceId);
  if (bpPos === -1) return null;
  return { type: 'equip', backpackSlot: bpPos, equipSlot: targetSlot };
}

export function panelHandleRightClick(
  hudX: number,
  hudY: number,
  gameState: GameState,
  playerCol: number,
  playerRow: number,
): InventoryAction | null {
  const pos = panelHitTest(hudX, hudY);
  if (!pos) return null;

  let entity;
  if (pos.section === 'equipment') {
    entity = gameState.entityRegistry.getEquipped(EQUIP_SLOTS[pos.index]);
  } else {
    entity = gameState.entityRegistry.getBackpackItemAt(pos.index);
  }
  if (!entity) return null;

  return { type: 'drop', instanceId: entity.instanceId, col: playerCol, row: playerRow };
}

export function panelIsDragging(): boolean {
  return dragState !== null;
}

export function panelClearHover(): void {
  hoveredSlot = null;
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

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

  // Equipment row 1 (5 slots, indices 0-4)
  const equipY1 = y + 28;
  for (let i = 0; i < EQUIP_SLOTS_ROW1.length; i++) {
    const sx = x + 6 + i * (SLOT_SIZE + SLOT_GAP);
    const slot = EQUIP_SLOTS_ROW1[i];
    const label = EQUIP_LABELS_ROW1[i];
    const equipIndex = i; // flat index 0-4

    // Hover highlight (skip during drag)
    if (!dragState && hoveredSlot?.section === 'equipment' && hoveredSlot.index === equipIndex) {
      ctx.fillStyle = 'rgba(232, 200, 74, 0.3)';
      ctx.fillRect(sx - 1, equipY1 - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
      ctx.strokeStyle = '#e8c84a';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 1, equipY1 - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
    }

    // Drag: valid equip target highlight (green)
    if (dragState?.source.section === 'backpack' && dragState.validEquipSlots.has(equipIndex)) {
      ctx.fillStyle = 'rgba(68, 200, 68, 0.25)';
      ctx.fillRect(sx - 1, equipY1 - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
      ctx.strokeStyle = '#44cc44';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 1, equipY1 - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
    }

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

  // Equipment row 2 (5 slots, indices 5-9)
  const equipY2 = equipY1 + SLOT_SIZE + SLOT_GAP;
  for (let i = 0; i < EQUIP_SLOTS_ROW2.length; i++) {
    const sx = x + 6 + i * (SLOT_SIZE + SLOT_GAP);
    const slot = EQUIP_SLOTS_ROW2[i];
    const label = EQUIP_LABELS_ROW2[i];
    const equipIndex = 5 + i; // flat index 5-9

    // Hover highlight (skip during drag)
    if (!dragState && hoveredSlot?.section === 'equipment' && hoveredSlot.index === equipIndex) {
      ctx.fillStyle = 'rgba(232, 200, 74, 0.3)';
      ctx.fillRect(sx - 1, equipY2 - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
      ctx.strokeStyle = '#e8c84a';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 1, equipY2 - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
    }

    // Drag: valid equip target highlight (green)
    if (dragState?.source.section === 'backpack' && dragState.validEquipSlots.has(equipIndex)) {
      ctx.fillStyle = 'rgba(68, 200, 68, 0.25)';
      ctx.fillRect(sx - 1, equipY2 - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
      ctx.strokeStyle = '#44cc44';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 1, equipY2 - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
    }

    drawSlot(ctx, sx, equipY2, label);

    const entity = gameState.entityRegistry.getEquipped(slot);
    if (entity) {
      _drawItemIcon(ctx, entity.itemId, sx, equipY2, SLOT_SIZE, EQUIP_COLORS[slot] ?? '#888');
    }
  }

  // Backpack: 12 slots, 4 columns x 3 rows
  const backpackY = equipY2 + SLOT_SIZE + SLOT_GAP + 4;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const slotIndex = row * 4 + col;
      const sx = x + 6 + col * (SLOT_SIZE + SLOT_GAP);
      const slotY = backpackY + row * (SLOT_SIZE + SLOT_GAP);

      // Hover highlight (skip during drag)
      if (!dragState && hoveredSlot?.section === 'backpack' && hoveredSlot.index === slotIndex) {
        ctx.fillStyle = 'rgba(232, 200, 74, 0.3)';
        ctx.fillRect(sx - 1, slotY - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
        ctx.strokeStyle = '#e8c84a';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 1, slotY - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
      }

      // Drag: highlight backpack slots as drop targets, excluding the drag source
      if (dragState && !(dragState.source.section === 'backpack' && dragState.source.index === slotIndex)) {
        ctx.fillStyle = 'rgba(68, 200, 68, 0.15)';
        ctx.fillRect(sx - 1, slotY - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
        ctx.strokeStyle = 'rgba(68, 200, 68, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 1, slotY - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
      }

      drawSlot(ctx, sx, slotY);

      const entity = gameState.entityRegistry.getBackpackItemAt(slotIndex);
      if (entity) {
        let fallbackColor = '#888';
        const def = itemDatabase.getItem(entity.itemId);
        if (def?.type === 'consumable') {
          fallbackColor = CONSUMABLE_COLORS[def.subtype as string] ?? '#888';
        }
        _drawItemIcon(ctx, entity.itemId, sx, slotY, SLOT_SIZE, fallbackColor);
      }

      // Slot number indicator (1-8): gold for consumables, grey for others/empty
      if (slotIndex < 8) {
        const numStr = String(slotIndex + 1);
        const nx = sx + SLOT_SIZE - 8;
        const ny = slotY + 1;
        const entity2 = gameState.entityRegistry.getBackpackItemAt(slotIndex);
        const def2 = entity2 ? itemDatabase.getItem(entity2.itemId) : null;
        const isConsumable = def2?.type === 'consumable';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(nx, ny, 6, 7);
        drawPixelText(ctx, numStr, nx + 1, ny, isConsumable ? '#ffcc44' : '#666666', 1);
      }
    }
  }

  // Border
  ctx.strokeStyle = HUD_COLORS.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Tooltip for hovered slot (hidden during drag)
  if (!dragState && hoveredSlot) {
    let hoveredEntity;
    if (hoveredSlot.section === 'equipment') {
      hoveredEntity = gameState.entityRegistry.getEquipped(EQUIP_SLOTS[hoveredSlot.index]);
    } else {
      hoveredEntity = gameState.entityRegistry.getBackpackItemAt(hoveredSlot.index);
    }

    if (hoveredEntity) {
      // Anchor tooltip to the left of the panel (it will right-edge-flip if needed).
      const tooltipX = x - 4;
      const tooltipY = y;
      drawItemTooltip(ctx, hoveredEntity, gameState, tooltipX, tooltipY);
    }
  }

  // Dragged item icon floating at cursor
  if (dragState) {
    ctx.globalAlpha = 0.8;
    _drawItemIcon(
      ctx,
      dragState.itemId,
      dragState.hudX - SLOT_SIZE / 2,
      dragState.hudY - SLOT_SIZE / 2,
      SLOT_SIZE,
      '#888',
    );
    ctx.globalAlpha = 1;
  }
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
