import * as THREE from 'three';
import type { LeverState } from '../core/gameState';

const ANGLE_UP = -1.047;   // ~60° above horizontal
const ANGLE_DOWN = 1.047;  // ~60° below horizontal
const LEVER_SPEED = 6.0; // radians per second

interface LeverAnimEntry {
  pivot: THREE.Group;
  targetAngle: number;
}

export class LeverAnimator {
  private entries = new Map<string, LeverAnimEntry>();

  register(key: string, pivot: THREE.Group, state: LeverState): void {
    this.entries.set(key, {
      pivot,
      targetAngle: state === 'up' ? ANGLE_UP : ANGLE_DOWN,
    });
  }

  setState(key: string, state: LeverState): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.targetAngle = state === 'up' ? ANGLE_UP : ANGLE_DOWN;
  }

  update(delta: number): void {
    const step = LEVER_SPEED * delta;
    for (const entry of this.entries.values()) {
      const current = entry.pivot.rotation.x;
      const diff = entry.targetAngle - current;
      if (Math.abs(diff) < 0.01) {
        entry.pivot.rotation.x = entry.targetAngle;
        continue;
      }
      entry.pivot.rotation.x += Math.sign(diff) * Math.min(step, Math.abs(diff));
    }
  }
}
