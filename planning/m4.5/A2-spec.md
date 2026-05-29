# Phase A2 — Invert `core/ → enemies/, npcs/` deps so `core/` compiles standalone

## Goal

Remove the four cross-layer imports in `src/core/gameState.ts` (lines 5–8) and the single cross-layer import in `src/core/assetCheck.ts` (line 4). Introduce a registry-injection seam in a new `src/core/typeRegistries.ts`. Move `EnemyInstance` and `EnemyAIState` into `src/core/entities.ts`. After this phase, `core/` must compile without any `../enemies/` or `../npcs/` imports.

---

## Scope: touch

```
src/core/entities.ts
src/core/typeRegistries.ts
src/core/gameState.ts
src/core/assetCheck.ts
src/enemies/enemyTypes.ts
src/npcs/npcDatabase.ts
```

---

## Scope: don't touch

```
src/main.ts
src/hud/minimapRenderer.ts
src/enemies/enemyDatabase.ts
src/level/levelLoader.ts
src/core/gameState.test.ts
```

---

## Before

### `src/core/gameState.ts` — lines 1–19 (cross-layer imports, lines 5–8)

```typescript
import type { Entity, LayerDef } from './types';
import type { Facing } from './grid';
import type { DropsOverride } from './lootTable';
import { FACING_DELTA } from './grid';
import { createEnemyInstance } from '../enemies/enemyTypes';
import { enemyDatabase } from '../enemies/enemyDatabase';
import { npcDatabase } from '../npcs/npcDatabase';
import type { EnemyInstance } from '../enemies/enemyTypes';
import { EntityRegistry } from './entities';
import type { ItemEntity, ItemLocation } from './entities';
import { itemDatabase } from './itemDatabase';
import type { ItemDef } from './itemDatabase';
export type { EquipSlot } from './entities';
import type { EquipSlot } from './entities';
import { SignalManager } from './signalManager';
import type { GateMode, GateType, SignalMode } from './signalManager';
import type { StatusEffect } from './statusEffects';
import { removeEffectsByType } from './statusEffects';
```

### `src/core/gameState.ts` — lines 968–977 (npcDatabase usage)

```typescript
  private _parseNpcEntity(e: Entity, grid?: string[]): boolean {
    if (e.type === 'npc') {
      const npcId = e.npcId as string;
      if (npcDatabase.getNpc(npcId)) {
        this.npcs.set(doorKey(e.col, e.row), {
          id: e.id as string | undefined,
          col: e.col,
          row: e.row,
          npcId,
        });
      }
      return true;
```

### `src/core/gameState.ts` — lines 1031–1040 (enemyDatabase + createEnemyInstance usage)

```typescript
  private _parseItemEntity(e: Entity): boolean {
    if (e.type === 'enemy') {
      const enemyType = e.enemyType as string;
      if (enemyDatabase.getEnemy(enemyType)) {
        const instance = createEnemyInstance(e.col, e.row, enemyType);
        if (e.drops) {
          instance.drops = e.drops as DropsOverride;
        }
        this.enemies.set(doorKey(e.col, e.row), instance);
      }
      return true;
```

### `src/core/gameState.ts` — lines 2196–2209 (enemyDatabase.getBehavior usage)

```typescript
  damageEnemy(col: number, row: number, amount: number): boolean {
    const enemy = this.getEnemy(col, row);
    if (!enemy) return false;
    enemy.hp -= amount;
    // Pause regen on hit
    if (enemy.regenPauseTimer !== undefined) {
      enemy.regenPauseTimer = (enemyDatabase.getBehavior(enemy.type, 'regen')?.params.pauseOnDamage as number | undefined) ?? 3;
    }
    if (enemy.hp <= 0) {
      this.enemies.delete(doorKey(col, row));
      return true; // killed
    }
    return false;
  }
```

### `src/core/assetCheck.ts` — full file (cross-layer import, line 4)

```typescript
// Startup asset checker — verifies all referenced PNG files exist.

import { itemDatabase } from './itemDatabase';
import { enemyDatabase } from '../enemies/enemyDatabase';

/**
 * Check all referenced PNG assets exist on the server.
 * Logs console.error for each missing file. Call after itemDatabase.load().
 */
export async function checkAssets(): Promise<void> {
  const paths = new Set<string>();

  // Enemy sprites
  for (const def of enemyDatabase.getAllEnemies()) {
    paths.add(def.sprite.path);
  }
```

