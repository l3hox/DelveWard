import * as THREE from 'three';
import { CELL_SIZE, LAYER_HEIGHT } from './dungeon';
import type { Facing } from '../core/grid';
import { BOULDER_RADIUS } from './boulderRenderer';

export const BOULDER_SPEED = 3.0;
const ROLL_DURATION = 1 / BOULDER_SPEED;
const DESCENT_DURATION = ROLL_DURATION * 1.5;

const FALL_TERMINAL_VELOCITY = 20;
const FALL_ACCEL_DISTANCE = 2 * LAYER_HEIGHT;
const FALL_ACCEL = (FALL_TERMINAL_VELOCITY * FALL_TERMINAL_VELOCITY) / (2 * FALL_ACCEL_DISTANCE);

const ROTATION_AXIS: Record<Facing, THREE.Vector3> = {
  N: new THREE.Vector3(1, 0, 0),
  S: new THREE.Vector3(-1, 0, 0),
  E: new THREE.Vector3(0, 0, 1),
  W: new THREE.Vector3(0, 0, -1),
};

const ANGULAR_VELOCITY = (CELL_SIZE * BOULDER_SPEED) / BOULDER_RADIUS;

export type BoulderMode = 'rest' | 'rolling' | 'descending' | 'falling';

interface BoulderEntry {
  mesh: THREE.Mesh;
  mode: BoulderMode;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  tweenElapsed: number;
  tweenDuration: number;
  rotationDir: Facing;
  fallVelocity: number;
  fallDistance: number;
  fallTargetY: number;
}

export class BoulderAnimator {
  private entries = new Map<string, BoulderEntry>();

  register(
    key: string,
    mesh: THREE.Mesh,
    col: number,
    row: number,
    yOffset: number,
    direction: Facing,
  ): void {
    const target = new THREE.Vector3(
      col * CELL_SIZE + CELL_SIZE / 2,
      BOULDER_RADIUS + yOffset,
      row * CELL_SIZE + CELL_SIZE / 2,
    );
    this.entries.set(key, {
      mesh,
      mode: 'rest',
      startPos: target.clone(),
      targetPos: target,
      tweenElapsed: 0,
      tweenDuration: 0,
      rotationDir: direction,
      fallVelocity: 0,
      fallDistance: 0,
      fallTargetY: 0,
    });
  }

  remove(key: string): void {
    this.entries.delete(key);
  }

  rekey(oldKey: string, newKey: string): void {
    if (oldKey === newKey) return;
    const entry = this.entries.get(oldKey);
    if (!entry) return;
    this.entries.delete(oldKey);
    this.entries.set(newKey, entry);
  }

  startRoll(
    key: string,
    toCol: number,
    toRow: number,
    yOffset: number,
    direction: Facing,
  ): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.mode = 'rolling';
    entry.startPos.copy(entry.mesh.position);
    entry.targetPos.set(
      toCol * CELL_SIZE + CELL_SIZE / 2,
      BOULDER_RADIUS + yOffset,
      toRow * CELL_SIZE + CELL_SIZE / 2,
    );
    entry.tweenElapsed = 0;
    entry.tweenDuration = ROLL_DURATION;
    entry.rotationDir = direction;
  }

  startDescent(
    key: string,
    toCol: number,
    toRow: number,
    toYOffset: number,
    direction: Facing,
  ): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.mode = 'descending';
    entry.startPos.copy(entry.mesh.position);
    entry.targetPos.set(
      toCol * CELL_SIZE + CELL_SIZE / 2,
      BOULDER_RADIUS + toYOffset,
      toRow * CELL_SIZE + CELL_SIZE / 2,
    );
    entry.tweenElapsed = 0;
    entry.tweenDuration = DESCENT_DURATION;
    entry.rotationDir = direction;
  }

  startFall(key: string, targetYOffset: number): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.mode = 'falling';
    entry.fallVelocity = 0;
    entry.fallDistance = 0;
    entry.fallTargetY = BOULDER_RADIUS + targetYOffset;
  }

  getMode(key: string): BoulderMode {
    return this.entries.get(key)?.mode ?? 'rest';
  }

  update(delta: number): void {
    for (const entry of this.entries.values()) {
      const { mesh } = entry;

      if (entry.mode === 'rolling' || entry.mode === 'descending') {
        entry.tweenElapsed += delta;
        const t = Math.min(1, entry.tweenElapsed / entry.tweenDuration);
        mesh.position.lerpVectors(entry.startPos, entry.targetPos, t);

        mesh.rotateOnWorldAxis(ROTATION_AXIS[entry.rotationDir], ANGULAR_VELOCITY * delta);

        if (t >= 1) {
          entry.mode = 'rest';
          entry.startPos.copy(entry.targetPos);
        }
      } else if (entry.mode === 'falling') {
        if (entry.fallDistance < FALL_ACCEL_DISTANCE) {
          entry.fallVelocity = Math.min(
            entry.fallVelocity + FALL_ACCEL * delta,
            FALL_TERMINAL_VELOCITY,
          );
        }
        const dy = entry.fallVelocity * delta;
        mesh.position.y -= dy;
        entry.fallDistance += dy;

        mesh.rotateOnWorldAxis(ROTATION_AXIS[entry.rotationDir], ANGULAR_VELOCITY * delta);

        if (mesh.position.y <= entry.fallTargetY) {
          mesh.position.y = entry.fallTargetY;
          entry.mode = 'rest';
          entry.fallVelocity = 0;
          entry.fallDistance = 0;
          entry.startPos.copy(mesh.position);
          entry.targetPos.copy(mesh.position);
        }
      }
    }
  }
}
