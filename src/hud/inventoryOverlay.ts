import { HUD_WIDTH, HUD_HEIGHT, INVENTORY_OVERLAY } from './hudLayout';
import { HUD_COLORS } from './hudColors';
import { drawPixelText, measurePixelText } from './hudFont';
import { itemDatabase } from '../core/itemDatabase';
import type { GameState } from '../core/gameState';
import type { EquipSlot } from '../core/entities';

type InventorySection = 'equipment' | 'backpack';

interface CursorPos {
  section: InventorySection;
  index: number;
}

export type InventoryAction =
  | { type: 'equip'; backpackSlot: number; equipSlot: EquipSlot }
  | { type: 'unequip'; equipSlot: EquipSlot; backpackSlot: number }
  | { type: 'use'; backpackSlot: number }
  | { type: 'drop'; instanceId: string; col: number; row: number }
  | { type: 'message'; text: string };

// Equipment slots in the canonical 2-row-of-5 layout used throughout the HUD.
const EQUIP_SLOTS: EquipSlot[] = [
  'weapon', 'head', 'chest', 'legs', 'hands',  // row 0: indices 0-4
  'shield', 'feet', 'ring1', 'ring2', 'amulet', // row 1: indices 5-9
];

const EQUIP_LABELS = ['W', 'H', 'C', 'L', 'G', 'S', 'F', 'R', 'R', 'A'] as const;

// Slot accent colors matching inventoryPanel.ts
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

const SLOT_SIZE = 28;
const SLOT_GAP = 4;
const EQUIP_COLS = 5;
const BACKPACK_COLS = 4;

