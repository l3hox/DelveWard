# DelveWard v2 — Design Ideas

Future features and ambitions beyond the v1 foundation. Not prioritized yet — this is the idea pool.

---

## Big Vision: Multi-Level Vertical World

The game currently renders one level at a time. v2 breaks that barrier — multiple dungeon layers coexist in a single 3D scene, visible simultaneously.

### Vertical Openness
- Multiple grid layers stacked vertically with Y offsets
- Void cells with no floor — look down and see the level below
- Fall mechanic when stepping into open space
- Combined scene graph renders all visible levels at once

### Ravines & Caverns
- Deep vertical drops spanning many levels
- Cliff edges where you look down into darkness below
- Bridges spanning chasms — walkable cells with void on both sides
- Cavern ceilings high above, stalactites, vertical scale

### Cliffs & Elevation
- Go up and down cliff faces via carved stairs or ladders
- See the path below/above from the edge
- Waterfalls dropping between levels

### Multi-Story Structures
- Houses with multiple floors, stairs visible from outside
- Windows you can see through — interior/exterior boundary
- Enter buildings, climb internal stairs, look out windows at the street level

### Castles & Fortifications
- Walk on castle walls, see the surrounding terrain from above
- Towers with spiral staircases, visible from the outside
- Battlements, arrow slits, courtyards visible from the walls
- Gate houses, portcullises, drawbridges

### Backdrop Scenes — Custom 3D Beyond the Grid
- Seamless integration of the grid-based dungeon with **inaccessible custom 3D scenes** created in an external 3D editor (Blender, etc.)
- Backdrop scenes are loaded as static meshes and placed around/beyond the grid boundary — visible but not reachable by grid movement
- Use cases:
  - **Mountain ranges** visible from castle walls or cliff edges — massive sense of scale
  - **Distant cities, forests, coastlines** seen from outdoor areas — the world feels bigger than the playable space
  - **Underground vistas** — vast cavern backdrops with glowing lava rivers, crystal formations, or subterranean lakes far below
  - **Sky and horizon** — replaces flat skybox with actual 3D geometry for parallax depth
  - **Set pieces** — a dragon perched on a distant peak, a ruined tower across a chasm, a ship at anchor in a harbor below
- The grid world blends into the backdrop at boundary cells — no visible seam between walkable geometry and backdrop mesh
- Backdrops are purely visual — no collision, no pathfinding, no entities
- Lighting and fog matched between grid scene and backdrop for seamless feel
- Per-level backdrop reference in dungeon JSON: `"backdrop": "mountains-east.glb"` or similar
- Multiple backdrops per level possible (different directions)
- LOD (level of detail) — backdrops can be low-poly since they're always at a distance

---

## Moving Objects & Projectiles

### Trap Projectiles
- Dart traps — wall-mounted, fire darts across corridors on trigger (pressure plate, tripwire, or timed)
- Arrow traps — similar to darts but deal more damage, visible arrow sprite
- Fireball traps — launched from wall sconces or statues, travels in a line, deals fire damage + area glow

### Enemy Projectiles
- Skeleton archers — fire arrows at player from range
- Orc shamans — throw fireballs
- Projectile dodge — step out of the path before it arrives

### Rolling Boulders
- Trap-triggered boulders that roll along a straight line
- Crush anything in their path (player and enemies)
- Audible rumble as they approach
- Block corridors after coming to rest (new obstacle)

### Thrown Items
- Player can throw potions/rocks at enemies from range
- Arc animation for thrown objects
- Splash effect for potions (area heal, area damage)

---

## Environment & Tiles

### Animated Water & Lava
- Water tiles with animated surface, lowered floor geometry
- Lava tiles with glow, damage on contact
- Wading through shallow water (slow movement)

### Outdoor Sections
- No ceiling, skybox above
- Fullbright ambient lighting for outdoor tiles
- Indoor/outdoor boundary walls act as strong light sources
- Day/night cycle affects outdoor light level and skybox

