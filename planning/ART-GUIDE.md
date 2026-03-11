# DelveWard — Art & Audio Production Guide

> **This is an initial template.** Expect heavy iteration as the visual style solidifies through experimentation. Prompt templates, palettes, and tool choices will evolve.

---

## Philosophy

Consistency beats quality. A mediocre texture that matches the rest of the game looks better than a gorgeous one that stands out. Every asset goes through the same pipeline: generate → downscale → palette-lock → integrate.

---

## Visual Style Reference

### Target Aesthetic
- Pixelart, dark fantasy, dungeon crawler
- Muted, desaturated palette — grays, browns, deep greens, rust, cold blue highlights
- Flat lighting in textures (the engine handles lighting — baked shadows in textures fight the 3D lights)
- Low detail density — readable at small sizes, no visual noise
- Inspiration: Eye of the Beholder, Legend of Grimrock, Ultima Underworld, classic SNES RPGs

### Style Anchors
Store reference images in `art/style-reference/`. These are the ground truth for the visual language:

| Anchor | Purpose | File |
|---|---|---|
| Wall texture | Stone/brick tone and detail level | `wall-anchor.png` |
| Floor texture | Color range for ground surfaces | `floor-anchor.png` |
| Enemy sprite | Character proportions, shading style, outline weight | `enemy-anchor.png` |
| NPC sprite | Non-hostile character treatment | `npc-anchor.png` |
| Item icon | Object readability at small size | `item-anchor.png` |
| UI element | HUD style, font, frame treatment | `ui-anchor.png` |
| Portrait | NPC dialog portrait style | `portrait-anchor.png` |

When generating new assets, always use these as image-to-image references or style references.

---

## Prompt Templates

### Textures (Walls, Floors, Ceilings)

```
pixelart seamless tileable dungeon [SUBJECT], [SIZE]x[SIZE], muted dark fantasy palette,
[MATERIAL] surface, flat lighting no baked shadows, retro RPG style, top-down or front-facing,
limited color count, no text no watermark
```

Examples:
- `[SUBJECT]`: stone brick wall, mossy cobblestone floor, wooden plank ceiling, cracked marble floor
- `[SIZE]`: 64, 128 (generate larger, downscale to target)
- `[MATERIAL]`: rough stone, weathered wood, damp brick, polished marble

### Enemy Sprites

```
pixelart character sprite, [CREATURE], front-facing, full body, transparent background,
dark fantasy style, 2-3 tone shading, [SIZE]px, pixel-perfect edges, muted palette,
no text no watermark
```

Examples:
- `[CREATURE]`: skeleton warrior with sword, giant rat, orc berserker, cave spider, hooded necromancer
- `[SIZE]`: 128, 256 (generate larger, downscale)

### NPC Sprites

```
pixelart character sprite, [CHARACTER], front-facing, full body, transparent background,
dark fantasy RPG style, friendly/neutral pose, 2-3 tone shading, [SIZE]px, pixel-perfect edges,
muted palette, no text no watermark
```

Examples:
- `[CHARACTER]`: dwarf blacksmith with hammer, hooded merchant, old wizard with staff, armored guard

### Item Icons

```
pixelart item icon, [ITEM], top-down or 3/4 view, transparent background, 32x32 or 64x64,
dark fantasy RPG style, clean readable silhouette, limited colors, no text no watermark
```

Examples:
- `[ITEM]`: iron sword, health potion red flask, gold key, leather armor, wooden shield, spell scroll

### NPC Portraits (Dialog)

```
pixelart portrait, [CHARACTER] bust, dark background, dark fantasy RPG style,
4-6 color limited palette, expressive face, retro dungeon crawler style, 96x96 or 128x128,
no text no watermark
```

### UI Elements

```
pixelart UI [ELEMENT], dark fantasy RPG theme, stone/metal frame, muted gold accent,
transparent or dark background, clean edges, retro style, no text no watermark
```

Examples:
- `[ELEMENT]`: health bar frame, inventory slot border, dialog box frame, minimap border

---

## Color Palette

### Master Palette (Draft — Will Evolve)

Lock all assets to a shared palette after generation. Start with approximately 32 colors:

| Role | Colors |
|---|---|
| Stone/neutral | Near-black, dark gray, medium gray, warm gray |
| Brown/wood | Dark brown, medium brown, tan, pale wood |
| Green/moss | Deep forest, muted olive, sage |
| Blue/cold | Midnight blue, steel blue, pale ice |
| Red/warm | Rust, dried blood, ember orange |
| Gold/accent | Dark gold, bright gold (sparingly) |
| Flesh | 2-3 skin tones |
| Pure | Black, near-white (never pure white) |

Export as a `.pal`, `.aco`, or PNG swatch strip for use in post-processing.

Target file: `art/palette.png`

---

## Asset Resolutions

| Asset Type | Working Size | Final In-Game Size | Notes |
|---|---|---|---|
| Wall/floor/ceiling textures | 128x128 or 256x256 | 64x64 or 128x128 | Seamless tileable, nearest-neighbor downscale |
| Enemy sprites | 256x256 or 512x512 | 128x128 or 256x256 | Transparent background, front-facing |
| NPC sprites | 256x256 or 512x512 | 128x128 or 256x256 | Same pipeline as enemies |
| Item icons | 64x64 or 128x128 | 32x32 or 64x64 | Must be readable at small size |
| NPC portraits | 128x128 or 256x256 | 96x96 or 128x128 | Bust shot, for dialog UI |
| UI frames | Varies | Varies | 9-slice friendly where possible |

