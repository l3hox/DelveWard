import { MINIMAP } from './hudLayout';
import { HUD_COLORS } from './hudColors';
import { FACING_DELTA, type Facing } from '../core/grid';

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  grid: string[],
  exploredCells: Set<string>,
  playerCol: number,
  playerRow: number,
  facing: Facing,
): void {
  const { x, y, w, h, cellSize } = MINIMAP;

  // Background
  ctx.fillStyle = HUD_COLORS.minimapBg;
  ctx.fillRect(x, y, w, h);

  // Calculate visible area centered on player
  const visibleCols = Math.floor(w / cellSize);
  const visibleRows = Math.floor(h / cellSize);
  const startCol = playerCol - Math.floor(visibleCols / 2);
  const startRow = playerRow - Math.floor(visibleRows / 2);

  // Draw explored cells
  for (let vy = 0; vy < visibleRows; vy++) {
    for (let vx = 0; vx < visibleCols; vx++) {
      const gc = startCol + vx;
      const gr = startRow + vy;
      const key = `${gc},${gr}`;

      if (!exploredCells.has(key)) continue;
      if (gr < 0 || gr >= grid.length || gc < 0 || gc >= grid[0].length) continue;

      const cell = grid[gr][gc];
      const px = x + vx * cellSize;
      const py = y + vy * cellSize;

      if (cell === '#') {
        ctx.fillStyle = HUD_COLORS.minimapWall;
      } else if (cell === 'D') {
        ctx.fillStyle = HUD_COLORS.minimapDoor;
      } else if (cell === 'S' || cell === 'U') {
        ctx.fillStyle = HUD_COLORS.minimapStairs;
      } else {
        ctx.fillStyle = HUD_COLORS.minimapFloor;
      }
      ctx.fillRect(px, py, cellSize, cellSize);
    }
  }

  // Player dot
  const playerPx = x + (playerCol - startCol) * cellSize + cellSize / 2;
  const playerPy = y + (playerRow - startRow) * cellSize + cellSize / 2;

  ctx.fillStyle = HUD_COLORS.minimapPlayer;
  ctx.fillRect(playerPx - 1, playerPy - 1, 3, 3);

  // Facing line
  const [dc, dr] = FACING_DELTA[facing];
  ctx.strokeStyle = HUD_COLORS.minimapPlayer;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(playerPx, playerPy);
  ctx.lineTo(playerPx + dc * cellSize, playerPy + dr * cellSize);
  ctx.stroke();

  // Border
  ctx.strokeStyle = HUD_COLORS.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