### Breakable Walls
- Cracked wall texture — attack to reveal hidden rooms
- Debris particles on break
- Secret passages behind breakable walls

### Secret Walls
- Push-open walls — walk into them to reveal hidden passages
- Visual tells for observant players (slightly different texture, draft particles)

### Thin Walls
- Walls between two walkable cells (edge walls, not full-cell walls)
- Thin wall doors — enables village houses and walk-in structures
- Fence/railing variants — see through but can't pass

### Pushable Blocks
- Grid-aligned blocks for dungeon puzzles
- Push into pits to create bridges
- Block pressure plates

---

## Combat & Enemies

### Enemy AI Variety
- Patrol paths — guards walking set routes
- Line-of-sight spotting — enemies only aggro when they see you
- Fleeing — low-HP enemies run away
- Hiding — ambush enemies that wait behind corners
- Ranged attackers — archers, mages that keep distance

### Enemy Health Bars
- Small floating bar above enemy sprites
- Only visible when damaged or in combat

### Damage Directional Indicator
- Brief red arrow on HUD showing which direction an attack came from

### Status Effects
- Poison — tick damage over time
- Slow — longer tween duration
- Blind — reduced torch range
- Burning — fire damage over time from lava/fireballs

### Enemy Spawners
- Spawner entity placed on a cell — periodically creates enemies of a given type
- Configurable: spawn interval, max alive count, enemy type, spawn radius
- Can be signal-activated (alarm trap triggers spawner) or always-on
- Destroyable — attack the spawner to stop it (has HP, visual: dark portal / bone pile / nest)
- Scriptable spawn logic for boss encounters (spawn waves, spawn on HP threshold)

### Enemy Drops
- Killed enemies leave items on the ground
- Loot table per enemy type
- Rare drops for stronger enemies

---

## Items & Interaction

### Treasure Chests
- Interact to open, animated lid
- Drop random loot from a loot table
- Locked chests requiring keys
- Mimics (chest that attacks)

### Message Popups
- Stone tablets / signs showing lore or hints
- Interact to read, pixelart text popup

### Dungeon Objects
- Fountains (heal on interact)
- Altars (buff/curse effects)
- Bookshelves (lore, maybe spell scrolls)
- Thrones, statues, barrels, crates (decoration + breakable)

---

## NPCs & Dialog

### NPC Entities
- Billboard sprites like enemies, but non-hostile — distinct visual treatment (no red flash, name label)
- Placed in dungeon JSON as entities with type, dialog tree, and role
- Face the player like enemy billboards

### Dialog System
- Interact (Space) opens a dialog popup — pixelart text box with NPC portrait
- Branching dialog trees — player picks from 2-4 response options
- Dialog can check conditions: inventory contents, quest state, stats, flags
- Dialog can trigger effects: give/take items, set flags, update quests, open doors, spawn enemies
- Dialog data in JSON — tree of nodes with text, options, conditions, and effects

### Trading
- Trade UI — NPC's inventory on one side, player's on the other
- Buy/sell with gold currency (new resource)
- NPC stock can be fixed or level-dependent
- Barter option — trade items directly without gold
- Prices affected by player stats (charisma?) or quest state

### NPC Behaviors
- Stationary — stands in place, waits for interaction (shopkeeper, quest giver)
- Wandering — moves around a small area, can be approached
- Follower — joins the party, follows behind the player (escort quests)
- Schedule — NPC moves between locations based on time/triggers (day guard → night sleeper)

---

## Quests & Quest Log

### Quest Structure
- Quest = a named objective with stages, tracked in a quest log
- Stages: discovered → active → (optional sub-objectives) → complete / failed
- Quest givers: NPCs (dialog), items (read a note), triggers (enter an area), events (kill a boss)

### Quest Log UI
- HUD button or key to open quest log overlay
- Active quests with current objective description
- Completed / failed quests in a separate tab
- Quest markers on minimap (optional, toggleable)

