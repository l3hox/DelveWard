# Phase 3 — Remaining Steps

Steps 1–6 are done. 132 tests pass. What's left:

---

## Step 7: Test level + entity validation

### Create `public/levels/level7.json` — "The Locked Vault"

A mini puzzle level demonstrating all Phase 3 features:
- Closed doors (Space to open)
- A locked door requiring a key
- A key on the floor (auto-pickup on step)
- A lever on an `'O'` cell (Space to pull, toggles a linked door)
- A pressure plate on a `'.'` cell (auto-triggers on step, opens a linked door)

Design the layout so the player must: find the key → unlock the locked door → pull a lever → step on a plate → reach the exit. Keep it small (10x10 or so).

Entity examples for the JSON:
```json
{ "col": 5, "row": 3, "type": "door", "state": "closed" }
{ "col": 7, "row": 2, "type": "door", "state": "locked", "keyId": "gold_key" }
{ "col": 2, "row": 1, "type": "key", "keyId": "gold_key" }
{ "col": 3, "row": 4, "type": "lever", "targetDoor": "5,3" }
{ "col": 6, "row": 7, "type": "pressure_plate", "targetDoor": "7,5" }
```

### Add entity validation to `src/levelLoader.ts`

In `validateLevel()`, after the existing entity array check, validate each entity:

- **All entities**: must have numeric `col`/`row` within grid bounds
- **door entities**: `state` must be `'open'`/`'closed'`/`'locked'`; if `state === 'locked'`, `keyId` must be a string; cell at position must be `'D'`
- **key entities**: must have string `keyId`; cell at position must be walkable
- **lever entities**: must have string `targetDoor` in `"col,row"` format; target cell must be `'D'`; cell at position should be `'O'`
- **pressure_plate entities**: must have string `targetDoor` in `"col,row"` format; target cell must be `'D'`; cell at position must be walkable

### Add tests to `src/levelLoader.test.ts`

~10 tests:
- Valid door entity passes
- Door entity with invalid state rejected
- Locked door without keyId rejected
- Door entity on non-D cell rejected
- Valid key entity passes
- Key entity without keyId rejected
- Valid lever entity passes
- Lever with invalid targetDoor rejected
- Valid pressure_plate entity passes
- Entity with out-of-bounds col/row rejected

### Update `src/main.ts`

Change `loadLevel('/levels/level6.json')` to `loadLevel('/levels/level7.json')` to default to the showcase level.

---

## Final verification

- `npx vitest run` — all tests pass
- `npx tsc --noEmit` — TypeScript compiles clean
- `npm run dev` → load level7 in browser, verify full loop:
  - Walk to key, auto-pickup
  - Walk to locked door, Space → "locked" → walk back to key area → Space again → unlocks
  - Pull lever on O cell → linked door opens
  - Step on pressure plate → linked door opens
  - Walk through all opened doors
- Update `PROGRESS.md`: move Phase 3 items to done, update session log
- Update `LOG.md`: log Phase 3 design decisions and code changes
- Delete this file (`TODONEXT.md`)
- Commit to main

---

## Files changed so far in Phase 3

| New files | Purpose |
|-----------|---------|
| `src/gameState.ts` | Runtime state: doors, keys, levers, plates, inventory |
| `src/gameState.test.ts` | 33 tests for GameState |
| `src/interaction.ts` | Interaction dispatcher (Space key) |
| `src/interaction.test.ts` | 13 tests for interaction |
| `src/doorRenderer.ts` | Door mesh creation + visibility management |
| `src/keyRenderer.ts` | Key item floor meshes |

| Modified files | Changes |
|----------------|---------|
| `src/grid.ts` | `isDoorOpen` callback in `isWalkable` + `PlayerState`; `getFacingCell` helper |
| `src/grid.test.ts` | 10 new door-aware walkability + getFacingCell tests |
| `src/player.ts` | `isDoorOpen` callback, `getState()`, `setOnMove()` callback |
| `src/main.ts` | Wire GameState, interaction, door meshes, key meshes, pickup, plates, lever |
| `src/textures.ts` | Door + locked door texture generators |
