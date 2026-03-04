import * as THREE from 'three';
import { WALL_HEIGHT } from './dungeon';

const FRAME_WIDTH = 0.15;
const SPEED = 5.0; // units per second

interface PanelEntry {
  panel: THREE.Mesh;
  closedY: number;
  openY: number;
  targetY: number;
}

export class DoorAnimator {
  private panels = new Map<string, PanelEntry>();

  register(key: string, panel: THREE.Mesh, isOpen: boolean): void {
    const panelHeight = WALL_HEIGHT - FRAME_WIDTH;
    const closedY = panelHeight / 2;
    const openY = WALL_HEIGHT + panelHeight / 2;

    panel.position.y = isOpen ? openY : closedY;
    panel.visible = true; // always visible — position-based hiding

    this.panels.set(key, {
      panel,
      closedY,
      openY,
      targetY: isOpen ? openY : closedY,
    });
  }

  setOpen(key: string, isOpen: boolean): void {
    const entry = this.panels.get(key);
    if (!entry) return;
    entry.targetY = isOpen ? entry.openY : entry.closedY;
  }

  update(delta: number): void {
    const step = SPEED * delta;
    for (const entry of this.panels.values()) {
      const currentY = entry.panel.position.y;
      if (Math.abs(currentY - entry.targetY) < 0.001) continue;

      if (currentY < entry.targetY) {
        entry.panel.position.y = Math.min(currentY + step, entry.targetY);
      } else {
        entry.panel.position.y = Math.max(currentY - step, entry.targetY);
      }
    }
  }
}
