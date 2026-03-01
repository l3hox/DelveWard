import * as THREE from 'three';
import { CELL_SIZE, EYE_HEIGHT } from './dungeon';
import { PlayerState, Facing, FACING_ANGLE } from './grid';

const TWEEN_SPEED = 20;
const ANIM_THRESHOLD = 0.05;

export class Player {
  private camera: THREE.PerspectiveCamera;
  private map: number[][];
  private state: PlayerState;

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
    this.state = new PlayerState(startCol, startRow, facing);

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

  private isAnimating(): boolean {
    return (
      this.currentPos.distanceTo(this.targetPos) > ANIM_THRESHOLD ||
      Math.abs(this.currentAngle - this.targetAngle) > ANIM_THRESHOLD
    );
  }

  moveForward(): void {
    if (this.isAnimating()) return;
    if (this.state.moveForward(this.map)) {
      this.targetPos.copy(this.gridToWorld(this.state.gridX, this.state.gridZ));
    }
  }

  moveBack(): void {
    if (this.isAnimating()) return;
    if (this.state.moveBack(this.map)) {
      this.targetPos.copy(this.gridToWorld(this.state.gridX, this.state.gridZ));
    }
  }

  strafeLeft(): void {
    if (this.isAnimating()) return;
    if (this.state.strafeLeft(this.map)) {
      this.targetPos.copy(this.gridToWorld(this.state.gridX, this.state.gridZ));
    }
  }

  strafeRight(): void {
    if (this.isAnimating()) return;
    if (this.state.strafeRight(this.map)) {
      this.targetPos.copy(this.gridToWorld(this.state.gridX, this.state.gridZ));
    }
  }

  turnLeft(): void {
    if (this.isAnimating()) return;
    this.state.turnLeft();
    this.targetAngle += Math.PI / 2;
  }

  turnRight(): void {
    if (this.isAnimating()) return;
    this.state.turnRight();
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
