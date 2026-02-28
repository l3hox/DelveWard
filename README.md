# DelveWard

A grid-based first-person dungeon crawler built in the browser. Old-school soul, modern implementation.

Built with Three.js and TypeScript as a deliberate side project — hand-crafted levels, atmospheric lighting, pixelart textures.

---

## Status

Early development. Core navigation working. Textures, enemies, and combat coming next.

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

---

## Controls

| Key | Action |
|---|---|
| W / ↑ | Move forward |
| S / ↓ | Move back |
| A | Strafe left |
| D | Strafe right |
| ← | Turn left |
| → | Turn right |

---

## Design

- Grid movement only — step-by-step, 90-degree turns
- First-person 3D perspective with smooth tween camera
- Hand-crafted levels defined as 2D grid arrays (JSON)
- Pixelart textures, torch lighting, atmospheric fog
- Billboard sprite enemies (planned)