### Quest Actions (What Quests Can Do)
- Update objective text on stage change
- Grant rewards: items, gold, XP, stat boosts, unlock areas
- Modify world state: open/close doors, spawn/despawn NPCs, enable/disable traps
- Chain into follow-up quests

### Hardwired vs Scriptable? (TBD)

**Option A: Data-Driven (Hardwired Actions)**
- Quests defined entirely in JSON — stages, conditions, effects are predefined action types
- Conditions: `hasItem`, `enemyDead`, `flagSet`, `visitedCell`, `questStage`
- Effects: `giveItem`, `removeItem`, `setFlag`, `openDoor`, `spawnEnemy`, `updateQuestStage`
- Pro: safe, predictable, easy to validate in editor, no code execution
- Con: limited to pre-built action vocabulary — every new behavior needs engine code

**Option B: Scripted (TypeScript)**
- Quests have script hooks that run real TypeScript
- Full access to GameState, inventory, scene objects, signal system
- Pro: unlimited flexibility, can express any puzzle or sequence
- Con: security concerns if user-generated, harder to debug, harder to validate

**Option C: Hybrid (Recommended to explore)**
- Simple quests use data-driven JSON (90% of cases)
- Complex boss encounters, multi-stage puzzles, and unique events use script hooks
- Script API is a sandboxed subset — `quest.giveItem()`, `quest.spawnEnemy()`, `scene.getEntity()`, `gameState.hp`, etc.
- Editor has a "simple mode" (form-based conditions/effects) and "advanced mode" (script editor)
- Data-driven quests can be auto-validated; scripted quests get a test-play button

---

## Scripting System

The signal/wiring system handles simple cause-and-effect. Scripts handle everything else — complex puzzles, boss encounters, quest logic, custom NPC behavior, dynamic events.

### Script Scope
- TypeScript snippets attached to entities, triggers, quests, or level events
- Run in response to hooks: `onInteract`, `onStep`, `onSignal`, `onDeath`, `onSpawn`, `onTimer`, `onQuestUpdate`

### Script API (Sandboxed)
Scripts get access to a curated API, not raw engine internals:

- **GameState**: `hp`, `maxHp`, `torchFuel`, `inventory`, `gold`, `stats`, `flags` (read/write)
- **Inventory**: `hasItem()`, `giveItem()`, `removeItem()`, `itemCount()`
- **Entities**: `getEntity(id)`, `spawnEnemy()`, `despawnEntity()`, `moveEntity()`, `isAlive()`
- **Signals**: `emit(channel)`, `isActive(channel)`
- **Scene**: `openDoor()`, `closeDoor()`, `setCell()`, `playEffect()`, `showMessage()`
- **Quests**: `startQuest()`, `updateStage()`, `isQuestActive()`, `completeQuest()`
- **Dialog**: `openDialog(tree)`, `closeDialog()`
- **Time**: `wait(ms)`, `setTimer(ms, callback)`, `onTick(callback)`

### Execution Model
- Scripts run in the main thread but are time-limited (no infinite loops)
- Async-friendly — `await wait(1000)` for timed sequences
- Errors caught and logged to editor console, don't crash the game
- Scripts can be hot-reloaded in editor play-test mode

### Editor Integration
- Script editor panel with syntax highlighting (Monaco / CodeMirror)
- Autocomplete for the script API
- Entity scripts shown as a code icon on the entity in the grid view
- Script debugger: breakpoints, step, inspect GameState during play-test

---

## Item System

### Item Architecture
- Every item is a data object: `id`, `name`, `type`, `subtype`, `icon`, `weight`, `value`, `description`, `properties`
- Items defined in a central item database (JSON) — dungeon entities reference items by ID
- Items exist in three states: in world (ground/chest), in inventory (backpack), equipped (slot)
- Stackable items (potions, rations, arrows, gold) vs unique items (weapons, armor, rings)

