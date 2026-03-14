import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT } from './dungeon';

const FRAME_WIDTH = 0.15;
const SPEED = 5.0; // units per second

type SlideAxis = 'y' | 'x' | 'z';

interface PanelEntry {
  panel: THREE.Mesh;
  axis: SlideAxis;
  closedVal: number;
  openVal: number;
  targetVal: number;
}

export class DoorAnimator {
  private panels = new Map<string, PanelEntry>();

  /**
   * Register a door panel for animation.
   * @param slideAxis 'y' = slide up (default), 'x' = slide east, 'z' = slide north
   */
  register(key: string, panel: THREE.Mesh, isOpen: boolean, slideAxis: SlideAxis = 'y'): void {
    const panelWidth = CELL_SIZE - FRAME_WIDTH * 2;
    const panelHeight = WALL_HEIGHT - FRAME_WIDTH;

    let closedVal: number;
    let openVal: number;

    if (slideAxis === 'y') {
      closedVal = panelHeight / 2;
      openVal = WALL_HEIGHT + panelHeight / 2;
      panel.position.y = isOpen ? openVal : closedVal;
    } else if (slideAxis === 'x') {
      // EW door: slide east (+X), extra nudge to avoid z-fighting with adjacent wall
      closedVal = panel.position.x;
      openVal = closedVal + panelWidth + 0.05;
      if (isOpen) panel.position.x = openVal;
    } else {
      // NS door: slide north (-Z), extra nudge to avoid z-fighting with adjacent wall
      closedVal = panel.position.z;
      openVal = closedVal - panelWidth - 0.05;
      if (isOpen) panel.position.z = openVal;
    }

    panel.visible = true;

    this.panels.set(key, {
      panel,
      axis: slideAxis,
      closedVal,
      openVal,
      targetVal: isOpen ? openVal : closedVal,
    });
  }

  setOpen(key: string, isOpen: boolean): void {
    const entry = this.panels.get(key);
    if (!entry) return;
    entry.targetVal = isOpen ? entry.openVal : entry.closedVal;
  }

  update(delta: number): void {
    const step = SPEED * delta;
    for (const entry of this.panels.values()) {
      const current = entry.panel.position[entry.axis];
      if (Math.abs(current - entry.targetVal) < 0.001) continue;

      if (current < entry.targetVal) {
        entry.panel.position[entry.axis] = Math.min(current + step, entry.targetVal);
      } else {
        entry.panel.position[entry.axis] = Math.max(current - step, entry.targetVal);
      }
    }
  }
}
