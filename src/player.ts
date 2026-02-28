import * as THREE from 'three';
import { CELL_SIZE, EYE_HEIGHT } from './dungeon';

type Facing = 'N' | 'E' | 'S' | 'W';

// Camera Y rotation for each facing direction (Three.js camera faces -Z by default = North)
const FACING_ANGLE: Record<Facing, number> = {
  N: 0,
  E: -Math.PI / 2,
  S: Math.PI,
  W: Math.PI / 2,
};

// [dcol, drow] per facing
const FACING_DELTA: Record<Facing, [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

const TURN_LEFT: Record<Facing, Facing> = { N: 'W', W: 'S', S: 'E', E: 'N' };
const TURN_RIGHT: Record<Facing, Facing> = { N: 'E', E: 'S', S: 'W', W: 'N' };

const TWEEN_SPEED = 20;
const ANIM_THRESHOLD = 0.05;

export class Player {
  private camera: THREE.PerspectiveCamera;
  private map: number[][];
  private gridX: number; // col
  private gridZ: number; // row
  private facing: Facing;

  private currentPos: THREE.Vector3;
  private targetPos: THREE.Vector3;

  // Continuous angle accumulation avoids wrap-around issues on repeated turns
  private currentAngle: number;
  private targetAngle: number;

  constructor(
    camera: THREE.PerspectiveCamera,
    map: number[][],
    startCol: number,
    startRow: number,
    facing: Facing
  ) {
    this.camera = camera;
    this.map = map;
    this.gridX = startCol;
    this.gridZ = startRow;
    this.facing = facing;

    const worldPos = this.gridToWorld(startCol, startRow);
    this.currentPos = worldPos.clone();
    this.targetPos = worldPos.clone();

    this.currentAngle = FACING_ANGLE[facing];
    this.targetAngle = this.currentAngle;

    camera.rotation.order = 'YXZ';
    camera.position.copy(this.currentPos);
    camera.rotation.y = this.currentAngle;
  }

  private gridToWorld(col: number, row: number): THREE.Vector3 {
    return new THREE.Vector3(
      col * CELL_SIZE + CELL_SIZE / 2,
      EYE_HEIGHT,
      row * CELL_SIZE + CELL_SIZE / 2
    );
  }

  private isWalkable(col: number, row: number): boolean {
    if (row < 0 || row >= this.map.length) return false;
    if (col < 0 || col >= this.map[0].length) return false;
    return this.map[row][col] === 0;
  }

  private isAnimating(): boolean {
    return (
      this.currentPos.distanceTo(this.targetPos) > ANIM_THRESHOLD ||
      Math.abs(this.currentAngle - this.targetAngle) > ANIM_THRESHOLD
    );
  }

  moveForward(): void {
    if (this.isAnimating()) return;
    const [dc, dr] = FACING_DELTA[this.facing];
    const nx = this.gridX + dc;
    const nz = this.gridZ + dr;
    if (!this.isWalkable(nx, nz)) return;
    this.gridX = nx;
    this.gridZ = nz;
    this.targetPos.copy(this.gridToWorld(nx, nz));
  }

  moveBack(): void {
    if (this.isAnimating()) return;
    const [dc, dr] = FACING_DELTA[this.facing];
    const nx = this.gridX - dc;
    const nz = this.gridZ - dr;
    if (!this.isWalkable(nx, nz)) return;
    this.gridX = nx;
    this.gridZ = nz;
    this.targetPos.copy(this.gridToWorld(nx, nz));
  }

  strafeLeft(): void {
    if (this.isAnimating()) return;
    const [dc, dr] = FACING_DELTA[TURN_LEFT[this.facing]];
    const nx = this.gridX + dc;
    const nz = this.gridZ + dr;
    if (!this.isWalkable(nx, nz)) return;
    this.gridX = nx;
    this.gridZ = nz;
    this.targetPos.copy(this.gridToWorld(nx, nz));
  }

  strafeRight(): void {
    if (this.isAnimating()) return;
    const [dc, dr] = FACING_DELTA[TURN_RIGHT[this.facing]];
    const nx = this.gridX + dc;
    const nz = this.gridZ + dr;
    if (!this.isWalkable(nx, nz)) return;
    this.gridX = nx;
    this.gridZ = nz;
    this.targetPos.copy(this.gridToWorld(nx, nz));
  }

  turnLeft(): void {
    if (this.isAnimating()) return;
    this.facing = TURN_LEFT[this.facing];
    this.targetAngle += Math.PI / 2;
  }

  turnRight(): void {
    if (this.isAnimating()) return;
    this.facing = TURN_RIGHT[this.facing];
    this.targetAngle -= Math.PI / 2;
  }

  update(delta: number): void {
    const alpha = Math.min(1, TWEEN_SPEED * delta);

    this.currentPos.lerp(this.targetPos, alpha);
    if (this.currentPos.distanceTo(this.targetPos) < 0.005) {
      this.currentPos.copy(this.targetPos);
    }

    this.currentAngle += (this.targetAngle - this.currentAngle) * alpha;
    if (Math.abs(this.currentAngle - this.targetAngle) < 0.005) {
      this.currentAngle = this.targetAngle;
    }

    this.camera.position.copy(this.currentPos);
    this.camera.rotation.y = this.currentAngle;
  }

  getWorldPosition(): THREE.Vector3 {
    return this.currentPos.clone();
  }
}