### Weapons
| Type | Slot | Behavior | Stat Scaling |
|---|---|---|---|
| Sword | Main hand | Attack facing cell, medium speed | STR |
| Axe | Main hand | Attack facing cell, slow, high damage | STR |
| Mace | Main hand | Attack facing cell, medium, bonus vs armored | STR |
| Dagger | Main hand | Fast attack, low damage, crit chance | DEX |
| Spear | Main hand | Attack 2 cells deep (piercing), slow | STR + DEX |
| Staff | Main hand | Melee + amplifies spell damage | WIS |
| Bow | Both hands | Ranged attack (projectile), requires arrows | DEX |
| Crossbow | Both hands | Ranged, slow reload, high damage, requires bolts | DEX |
| Wand | Main hand | Ranged magic projectile, uses mana, no ammo | WIS |

- Weapon quality tiers: Rusty → Common → Fine → Masterwork → Enchanted → Legendary
- Each tier multiplies base damage and may add bonus properties
- Enchanted/Legendary weapons have special effects (fire damage, life steal, stun chance)
- Durability — weapons degrade with use, repair at NPCs or with repair kits

### Armor
| Slot | Examples |
|---|---|
| Head | Leather cap, iron helm, mage hood, crown |
| Chest | Leather vest, chainmail, plate armor, robe |
| Legs | Leather pants, greaves, mage leggings |
| Hands | Gloves, gauntlets, bracers |
| Feet | Boots, sandals, iron sabatons |
| Shield | Off hand — buckler (light), kite (medium), tower (heavy) |

- Armor class: Light (no penalty), Medium (slight slow), Heavy (slower, louder — enemies detect from further)
- Each piece provides DEF bonus, heavier = more DEF but more weight
- Set bonuses — wearing matching armor pieces grants extra effects
- Enchanted armor: fire resist, poison resist, stealth bonus, HP regen

### Accessories
| Slot | Examples |
|---|---|
| Ring (x2) | Ring of Power (+STR), Ring of Shadows (+stealth), Ring of Regeneration (+HP regen) |
| Amulet (x1) | Amulet of Light (torch range+), Amulet of Warding (+DEF), Amulet of Wisdom (+mana regen) |

- Passive effects — always active while equipped
- Some rings/amulets are cursed — can't unequip without Remove Curse spell or NPC service

### Consumables
| Type | Effect |
|---|---|
| Health potion | Restore HP (small/medium/large variants) |
| Mana potion | Restore MP |
| Antidote | Cure poison |
| Torch oil | Refill torch fuel |
| Rations | Restore hunger (bread, dried meat, cheese, stew) |
| Scroll | One-use spell cast (any spell, no mana cost, no skill check) |
| Thrown weapon | Throwing knife, bomb, holy water — ranged consumable attack |
| Repair kit | Restore weapon/armor durability |
| Lockpick | Attempt to pick a locked door/chest (DEX check, consumed on failure) |

### Ammunition
- Arrows (for bows), bolts (for crossbows) — stackable, consumed on use
- Special ammo: fire arrows, poison bolts, silver arrows (bonus vs undead)
- Recoverable — chance to pick up spent arrows from the ground after combat

### Item Properties & Modifiers
- Base stats: damage (weapons), defense (armor), effect magnitude (consumables)
- Modifiers: `+N STR`, `+N% crit`, `fire damage`, `life steal`, `poison resist`, etc.
- Prefix/suffix system for random loot: "Blazing Sword of the Bear" = fire damage + STR bonus
- Weight — total carry weight affects stamina drain / movement (optional, TBD)
- Required stats — some items need minimum STR/DEX/WIS to equip

### Inventory & Equipment UI
- Equipment paper doll — visual slot layout showing equipped gear
- Backpack grid — expandable with bags? Or fixed 16/24 slots
- Item tooltip on hover — name, stats, description, comparison with currently equipped
- Quick-use bar — number keys for consumables (already partially implemented)
- Sort / filter options
- Drop / destroy items
- Item comparison highlights (green = better, red = worse)

