# Milestone 2: The Dangerous Dungeon — Implementation Plan

**Status:** Not started
**See:** [DESIGN.md](DESIGN.md) for full feature specs, [ADR.md](ADR.md) for architecture decisions.

---

## Phase A: Signal System Foundation
1. Migrate `target: string` → `targets: string[]` across codebase + dungeon_m1.json
2. Signal state tracking: `SignalState` map in GameState (which sources are active)
3. Gate mode evaluation on receivers (OR/AND/XOR)
4. Signal behaviors on sources (toggle, momentary, one_shot, timed)
5. New entity types: `trigger`, `tripwire`
6. Standalone gate entities: AND, OR, NOT, DELAY, PULSE_EDGE, PULSE_REPEAT
7. **Editor: `targets[]` array** — inspector field migrated from single `target` to multi-target list (add/remove target IDs)
8. **Editor: signal inspector fields** — `signalMode` dropdown, `signalDuration` input, `gateMode` dropdown on receivers
9. **Editor: new entity palette entries** — `trigger`, `tripwire`, gate entities with `gateType` selector
10. **Editor: wiring visualization** — draw arrows from source to all `targets[]` on the map overlay
11. Tests

## Phase B: Projectile System
12. Projectile data model + ProjectileManager
13. Projectile movement, collision detection, damage application
14. Trap launcher entity (signal-activated)
15. 3 projectile types: dart, arrow, fireball
16. Projectile rendering (billboard sprites, movement interpolation)
17. **Editor: `trap_launcher` palette entry** — with `facing`, `projectileType`, `reloadTime` inspector fields
18. **Editor: trap launcher preview** — directional arrow icon on map showing fire direction
19. Tests

## Phase C: Status Effects
20. StatusEffect data model on GameState + EnemyInstance
21. Effect tick logic in enemy AI loop + main game loop
22. Poison (spider onHit behavior), slow, burning (fireball)
23. HUD status icons + visual tint overlays
24. Tests

*No editor work — status effects are runtime-only, configured via enemy behaviors in enemies.json.*

## Phase D: Environment Entities
25. Breakable walls (HP, combat interaction, grid mutation, optional drops)
26. Secret walls (walk-into detection, grid mutation, charDef)
27. Pushable blocks (interact to push, pressure plate interaction, pathfinding)
28. Treasure chests (open/locked/signal states, loot, animation)
29. Message signs (scroll-style popup overlay)
30. Renderers for all new entity types
31. **Editor: `breakable_wall` palette entry** — `hp` input, `drops` editor (reuse enemy drops UI if available)
32. **Editor: `secret_wall` palette entry** — placed on wall cells, charDef selector for subtle texture variant
33. **Editor: `block` palette entry** — placed on walkable cells, simple placement
34. **Editor: `chest` palette entry** — `keyId` input, `drops` editor, `gateMode` dropdown for signal-controlled chests
35. **Editor: `sign` palette entry** — `wall` facing selector, `text` multiline input field
36. Tests

## Phase E: Save/Load
37. Save data serialization (Maps → Records, Sets → arrays)
38. localStorage read/write with slot management
39. Auto-save on stair transition
40. Save/load UI (menu overlay, slot display, death prompt)
41. Export/import JSON
42. Death → load last save behavior
43. Tests

*No editor work — save/load is a game runtime feature.*

## Phase F: Content & Polish
44. New charDef textures (cracked wall, mossy wall)
45. Projectile sprites (dart, arrow, fireball)
46. Status effect visuals (tint overlays, HUD icons)
47. M2 test dungeon: "The Architect's Tomb" (3 levels)
48. Playtesting & balance pass

---

*Detailed task breakdowns, file lists, and swarm structure will be expanded when implementation begins.*
