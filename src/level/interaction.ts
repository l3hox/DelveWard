import type { PlayerState } from '../core/grid';
import { getFacingCell } from '../core/grid';
import type { GameState } from '../core/gameState';

export interface InteractionResult {
  type: 'door_opened' | 'door_closed' | 'door_unlocked' | 'door_locked' | 'lever_activated' | 'sconce_taken' | 'nothing';
  message?: string;
  targetDoor?: string; // "col,row" of affected door (for mesh updates)
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

  const cell = grid[row][col];

  // Door interaction
  if (cell === 'D') {
    const door = gameState.getDoor(col, row);
    if (!door) return { type: 'nothing' }; // no door entity = always open, nothing to interact with

    if (door.state === 'open') {
      if (gameState.closeDoor(col, row)) {
        return { type: 'door_closed', message: 'Door closed.' };
      }
      return { type: 'nothing' }; // mechanical door, can't close manually
    }

    if (door.state === 'locked') {
      // Try to unlock
      if (gameState.unlockDoor(col, row)) {
        // After unlocking, also open it immediately
        gameState.openDoor(col, row);
        return { type: 'door_unlocked', message: 'Door unlocked and opened.' };
      }
      return { type: 'door_locked', message: 'This door is locked.' };
    }

    if (door.state === 'closed') {
      if (door.mechanical) {
        return { type: 'nothing', message: 'This door is operated by a mechanism.' };
      }
      if (gameState.openDoor(col, row)) {
        return { type: 'door_opened', message: 'Door opened.' };
      }
    }
  }

  // Lever interaction — player stands on lever cell, faces the wall
  const playerCell = grid[playerState.row]?.[playerState.col];
  if (playerCell === 'O') {
    const lever = gameState.getLever(playerState.col, playerState.row);
    if (lever && lever.wall === playerState.facing) {
      const targetDoor = gameState.activateLever(playerState.col, playerState.row);
      if (targetDoor) {
        return { type: 'lever_activated', message: 'Lever pulled.', targetDoor };
      }
    }
  }

  // Sconce interaction — player stands on sconce cell, faces wall with sconce
  const sconce = gameState.getSconce(playerState.col, playerState.row);
  if (sconce && sconce.lit && sconce.wall === playerState.facing) {
    if (gameState.takeSconceTorch(playerState.col, playerState.row)) {
      return { type: 'sconce_taken', message: 'Torch taken. Fuel replenished.' };
    }
  }

  return { type: 'nothing' };
}