---

## Magic System

### Mana Resource
- MP pool alongside HP — scales with WIS and level
- Regenerates slowly over time (rate boosted by WIS, amulets, resting)
- Mana potions for instant restore
- Some spells cost HP instead of MP (blood magic — risky but powerful)

### Spell Schools
| School | Theme | Stat | Examples |
|---|---|---|---|
| Fire | Damage, AoE | WIS | Fireball, Fire Wall, Ignite, Meteor |
| Ice | Crowd control, slow | WIS | Frost Bolt, Freeze, Ice Wall, Blizzard |
| Lightning | High single-target, chain | WIS | Spark, Chain Lightning, Thunderbolt |
| Holy | Healing, undead damage | WIS | Heal, Cure Poison, Turn Undead, Resurrect |
| Shadow | Debuff, stealth, drain | WIS | Drain Life, Blind, Shadow Step, Fear |
| Earth | Defense, terrain | WIS | Stone Skin, Earthquake, Wall of Stone, Entangle |
| Arcane | Utility | WIS | Light (extended torch), Detect Secrets, Telekinesis, Identify, Remove Curse |

### Learning Spells
- **Option A: Spell books** — find/buy spell books, learn permanently
- **Option B: Skill tree** — spend skill points at level-up to unlock spells in each school
- **Option C: Hybrid** — basic spells from books, advanced spells require skill investment
- Scrolls provide one-time use of any spell without learning it

### Casting Mechanics
- Select active spell (hotbar or spell menu)
- Cast with a key (G? or right-click equivalent)
- Some spells are instant, some have a short cast time (vulnerable while casting)
- Directional — offensive spells fire in facing direction
- Self-targeted — buffs and heals apply to player
- AoE — affects a pattern of cells (cross, cone, line, radius)
- Spell level — same spell gets stronger as the school skill increases

### Spell Interactions with World
- Fire spells ignite oil puddles, melt ice, light unlit torches
- Ice spells freeze water tiles (walkable ice), slow enemies
- Lightning chains through water, extra damage to wet targets
- Earth spells can block corridors (Wall of Stone), reveal secret walls
- Arcane Light replaces/supplements torch — doesn't drain fuel
- Telekinesis pulls levers, pushes blocks from a distance — puzzle solving tool

---

## RPG System & Character Progression

### Core Attributes
| Attribute | Abbreviation | Effects |
|---|---|---|
| Strength | STR | Melee damage, carry weight, forced doors/blocks |
| Dexterity | DEX | Ranged damage, crit chance, dodge, lockpicking, trap disarm |
| Vitality | VIT | Max HP, HP regen rate, poison/disease resistance, hunger drain rate |
| Wisdom | WIS | Max MP, spell damage, mana regen, scroll success rate |

- Start with a point pool to distribute (character creation) or pick a class template
- Each level-up grants +N attribute points to allocate freely

### Derived Stats
| Stat | Formula |
|---|---|
| Max HP | Base + VIT × scaling |
| Max MP | Base + WIS × scaling |
| Melee ATK | Weapon base + STR modifier |
| Ranged ATK | Weapon base + DEX modifier |
| Spell Power | Base + WIS modifier + staff/wand bonus |
| DEF | Armor total + shield + buffs |
| Crit Chance | Base 5% + DEX modifier |
| Dodge Chance | Base 0% + DEX modifier (light armor only) |
| Carry Capacity | Base + STR × scaling |

### Experience & Leveling
- XP from: killing enemies, completing quests, discovering areas, disarming traps
- XP curve: each level requires progressively more XP
- Level cap: TBD (20? 30? 50?)
- On level-up: attribute points, HP/MP increase, possibly skill points

### Classes vs Classless (TBD)

**Option A: Classless (Free-form)**
- No classes — player distributes stats and learns whatever spells/skills they find
- Character identity emerges from gear + stat choices
- Pro: maximum freedom, simpler system, one character can try everything
- Con: risk of unfocused builds, harder to balance