### `src/enemies/enemyTypes.ts` — lines 1–29 (EnemyAIState + EnemyInstance definitions to be moved)

```typescript
// Enemy type definitions and registry — pure data, no Three.js

import type { DropsOverride } from '../core/lootTable';
import { enemyDatabase } from './enemyDatabase';
import type { StatusEffect } from '../core/statusEffects';

export type { EnemyDef } from './enemyDatabase';

export type EnemyAIState = 'idle' | 'chase' | 'attack' | 'flee';

export interface EnemyInstance {
  col: number;
  row: number;
  type: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  aggroRange: number;
  moveInterval: number;
  blocksMovement: boolean;
  aiState: EnemyAIState;
  moveTimer: number;      // accumulates delta, resets on action
  regenTimer?: number;       // accumulates time for HP regen
  regenPauseTimer?: number;  // remaining seconds of regen pause after taking damage
  drops?: DropsOverride;  // per-entity override from dungeon JSON
  statusEffects: StatusEffect[];
  spawnerId?: string;
}
```

### `src/npcs/npcDatabase.ts` — line 66 (registration point, end of file)

```typescript
export const npcDatabase = new NpcDatabase();
```

### `src/core/gameState.test.ts` — lines 1–25 (existing vi.mock seam)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GameState } from './gameState';
import type { Entity, LayerDef } from './types';

/** Wrap entities into a single-layer LayerDef array for loadNewLevel. */
function asLayer(entities: Entity[]): LayerDef[] {
  return [{ id: '0', grid: ['...', '...', '...'], entities }];
}

vi.mock('./itemDatabase', () => ({
  itemDatabase: {
    isLoaded: () => true,
    getItem: (id: string) => {
      const items: Record<string, object> = {
        hp1:   { id: 'hp1',   name: 'Potion', type: 'consumable', subtype: 'health_potion', stats: { hp: 5 },  requirements: {}, effect: {} },
        oil1:  { id: 'oil1',  name: 'Oil',    type: 'consumable', subtype: 'torch_oil',     stats: {},         requirements: {}, effect: { torchFuel: 30 } },
        food1: { id: 'food1', name: 'Rations', type: 'consumable', subtype: 'food',          stats: {},         requirements: {}, effect: { restoreHunger: 30 }, stackable: true, stackMax: 20 },
        sword: { id: 'sword', name: 'Sword',  type: 'weapon',     subtype: 'sword',          stats: { atk: 2 }, requirements: {}, modifiers: [] },
        ring:  { id: 'ring',  name: 'Ring',   type: 'accessory',  subtype: 'ring',           stats: { atk: 1, def: 1 }, requirements: {}, modifiers: [] },
      };
      return (items as Record<string, unknown>)[id];
    },
    getItemsByType: () => [],
  },
}));
```

---

## After

### `src/core/entities.ts` — new exports appended after the `EntityRegistry` class

```typescript
export type EnemyAIState = 'idle' | 'chase' | 'attack' | 'flee';

export interface EnemyInstance {
    col: number;
    row: number;
    type: string;
    hp: number;
    maxHp: number;
    atk: number;
    def: number;
    aggroRange: number;
    moveInterval: number;
    blocksMovement: boolean;
    aiState: EnemyAIState;
    moveTimer: number;
    regenTimer?: number;
    regenPauseTimer?: number;
    drops?: DropsOverride;
    statusEffects: StatusEffect[];
    spawnerId?: string;
}
```

### `src/core/typeRegistries.ts` — full public API

```typescript
export interface IEnemyRegistry {
    createEnemy(col: number, row: number, type: string): EnemyInstance | undefined;
    getEnemyBehavior(type: string, behaviorName: string): { params: Record<string, unknown> } | undefined;
    getAllEnemySpritePaths(): string[];
}

export interface INpcRegistry {
    hasNpc(id: string): boolean;
}

