# Milestone 2 — Architecture Decision Records

---

## ADR-M2-01 — Signal System: Direct References with Gates

**Status:** Accepted
**Date:** 2026-03-18

### Context

M1 uses direct entity ID references (`lever.target = "door_1"`) for wiring. M2 needs fan-out (one source → multiple targets), fan-in (multiple sources → one receiver), and logic gates for puzzles. Three options were considered: named channels, extended direct references, or a hybrid.

### Decision

**Extend direct references. No named channels.**

- `target: string` migrates to `targets: string[]` (breaking change, migrate dungeon_m1.json only)
- Fan-out: sources list multiple target IDs in `targets` array
- Fan-in: multiple sources can list the same receiver in their `targets`
- Simple logic: receivers have a `gateMode` field (`"or"` default, `"and"`, `"xor"`) for built-in evaluation when they have multiple incoming signals
- Complex logic: standalone invisible gate entities (AND, OR, NOT, DELAY, PULSE_EDGE, PULSE_REPEAT) positioned on the grid, with their own `targets` for output

### Alternatives Rejected

**Named channels (pub/sub):** Rejected. Adds indirection (entity → channel name → subscribers) without clear benefit. Direct references are easier to visualize in the editor (draw arrows between entities). Named channels make debugging harder ("which entities are on channel 'trap_corridor_1'?").

**Separate gate entities only (no built-in gates):** Rejected. Forces users to create gate entities even for simple two-lever AND door. The built-in `gateMode` on receivers covers 80% of cases without extra entities.

### Consequences

**Positive:**
- Editor wiring visualization (arrows) works unchanged — just draw arrows to all `targets[]`
- Backward-compatible in spirit (same pattern, just array instead of string)
- Gate entities are optional — simple levels don't need them
- Signal state is computable from source states + gate topology (no hidden state)

**Negative / Risks:**
- **Circular references**: gate A → gate B → gate A would loop. Must detect and break cycles during signal evaluation.
- **Signal evaluation order**: with DELAY and PULSE gates, signals become time-dependent. Need a proper tick-based signal propagation, not just instant evaluation.
- **Editor complexity**: standalone gate entities need visual representation in the editor (logic symbols), targets array editing, and wiring arrows. Significant editor work.

---

## ADR-M2-02 — Projectile System Architecture

**Status:** Accepted
**Date:** 2026-03-18

### Context

M2 trap launchers fire projectiles across corridors. M4 will add player-fired ranged weapons. The projectile system should be designed once and extended, not rebuilt.

### Decision

**Design for both traps and ranged combat, implement traps only in M2.**

Projectiles are managed by a `ProjectileManager` that tracks active projectiles, updates positions each frame, checks collisions, and applies damage. Each projectile has a `source` field (`'trap'`, `'player'`, `'enemy'`) for future routing of damage/effects.

Projectiles move in cardinal directions only (no diagonal). Speed is in cells/second. Position is fractional (for smooth rendering). Collision checks happen at cell boundaries.

### Alternatives Rejected

**Minimal trap-only system:** Rejected. Would need to be rebuilt for M4 ranged combat. The cost of designing the general system now is low (extra fields in the interface), and the implementation for M2 is the same either way.

### Consequences

**Positive:**
- M4 ranged combat can reuse ProjectileManager, collision, rendering
- Projectile types are data-driven (speed, damage, sprite, status effect)

**Negative / Risks:**
- Slightly over-designed for M2 (the `source` field and enemy-hit logic won't be used until M4)

---

## ADR-M2-03 — Save/Load with localStorage

**Status:** Accepted
**Date:** 2026-03-18

### Context

M1 has no persistence — browser refresh loses everything. M2's longer dungeons and trap-heavy design make this unacceptable. Need a save system.

### Decision

**localStorage with 5 manual slots + 1 auto-save slot + JSON export/import.**

- Manual saves: player opens save menu, picks a slot (1-5), overwrites
- Auto-save: written on every stair transition (single slot, overwritten each time)
- Death: prompts "Load last save?" instead of restarting level
- Export: download save as `.json` for portability
- Import: upload `.json`, validate format version, load

Save data includes full GameState (player stats, inventory, position), all level snapshots (door/enemy/item states), and the current level's live state.

### Alternatives Rejected

**IndexedDB:** More robust but async API adds complexity. localStorage's 5MB limit is more than sufficient for serialized game state (~100KB per save).

**Auto-save only:** Rejected. Players want control over when they save, especially before dangerous rooms. Manual slots are the standard expectation.

### Consequences

**Positive:**
- Simple synchronous API (localStorage.setItem/getItem)
- Export/import enables sharing saves and backup
- 5 slots is enough without being overwhelming

**Negative / Risks:**
- **localStorage cleared on browser data clear**: mitigated by export/import feature
- **Save format versioning**: saves from v0.2 may not load in v0.3 if entity types change. Include a version field and validate on load.
- **Serialization of Maps/Sets**: JavaScript Maps and Sets don't JSON.stringify. Need conversion helpers (Map → Record, Set → array).

---

## ADR-M2-04 — Status Effects System

**Status:** Accepted
**Date:** 2026-03-18

### Context

M1 has no status effects. Spider has a poison data tag that does nothing. M2 introduces three effects: poison, slow, burning. These need to integrate with the existing real-time combat and movement systems.

### Decision

**Array-based status effects on both player and enemies.**

- `GameState.playerStatusEffects: StatusEffect[]`
- `EnemyInstance.statusEffects: StatusEffect[]`
- Each effect has: type, remaining duration, tick timer, tick interval, tick damage
- Ticked every frame: decrement remaining, accumulate tick timer, apply damage/slow when timer fires
- Enemy effects ticked in `updateEnemies()` (already has per-enemy delta processing)
- Player effects ticked in main game loop (alongside attack cooldown)
- Slow effect: multiplies effective move interval (enemies) or tween duration (player)
- Multiple effects can stack (e.g. poisoned AND burning simultaneously)
- Same-type effects refresh duration (don't stack damage)

### Consequences

**Positive:**
- Simple array model, easy to serialize for save/load
- Integrates naturally into existing tick loops
- Same model works for player and enemies

**Negative / Risks:**
- **Slow on player**: needs to affect the tween animation system in Player class, not just a number. May need a `getEffectiveMoveDuration()` method.
- **Visual feedback**: each active effect needs a HUD icon and/or tint. Burning and poison both do tick damage — ensure they're visually distinguishable.
