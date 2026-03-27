# DelveWard — Decision & Change Log

Each entry records what was decided or changed — design decisions, architecture changes, and significant code changes. Marked by date. Newest entries first.

---

## 2026-03-27 — M3 Phase F: Dungeon Objects + Editor

**Design**: 4 new entity types: fountain (one-shot HP heal), bookshelf (wall-mounted lore text via SignOverlay), altar (timed stat buff via new TempBuff system), barrel (breakable via combat, drops loot, blocks movement). All use simple 3D geometry per ADR-M3-06 — no billboards, no imported models.

**Architecture — TempBuff system**: New `TempBuff` interface (`stat`, `amount`, `remaining`) and `tempBuffs: TempBuff[]` on GameState. Same-stat refresh (replace, don't stack). Ticked in game loop alongside status effects. Factored into `getEffectiveStats()` — atk/def buffs add to final values, str/dex/vit/wis buffs add to effective attributes. Separate from StatusEffect system (which is for DoT/debuffs).

**Architecture — Barrel combat**: Barrels follow the breakable_wall damage pattern in `combat.ts` (attack key, not interact). Unlike breakable_wall, barrel destruction does NOT modify the grid (cell is already walkable) — just removes the entity from the Map and the mesh from the scene.

**Bug fix — multi-item loot mesh management**: When multiple items drop at the same cell (barrel loot, enemy kills, wall destruction), the mesh system now correctly: (1) keeps only the first item's mesh visible (matching pickup order), (2) after each pickup, removes the old mesh from the group + map and rebuilds for the next remaining item. Previously, meshMap overwrites caused orphaned meshes or mesh/pickup order mismatches.

---

## 2026-03-25 — M3 Phase E: Hunger System

**Design**: Simple survival hunger mechanic — hunger stat (0–100) drains 1 per 10 seconds of real unpaused game time. Starvation at hunger=0 deals 1 HP every 3 seconds. Rations consumable restores 30 hunger. All timers use accumulator pattern and pause during overlays.

**Architecture**: `hungerBar.ts` mirrors `torchIndicator.ts` exactly (same draw pattern: bg → bar bg → fill → icon → text% → border). HUD bottom row resized to fit 4 bars: HP(140) + Torch(100) + Hunger(80) + XP(120) = 464px. Hunger/starvation accumulators live in `main.ts` game loop alongside existing timers (attack cooldown, status effects). Both reset on load. Backward-compat: optional `hunger?`/`maxHunger?` in SaveData, `?? 100` fallback in both `restorePlayerState` and `applySaveData`.

**Data**: `rations` item added to `items.json` (food subtype, restoreHunger: 30). Gregor's stock re-includes rations (was removed in Phase D pending hunger system).

---

## 2026-03-24 — M3 Phase D: Trading System

**Design**: Buy/sell trading overlay triggered by `openShop` dialog effect. NPCs with `stock` arrays in `npcs.json` are merchants. Buy price = `ceil(value × markup)`, sell price = `floor(value × 0.5)`. Items with `value: 0` are not sellable. Merchant stock is a fixed list (items are not consumed on purchase — infinite supply).

**Architecture**: `TradingOverlay` follows existing overlay patterns (fixed position, z-index 500, capture-phase keydown, Escape to close). Two-column layout: shop stock (left) and player backpack (right). `_rebuildContent()` rebuilds both columns from live state after every buy/sell. The `onOpenShop` dialog hook closes the dialog overlay and opens the trading overlay — clean handoff with no overlapping overlays.

**Data fix**: Gregor's stock corrected — `health_potion` → `health_potion_small` (matching actual item ID), `rations` removed (hunger system is Phase E).

---

## 2026-03-24 — M3 Phase C/D Editor: Dialog Editor

**Architecture**: Dialog editor runs as a separate `editorMode` ('level' | 'dialog') on EditorApp, with its own state model (`DialogEditorState`), canvas (`DialogGraphCanvas`), and inspector (`DialogInspector`). Dialog state is fully decoupled from level state — no cross-contamination of undo stacks or dirty tracking.

**Sidecar layout files**: Node positions stored in `{npcId}.layout.json` alongside dialog JSON in `public/data/dialogs/`. Keeps runtime dialog files clean. Auto-layout via BFS when no sidecar exists (`DialogNodeLayout.ts`).

**API design**: Reuses the existing Vite editor API plugin pattern — 3 new routes (`/api/editor/dialogs/list`, `/load`, `/save`) with same CSRF validation. `validateDialogFilename()` allows `.layout.json` suffix. Route ordering avoids `/api/editor/load` intercepting dialog URLs.

**Inspector refresh strategy**: `onNodeChanged` calls `updateDialogStatus()` (canvas + dirty + error banner) without rebuilding the inspector DOM, preventing input focus loss during text editing. Full `refresh()` only on structural changes (add/remove node, undo/redo, type switch). Expandable sections track open/closed state in a `Set<string>` keyed by section identity, preserved across rebuilds.

**Toolbar mode switching**: Level-specific toolbar buttons are hidden in dialog mode (original display state saved and restored on exit to handle initially-hidden buttons like Save/Save As). Dialog mode shows Back, Add Node, and Save Dialog buttons.

**Dialog overlay keyboard navigation**: Added arrow key choice navigation with visual highlight, Enter to confirm, Escape always dismisses. `onDismiss` callback added for forced close without requiring a "Farewell" choice.

**Condition/effect default values**: When switching condition or effect type, default field values are set immediately (e.g. `questStage` → `stage: 'undiscovered'`, `hasItem` → first item from database). Prevents invisible mismatch between displayed dropdown value and serialized data.

---

## 2026-03-24 — M3 Phase C: Quest System

**Design**: Data-driven JSON quests (`public/data/quests/{questId}.json`) with dialog-driven progression. Objectives are not auto-evaluated — dialog trees gate completion via conditions (`hasItem`, `hasFlag`), and `advanceQuest` dialog effects trigger stage progression. Quest stage descriptions are purely for quest log display.

**Architecture**: `QuestManager` class (singleton) owns quest defs (fetched + cached) and runtime state (`Map<string, { status, stageIndex }>`). Reward application delegates to GameState APIs (`addXp`, `gold +=`, `entityRegistry.createItem`, `setFlag`). `installConditionEvaluator()` replaces the `questStage` stub in `dialogManager` via `setConditionEvaluator()` — a new hook that shadows default evaluators with custom ones, keeping the evaluator lookup extensible.

**Save/load threading**: Quest state added as optional `quests` field on `SaveData` (backward-compatible — old saves load with empty quest state). `saveSystem.ts` stays free of questManager dependency; `main.ts` bridges them.

**Single-stage quest design**: Each quest has 1 stage since dialog flow calls `advanceQuest` exactly once per quest (on turn-in). Rewards are on the single stage, applied before incrementing past it (which triggers completion). Multi-stage quests would require additional `advanceQuest` triggers (e.g. auto-advance on item pickup), which can be added later if needed.

**Quest log overlay**: DOM overlay following SaveLoadOverlay pattern. J key opens, J/Escape closes. Brown dungeon theme (#2a1a0a) with gold border. Active quests show name + current stage description + dimmed quest description. Completed quests show checkmark + dimmed name. Content rebuilt on each `show()` call.

---

## 2026-03-24 — M3 Phase A/B Editor: NPC Editor Support

**Editor integration**: NPC entity type added to dungeon editor. Toolbar palette with teal "NPC" icon. GridCanvas draws teal circle icon on grid, resolves NPC sprite from `npcDatabase` for Item Preview mode. Inspector shows `npcId` dropdown (sprite-swatch custom dropdown mirroring enemy type selector), readonly details panel (name, dialog file reference, merchant stock list), sprite preview.

**Red hover on invalid placement**: Entity mode hover highlight now checks `canPlaceEntityType()` and turns red on cells where the selected entity type cannot be placed (walls for most entities, non-wall cells for breakable_wall/secret_wall). Applies to all entity types, not just NPC.

**NPC facing removed**: `facing` field removed from NPC entity defaults, NPCInstance interface, entity parsing, level loader validation, and DUNGEON-DESIGNER.md. NPC facing was stored but never consumed by game code (billboard rendering always faces camera). Enemies also lack a facing field. May revisit if a front/back/side sprite system is added in a future milestone.

**Dialog Editor planned**: New Phase C/D Editor added to M3 plan — visual dialog tree editor with node graph, condition/effect authoring (quest stages, world flags, items, stats), validation, preview mode, and NPC inspector integration. Depends on Phase C (quest system) for quest ID validation.

---

## 2026-03-24 — M3 Phase B: Dialog System

**Design**: Per-NPC JSON dialog trees in `public/data/dialogs/{npcId}.json`. Named nodes with `speaker`, `text`, optional `choices` (branching) or `next` (linear). Condition/effect engine: conditions gate choice visibility (`hasFlag`, `hasItem`, `questStage`, `statCheck`, all AND'd), effects execute on choice selection (`setFlag`, `giveItem`, `takeItem`, `startQuest`, `advanceQuest`, `openShop`). ADR-M3-02.

**Architecture**: `DialogManager` module (not a class — functional API with module-level cache and hooks). `loadDialog()` fetches and caches per-NPC JSON. `DialogSession` plain data object tracks tree + current node. `setDialogHooks()` decouples dialog from quest/shop systems — main.ts wires the hooks. Condition evaluators and effect executors are extensible lookup tables. `questStage` evaluator stubbed until Phase C (returns true for `undiscovered`).

**UI**: `DialogOverlay` follows SignOverlay pattern. Dark dungeon-themed panel at screen bottom with gold border. Speaker name in uppercase, dialog text, numbered choice buttons (1-9 keys or click). Non-choice nodes advance on any key. Capture-phase keydown blocks game input while dialog is open.

**Integration**: NPC interaction (Space on facing cell) → async `loadDialog()` → `startDialog()` → `showDialogNode()`. Dialog overlay added to both keydown guard chain and `anyOverlayOpen` pause check.

---

## 2026-03-24 — M3 Phase A: NPC Foundation

**Design**: Separate NPC database (`public/data/npcs.json`) with `NpcDatabase` singleton class mirroring `EnemyDatabase`. `NpcDef`: id, name, sprite (path/size/yOffset), dialog reference, optional stock + markup for merchants. ADR-M3-01.

**Architecture**: New `npc` entity type in dungeon JSON: `{ type: "npc", npcId: "..." }`. `NPCInstance` in GameState (`npcs: Map<string, NPCInstance>`), parsed in `_parseEntities`, included in `LevelSnapshot`, `saveLevelState`, `loadLevelState`, `loadNewLevel`, `_rebuildEntityIndex`. Billboard rendering via `npcRenderer.ts` (mirrors `enemyRenderer.ts` — texture cache, `PlaneGeometry`, `createNeutralLitMaterial`, `camera.rotation.y` billboard). NPCs block player movement.

**Global flags**: `flags: Set<string>` on GameState with `hasFlag`/`setFlag`/`removeFlag`. Persisted in SaveData as `string[]`. ADR-M3-03.

**Save/load**: NPC state in `SerializedLevelSnapshot` (npcs Record). Flags in SaveData top-level. Backward-compatible deserialization (`npcs ?? {}`, `flags ?? []`).

**Level loader**: `npc` entity validation — npcId must exist in NpcDatabase, walkable cell required.

---

## 2026-03-24 — M3 Design Decisions

Architectural decisions for Milestone 3: The Living World. See `planning/m3/ADR.md` for full records.

- **ADR-M3-01**: Separate NPC database + entity type (not reusing enemy system)
- **ADR-M3-02**: Per-NPC JSON dialog trees with condition/effect engine (not Ink markup or embedded scripts)
- **ADR-M3-03**: Global flags as `Set<string>` for cross-system state (not key-value store)
- **ADR-M3-04**: Data-driven JSON quests with generic stage machine (not code-per-quest)
- **ADR-M3-05**: Dialog-triggered trading overlay with NPC stock from npcs.json
- **ADR-M3-06**: 3D geometry for dungeon objects (not billboard sprites)

---

## 2026-03-19 — Phase E: Save/Load System

**Design**: localStorage-based persistence with 5 manual save slots + 1 autosave slot. ~50-100KB per save, well within localStorage limits. Same-dungeon restriction (saves only load for matching dungeon name). Death shows load overlay if saves exist, else restarts.

**Serialization**: `SaveData` interface captures full game state: player stats/position/facing, key inventory, entity registry (all items across all levels + backpack + equipped), level snapshots (all visited levels' entity Maps→Records, Sets→arrays), and mutated grids. `serializeLevelSnapshot`/`deserializeLevelSnapshot` handle Map↔Record and Set↔array conversions. Signal state is already JSON-safe (tuple arrays from `Array.from(map.entries())`).

**Architecture**: New `saveSystem.ts` owns all serialization logic and slot management. `GameState` exposes 4 accessor methods (`getPlayerState`, `restorePlayerState`, `getPickedUpKeys`, `restorePickedUpKeys`) — keeps serialization concerns out of the game state class. `applySaveData` restores grids → loads active level snapshot → overwrites entity registry with full save (backpack/equipped survive the level-scoped restore). `buildSaveData` flushes active level state before capturing the full registry.

**UI**: `SaveLoadOverlay` follows `SignOverlay` DOM pattern (fullscreen backdrop, capture-phase keydown, `attach`/`show`/`hide`/`isOpen`). Dark dungeon theme with monospace font. Two modes: save (shows Save buttons on manual slots) and load (death variant with "You have died" header and Restart button). Export/Import buttons in bottom action bar.

**Integration**: Escape key opens overlay in save mode. Auto-save fires on every stair transition (after level snapshot, before scene swap). Death handler checks `hasSaves()` and shows load overlay or falls back to restart. Overlay added to `anyOverlayOpen` to pause game loop.

---

## 2026-03-19 — Phase D: Environment Entities

**Design**: 5 new entity types for dungeon environment interaction.

- **Breakable walls**: Solid cells with HP. Player attacks reduce HP (wall_hit combat result). On destroy: grid mutated to '.', wall geometry hidden, floor/ceiling revealed, optional loot drops. Uses shared wallEntityRenderer for geometry (wallGroup visible initially, floorCeilGroup hidden until destroy).
- **Secret walls**: Solid cells opened by walking into them. Player's `onMoveBlocked` callback detects walk-into, opens wall (grid mutation + geometry swap), re-invokes moveForward. `persistent` flag for illusionary walls that stay visible but become walkable ("An illusionary wall!" vs "A secret passage!").
- **Pushable blocks**: Walkable cells with blocking entities. Interact (Space) pushes one cell in facing direction. Validates destination (walkable, no enemy/block/player, door open). Activates pressure plates. Blocks projectiles (added to projectileManager collision).
- **Treasure chests**: Three states (closed/open/locked). `facing` field controls 3D orientation and editor icon rotation. Key-locked variant consumes key on open. Signal-controlled variant (gateMode auto-set when targeted by signal sources) registered as receiver — blocks manual opening ("This chest is sealed by a mechanism."). Chests can also be signal sources with `targets[]` (booby-trapped chests → trap launchers). Lid pivot opens upward. Editor: facing dropdown, key pick with auto-create, bidirectional chest-key wiring + visualization, targets array field, remove (X) buttons on key associations.
- **Message signs**: Wall-mounted on walkable cells. Interact (Space facing sign's wall) shows parchment overlay. DOM-based overlay with capture-phase keydown for modal input blocking.

**Architecture**: `wallEntityCells` Set passed to `buildDungeon()` to skip wall faces that entity renderers own. Combined `isBlocked` callback on Player (`isBlockedByEnemy || isBlockAt`). `destroyedWalls` Set in GameState for walkability tracking across save/restore. `playerStart` moved from per-level to per-dungeon (`Dungeon.playerStart` with `levelId`); migration auto-promotes first level's playerStart for old format.

**Editor polish**: Inline readonly stats (label: value on same line). Enemy behavior tags with hover tooltips. Immediate validation on entity add. Placement hints ("Must be placed on a solid wall tile" / "Must be placed on a floor tile"). Player Start section in Level Properties with Pick button + facing dropdown. "Custom Tiles" UI rename. Auto-create key entity on empty floor during keyId pick. Interaction messages shown in HUD (mechanical doors, sealed chests).

---

## 2026-03-19 — Phase C: Status Effects

**Design**: Array-based status effects on both player and enemies. Same-type refresh (max of remaining vs new duration), no damage stacking. Ticked in existing game loops (animate for player, updateEnemies for enemies). ADR-M2-04.

**Effect types**: poison (2 dmg/s, 1s tick), slow (2× movement penalty, no damage), burning (3 dmg/s, 1s tick).

**Application**: Fireball projectile applies burning (6s) — was stubbed in Phase B with `statusEffect: 'burning'`. Spider applies poison (10s, 30% chance) via new `onHit` behavior in enemies.json. Antidote consumable cures poison via existing `curePoison` item effect.

**Architecture**:
- `statusEffects.ts`: pure-logic module, no Three.js dependency. applyEffect/tickEffects/removeEffectsByType/hasEffect/getSlowMultiplier.
- `statusEffects: StatusEffect[]` on EnemyInstance (non-optional, always []), `playerStatusEffects: StatusEffect[]` on GameState.
- `status_damage` / `status_kill` action types in enemyAI. Slow multiplier applied to effectiveInterval.
- Player effects ticked in animate(), paused during overlays. Cleared on death/restart, persisted across level transitions.
- `handleEnemyKill()` helper extracted from 3 duplicated kill paths (combat, projectile, status_kill).
- `EnemyBehavior.params` widened from `Record<string, number>` to `Record<string, unknown>` to support onHit's string-typed statusEffect param.
- Deep-copy enemy statusEffects in saveLevelState/loadLevelState.

**Visuals**: Screen tint overlays (burning=fast orange flicker, poison=slow green pulse, slow=static blue). Pixel-art status icons above health bar (flame, droplet, snowflake). Per-frame enemy billboard tint (burning=0xFF8844, poison=0x66FF66). Player slow via `slowMultiplier` field on Player class.

**Editor fix**: Gates exempted from non-walkable cell validation (valid position for all gates).

---

## 2026-03-19 — GPU Shader Warmup

**Problem**: First fireball spawn caused heavy frame drop. Root causes: (1) lazy shader compilation of fireball `MeshStandardMaterial` and explosion `PointsMaterial` on first use, (2) each new `PointLight` (fireball/explosion) changes `NUM_POINT_LIGHTS` shader define, forcing recompilation of all lit materials.

**Solution**: `warmUpGPUShaders()` pre-compiles all shader programs + light-count variants during init. Uses `renderer.compileAsync()` (`KHR_parallel_shader_compile` extension) for non-blocking compilation. Runs concurrently with character creation screen — level scene built before character creation so all materials are in the scene during warmup. Animated "Loading..." indicator.

**Browser variance**: Chrome has the extension (1-2s, fully smooth). Firefox lacks it (~8s, synchronous fallback with RAF yields between blocking passes). Double-RAF before warmup guarantees the character creation screen is painted on Firefox.

**Scaling**: Compile time depends on unique shader program count × light-count variants, not mesh count. 10x content with same material types ≈ same compile time.

**Changes**:
- `projectileRenderer.ts`: `warmUpGPUShaders()` — async, creates temp projectile/explosion meshes + incremental PointLights, compileAsync at each count, RAF yields for Firefox fallback
- `main.ts`: level scene built before character creation, `Promise.all` for concurrent warmup + character creation, loading indicator with CSS-animated dots

**ADR**: ADR-M2-06

---

## 2026-03-19 — Global Clock: Absolute-Time Scheduling

**Problem**: Independent countdown timers (`timer -= delta`) across signal delays, timed sources, delay/pulse gates, and trap launchers drift under variable framerates. Repeating events compound drift by rescheduling from `this.now` instead of intended fire time.

**Solution**: Single monotonic clock (`SignalManager.now`) advanced by `tick()`. All timed events store absolute timestamps (`deactivateAt`, `delayFireAt`, `fireAt`, `nextFireAt`). Repeating events reschedule from their *intended* fire time, not actual frame time. Zero drift over any time horizon.

**Scope**: Game-logic timers only. Visual/animation timers (particles, damage numbers, flicker) remain delta-based.

**Changes**:
- `signalManager.ts`: `now` field, renamed `timer`→`deactivateAt`/`delayFireAt`/`fireAt`, tick uses `>=` comparison instead of countdown, save/load/clear includes clock
- `gameState.ts`: `reloadTimer`→`nextFireAt`, `tickTrapLaunchers()` drops delta param, 4 source field mutation sites updated
- `main.ts`: removed delta arg from `tickTrapLaunchers()` call
- `signalManager.test.ts`: 3 new drift regression tests (pulse zero-drift, save/load clock preservation, delay chain timing)

**ADR**: ADR-M2-05

---

## 2026-03-18 — Post-Phase-A Round 2: Trigger/Tripwire Fixes, Tripwire Rendering, Editor UX

**Trigger modes fixed**: Toggle triggers flip on/off each step-on (was always activating). Timed triggers start countdown on step-off, not step-on. Fired state resets on timer expiry via `onSourceDeactivated`.

**Tripwire simplified**: Removed signalMode from tripwire — always one_shot. Only `signalDelay` configurable in editor. Tripwire orientation auto-detect fixed in both editor and game: wire now runs perpendicular to passage (across it) instead of parallel.

**Tripwire 3D rendering**: New `tripwireRenderer.ts`. Thin cylinder mesh at ankle height (0.25), wall-to-wall, dark grey with very low opacity (0.1). Disappears when triggered. Meshes included in level scene setup/teardown.

**Editor ghost preview**: Entity mode hover shows semi-transparent (50%) icon of the entity that would be placed. Auto-detects wall orientation for lever/sconce and tripwire orientation per hover cell. Shows actual sprites for enemy/equipment/consumable (always, regardless of item preview toggle).

**Editor UX**: Select tool button highlighted on page load. Escape in entity mode reverts to select mode. Drag-to-wire falls back to any wirable entity at cell if selected entity is not a wire source (e.g. sconce on same cell as plate). Lever wiring arrows originate from bar center instead of cell center.

**Files**: `src/core/gameState.ts`, `src/main.ts`, `src/rendering/tripwireRenderer.ts` (new), `src/editor/GridCanvas.ts`, `src/editor/EditorApp.ts`, `src/editor/Inspector.ts`, `src/editor/main.ts`

---

## 2026-03-18 — Post-Phase-A: Signal Behavior Fixes, Editor Hover Highlights, Door Blocking

**Signal state persistence**: `SignalManager.saveState()`/`loadState()` now included in `LevelSnapshot`. Fixes AND/XOR gates losing source active flags on level transition (door stayed open but wouldn't respond to lever toggles).

**Lever signal modes**: Removed `momentary` (nonsensical for physical switches) and empty default. Options: toggle, one_shot, timed. Timed levers auto-reset to 'up' with animation via new `onSourceDeactivated` → `onLeverReset` callback chain.

**Pressure plate modes fixed**: Toggle now properly flips on/off each step-on (was acting as one_shot). Timed plates start countdown on step-off, not step-on (momentary with delayed reset). Momentary plates show visual feedback (releasePlate mesh reset) on step-off. Removed empty default option.

**Door gateMode cleanup**: Removed empty/default option (was identical to 'or'). New doors preset to 'or'. Dropdown only shown when door has 2+ incoming connections.

**Editor hover highlights**: Hovering any entity link in inspector (targets, referenced-by, key peers, stair go-to) highlights the entity's cell on the grid canvas (blue translucent overlay). Cross-level entity refs highlight the target level name in the level list (blue). Remove buttons (×) added to Referenced By section.

**Door blocking on occupied cells**: Signal-driven doors that try to close on a player or enemy bounce open and retry every 1.5s. Player position updated before source deactivation to prevent timing race. Safety check: if player ends up on a closed door, force it open. Door state correctly set to 'closed' when cell finally clears (fixes walk-through bug). Door panel edge UVs fixed (proportional scaling on thin side/bottom faces only, front/back untouched).

**Files**: `src/core/signalManager.ts`, `src/core/gameState.ts`, `src/main.ts`, `src/editor/Inspector.ts`, `src/editor/EditorApp.ts`, `src/editor/GridCanvas.ts`, `src/editor/LevelList.ts`, `src/editor/main.ts`, `src/rendering/plateRenderer.ts`, `src/rendering/doorRenderer.ts`, `src/rendering/doorAnimator.ts`, `editor.html`, `DUNGEON-DESIGNER.md`

---

## 2026-03-18 — Phase A: Signal System Foundation (Implementation + Polish)

**Goal**: Build the entire M2 signal system — multi-target migration, centralized signal evaluation, gate logic, new entity types, full editor support. Then polish editor UX.

**Architecture decisions**:
- `SignalManager` class owns all signal propagation. Sources → Gates → Receivers pipeline. GameState registers entities on init, routes lever/plate/trigger/tripwire activations through SM.
- `onDoorSignalChanged` callback bridges SM-driven state changes to main.ts mesh animation (without this, doors opened by triggers/gates wouldn't animate).
- Entity validation made soft/recoverable — invalid entities are console.warn'd and filtered out for game use, but preserved in JSON for editor. Export/save no longer gated on errors.
- Signal chain highlighting: `getSignalChain()` does bidirectional BFS (forward through targets, backward through referencing entities) with cycle protection.
- Loop detection: DFS from each signal entity, seeds with direct targets, reports cycle only when path leads back to starting entity.

**Sub-phases completed**:
- A1: `target: string` → `targets: string[]` migration (lever, plate). Migration layer: `targetDoor` → `target` → `targets[]`. All consumers updated.
- A2: SignalManager with OR/AND/XOR gate evaluation, source→receiver propagation, cycle detection.
- A3: Signal modes (toggle/momentary/one_shot/timed), gate modes on doors, momentary plate deactivation on step-off, signalDelay (optional activation delay, composes with any mode).
- A4: Trigger entity (invisible floor trigger), Tripwire entity (one-shot, orientation auto-detect, visibility threshold).
- A5: Standalone gate entities (and/or/not/delay/pulse_edge/pulse_repeat), gates as both receivers and sources.
- A6: Editor — toolbar buttons, inspector fields (signal mode with tooltips, targets array with clickable IDs, delay checkbox, orientation dropdown), grid icons, wiring arrows, auto-detect wall/orientation, target copy on placement, reference cleanup on delete.

**Post-A6 editor polish**:
- Full signal chain highlighting: selecting any entity highlights all arrows in its chain (forward + backward)
- Signal loop detection in editor validation with immediate feedback on wire add/remove and entity delete
- "Referenced by" section on gates (and doors), extracted into `addReferencedBySection()` helper
- Unified clickable entity link format: `type @ (col, row)` with ID tooltip, blue `#88aaff` color — consistent across inspector targets, referenced-by, stair go-to, and error banner links
- Validation + error banner refresh on pick/wire complete, Delete key, and target removal
- Sprite-based toolbar icons (enemy, key, equipment, consumable) enlarged for readability
- Gate diamond icon enlarged on grid and toolbar

**Files**: `src/core/signalManager.ts` (new), `src/core/signalManager.test.ts` (new), `src/core/gameState.ts`, `src/level/levelLoader.ts`, `src/level/interaction.ts`, `src/main.ts`, `src/editor/EditorApp.ts`, `src/editor/Inspector.ts`, `src/editor/GridCanvas.ts`, `src/editor/Toolbar.ts`, `editor.html`, `DUNGEON-DESIGNER.md`

---

## 2026-03-18 — M2 Design & Planning

**Goal**: Design M2 ("The Dangerous Dungeon") — traps, signals, secrets, puzzles, status effects, save/load. Produce design doc, ADRs, and implementation plan.

**Key decisions (ADRs)**:
- **ADR-M2-01 — Signal system**: Direct entity references with multi-target (`targets: string[]`), no named channels. Two-layer logic: built-in `gateMode` on receivers (OR/AND/XOR) for simple cases, standalone gate entities (AND, OR, NOT, DELAY, PULSE_EDGE, PULSE_REPEAT) for complex puzzles. Breaking migration from `target` → `targets`.
- **ADR-M2-02 — Projectile system**: Design for both M2 traps and M4 ranged combat, implement traps only now. `ProjectileManager` with `source` field for future routing. Cardinal movement, fractional position, cell-boundary collision.
- **ADR-M2-03 — Save/load**: localStorage with 5 manual slots + 1 auto-save + JSON export/import. Death → load last save (replaces M1 restart behavior).
- **ADR-M2-04 — Status effects**: Array-based on both player and enemies. Three types: poison (tick damage), slow (move interval multiplier), burning (tick damage + visual). Same-type refreshes duration, different types stack.

**Scoping decisions**:
- E6 (sub-grid entity positioning) deferred from M2 → M5 (needed for multi-enemy rooms, spawners)
- S5 (pit traps), V9 (rolling boulders), C7 (enemy spawners) confirmed in M5
- R4 (lockpicking) confirmed in M4 as part of skills system
- Editor support integrated into each implementation phase (not a separate phase)

**Files**: `planning/m2/DESIGN.md`, `planning/m2/ADR.md`, `planning/m2/PLAN.md`, `planning/MILESTONES-V2.md` (E6 moved M2→M5)

---

## 2026-03-18 — Editor UX Round 2 (Drag-to-Wire + File Picker)

**Goal**: Make entity wiring faster (drag instead of Pick button) and replace the unfriendly `prompt()` file picker with a clickable modal.

**Key decisions**:
- **Drag-to-wire in select mode only** — mousedown on a wirable entity records a potential drag source. If the cursor moves to a different cell, it transitions to wire-drag mode with an orange dashed arrow following the cursor. Mouseup on a valid target completes the wiring. No conflict with paint/entity modes.
- **Bidirectional wiring** — dragging door→lever is equivalent to dragging lever→door. At completion, the system checks both forward (source.field = target.id) and reverse (target has a field pointing to source's type). This means users don't need to remember which direction to drag.
- **Wire source map** — a static `WIRE_SOURCE_MAP` maps entity types to their wiring field and valid target type (lever→door via `target`, key↔door via `keyId`, stairs→stairs via `target`).
- **Clickable file picker** — `showFilePicker()` creates a DOM modal overlay with a title, scrollable file list, and Cancel button. Click a file to open it, click outside or Cancel to dismiss. Returns a Promise<string | null>.

**Files**: `src/editor/EditorApp.ts` (WireDragState, getWireSourceInfo, isValidWireTarget, completeWireDrag, applyWire), `src/editor/GridCanvas.ts` (potentialWireSource, drag detection, drawWireDragLine, hover validation, cursor), `src/editor/main.ts` (Escape handler, showFilePicker, rewritten openFromServer callback), `editor.html` (file-picker CSS).

---

## 2026-03-18 — Enemy Database (Data-Driven Enemy Definitions)

**Goal**: Move all hardcoded enemy definitions to a JSON database, enabling future editor-based enemy creation/editing. Prerequisite for items/monsters editor.

**Key decisions**:
- **Follow `ItemDatabase` pattern exactly** — `EnemyDatabase` class with `load()` → fetch → Map, singleton export. Consistent API surface.
- **Behaviors as typed params** — instead of type-name checks (`enemy.type === 'troll'`), behaviors are arrays of `{ type, params }` objects. Three behavior types: `regen` (hpPerTick, tickInterval, pauseOnDamage), `flee` (hpThreshold, speedMultiplier), `erratic` (chance). AI code uses `hasBehavior()`/`getBehavior()` lookups.
- **Sprite data co-located with enemy** — `sprite: { path, size?, yOffset? }` in each enemy definition. Eliminates the 3 separate renderer lookup maps (`SPRITE_SIZES`, `SPRITE_PATHS`, `SPRITE_Y_OFFSETS`).
- **Load order** — `enemyDatabase.load()` must complete before `preloadEnemyTextures()` (which iterates the database for paths). Item database and loot tables can still load in parallel after.
- **Re-export `EnemyDef`** — `enemyTypes.ts` re-exports the type from `enemyDatabase.ts` for backward compatibility of import paths.
- **`EnemyDef.type` → `EnemyDef.id`** — the old `EnemyDef` had a `type` field that duplicated the map key. The new interface uses `id` (matching ItemDatabase convention). `createEnemyInstance` maps `def.id` to `instance.type`.

**Files**: `public/data/enemies.json` (new, 9 enemies), `src/enemies/enemyDatabase.ts` (new, EnemyDatabase class), `src/enemies/enemyTypes.ts` (removed ENEMY_DEFS/EnemyDef, uses database), `src/enemies/enemyAI.ts` (behavior-driven lookups), `src/rendering/enemyRenderer.ts` (uses database), `src/main.ts`, `src/core/gameState.ts`, `src/core/assetCheck.ts`, `src/level/levelLoader.ts`, `src/editor/main.ts`, `src/editor/Inspector.ts`, `src/enemies/enemyTypes.test.ts` (rewritten), `src/enemies/enemyAI.test.ts` (mock added), `src/core/combat.test.ts` (mock added).

---

## 2026-03-18 — Editor Direct File Save

**Goal**: Eliminate the browser-download friction loop when iterating on levels. Let the editor read/write JSON files directly to `public/levels/` during dev.

**Key decisions**:
- **Vite dev server plugin** — `editorApiPlugin()` uses `configureServer` hook, so it only runs during `npm run dev`. Production builds are unaffected (export-only workflow unchanged).
- **CSRF token** — `crypto.randomUUID()` generated at server start, injected into `editor.html` via `transformIndexHtml`, required as `X-Editor-Token` header on all API calls. Custom headers trigger CORS preflight, blocking cross-origin attacks without needing same-origin cookies.
- **Filename validation** — rejects null bytes, slashes, `..`, non-allowlist chars. `path.resolve` + `startsWith` check as final guard against path traversal.
- **Watcher suppression** — `server.watcher.unwatch()` before write, `server.watcher.add()` after 100ms delay, prevents Vite HMR from reloading the game page when the editor saves.
- **Serialization refactor** — extracted `serializeLevel()` / `serializeDungeon()` from duplicated field-ordering blocks in `exportLevelFile`/`exportDungeonFile`. Now includes `fireflies` field (was missing from export before this change).
- **sourcePath tracking** — `EditorApp.sourcePath` tracks the server filename. Reset on load/create. Set after server load or first save. Save button enabled only when `sourcePath` is set and level is dirty.
- **Save vs Save As** — Save writes to `sourcePath` (Ctrl+S), Save As prompts for filename. If `sourcePath` is null, Save falls through to Save As.

**Files**: `vite.config.ts` (plugin + routes), `src/editor/io.ts` (serialization helpers + API client), `src/editor/EditorApp.ts` (`sourcePath` field), `src/editor/Toolbar.ts` (3 new buttons + methods), `src/editor/main.ts` (callbacks, `performSave`, Ctrl+S, dev server detection), `editor.html` (button CSS).

---

## 2026-03-17 — Outdoor Forest Environment + Fireflies

**Goal**: Add an outdoor forest environment with dense tree-filled cells and atmospheric firefly particles.

**Key decisions**:
- **`seeThrough` CharDef property** — generic mechanism for solid-but-rendered cells. `solid: true, seeThrough: true` renders floor/ceiling without wall faces toward renderable neighbors. Extensible to future visual fill types (stalactite caverns, etc).
- **Two-layer forest** — hard forest walls (`F`, opaque) + see-through tree cells (`T`, non-walkable but visually open, filled with billboard sprites) + walkable clearings (`.`). Creates depth gradient.
- **Billboard material extraction** — `createNeutralLitMaterial` moved from enemyRenderer to shared `billboardMaterial.ts`, used by both enemy sprites and tree billboards.
- **Dungeon builder `renderable` set** — walkable + seeThrough chars. Controls floor/ceiling rendering and wall face decisions. Game movement still uses the original walkable set.
- **Forest renderer** — seeded PRNG placement (deterministic per cell/face), 4 procedural tree variants (pine, oak, birch, bush). Edge trees on walkable cells near forest faces + fill trees inside see-through cells.
- **Fireflies** — custom ShaderMaterial (PointsMaterial ignores per-vertex opacity attributes). Per-particle fade in/out over 1s, respawn delay 0.5–2s, 1/3 blink chance. Controlled by `level.fireflies` flag, not auto-enabled.

---

## 2026-03-16 — Stair Cross-Level Visual Feedback

**Goal**: When a stairs entity is selected, visually indicate where its target stair lives — in the level list, on the grid, and with a quick "go to" link in the inspector. Also improve the stair creation workflow.

**Key decisions**:
- **Level list highlight** — when a stair is selected, the level containing its target stair gets a yellow highlight (`.highlight` CSS class with `#ffaa00` border/text). Skipped if the target is on the active level.
- **Same-level wiring arrows** — stairs with same-level targets use the existing wiring arrow system (dashed lines with arrowheads, yellow when active, gray when inactive). Reuses lever→door arrow code.
- **Cross-level target marker** — when the selected stair is on a different level, four small yellow arrowheads with tails converge on the target stair's cell from all four directions (celtic cross pattern). No connecting line since the source is off-screen.
- **Inspector "go to" link** — clickable `→ stairId on LevelName` link below the target field. Commits pending undo, switches to the target level, selects the target stair, refreshes all UI.
- **Pick mode for stair target** — uses cross-level pick mode (persists across level switches). Inspector Pick button and newly placed stairs both enter this mode. Walkable empty cells are valid targets — auto-creates a new stairs entity there.
- **Auto-create stair on pick** — clicking an empty walkable cell during cross-level stair pick creates a new stairs with the opposite direction (up↔down) and mutually links both stairs.
- **Auto-pick on placement** — placing a new stairs entity in dungeon mode immediately enters cross-level pick mode so the user can link it in one gesture.
- **Dungeon-wide unique entity IDs** — `generateEntityId()` now scans all levels in dungeon mode, preventing duplicate IDs like `stairs_1` on two different levels.
- **Stair icon overhaul** — grid and toolbar stair icons replaced with perspective step bars (5 steps, narrowing with depth, color gradient from bright to dark based on up/down direction). Facing indicated by step orientation rather than a separate bar.

**Files**: `editor.html` (`.level-entry.highlight` CSS), `LevelList.ts` (`highlightedLevelIndex` field), `GridCanvas.ts` (same-level stair arrows, cross-level celtic cross marker, stair step icon, selection highlight cross-level guard), `Inspector.ts` (`onStairGoTo` callback, "go to" link, pickable target field replacing dropdown), `EditorApp.ts` (`crossLevel` on PickModeState, auto-create stair in `completePickMode`, walkable cell validation in `isValidPickTarget`, dungeon-wide `generateEntityId`, cross-level pick preserve in `switchToLevel`), `Toolbar.ts` (stair step icon), `main.ts` (`updateStairHighlight`, auto-pick on stair placement, stair go-to callback, cross-level pick mode wiring, highlight refresh in all mutation callbacks).

---

## 2026-03-16 — Stair Entity Pairing

**Goal**: Make stairs reference each other by entity ID instead of target positions. Player spawns in front of the target stair (not on it), with stairs at their back.

**Key decisions**:
- **Entity-to-entity reference** — stairs use `target: stairEntityId` instead of `targetLevel`/`targetCol`/`targetRow`. Consistent with how levers reference doors. The target level is derived from which level the target entity lives on.
- **Explicit facing** — stairs gain a `facing` field (N/S/E/W) indicating which direction the stair opening faces. Previously auto-detected from adjacent walkable cells in stairRenderer. Explicit facing gives the designer full control and works correctly in open areas with multiple walkable neighbors.
- **Spawn-in-front logic** — on transition, player spawns one cell in the target stair's facing direction, facing that direction (stairs at their back). E.g., target stair facing N → player at (col, row-1) facing N.
- **Cross-level validation** — both loader and editor verify: target entity exists on another level, is a stairs type, and the spawn cell (one step in facing direction) is in-bounds and walkable.
- **Editor inspector** — facing dropdown (N/S/E/W) and target dropdown showing all stair IDs from other levels with labels like "stairs_1 on Level 2". Falls back to text field in single-level mode.
- **Grid icon** — stair icon now shows a small facing triangle indicator in addition to the up/down arrow.
- **Stair renderer** — `buildStairMeshes` uses `StairInstance.facing` directly instead of calling `detectStairFacing`. Function kept exported as a utility.
- **Skipped stairs in generic target check** — EditorApp.validate() generic target reference check now skips stairs entities (their targets live on other levels, validated separately).

**Files**: `gameState.ts` (StairInstance.facing), `stairRenderer.ts` (explicit facing), `main.ts` (spawn-in-front transition), `levelLoader.ts` + tests (validation), `EditorApp.ts` (defaults, validation), `Inspector.ts` (facing + target fields), `GridCanvas.ts` (facing icon), `dungeon_m1.json` (migration), `DUNGEON-DESIGNER.md`.

---

## 2026-03-15 — Area Editing UX Improvements

**Goal**: Make area editing feel more direct and visual — reduce clicks, provide visual feedback during coordinate picking, support rectangle drag selection.

**Key decisions**:
- **Status hint bar** — blue-tinted `#status-hint` div at the bottom of the screen (alongside error banner). Shows context-aware messages during pick/drag operations. Hidden by default, shown via `.visible` class. Placed at bottom to avoid layout jumping when shown/hidden.
- **Error banner relocated** — moved from above `#main-area` to bottom of screen (after main area, before status hint). Same reason: prevent layout jumping.
- **Default textures on new area** — "Add Area" copies `wallTexture`/`floorTexture`/`ceilingTexture` from `level.defaults` into the new area object. Saves repeated manual selection.
- **Auto-expand + auto-drag-pick** — new area is immediately expanded in the sidebar and editor enters rectangle drag mode. User can define the area bounds in one gesture right after creation.
- **Rectangle drag selection** — new `coordDragCallback` + `areaDragState` on EditorApp. mousedown starts drag, mousemove updates live rectangle (blue dashed border + fill), mouseup normalizes with min/max and clamps to grid bounds. Single click (same cell) treated as 1×1 selection.
- **Dual-mode area Pick buttons** — from/to Pick buttons in area entries use drag mode (`onDragArea` parameter on `addCoordPairField`). Single click sets just that one coordinate; drag sets all four area coordinates. Hint text reflects both options.
- **Blue hover for pick modes** — `coordPickCallback` and `coordDragCallback` both show blue hover highlight (distinct from green entity pick mode). Hover suppressed during active drag (the rectangle provides feedback). Crosshair cursor for all pick/drag modes.
- **Cancel mechanisms** — Escape key, right-click, and mouseleave all properly clean up drag/pick state. mouseleave clears visual drag but keeps callback so user can retry.

**Files**: `editor.html` (status hint div + CSS, error banner relocated), `EditorApp.ts` (AreaDragState, coordDragCallback, areaDragState, statusHint), `GridCanvas.ts` (drag mouse events, drawDragRectangle, blue hover, cursor), `LevelProperties.ts` (default textures, auto-expand, startAreaDragPick, onDragArea in addCoordPairField, statusHintChanged callback), `main.ts` (updateStatusHint, Escape handlers, pick complete wiring).

---

## 2026-03-15 — Editor Phase 8: Multi-Level Dungeon Support

**Goal**: Make the editor dungeon-aware — load all levels, switch between them, add/remove/reorder, export as full dungeon JSON, validate cross-level stair references.

**Key decisions**:
- **Shared object reference** — `app.level` always points into `dungeon.levels[activeLevelIndex]`. Mutations to `this.level` are automatically reflected in the dungeon array. No "save back" step needed.
- **Per-level dirty tracking** — `levelCleanSnapshots[]` stores JSON at load/export time for each level. `dirtyLevelIndices` Set tracks which levels have unsaved changes. `isDungeonDirty()` checks both the set and the active level's snapshot.
- **Cross-level undo/redo** — UndoManager entries tagged with `levelIndex`. On undo/redo, if the entry belongs to a different level, the editor auto-switches to that level before restoring. `switchToLevel()` no longer resets the undo stack — only `loadLevel`/`loadDungeon` do.
- **Discriminated union for open** — `openLevelFile()` returns `{ type: 'level', level } | { type: 'dungeon', dungeon } | null`. Callers branch on `type` to call `loadLevel` or `loadDungeon`.
- **Dungeon-wide export validation** — before exporting, iterates all levels and collects errors. Aborts if any level has errors, showing `[levelName] error` format.
- **Cross-level stair validation** — checks `targetLevel` exists in dungeon, target position in-bounds and walkable on the target level. Builds walkable set per target level.
- **Clickable error banner** — `ValidationError` type (message + optional entity ref). Entity-related errors show a green "→select" link that auto-selects the offending entity in the inspector.
- **Entity selection preserved across level switches** — `selectedEntity` not cleared on `switchToLevel()` or `restoreLevelAtIndex()`. Prerequisite for cross-level editing features.
- **LevelList component** — dungeon name text field, scrollable level entries with green active highlight, move up/down/remove buttons, Add Level button. Hidden when `app.dungeon` is null.
- **Inspector targetLevel dropdown** — in dungeon mode, replaces plain text field with dropdown populated from `dungeon.levels` IDs. Falls back to text field in single-level mode.

**Files**: `EditorApp.ts` (dungeon state, switchToLevel, cross-level validation, ValidationError), `UndoManager.ts` (levelIndex-tagged entries, peek getters), `io.ts` (OpenResult union, exportDungeonFile), `LevelList.ts` (new component), `Inspector.ts` (targetLevel dropdown), `Toolbar.ts` (New Dungeon button), `main.ts` (full wiring), `editor.html` (sidebar split, level list CSS, error-goto CSS).

---

## 2026-03-15 — Editor Phase 7: Final Polish

**Goal**: Close usability gaps that make the editor feel unfinished — errors only shown on export, no keyboard shortcuts, no dirty-state feedback, palette overflow.

**Key decisions**:
- **Inline error banner** — red-tinted `#error-banner` div below entity palette, hidden when no errors. Shows single error or count + joined list. `updateErrorBanner()` called after every mutation path (paint, entity add/delete, property changes, undo/redo, level load/new). Export `alert()` kept as safety net.
- **Expanded validation** — 4 new checks in `EditorApp.validate()`: undefined grid chars (char in grid not in `#`, `.`, ` `, or charDefs), broken entity `target` references, player start out-of-bounds or non-walkable, entity on non-walkable or out-of-bounds. Unknown chars deduplicated via `Set` to avoid error floods.
- **Keyboard tool shortcuts** — `1`–`4` for Select/Paint/Erase/Entity. Plain number keys, no modifiers. Same `activeElement` guard as Delete/Undo. Cancels pick mode on switch (matching toolbar button behavior).
- **Dirty state** — `app.dirty` flag + `cleanSnapshot` (JSON string of level at load/export time). Set dirty on every mutation. Clear on export, load, new level. `*` prefix on level name span + document title. `beforeunload` event fires only when dirty. Undo/redo compares `JSON.stringify(level)` against `cleanSnapshot` — undoing all the way back clears dirty.
- **Scrollable palettes** — `overflow-x: auto` on `#char-palette` and `#entity-palette`. `min-width: 0` on `.palette-group` to allow shrinking. 4px webkit scrollbar styling.

**Files**: `editor.html` (CSS + error banner div), `EditorApp.ts` (dirty, cleanSnapshot, expanded validate), `main.ts` (updateErrorBanner, markDirty, updateDirtyDisplay, keyboard shortcuts, beforeunload).

---

## 2026-03-15 — Editor Undo/Redo System

**Goal**: Make editor mutations reversible — one misclick shouldn't require manual repair or reimport.

**Key decisions**:
- **Full-snapshot undo** — `JSON.parse(JSON.stringify(level))` captures entire `DungeonLevel` before each mutation. At 2–16 KB per level, 100 snapshots = 1.6 MB worst case. Simple, correct, no partial-delta bookkeeping.
- **Standalone `UndoManager` class** — no UI dependencies, ~70 lines. Two stacks (undo/redo), max 100 entries. Pending slot for batch operations.
- **Paint drag coalescing** — `beginBatch` on mousedown, `commitBatch` on mouseup/mouseleave. Entire drag is one undo step.
- **Text input batching** — `beginBatch` on first input event (idempotent), `commitBatch` on blur. Typing in a text field is one undo step regardless of keystroke count.
- **Discrete mutations** — `snapshot` called before dropdown/checkbox/entity-add/entity-delete/pick-complete/array-add/array-remove. Each is its own undo step.
- **Callback wiring** — Inspector and LevelProperties expose `onBeforeDiscreteChange`, `onBeginTextEdit`, `onCommitTextEdit`. GridCanvas exposes `onBeforePaint`/`onAfterPaint`, `onBeforeEntityAdd`, `onBeforePickComplete`. All wired in `main.ts`.
- **Entity selection preservation** — `restoreLevel()` matches `selectedEntity` by `id` in restored level; clears if entity no longer exists.
- **Keyboard shortcuts** — Ctrl+Z (undo), Ctrl+Shift+Z / Ctrl+Y (redo). Guarded: skips when activeElement is INPUT/SELECT/TEXTAREA. Cancels pick modes before undo/redo. Flushes pending batch first.

**Files**: New `UndoManager.ts`. Modified `EditorApp.ts`, `GridCanvas.ts`, `Inspector.ts`, `LevelProperties.ts`, `main.ts`.

---

## 2026-03-15 — Editor Phase 6: Visual Toolbars + Inspector Polish

**Goal**: Make the editor visually informative — replace text-only dropdowns and simple shape icons with texture previews, sprite-based entity icons, and item database integration.

**Key decisions**:
- Native `<select>` can't render images → built a custom dropdown component (`.tex-dropdown`) reused for texture fields and item selection
- Char palette split into two groups (Floors + Walls) with texture swatches, sized to show actual pixelart. Entity palette is a separate row with canvas-drawn icons matching the grid view.
- View toggles (floor/ceiling, item preview) placed on entity palette row, right-aligned. Item preview on by default.
- Wall-mounted entities (lever, sconce) now draw at the wall edge according to their `wall` property, not centered. Lever = perpendicular bar, sconce = circle + radial aura.
- Door orientation auto-detected from adjacent solid cells (same logic as 3D renderer). Drawn as bar with hinge squares.
- Item database loaded eagerly at editor startup. Equipment/consumable inspector shows full item details as readonly fields. Right-click context menu on toolbar entity buttons for quick item type selection.
- Area coordinates reorganized as (col, row) pairs with Pick buttons. New `coordPickCallback` mechanism on EditorApp — simpler than entity pick mode, just captures one grid click.

**Files touched**: `editor.html` (CSS), `Toolbar.ts` (rewrite), `GridCanvas.ts` (ceiling view, sprite preview, wall-mounted icons, door bars, coord pick), `Inspector.ts` (item dropdown, item/enemy details), `LevelProperties.ts` (texture swatches, checkbox layout, coord pair fields), `EditorApp.ts` (view flags, item IDs, coord pick), `main.ts` (wiring).

---

## 2026-03-14 — Stable Entity IDs + ID-Based References

**Problem**: Levers/plates referenced doors via `targetDoor: "col,row"` position strings. This broke when entities moved in the editor, couldn't generalize to future entity types (spawners, trap doors, logical gates), and was the last position-based coupling in the data model.

**Solution**:
- Every entity gets an optional `id` field (format: `type_N`, e.g., `door_1`, `lever_2`). Editor auto-generates IDs on entity creation.
- Cross-references use `target: entityId` instead of `targetDoor: "col,row"`. Generic field name supports future non-door targets.
- `GameState` maintains derived `entityById` Map, rebuilt after `_parseEntities()` and `loadLevelState()`. `resolveEntityPosition(id)` provides lookup.
- `migrateEntities()` preprocessor in levelLoader handles backward compat: auto-assigns IDs to doors, converts `targetDoor` → `target` with entity ID.
- `keyId` system stays as-is — it's a group identifier (key↔door), not a direct reference.

**Design decisions**:
- `id` is optional on Entity type. Editor auto-generates for all. Validator requires on referenced/referencing entities.
- Single `target: string` now; documented path to `string | string[]` when logical gates arrive.
- `entityById` is derived state, not saved in snapshots — rebuilt from instance Maps.

---

## 2026-03-14 — Data Model Unification: Entity-Only Doors, Stairs, Levers

**Problem**: The grid used special characters (`D`, `S`, `U`, `O`) that duplicated entity information. This created dual-tracked state (grid char + entity must agree), silent breakage when they diverged, and extra validation complexity. Designed for manual JSON editing, now unnecessary with the visual editor.

**Solution — two-pass refactor**:

1. **Door unification**: Removed `'D'` grid char. Doors placed on `'.'` cells. Removed `'locked'` state — `keyId` on a closed door means "needs key." Removed `unlockDoor()`, auto-creation from D cells. Level loader uses two-pass validation (collect door positions, then validate lever/plate references). Editor updated: doors on walkable cells, `coordinateMode` added to pick system for lever→door targeting.

2. **Stairs + lever unification**: Removed `'S'`, `'U'`, `'O'` grid chars. `WALKABLE_CELLS` → `new Set(['.'])`. Added `StairInstance` and `stairs` Map to GameState (same pattern as doors/keys/levers). All renderers (`player.ts`, `dungeon.ts`, `stairRenderer.ts`, `minimapRenderer.ts`) use entity lookup. Interaction.ts dropped `O` cell guard — levers work on any walkable cell. Editor palette reduced to `.`, `#`, `_`.

**Architectural principle established**: Grid owns geometry only (`#` wall, `.` floor, ` ` void, charDefs for texture zones). Entities own all behavior. This eliminates the class of bugs where grid and entity state diverge.

**Future**: `id?: string` on Entity recommended for stable references (enabling editor drag-to-reposition without breaking lever→door wiring). Deferred until needed.

---

## 2026-03-14 — Dungeon Editor Phase 5: Target Picking + Wiring Visualization

**Pick mode** for lever/pressure_plate `targetDoor` fields:
- "Pick" button next to text input in inspector — enters pick mode (shows "Picking..." with active style)
- Crosshair cursor, green hover on valid `D` cells, red hover on invalid cells
- Left-click valid cell completes pick (sets `"col,row"` string), right-click or Escape cancels
- Tool switch or entity delete also cancels pick mode
- `PickModeState` on EditorApp stores entity, field name, and valid char filter

**Wiring visualization** on grid canvas:
- All lever/pressure_plate → door connections always visible as dashed arrows
- Active connections (selected entity involved) rendered in orange (#ffaa00), 2px, 8px arrowhead
- Inactive connections rendered in faint grey (rgba(150,150,150,0.3)), 1px, 5px arrowhead
- Inactive drawn first so active renders on top

**"Referenced by" section** in inspector for doors:
- Shows list of levers/plates targeting the selected door
- Clickable items — clicking selects the referencing entity

**Design decision**: wiring arrows always visible (not just for selected entity) — makes connection topology discoverable at a glance. Active/inactive distinction via color intensity avoids visual clutter.

---

## 2026-03-14 — Dungeon Editor Phase 4: Level Properties Panel

**Level properties panel** (`src/editor/LevelProperties.ts` — new):
- Left sidebar (260px) with collapsible sections: Level, Environment, Defaults, CharDefs, Areas
- Level section: name and id text fields
- Environment section: environment dropdown, ceiling checkbox (toggles skybox dropdown visibility), dustMotes/waterDrips checkboxes
- Defaults section: optional wall/floor/ceiling texture dropdowns with "none" option
- CharDefs section: array editor with summary rows, expand/collapse per item, char/solid/texture fields, add/remove buttons. Duplicate char detection (rejects edits that would create duplicates, marks existing duplicates in red)
- Areas section: array editor with coordinate fields + optional texture overrides, add/remove buttons
- Expansion state (sections, charDef indices, area indices) persists across refresh cycles

**New level creation** (`src/editor/EditorApp.ts`, `src/editor/Toolbar.ts`, `src/editor/main.ts`):
- `createNewLevel(cols, rows)` builds wall-border grid with floor interior, minimal DungeonLevel
- "New" toolbar button prompts for WxH dimensions (3–100), creates blank level
- Refreshes all panels (properties, palette, inspector, canvas)

**Centralized validation** (`src/editor/EditorApp.ts`):
- `validate()` returns error strings array (currently: duplicate charDef chars)
- Called automatically from `rebuildDerivedState()`, stored on `errors` field
- Export gated: shows alert with error list instead of exporting when errors present

**Refactored** `loadLevel()` to use extracted `rebuildDerivedState()` (charDefMap + walkableSet rebuild)

**Layout** (`editor.html`):
- `#level-properties` div added as first child of `#main-area`
- CSS for collapsible sections, array entry summaries, add/remove buttons, checkbox width fix, "New" button

---

## 2026-03-14 — Dungeon Editor Phase 3: Entity Placement + Inspector

**Entity CRUD** (`src/editor/EditorApp.ts`):
- Expanded `EditorTool` to include `'entity'` mode
- Added `selectedEntity`, `selectedEntityType` state with cycling selection for multi-entity cells
- Entity defaults registry — new entities get sensible defaults per type
- Placement constraints: doors only on 'D' cells, stairs only on 'S'/'U' cells, others on walkable cells
- Methods: `getEntitiesAt`, `selectEntityAt`, `deselectEntity`, `addEntity`, `deleteSelectedEntity`, `canPlaceEntityType`

**Inspector panel** (`src/editor/Inspector.ts` — new):
- Right sidebar with type-specific property forms (dropdowns, text inputs, number inputs)
- Door state dropdown dynamically shows/hides `keyId` field when locked
- Enemy type dropdown populated from `ENEMY_DEFS`
- Delete Entity button, entity changed / delete callbacks

**Grid interaction** (`src/editor/GridCanvas.ts`):
- Select tool: click to select/cycle entities, click empty to deselect
- Entity tool: click to place new entity of selected type
- Cyan selection highlight on selected entity's cell
- Green hover color for entity tool, crosshair cursor

**Toolbar** (`src/editor/Toolbar.ts`):
- Entity tool button added to tool group
- Entity type `<select>` dropdown (9 types) — selecting auto-switches to entity tool
- Dropdown dims when not in entity mode

**Layout** (`editor.html`):
- `#main-area` flex wrapper around canvas + inspector
- Full inspector CSS (dark theme, field styling, delete button)
- Entity type select styling

**Wiring** (`src/editor/main.ts`):
- Inspector refresh on selection change, entity change → canvas redraw
- Delete key listener with input focus guard (doesn't trigger while editing fields)
- Inspector refresh on level load

---

## 2026-03-14 — Door blocking & troll regen improvements

**Door enemy blocking** (`src/core/gameState.ts`, `src/level/interaction.ts`, `src/rendering/doorAnimator.ts`, `src/main.ts`):
- `closeDoor()` now rejects if an enemy occupies the door cell
- New `door_blocked` interaction result with "Something is blocking the door." message
- `DoorAnimator.bounce()` — door slides 20% toward closed then springs back open (slower speed for visual weight)

**Troll regen buff** (`src/enemies/enemyAI.ts`):
- Regen rate increased to +7 HP every 1s (was +2 every 2s)
- Regen now emits `'regen'` action type so health bar updates in real time (was only updating on next hit)

**Docs** (`DUNGEON-DESIGNER.md`):
- Updated troll regen stats in enemy table

---

## 2026-03-14 — Procedural starry night skybox

Added optional `skybox` field for levels with `ceiling: false`. Renders a procedural star field visible through ceiling openings, immune to fog and lighting.

**New type** (`src/core/types.ts`):
- `Skybox` type: `'starry-night'`
- Optional `skybox` field on `DungeonLevel`

**New module** (`src/rendering/skybox.ts`):
- `generateStarryNightTexture()` — 1024×1024 canvas: near-black blue gradient + 1200 small star dots
- `createSkyboxMesh()` — `SphereGeometry(90, BackSide)` with `MeshBasicMaterial(fog: false, depthWrite: false)`, `renderOrder: -1`
- Radius 90 to stay within camera far plane (100)

**Scene integration** (`src/main.ts`):
- Skybox created/destroyed per level in `buildLevelScene()`/`teardownLevelScene()`
- Position tracks camera each frame (always "infinitely far")
- `skyboxMesh?: THREE.Mesh` added to `LevelScene` interface

**Stair back wall fix** (`src/rendering/stairRenderer.ts`):
- Back wall Y now depends on stair direction: down centers at 0, up centers at WALL_HEIGHT
- Prevents back wall from poking above wall height on ceiling-less levels

**Door slide fix** (`src/rendering/doorAnimator.ts`):
- Horizontal door slide adds 0.05 extra offset to tuck panel fully inside adjacent wall
- Fixes z-fighting artifact on ceiling-less levels

**Validation** (`src/level/levelLoader.ts`):
- Validates `skybox` field against known values
- Warns if `skybox` set but `ceiling` is not `false`

**Docs** (`DUNGEON-DESIGNER.md`):
- Documented `skybox` field with example and behavior

---

## 2026-03-14 — Level environment system

Added per-level `environment` parameter to control visual atmosphere (fog, background, ambient light).

**New type** (`src/core/types.ts`):
- `Environment` type: `'dungeon' | 'mist'`
- Optional `environment` field on `DungeonLevel` (defaults to `'dungeon'`)

**New module** (`src/rendering/environment.ts`):
- Environment presets with fog color/range and ambient light color
- `applyEnvironment()` sets scene fog, background, and ambient per level
- `getEnvironmentConfig()` for debug fullbright fog restore
- Dungeon: black fog (6–26), dark ambient — original behavior
- Mist: grey fog (2–14), bright ambient — outdoor/misty feel

**Gameplay** (`src/main.ts`):
- Environment applied at initial load, level transitions, and restarts
- Torch fuel does not drain in mist environment (ambient light, no torch needed)
- Debug fullbright toggle restores correct environment fog

**Stair rendering** (`src/rendering/stairRenderer.ts`):
- Fixed back wall facing (removed incorrect π rotation)
- Doubled back wall height to cover two floors — prevents background bleed in non-black environments

**Validation** (`src/level/levelLoader.ts`):
- Validates `environment` field against known values

**Docs** (`DUNGEON-DESIGNER.md`):
- Documented environment field with available presets

---

## 2026-03-13 — Item sprite system

Replaced procedural canvas textures with PNG sprite loading for all items.

**New module** (`src/rendering/itemSprites.ts`):
- Shared sprite loader providing both THREE.Texture (3D ground items) and HTMLImageElement (2D HUD canvas)
- `getItemTexture(icon)` / `getItemImage(icon)` with caching
- `preloadItemSprites()` called at startup after item DB loads
- Falls back gracefully if a PNG is missing

**Updated renderers:**
- `itemRenderer.ts` — replaced procedural weapon/armor/ring textures with per-item PNG sprites via `icon` field
- `consumableRenderer.ts` — replaced procedural potion textures with per-item PNG sprites
- `inventoryPanel.ts` (HUD quickbar) — draws sprite icons in equipment and backpack slots
- `inventoryOverlay.ts` (full inventory screen) — draws sprite icons in all slots
- All four fall back to colored rectangles if sprite not loaded

**Item data** (`public/data/items.json`):
- `icon` field updated to match actual sprite filenames (hyphenated, e.g. `red-potion`, `leather-cap`)
- Items sharing visual category reuse the same sprite (e.g. all swords → `sword.png`)

**Sprite assets** (`public/sprites/items/`):
- 26 pixelart item sprites (32x32 PNG): weapons, armor, shields, rings, amulets, potions, bone

**Other:**
- `ItemDatabase.getAllItems()` added for preloader icon collection

---

## 2026-03-13 — Lighting, torch, and UX improvements

**Torch & lighting overhaul** (`src/main.ts`):
- Torch light 50% brighter (intensity 4→6, fill 2→3) and 50% longer range (distance 10→21, fill 8→16.5)
- Light no longer dims above 35% fuel — full brightness until low, then linear fade
- Ambient light bumped from `0x111111` to `0x1a1a22` for slight visibility in distant darkness

**Torch capacity** (`src/core/gameState.ts`, `public/data/items.json`):
- Max torch fuel doubled: 100 → 200
- Oil flask fuel restore doubled: 50 → 100

**Escape key closes overlay panels** (`src/main.ts`):
- Inventory, stats, and attribute panels can all be closed with Escape
- Attribute panel respects tryClose guard (can't dismiss during level-up with unspent points)

---

## 2026-03-13 — Bugfixes & enemy sprites

**Equipment pickup fix** (`src/core/gameState.ts`):
- `pickupEquipmentAt()` now moves displaced equipped item to backpack instead of destroying it
- If backpack is full, pickup is denied with a message instead of silently losing the item

**Bat vertical offset** (`src/rendering/enemyRenderer.ts`):
- Added `SPRITE_Y_OFFSETS` lookup — giant_bat sprites now hover 1.0 unit above floor (upper half of cell)
- Other enemy types unaffected

**Enemy sprite art** (`public/sprites/`):
- Added pixelart sprites for all 6 new enemy types: goblin, giant_bat, spider, kobold, zombie, troll
- Enemies no longer fall back to skeleton placeholder

**Dungeon fixes** (`public/levels/dungeon_m1.json`):
- Minor layout adjustments to level 2 and level 3

---

## 2026-03-13 — M1 Phase F: Content (enemy types, AI, dungeon)

6 new enemy types, 3 new AI behaviors, and the 3-level M1 test dungeon.

**F1 — New enemy types** (`src/enemies/enemyTypes.ts`, `src/rendering/enemyRenderer.ts`):
- Added goblin, giant_bat, spider, kobold, zombie, troll to `ENEMY_DEFS`
- Stats from `planning/m1/ENEMIES.md`; existing enemy stats rebalanced for M1 (higher HP/faster moves to match player progression)
- `EnemyAIState` extended with `'flee'`; `EnemyInstance` extended with `regenTimer`/`regenPauseTimer` for troll
- Sprite paths and sizes registered in renderer (placeholder until art assets created)

**F2 — AI behaviors** (`src/enemies/enemyAI.ts`, `src/core/gameState.ts`):
- **Bat erratic movement**: 30% chance per move tick to pick a random adjacent cell instead of pathfinding toward player
- **Kobold flee**: switches to `'flee'` state below 30% HP — pathfinds away from player (max manhattan distance), moves at double speed. Falls back to attack if cornered
- **Troll HP regen**: +2 HP every 2 seconds, paused for 3 seconds after taking damage. `damageEnemy()` sets `regenPauseTimer = 3` on hit

**F4 — M1 test dungeon** (`public/levels/dungeon_m1.json`):
- Level 1 "The Upper Crypts" — tutorial: rats, bats, goblins (~112 XP)
- Level 2 "The Dark Warrens" — mid: spiders, skeletons, kobolds, locked door + lever puzzle (~304 XP)
- Level 3 "The Troll's Domain" — hard: orcs, zombies, troll boss with guaranteed sword_steel drop (~600 XP)
- Total ~1016 XP across full clear → reaches level 4. CharDef-themed areas, all weapon types placed on ground
- Wired as default dungeon in `main.ts`

**Decisions:**
- Existing enemy stats updated to ENEMIES.md M1 values (not just new enemies) — old pre-M1 stats were too weak for the progression system
- Stair targets must land on adjacent walkable cells, not on the stair cell itself (prevents immediate re-traversal)
- Enemy sprites deferred to F3 — renderer falls back to skeleton sprite for unknown types

---

## 2026-03-12 — M1 Phase D: Loot & Drops

Enemy death loot rolls, ground item spawning, and gold counter.

**New modules:**
- **`src/core/lootTable.ts`** — loot roll system: loads `public/data/loot-tables.json`, rolls XP, gold (min-max range), and item drops (per-quality-tier chance). `rollLoot(enemyType)` returns `LootResult` with XP, gold, and item IDs.

**Modified modules:**
- **`src/core/gameState.ts`** — `gold` field added to GameState.
- **`src/core/combat.ts`** — enemy death triggers loot roll.
- **`src/enemies/enemyTypes.ts`** — enemy types wired to loot table keys.
- **`src/main.ts`** — enemy death → loot roll → spawn ground items at death cell, gold counter update.
- **`src/rendering/itemRenderer.ts`** + **`consumableRenderer.ts`** — support spawning new items at runtime (not just level-load time).

**Tests:** 407 new tests in `lootTable.test.ts`.

---

## 2026-03-12 — M1 Design & Data Foundation

Data files and design documents for Milestone 1.

**New files:**
- **`planning/m1/DESIGN.md`** — full M1 design doc: scope, 6 open TBDs resolved, architecture, data model, item system, stats, XP/leveling, gold, loot tables, paper doll UI, implementation order.
- **`planning/m1/ENEMIES.md`** — 9-enemy roster (rat/skeleton/orc + goblin/giant bat/spider/kobold/zombie/troll) with stats, behaviors, new mechanics (flee, erratic, regen).
- **`public/data/items.json`** — central item database: 57 items (22 weapons, 20 armor, 10 accessories, 5 consumables).
- **`public/data/loot-tables.json`** — per-enemy loot tables with XP, gold ranges, drop chances for all 9 enemies.
- **`CHANGELOG.md`** — v0.0.9 entry covering all 8 pre-M1 phases.

**Decisions:**
- Versioning scheme: `0.milestone` (v0.1 = M1 done). Tagged `v0.0.9` on current HEAD.
- Enemy quality tier: added `poor` (10%), rebalanced `common` to 50%.
- Per-entity drops override schema added to DESIGN.md (individual entities can override their type's loot table).
- Agile data model: design per milestone, refactor as needed (not upfront schema for everything).

---

## 2026-03-12 — M1 Phase C: Equipment Expansion

**New files:**
- `src/hud/xpBar.ts` — XP progress bar HUD widget (level label, blue fill bar, XP fraction, "MAX" at cap).
- `src/hud/statsPanel.ts` — `StatsPanel` class: debug overlay toggled by T key. Base vs effective stats side-by-side with green/red diff coloring. Will be repurposed as a proper UI panel in Phase E.

**Modified files:**
- `src/core/combat.ts` — `WEAPON_BEHAVIOR` table with per-subtype cooldown + damage multiplier. `getWeaponCooldown()` reads equipped weapon via DB. `resolveWeaponEffect()` handles specials (axe: -1 DEF, dagger: 10% crit override, mace: +2 vs armored). `playerAttack()` now returns `CombatResult[]` and supports spear 2-cell range.
- `src/core/gameState.ts` — `getEffectiveStats()` expanded: returns `effectiveStr/Dex/Vit/Wis` (base + item attribute bonuses). New methods: `getEquippedWeaponDef()`, `canEquipItem()` (STR/DEX/VIT/WIS requirement check). `pickupEquipmentAt()` returns `{ item?, denied? }` instead of bare item — blocks equip if requirements unmet.
- `src/hud/hudCanvas.ts` — Wired XP bar, `showMessage()` for centered fade-out text, `StatsPanel` integration.
- `src/hud/hudLayout.ts` — Added `XP_BAR` layout constant.
- `src/main.ts` — Multi-result combat loop (spear), equipment pickup HUD message on success/denial, T key stats panel toggle with input blocking.
- `public/levels/dungeon3.json` — Added test weapons (dagger, axe, spear, ring) for manual testing.

**Decisions:**
- `playerAttack()` return type changed from single `CombatResult` to `CombatResult[]` to support spear multi-target. All callers updated to loop.
- Dagger crit is a flat 10% override (not additive with base crit chance) — keeps daggers viable at low DEX but doesn't stack with high DEX builds.
- Stats panel created as debug tool now; will be integrated into Phase E UI.

**Test count:** 689 (669 + 20 new)

---

## 2026-03-12 — M1 Phase B: Stats & Leveling

**New files:**
- `src/hud/characterCreation.ts` — `CharacterCreationScreen`: 5-point stat allocation canvas overlay, shown before game loop starts. Arrow keys to navigate/adjust, Enter to confirm.
- `src/hud/levelUpNotification.ts` — `LevelUpNotification`: 3s gold text flash centered top-center, 2s fade-out. Triggered on level-up.

**Modified files:**
- `src/core/gameState.ts` — Added str/dex/vit/wis (base 5), xp, level (base 1), attributePoints, playerName. `maxHp` now `40 + vit * 5`. New methods: `getEffectiveStats()`, `xpForLevel()`, `addXp()`, `allocatePoint()`, `applyCharacterSetup()`. `getEffectiveAtk/Def` delegate to `getEffectiveStats()`.
- `src/enemies/enemyTypes.ts` — Added `xp` to `EnemyDef`: rat=10, skeleton=25, orc=50.
- `src/hud/hudCanvas.ts` — Added `getCanvas()`, wired `levelUpNotification` into draw call.
- `src/main.ts` — Character creation await block before game loop; XP award on kill; level-up notification update/draw in game loop.

**Decisions:**
- WIS has zero mechanical effect in M1 — shown in character creation with note "magic (not yet)". Reserved for M4 mana.
- `getEffectiveStats()` fallback path (no DB loaded) includes legacy `this.atk`/`this.def` for backwards compat with combat tests.

---

## 2026-03-12 — M1 Phase A: Entity Registry + Item Database

Data foundation for Milestone 1. All Phase A tasks complete.

**New files:**
- `src/core/itemDatabase.ts` — `ItemDatabase` class + singleton. Loads `public/data/items.json`. Types: `ItemDef`, `ItemStats`, `ItemModifier`, quality/subtype enums. Query API: `getItem(id)`, `getItemsByType(type)`.
- `src/core/entities.ts` — `EntityRegistry` class + `ItemLocation` discriminant union + `EquipSlot` (3→10 slots). Single source of truth for all item instances. Items move between world/backpack/equipped via `moveItem()`.
- `src/core/itemDatabase.test.ts` — 67 new tests
- `src/core/entities.test.ts` — (included in test count above)
- `planning/m1/PLAN.md` — full M1 implementation plan (Phases A–F)

**Modified files:**
- `src/core/gameState.ts` — `EntityRegistry` added alongside legacy item maps (dual-write for backwards compat). `EquipSlot` re-exported from `entities.ts`. `currentLevelId` field added. `normalizeLegacySlot()` maps old `armor`→`chest`, `ring`→`ring1`. `getEffectiveAtk/Def` updated to query registry when DB loaded.
- `src/rendering/itemRenderer.ts` + `consumableRenderer.ts` — query entity registry; fall back to legacy maps when itemId not in DB.
- `src/hud/inventoryPanel.ts` — 10-slot equipment panel + 12-slot backpack.
- `src/level/levelLoader.ts` — equipment slot validator updated to accept all 10 M1 slot names.
- `src/rendering/enemyRenderer.ts` — added `preloadEnemyTextures()` so all sprites are loaded before scene build (fixes orc delayed appearance on level load).
- `src/main.ts` — `itemDatabase.load()` + `preloadEnemyTextures()` called in parallel before level scene build.
- `public/levels/dungeon1.json` + `dungeon3.json` — equipment slot names updated: `armor`→`chest`/`shield`, `ring`→`ring1`.

**Decisions:**
- Dual-write (legacy maps + registry) kept intentionally for Phase A to preserve backwards compat with tests and levelLoader. Legacy maps will be removed when Phase C (equipment expansion) lands.
- itemIds in existing dungeon JSON don't match items.json (legacy naming). Renderers fall back to legacy map for visual category. Will be resolved when M1 dungeon content is authored in Phase F.

**Test count:** 348 (281 existing + 67 new)

---

## 2026-03-07 — Particle Effects

Added three particle effect systems for atmosphere.

**New file:** `src/rendering/particles.ts`
- **DustMotes** — warm-tinted Points floating near ceiling around player. Additive blending, frustum culling disabled. Configurable per level.
- **SconceEmbers** — orange sparks rising from lit sconce flame meshes. Uses `getWorldPosition()` on flame mesh (child[3]) for accurate spawn position.
- **WaterDrips** — full drop lifecycle: slow formation on ceiling → gravity fall with stretch → expanding ring splash on floor. Spawns at random walkable cells near player, 10-30s interval per cell.

**Type change:** `DungeonLevel` gains `dustMotes?: boolean` (default true) and `waterDrips?: boolean` (default false) for per-level control.

Enabled `waterDrips` on dungeon3 "Dark Cellar" level.

---

## 2026-03-07 — Phase 8: Equipment, Consumables, Enemy Animations

Equipment system, consumable items, backpack inventory, and enemy combat animations.

**New modules:**
- **`src/rendering/itemRenderer.ts`** — billboard sprites for ground equipment items (weapon/armor/ring icons).
- **`src/rendering/consumableRenderer.ts`** — billboard sprites for consumables: red flask (health potion), yellow flask (torch oil).

**Modified modules:**
- **`src/core/gameState.ts`** — `EquipSlot` type, `EquipmentItem` interface, weapon/armor/ring equipment slots with ATK/DEF bonuses. `getEffectiveAtk()`/`getEffectiveDef()` replace raw stats in combat formula. `ConsumableItem` type with `health_potion` and `torch_oil` subtypes. Backpack array (max 8 slots). `enemyAttackPlayer()` reads def from gameState internally.
- **`src/rendering/enemyRenderer.ts`** — Enemy hit shake: horizontal sin-based oscillation (0.3s, amplitude 0.25, decaying). Enemy attack lunge: forward-and-back toward player (triangle wave, 0.25s, 0.6 units).
- **`src/hud/inventoryPanel.ts`** — shows equipped item indicators and backpack contents.
- **`src/level/levelLoader.ts`** — entity validation for `equipment` and `consumable` types.
- **`src/main.ts`** — ground equipment auto-pickup on step, backpack use via Digit1-8 keys, enemy animation wiring.
- **`public/levels/dungeon1.json`** — added items: Rusty Sword, Iron Shield, Power Ring, health potions, torch oil.

**Design decisions:**
- Equipment auto-equips on pickup (oldschool feel, same as keys).
- Consumables go to backpack, used via number keys 1-8.
- Backpack persists across levels.
- Enemy animations are visual-only (don't affect combat timing).

**Tests:** 281 total (23 new).

---

## 2026-03-06 — Phase 7 Complete: Combat

Floating damage numbers and sword swing animation complete Phase 7.

**New modules:**
- **`src/rendering/damageNumbers.ts`** — 3D billboard sprites with canvas-rendered white text + black outline. Float up and fade out over 0.7s from hit enemy position.
- **`src/rendering/swordSwing.ts`** — pixelart sword drawn on HUD canvas, sweeps from lower-right to upper-left over 0.25s with easeOutQuad.

**Wired into:** `main.ts` (game loop + F key handler) and `hudCanvas.ts`.

**Tests:** 258 total, TypeScript compiles clean.

---

## 2026-03-06 — Phase 6 Complete + Phase 7 Combat Foundation

Enemy system marked complete, combat system built.

**New modules:**
- **`src/core/combat.ts`** — pure combat logic: `calculateDamage()`, `playerAttack()`, `enemyAttackPlayer()`. Damage formula: `max(1, ATK - DEF + random(-1..+1))` — always deals at least 1.

**Modified modules:**
- **`src/core/gameState.ts`** — added `atk` (3), `def` (1), `attackCooldown` to GameState.
- **`src/enemies/enemyTypes.ts`** — renamed `damage` → `atk`, added `def`: rat (2/0), skeleton (3/1), orc (5/2).
- **`src/main.ts`** — F key attacks facing cell with 0.8s cooldown. Enemy AI attack actions call `enemyAttackPlayer()`.

**Combat feedback:**
- Enemy mesh flashes red on hit.
- HUD red overlay on player damage.
- Weapon slot cooldown fill overlay.

**Death:** HP <= 0 triggers fade-to-black → full level restart (reset state, player start, full HP/torch, enemies respawn).

**Design decisions:**
- F key melee attack, real-time with cooldown (not turn-based).
- `max(1, ...)` ensures every hit deals damage.
- Death fully resets current level (no save/checkpoint).

**Tests:** 258 total (10 new).

---

## 2026-03-05 — Phase 4 Complete: HUD Overlay

Full HUD system as 2D canvas overlay on top of Three.js viewport.

**New modules (`src/hud/`):**
- **`hudCanvas.ts`** — 640x360 internal resolution canvas with `image-rendering: pixelated`, overlaid on Three.js viewport.
- **`hudLayout.ts`** — layout constants for all HUD elements.
- **`hudColors.ts`** — color palette constants.
- **`pixelFont.ts`** — bitmap font renderer for HUD text.
- **`compassRenderer.ts`** — compass rose (top-left): N/E/S/W letters, active direction highlighted gold.
- **`minimapRenderer.ts`** — minimap (top-right): explored-cell top-down grid, player dot + facing line, centered on player.
- **`healthBar.ts`** — health bar (bottom-left): heart icon, HP fill bar, low-HP pulse effect.
- **`torchIndicator.ts`** — torch indicator (bottom-center-left): flame icon, fuel fill bar, low-fuel flicker effect.
- **`inventoryPanel.ts`** — inventory panel (bottom-right): key count with icon, 3 equipment slots (W/A/R), 8 backpack slots.

**Modified modules:**
- **`src/core/gameState.ts`** — gains `hp`/`maxHp`, `torchFuel`/`maxTorchFuel`, `exploredCells` Set, `revealAround()` method.
- **`src/rendering/player.ts`** — gains `setOnTurn()` callback for exploration on facing change.
- **`src/main.ts`** — wires exploration into initial position, onMove, and onTurn callbacks. Removed old controls hint div.

**Exploration logic:** `revealAround()` marks current cell + 4 adjacent + line-of-sight forward until wall.

**Tests:** 187 total (20 new).

---

## 2026-03-05 — Camera Viewport Tuning

Iterative camera feel tuning — asymmetric frustum crop, stair pitch, telephoto effect.

**Changes:**
- **Asymmetric frustum crop** via `camera.setViewOffset()` in `main.ts` — crop top 15%, expand bottom 20%. Side crop auto-derived to preserve 1:1 aspect ratio. Applied on init + resize.
- **Camera pitch on stairs** in `player.ts` — `STAIR_PITCH = 0.15` rad. Camera tilts down on S cells, up on U cells. Smoothly lerped alongside position and angle.
- **Camera back offset** increased from 0.4 to 0.95 — pulls camera toward cell edge behind player. Combined with FOV 75 this creates a telephoto effect that flattens perspective, making distant objects look closer.
- **EYE_HEIGHT** changed from fixed 1.0 to `WALL_HEIGHT * 0.65` — lower eye height for claustrophobic feel.

**Discarded approaches:**
- Projection matrix Z-column scaling (CAMERA_DEPTH_SCALE) — mathematically equivalent to FOV change, no practical benefit over camera back offset + FOV reduction.
- Camera pitch offset (constant downward tilt) — felt unnatural, reverted.

---

## 2026-03-05 — 3D Stair Geometry + Debug Fullbright

Visual stair steps for S/U cells and a debug lighting toggle.

**New modules:**
- **`src/rendering/stairRenderer.ts`** — builds 3D stair geometry per stair cell. 4 floor steps + 4 ceiling steps (thin slabs at correct Y), 2 side walls (2×WALL_HEIGHT tall), 1 black back wall. Auto-detects approach direction from adjacent walkable neighbor. Textured: floor texture on steps, wall texture on sides, ceiling texture on ceiling steps. Back wall uses `MeshBasicMaterial({ color: 0x000000 })` — pure black regardless of lighting. Materials cached per texture name.

**Modified modules:**
- **`src/rendering/dungeon.ts`** — floor, ceiling, and all 4 wall faces skipped for S/U cells (stairRenderer owns the entire cell geometry).
- **`src/main.ts`** — `stairMeshes` added to `LevelScene`, built in `buildLevelScene()`, cleaned up in `teardownLevelScene()`. Debug fullbright toggle on `L` key: adds bright ambient light + disables fog, toggles off to restore.

**Design decisions:**
- Stair cells fully owned by stairRenderer — dungeon.ts renders nothing for S/U cells
- Back wall pure black (MeshBasicMaterial) to simulate darkness beyond the stairwell
- Side walls extend 2×WALL_HEIGHT to cover one extra floor in the stair direction
- Side wall thickness computed as `(CELL_SIZE - STEP_WIDTH) / 2` — flush with cell edge, no gaps
- Side wall UVs corrected: thin faces scaled proportionally, tall faces repeat texture vertically (RepeatWrapping)
- Vertex color depth fade: all stair geometry fades to black toward the back wall (`applyDepthFade` via vertex colors multiplied with texture)
- Debug fullbright is a runtime toggle (L key), not persisted

---

## 2026-03-05 — Phase 5: Multi-Level Dungeons

Multi-level dungeon support with stair transitions, per-level state persistence, and torch fuel drain.

**Design decisions:**
- **Dungeon format**: Single JSON file with `levels[]` array, each level has unique `id`. Stair entities reference `targetLevel` (id), `targetCol`, `targetRow`.
- **Level state persistence**: `saveLevelState()`/`loadLevelState()` deep-copy snapshots of doors/keys/levers/plates/exploredCells. Revisiting a floor restores its state.
- **GameState split**: `loadNewLevel()` resets level-specific maps but preserves player-global state (hp, torchFuel, inventory).
- **Transition**: Fade-to-black DOM overlay (not Three.js). Blocks input during transition. No camera animation.
- **Stair trigger**: On step (in onMove callback), not on Space interaction.
- **Torch fuel**: Drains 1 per step. Light distance (3–8) and flicker intensity scale with fuel ratio. Ambient prevents total blackout.

**New modules:**
- **`src/core/types.ts`** — `Dungeon` interface, `id` on `DungeonLevel`
- **`src/core/gameState.ts`** — `LevelSnapshot`, `saveLevelState()`, `loadLevelState()`, `loadNewLevel()`, `drainTorchFuel()`, extracted `_parseEntities()`
- **`src/core/levelLoader.ts`** — `validateDungeon()`, `loadDungeon()`, stair entity validation with cross-level reference checks
- **`src/rendering/transitionOverlay.ts`** — `TransitionOverlay` class: pure DOM, fade-to-black, midpoint callback pattern
- **`public/levels/dungeon1.json`** — two-level test dungeon ("Entry Hall" with key puzzle, "Lower Vault")

**Modified modules:**
- **`src/main.ts`** — major restructure: `LevelScene` interface, `buildLevelScene()`/`teardownLevelScene()`, `wireCallbacks()`, `triggerLevelTransition()`. Loads dungeon instead of single level. Torch fuel scales light.
- **`src/hud/hudColors.ts`** — `minimapStairs: '#44aacc'` (teal)
- **`src/hud/minimapRenderer.ts`** — S/U cells rendered with stair color

---

## 2026-03-04 — Door system improvements + lever/plate polish (post Phase 3)

Door improvements, repeatable lever with animation, pressure plate pressed state.

**New modules:**
- **`src/doorAnimator.ts`** — `DoorAnimator` class: registers door panels, animates constant-speed vertical slide (5.0 units/sec). Panels slide above ceiling on open, back down on close. Position-based hiding (always visible in scene).
- **`src/plateRenderer.ts`** — pressure plate mesh on floor. Normal: raised stone slab with beveled edges. Pressed: sunk below floor, darker cracked texture. `pressPlate()` function for runtime state change.
- **`src/leverRenderer.ts`** — wall-mounted lever: metal base plate + pivot group (handle + knob). Pivot rotates between up/down angles. `LeverAnimator` class animates rotation at 4.0 rad/sec. Returns `handleMap` for animator registration.

**Modified modules:**
- **`src/gameState.ts`**:
  - `DoorInstance.mechanical: boolean` — `true` for lever/plate-targeted doors, auto-set in constructor
  - `GameState` constructor accepts optional `grid` — auto-creates closed doors for bare `D` cells
  - `openDoor()` rejects mechanical doors; `closeDoor()` rejects mechanical/locked/missing
  - `activatePressurePlate()` bypasses `openDoor` — directly sets door state
  - `LeverInstance.state: 'up' | 'down'` — replaces `toggled: boolean`, repeatable
  - `activateLever()` toggles state each call (no longer one-shot)
  - `LeverInstance.wall: Facing` — which wall the lever is mounted on
  - `getLever()` method, `autoDetectLeverWall()` helper for backward compat
- **`src/interaction.ts`**:
  - `door_closed` result type — Space on open non-mechanical door closes it
  - Mechanical doors show "This door is operated by a mechanism."
  - Lever interaction: repeatable, no `toggled` guard; player stands ON `O` cell, faces wall
- **`src/doorRenderer.ts`** — rewritten: each door is `THREE.Group` with stone frame (2 pillars + lintel) + door panel. Non-mechanical doors get brass button on left pillar. `meshMap` → `panelMap`. `updateDoorMesh` accepts optional `DoorAnimator`.
- **`src/textures.ts`** — `getDoorFrameTexture()`: grey stone with chisel marks.
- **`src/levelLoader.ts`** — validates lever `wall` field (N/S/E/W if present).
- **`src/main.ts`** — wires `DoorAnimator`, `LeverAnimator`, plate/lever renderers, `door_closed` handler, `pressPlate` on activation.

**Design decisions:**
- Lever is repeatable with up/down state (each pull toggles linked door)
- Lever animation: pivot rotates handle between -0.4 (up) and 0.6 (down) radians
- Pressure plate: one-time use, visual feedback (sinks + darkens)
- Mechanical doors can't be interacted with at all (not just closing — opening too)
- Lever interaction: stand on cell + face wall (directional, must see the lever)
- Door animation: constant speed slide at 5.0 units/sec
- Interactive doors distinguished by brass button on frame (subtle visual cue)

**Tests:** 167 total (20 new).

---

## 2026-03-04 — Phase 3 Complete: Doors & Interaction

First interactive gameplay — doors, keys, levers, pressure plates. All entities are data-driven via level JSON.

**New modules:**
- **`src/gameState.ts`** — `GameState` class: runtime door state (open/closed/locked), key inventory (`Set<string>`), lever/plate tracking. Methods: `isDoorOpen`, `openDoor`, `unlockDoor`, `toggleDoor`, `pickupKeyAt`, `activateLever`, `activatePressurePlate`. Pure logic, no Three.js.
- **`src/interaction.ts`** — `interact(playerState, grid, gameState)` dispatches Space key: opens closed doors, unlocks locked doors (consumes key from inventory), pulls levers (toggles linked door). Returns typed `InteractionResult`.
- **`src/doorRenderer.ts`** — builds door meshes per `GameState.doors`. Auto-detects orientation from adjacent walls. `DoubleSide` material, visibility toggle on open/close.
- **`src/keyRenderer.ts`** — gold key billboard meshes on floor. Hidden on pickup.

**Modified modules:**
- **`src/grid.ts`** — `isWalkable()` gained optional `isDoorOpen` callback: `'D'` cells delegate to callback when provided. `PlayerState` passes it through. New `getFacingCell()` helper.
- **`src/player.ts`** — `getState()` exposes `PlayerState`, `setOnMove()` callback fires after each successful movement (for key pickup + pressure plates).
- **`src/textures.ts`** — 2 new procedural textures: `getDoorTexture()` (dark wood planks with frame), `getLockedDoorTexture()` (darker with iron bands, studs, keyhole). Standalone cached getters, not in wall/floor/ceiling registries.
- **`src/levelLoader.ts`** — entity validation: doors (state, keyId, D-cell), keys (keyId, walkable cell), levers (targetDoor format, D-cell target), pressure plates (targetDoor, walkable cell).
- **`src/main.ts`** — wires GameState, door meshes, key meshes, interaction, onMove callback for pickup/plates.

**New level:**
- `public/levels/level7.json` "The Locked Vault" — puzzle level: closed doors, locked door + key, lever, pressure plate.

**Design decisions:**
- Interaction key: `Space`
- Key pickup: auto on step (oldschool feel)
- Inventory: `Set<string>` of key IDs only (full inventory deferred)
- Door orientation: auto-detect from adjacent walls, default N-S if ambiguous
- Pressure plates: one-way open (stays open)
- Backward compat: `'D'` cell with no door entity = always open

**Tests:** 147 total (71 new across 4 test files).

---

## 2026-03-04 — Phase 2: charDefs texture system replaces verbose cellOverrides

Replaced the per-cell `cellOverrides` model with a 4-layer texture resolution system. The key addition is `charDefs` — custom ASCII characters that carry texture information and can be painted directly into the grid.

- **`src/types.ts`** — added `CharDef` interface (extends `TextureSet` with `char: string`, `solid: boolean`), added `charDefs?: CharDef[]` to `DungeonLevel`
- **`src/grid.ts`** — added `buildWalkableSet(charDefs?)` that merges walkable charDef chars into `WALKABLE_CELLS`; `isWalkable()` and `PlayerState` now accept optional walkable set
- **`src/dungeon.ts`** — texture resolution now 4 layers: hard-coded → defaults → charDefs → areas; added `resolveWallMat()` for solid charDef neighbor wall textures; `buildDungeon()` accepts `charDefs` param
- **`src/player.ts`** / **`src/main.ts`** — wired walkable set through Player to PlayerState
- **`src/levelLoader.ts`** — charDefs validated before grid chars (so custom chars are known); validates char (single, not built-in, no duplicates), solid (boolean), texture names; grid and playerStart validation use extended known/walkable sets
- **Levels 4–6** — rewritten with `charDefs`, areas removed; grids now use `b`/`,`/`m`/`w` to visually show texture themes
- **`DUNGEON-DESIGNER.md`** (new) — full level JSON schema reference for human and agent authors
- **Tests** — 76 total (28 new): charDefs validation (15), buildWalkableSet (3), isWalkable with custom set (1), PlayerState with custom walkable (2), plus grid.test.ts additions

**Design decision**: charDefs are layer 3 (between defaults and areas). Solid charDefs provide `wallTexture` to adjacent walkable cells' wall faces. The `areas` system remains available as layer 4 for rectangular overrides.

---

## 2026-03-03 — Phase 2: Texture variety, per-cell overrides, 3 new levels

Added multiple texture styles and wired the `CellOverride` mechanism so levels can assign different textures per cell:

- **`src/textureNames.ts`** (new) — pure constants file, no Three.js dependency
  - `WALL_TEXTURES`: stone, brick, mossy, wood
  - `FLOOR_TEXTURES`: stone_tile, dirt, cobblestone
  - `CEILING_TEXTURES`: dark_rock, wooden_beams
  - Type aliases + `Set<string>` versions for validation
- **`src/textures.ts`** — expanded from 3 to 9 texture generators + cached registry
  - New walls: `brick` (warm red-brown, wider bricks), `mossy` (stone + green patches), `wood` (vertical grain + knots)
  - New floors: `dirt` (earthy brown, pebble spots), `cobblestone` (irregular rounded stones)
  - New ceiling: `wooden_beams` (dark wood base + thick horizontal beams)
  - Cached getters: `getWallTexture(name)`, `getFloorTexture(name)`, `getCeilingTexture(name)`
  - Old direct-export functions removed
- **`src/types.ts`** — added `ceilingTexture?: string` to `CellOverride`
- **`src/dungeon.ts`** — `buildDungeon(grid, cellOverrides?)` now builds override lookup map and selects per-cell materials (cached `MeshLambertMaterial` per texture name)
- **`src/levelLoader.ts`** — validates cellOverrides: array structure, numeric col/row, grid bounds, known texture names, ceilingHeight type
- **`src/levelLoader.test.ts`** — 10 new tests for cellOverrides validation (48 total)
- **3 new levels** using cellOverrides for themed zones:
  - `level4.json` "The Sunken Crypt" (20×20) — brick hall → mossy crypt → wood library
  - `level5.json` "Winding Depths" (18×18) — mossy cavern → brick guardroom → wood study
  - `level6.json` "The Grand Hall" (20×20) — central brick hall with 4 themed corners

**Known issue**: the per-cell cellOverrides model is verbose — next session will refactor to area-based overlays, level defaults, and special char definitions.

---

## 2026-03-03 — Phase 2 started: Procedural textures + input QoL

First Phase 2 work — replaced flat-colored materials with procedural pixelart textures:

- **`src/textures.ts`** (new) — Canvas2D texture generation with nearest-filter for pixel-perfect rendering
  - `createWallTexture()` — grey-brown stone with per-pixel noise + brick mortar pattern
  - `createFloorTexture()` — dark stone tile base with grid lines
  - `createCeilingTexture()` — very dark rock with subtle crack lines
  - All textures use `THREE.NearestFilter` and `SRGBColorSpace`
- **`src/dungeon.ts`** — wall/floor/ceiling materials now use canvas textures instead of flat `MeshLambertMaterial` colors
- **`src/main.ts`** — added `Q`/`E` key bindings for turning (alongside existing arrow keys)

---

## 2026-03-01 — Phase 1 Complete: Foundation Refactor

Completed all remaining Phase 1 steps in a single session:

- **`DungeonLevel` type + supporting types** (`src/types.ts`)
  - `DungeonLevel`, `Entity`, `CellOverride` interfaces
  - Grid format changed from `number[][]` to `string[]` with char-based cells (`.#DSUO `)
  - `WALKABLE_CELLS` set in `grid.ts` as single source of truth
- **External JSON level loading** (`src/levelLoader.ts`)
  - `loadLevel(url)` fetches + validates + returns typed `DungeonLevel`
  - `validateLevel(data, source)` extracted as pure function for testability
  - Validates: name, grid structure, uniform row lengths, known cell chars, playerStart bounds + walkability, facing, entities
- **Level files** in `public/levels/` — level1.json (Two Rooms), level2.json (L-Corridor), level3.json (First Room)
- **`buildDungeon` returns `THREE.Group`** — no longer mutates scene directly, enables level teardown/swap
- **`main.ts` async init** — wraps everything in `async init()`, loads level via fetch, `.catch()` error handler
- **Vitest test suite** — 38 tests across 2 files:
  - `grid.test.ts` (26 tests): isWalkable, WALKABLE_CELLS, turn tables, FACING_DELTA, PlayerState movement/turning/paths, void cells, OOB movement
  - `levelLoader.test.ts` (12 tests): all validation branches + happy path
- **Developer Council review** — SoftwareDeveloper + QaTester specialists identified validation gaps and test coverage issues, all addressed
- `tsconfig.json`: added `skipLibCheck: true` for vitest 4.x type compat

---

## 2026-03-01 — Phase 1 Step 1: Extract PlayerState + grid logic

Decoupled pure game logic from Three.js rendering in the player module:

- **Created `src/grid.ts`** — pure TypeScript, zero Three.js dependency
  - `Facing` type, direction tables (`FACING_ANGLE`, `FACING_DELTA`, `TURN_LEFT`, `TURN_RIGHT`)
  - `isWalkable()` as a pure function (takes map as parameter)
  - `PlayerState` class — holds grid position + facing, movement methods return success boolean
- **Slimmed `src/player.ts`** — now rendering-only
  - Imports `PlayerState` from `grid.ts`, delegates all grid logic
  - Retains Three.js camera tween, `gridToWorld`, `isAnimating`, `update`, `getWorldPosition`
- `dungeon.ts` and `main.ts` unchanged

This enables unit testing grid logic without Three.js and sets up clean type separation for later steps.

---

## 2026-02-28 — Planning session: all design decisions resolved

Developer Council (4 specialists, 3 rounds) identified all vague spots in the project. Decisions made:

- **Player stats**: HP + ATK + DEF + draining resource
- **Resources**: Torch Fuel (phase 5), Hunger (phase 8), Sanity (phase 8) — torch fuel first
- **Doors**: both key-locked (key consumed) and switch/plate-operated
- **Inventory**: equipment slots (weapon, armor, ring) + general backpack grid
- **Enemy movement**: move toward player (pathfinding on grid); later: varied AI strategies
- **Level transitions**: short descent animation → fade to black → new level → fade in
- **HUD timing**: after data model (GameState/DungeonLevel), not as early stub
- **Metadata format**: decided at implementation time (extensible entity schema)
- **Combat model**: deferred to Phase 7
- **Death/respawn**: deferred to Phase 7

Architecture plan established:
- Decouple Player from camera (pure grid state vs render layer)
- Introduce GameState as single source of truth
- DungeonLevel type replaces raw `number[][]`
- `buildDungeon` returns `THREE.Group` for clean level teardown

8-phase build order created — see PLAN.md.

---

## 2026-02-28 — Session workflow established

- CLAUDE.md: added session workflow rules (read PROGRESS.md on start, update on end)
- PROGRESS.md: restructured to track phases from PLAN.md
- LOG.md: created for decision and change history

---

## 2026-02-28 — Scaffold complete (Session 1)

Decisions made during scaffolding:
- **Renderer**: Three.js in browser (not Phaser, not Godot)
- **Perspective**: true 3D with grid movement (Grimrock-style, not sprite-based EotB)
- **Aesthetic**: pixelart textures on 3D geometry
- **Enemies**: billboard sprites (camera-facing 2D)
- **Dungeon format**: grid-based 2D array (hardcoded initially, JSON later)
- **Platform**: browser desktop first, shareable via link
- **Art generation**: Midjourney or Leonardo for textures
- **Language**: TypeScript
- **Build**: Vite + npm
- **Camera movement**: short tween animation on steps and turns

Code created:
- `src/main.ts` — scene, camera, renderer, lighting, hardcoded 2-room map, input handling, render loop
- `src/dungeon.ts` — `buildDungeon()` creates wall/floor/ceiling meshes from 2D grid array
- `src/player.ts` — `Player` class with grid movement, facing direction, tween camera animation
- `index.html`, `package.json`, `tsconfig.json`, `.gitignore`