export function registerEnemyRegistry(registry: IEnemyRegistry): void;
export function registerNpcRegistry(registry: INpcRegistry): void;
export function getEnemyRegistry(): IEnemyRegistry;
export function getNpcRegistry(): INpcRegistry;
```

Default state (before registration): `getEnemyRegistry().createEnemy(...)` returns `undefined`; `getNpcRegistry().hasNpc(...)` returns `false`; `getEnemyRegistry().getAllEnemySpritePaths()` returns `[]`.

### `src/enemies/enemyTypes.ts` — re-exports canonical types from `core/`

```typescript
export type { EnemyAIState, EnemyInstance } from '../core/entities';
```

The `EnemyAIState` type definition and the `EnemyInstance` interface definition are removed from this file; they are replaced by the re-export above.

### `src/core/gameState.ts` — imports after change

Lines 5–8 (the four cross-layer imports) are removed. Replacements added among the `core/` imports:

```typescript
import type { EnemyInstance } from './entities';
import { getEnemyRegistry, getNpcRegistry } from './typeRegistries';
```

### `src/core/assetCheck.ts` — imports after change

```typescript
import { itemDatabase } from './itemDatabase';
import { getEnemyRegistry } from './typeRegistries';
```

---

## Steps

1. **Append `EnemyAIState` and `EnemyInstance` to `src/core/entities.ts`.**
   After the closing brace of the `EntityRegistry` class (line 232), add:
   - `import type { DropsOverride } from './lootTable';`
   - `import type { StatusEffect } from './statusEffects';`
   - `export type EnemyAIState` and `export interface EnemyInstance` as specified in the After section.
   Verify: `npx tsc --noEmit` passes (or no new errors introduced beyond pre-existing ones).

2. **Create `src/core/typeRegistries.ts`** with `IEnemyRegistry`, `INpcRegistry`, noop defaults, module-level `let` variables, and the four exported functions (`registerEnemyRegistry`, `registerNpcRegistry`, `getEnemyRegistry`, `getNpcRegistry`).
   Verify: file compiles cleanly in isolation (no `../enemies/` or `../npcs/` imports).

3. **Update `src/enemies/enemyTypes.ts`: remove the moved definitions.**
   - Remove `import type { DropsOverride } from '../core/lootTable';`
   - Remove `import type { StatusEffect } from '../core/statusEffects';`
   - Remove the `EnemyAIState` type definition (lines 9–9).
   - Remove the `EnemyInstance` interface definition (lines 11–29).
   - Add `export type { EnemyAIState, EnemyInstance } from '../core/entities';` in place of the removed definitions. Use the re-export form only — do NOT add a separate `import type { EnemyInstance }` line (the re-export is self-contained and a bare named import would be redundant, causing lint noise under strict import rules).
   Verify: all existing callers of `EnemyInstance` from `'../enemies/enemyTypes'` or `'./enemies/enemyTypes'` continue to resolve via the re-export.

4. **Add the enemy registry self-registration to `src/enemies/enemyTypes.ts`.**
   - Add `import { registerEnemyRegistry } from '../core/typeRegistries';` at the top of the file, with the other `import` statements.
   - After the `createEnemyInstance` function body (the last declaration in the file), add the registration call:
   ```typescript
   registerEnemyRegistry({
       createEnemy: (col, row, type) => {
           if (!enemyDatabase.getEnemy(type)) return undefined;
           return createEnemyInstance(col, row, type);
       },
       getEnemyBehavior: (type, name) => enemyDatabase.getBehavior(type, name),
       getAllEnemySpritePaths: () => enemyDatabase.getAllEnemies().map(e => e.sprite.path),
   });
   ```
   Note: registration goes in `enemyTypes.ts`, not `enemyDatabase.ts`, to avoid the cycle `enemyDatabase → enemyTypes → enemyDatabase`. The `import` statement goes at the top; only the call site goes at the bottom.

5. **Add the NPC registry self-registration to `src/npcs/npcDatabase.ts`.**
   - Add `import { registerNpcRegistry } from '../core/typeRegistries';` at the top of the file, with the other `import` statements.
   - After `export const npcDatabase = new NpcDatabase();` (line 66), add the registration call:
   ```typescript
   registerNpcRegistry({
       hasNpc: (id) => npcDatabase.getNpc(id) !== undefined,
   });
   ```

6. **Update `src/core/gameState.ts` — imports.**
   - Remove lines 5–8 (the four cross-layer imports: `createEnemyInstance`, `enemyDatabase`, `npcDatabase`, `EnemyInstance`).
   - Add among the `core/` imports:
     ```typescript
     import type { EnemyInstance } from './entities';
     import { getEnemyRegistry, getNpcRegistry } from './typeRegistries';
     ```

7. **Update `src/core/gameState.ts` — `_parseNpcEntity` (around line 970).**
   Replace `if (npcDatabase.getNpc(npcId))` with `if (getNpcRegistry().hasNpc(npcId))`.

8. **Update `src/core/gameState.ts` — `_parseItemEntity` (around lines 1033–1038).**
   Replace the two-line guard-and-create pattern:
   ```typescript
   if (enemyDatabase.getEnemy(enemyType)) {
       const instance = createEnemyInstance(e.col, e.row, enemyType);
   ```
   with:
   ```typescript
   const instance = getEnemyRegistry().createEnemy(e.col, e.row, enemyType);
   if (instance) {
   ```

9. **Update `src/core/gameState.ts` — `damageEnemy` (around line 2202).**
   Replace `enemyDatabase.getBehavior(enemy.type, 'regen')` with `getEnemyRegistry().getEnemyBehavior(enemy.type, 'regen')`.

10. **Update `src/core/assetCheck.ts`.**
    - Remove `import { enemyDatabase } from '../enemies/enemyDatabase';`
    - Add `import { getEnemyRegistry } from './typeRegistries';`
    - Replace:
      ```typescript
      for (const def of enemyDatabase.getAllEnemies()) {
          paths.add(def.sprite.path);
      }
      ```
      with:
      ```typescript
      for (const spritePath of getEnemyRegistry().getAllEnemySpritePaths()) {
          paths.add(spritePath);
      }
      ```

11. **Verify no remaining `../enemies/` or `../npcs/` imports exist in `src/core/`.**
    Run:
    ```
    grep -r '\.\./enemies/\|\.\./npcs/' src/core/
    ```
    Expected: no output.

---

## Accept

- `npx vitest run` — all tests pass, including `src/core/gameState.test.ts`
- `npx tsc --noEmit` — zero type errors
- `npm run build` — build succeeds
- `node planning/m4.5/scripts/smoke.mjs` — smoke assertions pass
- `grep -r '\.\./enemies/\|\.\./npcs/' src/core/` — returns no output

---

## Budget

- New files: 1 (`src/core/typeRegistries.ts`)
- Net lines added: approximately +60 (new file ~45 lines, additions to `entities.ts` ~20, registration additions ~10, removals in `gameState.ts` ~10, removals in `enemyTypes.ts` ~25)
- Files touched: 6

---

## DO NOT

- Do not put the `registerEnemyRegistry` call in `src/enemies/enemyDatabase.ts` — this creates the cycle `enemyDatabase → enemyTypes → enemyDatabase`.
- Do not modify `NpcDatabase` class methods — only append the registration call after `export const npcDatabase`.
- Do not remove `createEnemyInstance` from `src/enemies/enemyTypes.ts` — it is still used internally by the registry adapter in that same file.
- Do not change the re-export in `src/enemies/enemyTypes.ts` to a direct import-only — callers in `src/main.ts` and `src/hud/minimapRenderer.ts` import `EnemyInstance` from `'../enemies/enemyTypes'` and must continue to resolve without modification.
- Do not add `vi.mock` calls to `src/core/gameState.test.ts` — the noop defaults in `typeRegistries.ts` reproduce the prior silent-skip behavior for enemy and NPC entities.
- Do not move `EnemyDef` or `createEnemyInstance` — they stay in `src/enemies/`.
- Do not create additional intermediate files beyond `src/core/typeRegistries.ts`.

---

## Rollback signal

Abort and revert if any of the following occur:

- `npx tsc --noEmit` reports errors in files outside the touch list after any step.
- `grep -r '\.\./enemies/\|\.\./npcs/' src/core/` still returns output after step 10.
- `npx vitest run` fails on `src/core/gameState.test.ts` with an error that cannot be fixed without modifying a file outside the touch list.
- The build produces a bundle where `IEnemyRegistry` or `INpcRegistry` is missing from the type graph (visible as a `Property 'createEnemy' does not exist` error).
<!-- sealed: 2026-05-29T10:44:26Z -->