export function subtypeToEquipSlot(subtype: string, gameState: GameState): EquipSlot {
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

export class InventoryOverlay {
  private _open = false;
  private cursor: CursorPos = { section: 'equipment', index: 0 };

  toggle(): void {
    this._open = !this._open;
    if (this._open) {
      // Reset cursor to first slot when opening
      this.cursor = { section: 'equipment', index: 0 };
    }
  }

  isOpen(): boolean {
    return this._open;
  }

  handleKey(
    code: string,
    gameState: GameState,
    playerCol: number,
    playerRow: number,
  ): InventoryAction | null {
    switch (code) {
      case 'ArrowLeft':
        this._moveLeft();
        return null;
      case 'ArrowRight':
        this._moveRight();
        return null;
      case 'ArrowUp':
        this._moveUp();
        return null;
      case 'ArrowDown':
        this._moveDown();
        return null;
      case 'Enter':
        return this._handleEnter(gameState);
      case 'KeyD':
        return this._handleDrop(gameState, playerCol, playerRow);
      default:
        return null;
    }
  }

  private _moveLeft(): void {
    if (this.cursor.section === 'equipment') {
      const row = Math.floor(this.cursor.index / EQUIP_COLS);
      const col = this.cursor.index % EQUIP_COLS;
      if (col > 0) {
        this.cursor = { section: 'equipment', index: row * EQUIP_COLS + col - 1 };
      }
    } else {
      const row = Math.floor(this.cursor.index / BACKPACK_COLS);
      const col = this.cursor.index % BACKPACK_COLS;
      if (col > 0) {
        this.cursor = { section: 'backpack', index: row * BACKPACK_COLS + col - 1 };
      }
    }
  }

  private _moveRight(): void {
    if (this.cursor.section === 'equipment') {
      const row = Math.floor(this.cursor.index / EQUIP_COLS);
      const col = this.cursor.index % EQUIP_COLS;
      if (col < EQUIP_COLS - 1) {
        this.cursor = { section: 'equipment', index: row * EQUIP_COLS + col + 1 };
      }
    } else {
      const row = Math.floor(this.cursor.index / BACKPACK_COLS);
      const col = this.cursor.index % BACKPACK_COLS;
      if (col < BACKPACK_COLS - 1) {
        this.cursor = { section: 'backpack', index: row * BACKPACK_COLS + col + 1 };
      }
    }
  }

  private _moveUp(): void {
    if (this.cursor.section === 'equipment') {
      // Already at top — no movement
      return;
    }
    // Backpack section
    const row = Math.floor(this.cursor.index / BACKPACK_COLS);
    const col = this.cursor.index % BACKPACK_COLS;
    if (row > 0) {
      this.cursor = { section: 'backpack', index: (row - 1) * BACKPACK_COLS + col };
    } else {
      // Jump up to equipment row 1 (second row), same column clamped to EQUIP_COLS
      const equipCol = Math.min(col, EQUIP_COLS - 1);
      this.cursor = { section: 'equipment', index: EQUIP_COLS + equipCol };
    }
  }

  private _moveDown(): void {
    if (this.cursor.section === 'equipment') {
      const row = Math.floor(this.cursor.index / EQUIP_COLS);
      const col = this.cursor.index % EQUIP_COLS;
      if (row < 1) {
        // Move within equipment to row 1
        this.cursor = { section: 'equipment', index: EQUIP_COLS + col };
      } else {
        // Jump to backpack row 0, same column clamped to BACKPACK_COLS
        const bpCol = Math.min(col, BACKPACK_COLS - 1);
        this.cursor = { section: 'backpack', index: bpCol };
      }
    } else {
      const row = Math.floor(this.cursor.index / BACKPACK_COLS);
      const col = this.cursor.index % BACKPACK_COLS;
      if (row < 2) {
        this.cursor = { section: 'backpack', index: (row + 1) * BACKPACK_COLS + col };
      }
      // Already at bottom — no movement
    }
  }

  private _handleEnter(gameState: GameState): InventoryAction | null {
    if (this.cursor.section === 'equipment') {
      const slot = EQUIP_SLOTS[this.cursor.index];
      const entity = gameState.entityRegistry.getEquipped(slot);
      if (!entity) return null;

      const freeSlot = gameState.entityRegistry.nextBackpackSlot();
      if (freeSlot === null) {
        return { type: 'message', text: 'Backpack is full' };
      }
      return { type: 'unequip', equipSlot: slot, backpackSlot: freeSlot };
    }

    // Backpack section
    const backpackItems = gameState.entityRegistry.getBackpackItems();
    // cursor.index is a visual slot position; map to sorted item list
    const entity = _getBackpackEntityAt(this.cursor.index, gameState);
    if (!entity) return null;

    if (!itemDatabase.isLoaded()) return null;
    const itemDef = itemDatabase.getItem(entity.itemId);
    if (!itemDef) return null;

    if (itemDef.type === 'consumable') {
      // Determine the visual slot index (position in sorted backpack list)
      const sorted = backpackItems;
      const pos = sorted.findIndex((e) => e.instanceId === entity.instanceId);
      if (pos === -1) return null;
      return { type: 'use', backpackSlot: pos };
    }

    // Equipment/armor/accessory — equip it
    const targetSlot = subtypeToEquipSlot(itemDef.subtype as string, gameState);
    const sorted = backpackItems;
    const pos = sorted.findIndex((e) => e.instanceId === entity.instanceId);
    if (pos === -1) return null;
    return { type: 'equip', backpackSlot: pos, equipSlot: targetSlot };
  }

  private _handleDrop(
    gameState: GameState,
    playerCol: number,
    playerRow: number,
  ): InventoryAction | null {
    if (this.cursor.section === 'equipment') {
      const slot = EQUIP_SLOTS[this.cursor.index];
      const entity = gameState.entityRegistry.getEquipped(slot);
      if (!entity) return null;
      return { type: 'drop', instanceId: entity.instanceId, col: playerCol, row: playerRow };
    }

    const entity = _getBackpackEntityAt(this.cursor.index, gameState);
    if (!entity) return null;
    return { type: 'drop', instanceId: entity.instanceId, col: playerCol, row: playerRow };
  }

  draw(ctx: CanvasRenderingContext2D, gameState: GameState): void {
    const { x, y, w, h } = INVENTORY_OVERLAY;

    // Full-screen backdrop
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, HUD_WIDTH, HUD_HEIGHT);

    // Panel background
    ctx.fillStyle = HUD_COLORS.panelBg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = HUD_COLORS.panelBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Title "INVENTORY"
    const title = 'INVENTORY';
    const titleW = measurePixelText(title, 3);
    drawPixelText(ctx, title, x + Math.floor((w - titleW) / 2), y + 14, HUD_COLORS.compassActive, 3);

    // Gold display — top-right of panel
    const goldStr = String(gameState.gold) + 'G';
    const goldTextW = measurePixelText(goldStr, 2);
    const goldIconR = 5;
    const goldTotalW = goldIconR * 2 + 4 + goldTextW;
    const goldX = x + w - 16 - goldTotalW;
    const goldCY = y + 22;
    ctx.fillStyle = '#DAA520';
    ctx.beginPath();
    ctx.arc(goldX + goldIconR, goldCY, goldIconR, 0, Math.PI * 2);
    ctx.fill();
    drawPixelText(ctx, goldStr, goldX + goldIconR * 2 + 4, goldCY - 4, '#DAA520', 2);

    // --- Equipment grid ---
    const equipStartX = x + Math.floor((w - (EQUIP_COLS * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP)) / 2);
    const equipStartY = y + 44;

    for (let i = 0; i < EQUIP_SLOTS.length; i++) {
      const col = i % EQUIP_COLS;
      const row = Math.floor(i / EQUIP_COLS);
      const sx = equipStartX + col * (SLOT_SIZE + SLOT_GAP);
      const sy = equipStartY + row * (SLOT_SIZE + SLOT_GAP);

      // Cursor highlight
      if (this.cursor.section === 'equipment' && this.cursor.index === i) {
        ctx.fillStyle = 'rgba(232, 200, 74, 0.3)';
        ctx.fillRect(sx - 1, sy - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
        ctx.strokeStyle = '#e8c84a';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 1, sy - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
      }

      _drawSlot(ctx, sx, sy, SLOT_SIZE, EQUIP_LABELS[i]);

      const slot = EQUIP_SLOTS[i];
      const entity = gameState.entityRegistry.getEquipped(slot);
      if (entity) {
        const color = EQUIP_COLORS[slot] ?? '#888';
        ctx.fillStyle = color;
        ctx.fillRect(sx + 4, sy + 4, SLOT_SIZE - 8, SLOT_SIZE - 8);
        const label = _getItemShortLabel(entity.itemId);
        drawPixelText(ctx, label, sx + 9, sy + 9, '#000', 2);
      }
    }

    // --- Separator ---
    const sepY = equipStartY + 2 * (SLOT_SIZE + SLOT_GAP) + 6;
    ctx.strokeStyle = HUD_COLORS.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 16, sepY);
    ctx.lineTo(x + w - 16, sepY);
    ctx.stroke();

    // --- Backpack grid ---
    const bpStartX = x + Math.floor((w - (BACKPACK_COLS * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP)) / 2);
    const bpStartY = sepY + 10;

    for (let i = 0; i < 12; i++) {
      const col = i % BACKPACK_COLS;
      const row = Math.floor(i / BACKPACK_COLS);
      const sx = bpStartX + col * (SLOT_SIZE + SLOT_GAP);
      const sy = bpStartY + row * (SLOT_SIZE + SLOT_GAP);

      // Cursor highlight
      if (this.cursor.section === 'backpack' && this.cursor.index === i) {
        ctx.fillStyle = 'rgba(232, 200, 74, 0.3)';
        ctx.fillRect(sx - 1, sy - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
        ctx.strokeStyle = '#e8c84a';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 1, sy - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
      }

      _drawSlot(ctx, sx, sy, SLOT_SIZE);

      const entity = _getBackpackEntityAt(i, gameState);
      if (entity) {
        let color = '#888';
        if (itemDatabase.isLoaded()) {
          const def = itemDatabase.getItem(entity.itemId);
          if (def?.type === 'consumable') {
            color = CONSUMABLE_COLORS[def.subtype as string] ?? '#888';
          } else if (def?.type === 'weapon') {
            color = EQUIP_COLORS['weapon'] ?? '#888';
          } else if (def?.type === 'armor') {
            color = EQUIP_COLORS[def.subtype as EquipSlot] ?? '#888';
          } else if (def?.type === 'accessory') {
            color = EQUIP_COLORS[def.subtype as EquipSlot] ?? '#DAA520';
          }
        }
        ctx.fillStyle = color;
        ctx.fillRect(sx + 4, sy + 4, SLOT_SIZE - 8, SLOT_SIZE - 8);
        const label = _getItemShortLabel(entity.itemId);
        drawPixelText(ctx, label, sx + 9, sy + 9, '#000', 2);
      }
    }

    // --- Item name tooltip ---
    const hoveredEntity = _getCursorEntity(this.cursor, gameState);
    if (hoveredEntity && itemDatabase.isLoaded()) {
      const def = itemDatabase.getItem(hoveredEntity.itemId);
      if (def) {
        const nameY = bpStartY + 3 * (SLOT_SIZE + SLOT_GAP) + 8;
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = HUD_COLORS.textPrimary;
        ctx.fillText(def.name, x + Math.floor(w / 2), nameY);
      }
    }

    // --- Footer ---
    const footer = 'I CLOSE  ENTER EQUIP  D DROP';
    const footerW = measurePixelText(footer, 2);
    drawPixelText(
      ctx,
      footer,
      x + Math.floor((w - footerW) / 2),
      y + h - 18,
      HUD_COLORS.textDim,
      2,
    );
  }
}

// --- Module-level helpers ---

/**
 * Get the backpack entity occupying visual position `index` (0-11),
 * where index maps to the sorted backpack list by slot number.
 */
function _getBackpackEntityAt(index: number, gameState: GameState) {
  const items = gameState.entityRegistry.getBackpackItems();
  return items[index] ?? null;
}

function _getCursorEntity(cursor: CursorPos, gameState: GameState) {
  if (cursor.section === 'equipment') {
    const slot = EQUIP_SLOTS[cursor.index];
    return gameState.entityRegistry.getEquipped(slot) ?? null;
  }
  return _getBackpackEntityAt(cursor.index, gameState);
}

function _drawSlot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  label?: string,
): void {
  ctx.fillStyle = HUD_COLORS.slotBg;
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = HUD_COLORS.slotBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  if (label) {
    drawPixelText(ctx, label, x + 9, y + 9, HUD_COLORS.slotLabel, 2);
  }
}

function _getItemShortLabel(itemId: string): string {
  if (itemDatabase.isLoaded()) {
    const def = itemDatabase.getItem(itemId);
    if (def?.name) return def.name.charAt(0).toUpperCase();
  }
  return itemId.charAt(0).toUpperCase();
}
