import type { PlayerState } from '../core/grid';
import { getFacingCell, FACING_DELTA, isWalkable } from '../core/grid';
import type { GameState } from '../core/gameState';

export interface InteractionResult {
  type: 'door_opened' | 'door_closed' | 'door_blocked' | 'door_locked' | 'lever_activated' | 'sconce_taken' | 'block_pushed' | 'chest_opened' | 'chest_locked' | 'sign_read' | 'nothing';
  message?: string;
  targets?: string[]; // entity IDs of affected doors (for mesh updates)
  targetCol?: number;
  targetRow?: number;
}

export function interact(
  playerState: PlayerState,
  grid: string[],
  gameState: GameState,
): InteractionResult {
  const { col, row } = getFacingCell(playerState);

  // Check bounds
  if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) {
    return { type: 'nothing' };
  }

  // Door interaction — entity-based lookup (no special grid char)
  const door = gameState.getDoor(col, row);
  if (door) {
    if (door.state === 'open') {
      if (gameState.isBlockedByEnemy(col, row)) {
        return { type: 'door_blocked', message: 'Something is blocking the door.' };
      }
      if (gameState.closeDoor(col, row)) {
        return { type: 'door_closed', message: 'Door closed.' };
      }
      return { type: 'nothing' }; // mechanical door, can't close manually
    }

    if (door.state === 'closed') {
      if (door.mechanical) {
        return { type: 'nothing', message: 'This door is operated by a mechanism.' };
      }
      if (door.keyId && !gameState.hasKey(door.keyId)) {
        return { type: 'door_locked', message: 'This door is locked.' };
      }
      if (gameState.openDoor(col, row)) {
        return { type: 'door_opened', message: 'Door opened.' };
      }
    }
  }

  // Lever interaction — player stands on lever cell, faces the wall
  const lever = gameState.getLever(playerState.col, playerState.row);
  if (lever && lever.wall === playerState.facing) {
    const targets = gameState.activateLever(playerState.col, playerState.row);
    if (targets) {
      return { type: 'lever_activated', message: 'Lever pulled.', targets };
    }
  }

  // Sconce interaction — player stands on sconce cell, faces wall with sconce
  const sconce = gameState.getSconce(playerState.col, playerState.row);
  if (sconce && sconce.lit && sconce.wall === playerState.facing) {
    if (gameState.takeSconceTorch(playerState.col, playerState.row)) {
      return { type: 'sconce_taken', message: 'Torch taken. Fuel replenished.' };
    }
  }

  // Block push — player faces a cell containing a pushable block
  const block = gameState.getBlock(col, row);
  if (block) {
    const [dc, dr] = FACING_DELTA[playerState.facing];
    const destCol = col + dc;
    const destRow = row + dr;
    if (
      isWalkable(grid, destCol, destRow, undefined, gameState.isDoorOpen.bind(gameState)) &&
      !gameState.isBlockedByEnemy(destCol, destRow) &&
      !gameState.isBlockAt(destCol, destRow) &&
      !(destCol === playerState.col && destRow === playerState.row)
    ) {
      gameState.pushBlock(col, row, destCol, destRow);
      return { type: 'block_pushed', targetCol: destCol, targetRow: destRow };
    }
    return { type: 'nothing' };
  }

  // Chest interaction
  const chest = gameState.getChest(col, row);
  if (chest) {
    const result = gameState.openChest(col, row);
    if (result.locked) {
      return { type: 'chest_locked', message: 'This chest is locked.' };
    }
    if (result.opened) {
      return { type: 'chest_opened', targetCol: col, targetRow: row, message: 'Chest opened.' };
    }
    return { type: 'nothing' };
  }

  // Sign interaction — player stands on sign cell and faces the sign's wall
  const sign = gameState.getSignOnWall(playerState.col, playerState.row, playerState.facing);
  if (sign) {
    return { type: 'sign_read', message: sign.text };
  }

  return { type: 'nothing' };
}
