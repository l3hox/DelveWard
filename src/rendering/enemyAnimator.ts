import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';

const SPEED = 12; // lerp speed (slightly slower than player's 20)
const THRESHOLD = 0.01;

interface EnemyEntry {
  mesh: THREE.Mesh;
  targetX: number;
  targetZ: number;
}

export class EnemyAnimator {
  private entries = new Map<string, EnemyEntry>();
  private _animating = false;

  register(key: string, mesh: THREE.Mesh, col: number, row: number): void {
    this.entries.set(key, {
      mesh,
      targetX: col * CELL_SIZE + CELL_SIZE / 2,
      targetZ: row * CELL_SIZE + CELL_SIZE / 2,
    });
  }

  moveTo(key: string, col: number, row: number, newKey: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.targetX = col * CELL_SIZE + CELL_SIZE / 2;
    entry.targetZ = row * CELL_SIZE + CELL_SIZE / 2;
    // Re-key the entry
    if (newKey !== key) {
      this.entries.delete(key);
      this.entries.set(newKey, entry);
    }
  }

  remove(key: string): void {
    this.entries.delete(key);
  }

  get isAnimating(): boolean {
    return this._animating;
  }

  update(delta: number): void {
    const alpha = Math.min(1, SPEED * delta);
    let anyMoving = false;

    for (const entry of this.entries.values()) {
      const pos = entry.mesh.position;
      const dx = entry.targetX - pos.x;
      const dz = entry.targetZ - pos.z;

      if (Math.abs(dx) > THRESHOLD || Math.abs(dz) > THRESHOLD) {
        pos.x += dx * alpha;
        pos.z += dz * alpha;

        if (Math.abs(entry.targetX - pos.x) < 0.005) pos.x = entry.targetX;
        if (Math.abs(entry.targetZ - pos.z) < 0.005) pos.z = entry.targetZ;

        anyMoving = true;
      }
    }

    this._animating = anyMoving;
  }
}
