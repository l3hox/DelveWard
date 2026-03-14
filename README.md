# DelveWard

[![License: EUPL v1.2](https://img.shields.io/badge/License-EUPL%20v1.2-blue.svg)](https://eupl.eu/)

A grid-based first-person dungeon crawler built in the browser. Old-school soul, modern implementation.

Built with Three.js and TypeScript as a deliberate side project — hand-crafted levels, atmospheric lighting, pixelart textures.

---

## Status

Playable. Multi-level dungeons, combat, equipment, consumables, enemy AI, and HUD all working.

---

## Tech Stack

- [Three.js](https://threejs.org/) — 3D rendering
- TypeScript
- Vite

---

## Running Locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

### Dungeon Editor

The project includes a visual dungeon editor at `http://localhost:5173/editor.html`. Open a level JSON file, paint the grid, place and configure entities, then export the modified level.

---

## Controls

| Key | Action |
|---|---|
| W / ↑ | Move forward |
| S / ↓ | Move back |
| A | Strafe left |
| D | Strafe right |
| Q / ← | Turn left |
| E / → | Turn right |
| Space | Interact (doors, levers, sconces) |
| F | Attack |
| 1-8 | Use backpack item |

---

## Design

- Grid movement only — step-by-step, 90-degree turns
- First-person 3D perspective with smooth tween camera
- Hand-crafted levels defined as 2D grid arrays (JSON)
- Pixelart textures, torch lighting, atmospheric fog
- Billboard sprite enemies with AI pathfinding
- Real-time combat with equipment and consumables
- Multi-level dungeons with stair transitions

---

## License

Licensed under the [European Union Public Licence v. 1.2](LICENSE).
