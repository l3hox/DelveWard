import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';

const SPEED = 12; // lerp speed (slightly slower than player's 20)
const THRESHOLD = 0.01;

const LUNGE_DURATION = 0.25;
const LUNGE_DISTANCE = 0.6; // world units toward player

interface EnemyEntry {
  mesh: THREE.Mesh;
  targetX: number;
  targetZ: number;
  hitTimer: number;
  hitPhase: number;
  prevHitOffsetX: number;
  lungeTimer: number;
  lungeDirX: number;
  lungeDirZ: number;
  prevLungeOffsetX: number;
  prevLungeOffsetZ: number;
}

export class EnemyAnimator {
  private entries = new Map<string, EnemyEntry>();
  private _animating = false;

  register(key: string, mesh: THREE.Mesh, col: number, row: number): void {
    this.entries.set(key, {
      mesh,
      targetX: col * CELL_SIZE + CELL_SIZE / 2,
      targetZ: row * CELL_SIZE + CELL_SIZE / 2,
      hitTimer: 0,
      hitPhase: 0,
      prevHitOffsetX: 0,
      lungeTimer: 0,
      lungeDirX: 0,
      lungeDirZ: 0,
      prevLungeOffsetX: 0,
      prevLungeOffsetZ: 0,
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

  triggerLunge(key: string, playerCol: number, playerRow: number): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    const playerX = playerCol * CELL_SIZE + CELL_SIZE / 2;
    const playerZ = playerRow * CELL_SIZE + CELL_SIZE / 2;
    const dx = playerX - entry.targetX;
    const dz = playerZ - entry.targetZ;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) return;
    entry.lungeDirX = dx / len;
    entry.lungeDirZ = dz / len;
    entry.lungeTimer = LUNGE_DURATION;
  }

  triggerHit(key: string): void {
    const entry = this.entries.get(key);
    if (entry) {
      entry.hitTimer = 0.3;
      entry.hitPhase = 0;
    }
  }

  get isAnimating(): boolean {
    return this._animating;
  }

  update(delta: number): void {
    const alpha = Math.min(1, SPEED * delta);
    let anyMoving = false;

    for (const entry of this.entries.values()) {
      const pos = entry.mesh.position;

      // Remove previous frame's offsets so lerp works against true position
      pos.x -= entry.prevHitOffsetX;
      pos.x -= entry.prevLungeOffsetX;
      pos.z -= entry.prevLungeOffsetZ;

      // Movement lerp
      const dx = entry.targetX - pos.x;
      const dz = entry.targetZ - pos.z;

      if (Math.abs(dx) > THRESHOLD || Math.abs(dz) > THRESHOLD) {
        pos.x += dx * alpha;
        pos.z += dz * alpha;

        if (Math.abs(entry.targetX - pos.x) < 0.005) pos.x = entry.targetX;
        if (Math.abs(entry.targetZ - pos.z) < 0.005) pos.z = entry.targetZ;

        anyMoving = true;
      }

      // Calculate and apply hit shake offset
      let hitOffsetX = 0;
      if (entry.hitTimer > 0) {
        const elapsed = 0.3 - entry.hitTimer;
        hitOffsetX = Math.sin(elapsed * 40) * 0.25 * (entry.hitTimer / 0.3);
        entry.hitPhase += delta;
        entry.hitTimer = Math.max(0, entry.hitTimer - delta);
      }
      pos.x += hitOffsetX;
      entry.prevHitOffsetX = hitOffsetX;

      // Lunge offset — quick forward-and-back toward player
      let lungeOffsetX = 0;
      let lungeOffsetZ = 0;
      if (entry.lungeTimer > 0) {
        const t = 1 - entry.lungeTimer / LUNGE_DURATION; // 0→1
        // Triangle wave: go forward first half, return second half
        const lungeAmount = t < 0.5 ? t * 2 : (1 - t) * 2;
        lungeOffsetX = entry.lungeDirX * LUNGE_DISTANCE * lungeAmount;
        lungeOffsetZ = entry.lungeDirZ * LUNGE_DISTANCE * lungeAmount;
        entry.lungeTimer = Math.max(0, entry.lungeTimer - delta);
      }
      pos.x += lungeOffsetX;
      pos.z += lungeOffsetZ;
      entry.prevLungeOffsetX = lungeOffsetX;
      entry.prevLungeOffsetZ = lungeOffsetZ;
    }

    this._animating = anyMoving;
  }
}
