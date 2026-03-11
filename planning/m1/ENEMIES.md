# Milestone 1 — Enemy Roster

9 enemies total. 3 carried from v1, 6 new.

Stats reference: ATK (damage output), DEF (damage reduction), HP, moveInterval (ms between moves — lower = faster).

---

## Existing (v1)

| Enemy | ATK | DEF | HP | Move (ms) | Size | Notes |
|---|---|---|---|---|---|---|
| Rat | 2 | 0 | 8 | 600 | 0.6 | Fast, weak, swarm filler |
| Skeleton | 3 | 1 | 20 | 1000 | 1.2 | Medium all-round |
| Orc | 5 | 2 | 40 | 1400 | 2.0 | Slow, hits hard |

---

## New (M1)

### Goblin
- **ATK** 2 | **DEF** 0 | **HP** 10 | **Move** 500ms | **Size** 0.8
- Fast, fragile, annoying. Slightly beefier than a rat but moves faster. Natural pack enemy — place 2-3 together.
- No special behavior. Pure speed pressure.
- **Loot:** small gold, occasionally a dagger or lockpick (M2).

### Giant Bat
- **ATK** 1 | **DEF** 0 | **HP** 6 | **Move** 400ms | **Size** 0.7
- Fastest enemy in the roster. Tickles for damage but hard to hit before it gets to you.
- Ideal for dark cave sections — spooks the player before they understand the threat.
- **Special:** erratic pathfinding — occasionally moves to a random adjacent cell instead of directly toward player. Gives it a fluttery, unpredictable feel.
- **Loot:** nothing or tiny gold. Purely atmosphere tax.

### Spider
- **ATK** 3 | **DEF** 0 | **HP** 14 | **Move** 600ms | **Size** 0.9
- Fast attacker, no armor. Feels dangerous because of speed + decent ATK combo.
- Placeholder for **poison** (M2 status effect) — add the tag now so the loot table and tooltip can say "May poison" even if the effect isn't implemented yet.
- Fits cave/dungeon-deep levels. Unnerving at range.
- **Loot:** occasionally a small health potion or antidote (ironic).

### Kobold
- **ATK** 2 | **DEF** 1 | **HP** 12 | **Move** 700ms | **Size** 0.8
- Cowardly hoarder. Engages normally until HP drops below 30%, then **flees** — new AI state.
- While fleeing: pathfinds *away* from player (inverse BFS), moves at double normal speed.
- If cornered (no escape path), panics and attacks at full speed.
- **Special:** drops a small guaranteed item on death (they were hoarding it). Better loot than goblins.
- **Loot:** always drops something — small gold + 30% chance of a random common item.

### Zombie
- **ATK** 3 | **DEF** 1 | **HP** 50 | **Move** 1600ms | **Size** 1.3
- Slow wall of HP. Dangerous not because of speed but because it eats every attack and keeps coming.
- The threat is attrition — it forces the player to commit to a fight they can't escape quickly.
- **Special:** none in M1. (Regen considered but deferred — keep it simple. Troll owns that niche.)
- Works well in groups of 2+ blocking a corridor.
- **Loot:** rotten scraps, occasionally low-tier armor.

### Troll
- **ATK** 5 | **DEF** 2 | **HP** 80 | **Move** 1200ms | **Size** 2.2
- The HP sponge boss-tier enemy. Similar ATK to orc but much more HP and **regenerates**.
- **Special:** regenerates 2 HP every 2 seconds while alive. Player must deal enough sustained DPS or it slowly recovers.
- Regen is paused for 3 seconds after taking a hit (so burst damage is still viable).
- Best used as a mini-boss: one troll guarding a valuable room, not packed in groups.
- **Loot:** guaranteed item drop + good gold. Worth the fight.

---

## Roster Summary

| Enemy | Tier | Role | Special |
|---|---|---|---|
| Giant Bat | 1 — Nuisance | Speed pressure, atmosphere | Erratic movement |
| Rat | 1 — Nuisance | Swarm filler | — |
| Goblin | 1 — Nuisance | Fast pack | — |
| Spider | 2 — Threat | Speed + ATK | Poison tag (M2) |
| Kobold | 2 — Threat | Hoarder, coward | Flee below 30% HP |
| Skeleton | 2 — Threat | Balanced | — |
| Zombie | 3 — Danger | HP wall | — |
| Orc | 3 — Danger | Hard hitter | — |
| Troll | 4 — Elite | Mini-boss | HP regen |

---

## New Mechanics to Implement

1. **Flee state** (Kobold) — inverse BFS pathfinding away from player, speed boost while fleeing
2. **Erratic movement** (Bat) — random chance per move tick to go random instead of toward player
3. **HP regen** (Troll) — timer-based regen, paused on damage hit
4. **Poison tag** (Spider) — data flag only in M1, no mechanical effect until M2

---

## Sprite Notes

All enemies are billboard sprites (camera-facing 2D). Each needs a pixelart sprite in the same style as rat/skeleton/orc. Suggested palette: dark muted dungeon tones, consistent light source from above-left.

- **Goblin** — hunched, green-grey skin, beady eyes, crude weapon
- **Giant Bat** — dark wings spread, fanged, hanging or swooping pose
- **Spider** — eight legs visible, chunky body, dark with faint markings
- **Kobold** — small reptilian, clutching a bag or small blade, fearful expression
- **Zombie** — shambling humanoid, torn cloth, outstretched arms, pale/grey
- **Troll** — hulking, knobbly, mossy green skin, wide grin, fists ready