**Option B: Classes (Archetype Templates)**
- Choose a class at start: Warrior, Rogue, Mage, Cleric (+ maybe Ranger, Paladin)
- Each class has: stat bonuses, exclusive skills, equipment restrictions, spell school access
- Pro: clear identity, easier balance, class-specific quests
- Con: less freedom, more content to design per class

**Option C: Hybrid (Classless with Specializations)**
- No class lock at start — play however you want
- At certain levels (5, 10, 20?) choose a specialization that grants bonuses and unlocks
- Specializations: Berserker (STR burst), Assassin (crit + stealth), Archmage (spell mastery), Paladin (holy + melee), Ranger (bow + survival)
- Pro: freedom early, identity later, replayability
- Con: more complex to implement

### Skills (Non-Spell Abilities)
| Skill | Stat | Effect |
|---|---|---|
| Lockpicking | DEX | Pick locked doors/chests without keys |
| Trap Disarm | DEX | Spot and disarm traps before triggering |
| Stealth | DEX | Reduced enemy detection range |
| Shield Block | STR | Active block with shield, reduces incoming damage |
| Power Strike | STR | Heavy melee hit, cooldown, bonus damage |
| Dual Strike | DEX | Two fast hits, dagger only |
| First Aid | WIS | Heal without spell/potion, long cooldown |
| Identify | WIS | Reveal item properties (or pay NPC to identify) |
| Survival | VIT | Reduced hunger/thirst drain, forage for rations |

- Skills improve with use (Elder Scrolls style) or via skill points (TBD)

### Resource Systems
| Resource | Drain | Restore | Effect When Low |
|---|---|---|---|
| HP | Combat damage, traps, hazards, starvation | Potions, spells, rest, food | Death at 0 |
| MP | Spell casting | Potions, regen, rest | Can't cast spells |
| Torch Fuel | Per step (existing) | Oil, Light spell, sconces | Darkness, reduced vision |
| Hunger | Over time / per step | Rations, cooked food, inns | Starving: HP drain, stat penalties |
| Sanity (optional) | Darkness, eldritch enemies, cursed areas | Light, safe zones, potions | Visual distortion, hallucination enemies, stat penalties |

### Death & Consequences
- HP reaches 0 → death
- **Option A: Restart level** (current v1 behavior)
- **Option B: Corpse run** — respawn at last save point, gear stays on corpse, retrieve it
- **Option C: Roguelike permadeath** — game over, start fresh (hardcore mode toggle?)
- **Option D: Mixed** — normal mode has save points, hardcore mode has permadeath

### Character Creation (if classes exist)
- Name
- Class selection (or skip if classless)
- Stat point allocation
- Portrait selection (pixelart portraits)
- Brief backstory flavor text per class

---

## Visual & Audio Polish

### Particle Effects (Extended)
- Torch wall shadows — dynamic shadow planes behind pillars/door frames
- Poison gas clouds — visible green particles in hazard zones
- Blood splatter on hits
- Magical sparkles on enchanted items

### Camera
- Footstep screen bob — subtle camera vertical bounce on each step
- Screen shake on big hits

### Minimap Improvements
- Fog-of-war fade — explored but not currently visible cells draw dimmer
- Enemy dots on minimap (within line of sight)
- Item/chest markers

### Sound
- Ambient sound — dripping water, distant echoes, wind
- Footstep sounds (surface-dependent)
- Combat sounds — sword clang, monster growl, hit impact
- Door creaks, lever clicks, chest opening
- Music — per-level ambient tracks

---

## Level Editor

Building levels by hand-editing JSON works for small dungeons but won't scale to the v2 vision (multi-level vertical worlds, signal wiring, complex puzzles). A visual editor is essential.