Always generate at 2x or 4x target resolution, then downscale with nearest-neighbor. This sharpens pixel edges and hides AI artifacts.

---

## Post-Processing Pipeline

Every raw AI-generated asset goes through these steps before entering the game:

### 1. Crop & Clean
- Remove any background artifacts, watermarks, extra elements
- Ensure transparent backgrounds where needed (sprites, icons)
- Trim to exact dimensions

### 2. Downscale (Nearest-Neighbor)
- Resize to target resolution using nearest-neighbor interpolation
- Never use bilinear/bicubic — it blurs pixel edges

### 3. Palette Lock
- Quantize colors to the master palette
- Tools: ImageMagick `convert -remap palette.png`, Aseprite palette swap, or a custom Sharp/canvas script
- This is the single most important consistency step

### 4. Seamless Check (Textures Only)
- Verify tiles are seamless — render a 3x3 grid and check for visible seams
- Fix seams manually in Aseprite/Photoshop if needed

### 5. Final Export
- Textures: PNG, no transparency
- Sprites: PNG, with transparency
- Icons: PNG, with transparency
- Naming convention: `[category]-[name].png` (e.g., `wall-mossy-brick.png`, `enemy-skeleton.png`, `item-health-potion.png`)

### Batch Script (TODO)
Build a script (`scripts/process-art.ts` or shell) that automates steps 2-5:
- Input: `art/raw/` folder with freshly generated images
- Output: `public/sprites/`, `public/textures/` etc. with processed game-ready assets
- Uses Sharp (Node) or ImageMagick

---

## Sound Effects

### Tools
- **ElevenLabs** — high quality text-to-SFX, good for environmental and mechanical sounds
- **SFX Engine** — game-dev focused, used by studios
- **OptimizerAI** — stereo 44.1kHz, up to 60s, good variety

### Prompt Strategy
Same approach as visuals — use consistent prompt templates per category:

| Category | Prompt Pattern | Examples |
|---|---|---|
| Footsteps | `footsteps on [SURFACE], [PACE], indoor, slight echo` | stone slow, wood fast, water splashing |
| Combat | `[ACTION] sound, fantasy RPG, close-up, no music` | sword slash metal, arrow impact wood, fireball whoosh |
| Environment | `ambient [SETTING], subtle, looping, no music` | dungeon dripping water, wind through corridor, torch crackling |
| UI | `[ACTION] UI sound, crisp, short, fantasy game` | inventory open, item pickup, menu click, level up chime |
| Doors/Mechanisms | `[OBJECT] [ACTION], stone/metal, echoing dungeon` | stone door sliding, lever click, chain rattling, gate raising |
| Creatures | `[CREATURE] [VOCALIZATION], fantasy, menacing` | rat squeak aggressive, skeleton bones rattling, orc grunt |

### Post-Processing (Audio)
- Normalize volume across all SFX (target -6dB peak, or use LUFS loudness normalization)
- Apply shared reverb preset for dungeon echo (short tail, stone room IR)
- Trim silence from start/end
- Export as: `.ogg` (preferred for web, small size) or `.mp3`
- Loop-point mark ambient tracks that need seamless looping
- Tools: Audacity (manual), ffmpeg (batch), or a Node script with `fluent-ffmpeg`

---

## Music / Ambient Tracks

### Tools
- **Beatoven.ai** — game-dev focused, mood/tempo/genre control
- **Soundverse** — good ambient loops
- **Wondera** — natural language descriptions

### Track Categories
| Category | Mood | Length | Loop? |
|---|---|---|---|
| Exploration (upper levels) | Tense, cautious, subtle melody | 2-3 min | Yes |
| Exploration (deep levels) | Dread, minimal, drone-based | 2-3 min | Yes |
| Combat | Urgent, percussive, fast | 1-2 min | Yes |
| Safe zone / NPC area | Warm, melancholic, restful | 2-3 min | Yes |
| Boss encounter | Epic, building intensity, unique per boss | 2-4 min | Yes |
| Menu / title screen | Atmospheric, mysterious, inviting | 1-2 min | Yes |

### Consistency Strategy
- Generate all tracks for one mood/zone in one session
- Define a key signature and BPM range per zone (e.g., deep levels = D minor, 60-70 BPM)
- Post-process: normalize, add shared reverb tail, crossfade loop points

---

## Folder Structure

```
art/
  style-reference/      ← anchor images that define the visual language
  palette.png           ← master color palette swatch
  raw/                  ← unprocessed AI-generated images (not committed)
  raw-audio/            ← unprocessed AI-generated sounds (not committed)

public/
  textures/             ← processed wall/floor/ceiling textures
  sprites/              ← processed enemy/NPC sprites
  icons/                ← processed item icons
  portraits/            ← processed NPC dialog portraits
  audio/
    sfx/                ← processed sound effects
    music/              ← processed ambient/music tracks
```

---

## Session Workflow

1. **Before generating**: Check style anchors and recent assets for visual reference
2. **During generation**: Use prompt templates, generate in batches per category, use image-to-image with anchors
3. **After generation**: Run through post-processing pipeline (downscale → palette lock → export)
4. **Validate in-game**: Load the asset, check it against existing ones in the actual dungeon
5. **Update anchors**: If a new asset looks better than the current anchor, promote it

---

## Notes

- This guide will be heavily iterated as the style solidifies
- The palette and prompt templates are starting points — expect them to change
- Consistency comes from the pipeline (especially palette locking), not from the AI generator
- When in doubt, process more aggressively — fewer colors and lower resolution hide more sins
