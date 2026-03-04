import type { PlayerState } from './grid';
import { getFacingCell } from './grid';
import type { GameState } from './gameState';

export interface InteractionResult {
  type: 'door_opened' | 'door_unlocked' | 'door_locked' | 'lever_activated' | 'nothing';
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
      return { type: 'nothing' }; // already open
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
      if (gameState.openDoor(col, row)) {
        return { type: 'door_opened', message: 'Door opened.' };
      }
    }
  }

  // Lever interaction (on 'O' cells)
  if (cell === 'O') {
    const targetDoor = gameState.activateLever(col, row);
    if (targetDoor) {
      return { type: 'lever_activated', message: 'Lever pulled.', targetDoor };
    }
  }

  return { type: 'nothing' };
}
