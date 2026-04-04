// lootSpawner.ts — shared helper for rolling loot and spawning item meshes.
// Encapsulates the rollLoot → gold → createItem → mesh pattern that occurs
// whenever an enemy dies, a chest opens, a barrel explodes, or a wall breaks.

import { rollLoot } from '../core/lootTable';
import type { DropsOverride } from '../core/lootTable';
import { itemDatabase } from '../core/itemDatabase';
import { addSingleItemMesh, addSingleConsumableMesh } from '../rendering/groundItemRenderer';
import type { GameState } from '../core/gameState';

interface LevelSceneLootSlice {
  itemMeshes: { group: import('three').Group; meshMap: Map<string, import('three').Mesh> };
  consumableMeshes: { group: import('three').Group; meshMap: Map<string, import('three').Mesh> };
}

/**
 * Roll loot for a source (enemy, chest, barrel, wall) and spawn world-item
 * meshes at (col, row) on the active layer.
 *
 * @param enemyType  Enemy type key for the loot table lookup. Pass '' for
 *                   non-enemy sources (chests, barrels, breakable walls).
 * @param drops      Optional DropsOverride (guaranteed items, extra drops,
 *                   suppressTable). May be undefined.
 * @param col        Grid column of the spawn position.
 * @param row        Grid row of the spawn position.
 * @param gameState  Live GameState — gold and entityRegistry are mutated.
 * @param ls         Slice of LevelScene containing the item/consumable mesh groups.
 */
export function spawnLoot(
  enemyType: string,
  drops: DropsOverride | undefined,
  col: number,
  row: number,
  gameState: GameState,
  ls: LevelSceneLootSlice,
): void {
  const lootResult = rollLoot(enemyType, drops);
  gameState.gold += lootResult.gold;

  for (const drop of lootResult.items) {
    const entity = gameState.entityRegistry.createItem(
      drop.itemId,
      drop.quality,
      { kind: 'world', levelId: gameState.currentLevelId, col, row, layerIndex: gameState.activeLayerIndex },
      drop.modifiers,
    );

    const itemDef = itemDatabase.getItem(drop.itemId);
    if (itemDef && itemDef.type === 'consumable') {
      addSingleConsumableMesh(entity, ls.consumableMeshes.group, ls.consumableMeshes.meshMap, gameState.activeLayerIndex);
    } else if (itemDef) {
      addSingleItemMesh(entity, gameState, ls.itemMeshes.group, ls.itemMeshes.meshMap, gameState.activeLayerIndex);
    }
  }
}