### Core Editor
- Browser-based (same tech stack — Three.js + TypeScript + Vite)
- Grid painting — click/drag to place wall, floor, void, door, stair cells
- Multi-layer view — stack levels vertically, toggle layer visibility
- Entity placement — drag-drop enemies, items, triggers, traps onto cells
- Live 3D preview — see the dungeon as the player would while editing
- Undo/redo, copy/paste regions, flood fill
- Export/import JSON (same format the game loads)

### CharDef & Texture Painting
- Visual charDef editor — define custom cell types with texture presets
- Area painting — draw rectangular texture override zones
- Texture picker with preview thumbnails

### Test Play
- One-click "play from here" — drop into the dungeon at the cursor position
- Instant reload on edit — no restart needed
- Toggle between edit mode and play mode

---

## Signal & Wiring System (Traps & Puzzles)

How traps, puzzles, and mechanical contraptions are designed and connected. This is the backbone for all non-trivial dungeon interactions.

### The Problem
v1 has simple hardcoded connections: a lever targets a specific door, a pressure plate targets a specific door. This doesn't scale to complex puzzles (multi-switch AND gates, timed sequences, chain reactions, trap corridors).

### Signal Model (TBD — Options to Explore)

**Option A: Visual Wiring in Editor**
- Signal sources (emitters): pressure plates, levers, tripwires, timers, kill triggers, player-step triggers
- Signal receivers (actuators): doors, pit traps (floor opens), dart/arrow/fireball launchers, moving walls, bridges, portcullises, spawn triggers
- Logic gates: AND (all inputs active), OR (any input), NOT (invert), DELAY (fire after N seconds), TOGGLE (flip-flop), SEQUENCE (inputs must activate in order)
- Editor shows wires as colored lines between sources and receivers
- Gates are placed as invisible entities on the grid, with input/output connections
- Wire colors or labels for readability in complex setups

**Option B: Named Channels**
- Sources and receivers reference named channels (strings) instead of direct entity IDs
- A lever emits on channel "vault-lock", a door listens on channel "vault-lock"
- Logic gates are entities that listen on input channels and emit on output channels
- Simpler to represent in JSON, no visual wiring needed
- Editor could still show channel connections as an overlay

**Option C: Hybrid**
- Simple cases (lever → door) use direct target IDs like v1
- Complex cases use a signal graph defined in a `signals` section of the level JSON
- Editor visualizes both — direct links and signal graph nodes

### Signal Behaviors
- **Momentary vs latching**: pressure plates are momentary (active while stood on), levers are latching (toggle)
- **Timed signals**: fire once, then auto-reset after N seconds (timed doors, trap rearm)
- **One-shot vs repeatable**: some triggers fire once ever (pressure plate crumbles), some reset
- **Inverted signals**: a door that's open by default and closes when triggered
- **Conditional signals**: only fire if player has item / stat check / enemy alive count

### Trap Design Patterns
- **Dart corridor**: tripwire → dart launcher, darts fly across hallway on delay
- **Pit trap**: pressure plate → floor retracts → fall to level below (ties into vertical world)
- **Timed door puzzle**: lever opens door for 5 seconds, must sprint through
- **Multi-switch vault**: 3 levers (some inverted) must all be correct to open vault door (AND gate)
- **Chain reaction**: boulder trigger → boulder rolls → hits pressure plate → opens escape door
- **Alarm trap**: tripwire → spawns enemies + locks doors behind you

### Editor Integration
- Place signal sources and receivers as entities
- Wire them visually (drag from source to receiver)
- Place logic gates from a palette
- Test wiring: click a source in editor, see which receivers light up
- Signal debugger in play-test mode: show active/inactive state of all signals in real time

---

## Systems

### Save/Load
- Save on stair transitions (auto)
- Manual save at save points (crystals, altars)
- Save file includes all level snapshots + inventory + stats

### Procedural Generation
- Random dungeon layouts from templates/rules
- Seeded generation for shareable dungeons
- Hand-crafted set pieces mixed with procedural corridors

---

## Notes

This is a living document. Ideas get promoted to PLAN.md phases when we're ready to build them.
