import { INVENTORY } from './hudLayout';
import { HUD_COLORS } from './hudColors';
import { drawPixelText } from './hudFont';
import { PLAYER_ATTACK_COOLDOWN } from '../core/combat';

const SLOT_SIZE = 24;
const SLOT_GAP = 4;
const EQUIP_LABELS = ['W', 'A', 'R']; // Weapon, Armor, Ring

export function drawInventoryPanel(
  ctx: CanvasRenderingContext2D,
  keyCount: number,
  attackCooldown: number = 0,
): void {
  const { x, y, w, h } = INVENTORY;

  // Background
  ctx.fillStyle = HUD_COLORS.panelBg;
  ctx.fillRect(x, y, w, h);

  // Key count (top row)
  drawKeyIcon(ctx, x + 6, y + 6, HUD_COLORS.keyIcon);
  drawPixelText(ctx, `x${keyCount}`, x + 20, y + 8, HUD_COLORS.textPrimary, 2);

  // Equipment slots (3 across, below key count)
  const equipY = y + 28;
  for (let i = 0; i < 3; i++) {
    const sx = x + 6 + i * (SLOT_SIZE + SLOT_GAP);
    drawSlot(ctx, sx, equipY, EQUIP_LABELS[i]);
  }

  // Weapon cooldown overlay on W slot
  if (attackCooldown > 0) {
    const cooldownRatio = attackCooldown / PLAYER_ATTACK_COOLDOWN;
    const wx = x + 6;
    const fillH = Math.ceil(SLOT_SIZE * cooldownRatio);
    ctx.fillStyle = 'rgba(200, 60, 60, 0.45)';
    ctx.fillRect(wx, equipY + (SLOT_SIZE - fillH), SLOT_SIZE, fillH);
  }

  // Backpack slots (2 rows of 4)
  const backpackY = equipY + SLOT_SIZE + SLOT_GAP + 4;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const sx = x + 6 + col * (SLOT_SIZE + SLOT_GAP);
      const sy = backpackY + row * (SLOT_SIZE + SLOT_GAP);
      drawSlot(ctx, sx, sy);
    }
  }

  // Border
  ctx.strokeStyle = HUD_COLORS.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
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
