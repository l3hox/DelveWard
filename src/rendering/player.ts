import * as THREE from 'three';
import { CELL_SIZE, EYE_HEIGHT } from './dungeon';
import { PlayerState, Facing, FACING_ANGLE } from '../core/grid';

const TWEEN_SPEED = 20;
const ANIM_THRESHOLD = 0.05;
const CAMERA_BACK_OFFSET = 0.95; // pull camera back from cell center to see tile edges
const STAIR_Y_OFFSET = 0.35; // camera dips/rises when stepping onto stairs
const STAIR_PITCH = 0.15; // camera tilts down/up on stairs (radians, ~8.5°)

export class Player {
  private camera: THREE.PerspectiveCamera;
  private grid: string[];
  private state: PlayerState;

  private currentPos: THREE.Vector3;
  private targetPos: THREE.Vector3;

  // Continuous angle accumulation avoids wrap-around issues on repeated turns
  private currentAngle: number;
  private targetAngle: number;

  private currentPitch: number;
  private targetPitch: number;

  private onMoveCallback?: (col: number, row: number) => void;
  private onTurnCallback?: () => void;

  constructor(
    camera: THREE.PerspectiveCamera,
    grid: string[],
    startCol: number,
    startRow: number,
    facing: Facing,
    walkable?: Set<string>,
    isDoorOpen?: (col: number, row: number) => boolean,
  ) {
    this.camera = camera;
    this.grid = grid;
    this.state = new PlayerState(startCol, startRow, facing, walkable, isDoorOpen);

    const worldPos = this.gridToWorld(startCol, startRow);
    this.currentPos = worldPos.clone();
    this.targetPos = worldPos.clone();

    this.currentAngle = FACING_ANGLE[facing];
    this.targetAngle = this.currentAngle;

    this.currentPitch = this.pitchForCell(startCol, startRow);
    this.targetPitch = this.currentPitch;

    camera.rotation.order = 'YXZ';
    camera.position.copy(this.currentPos);
    camera.rotation.y = this.currentAngle;
    camera.rotation.x = this.currentPitch;
  }

  private gridToWorld(col: number, row: number): THREE.Vector3 {
    let y = EYE_HEIGHT;
    const cell = this.grid[row]?.[col];
    if (cell === 'S') y -= STAIR_Y_OFFSET;
    if (cell === 'U') y += STAIR_Y_OFFSET;
    return new THREE.Vector3(
      col * CELL_SIZE + CELL_SIZE / 2,
      y,
      row * CELL_SIZE + CELL_SIZE / 2
    );
  }

  private pitchForCell(col: number, row: number): number {
    const cell = this.grid[row]?.[col];
    if (cell === 'S') return -STAIR_PITCH;  // look down
    if (cell === 'U') return STAIR_PITCH;   // look up
    return 0;
  }

  private isAnimating(): boolean {
    return (
      this.currentPos.distanceTo(this.targetPos) > ANIM_THRESHOLD ||
      Math.abs(this.currentAngle - this.targetAngle) > ANIM_THRESHOLD
    );
  }

  getState(): PlayerState {
    return this.state;
  }

  setOnMove(callback: (col: number, row: number) => void): void {
    this.onMoveCallback = callback;
  }

  setOnTurn(callback: () => void): void {
    this.onTurnCallback = callback;
  }

  moveForward(): void {
    if (this.isAnimating()) return;
    if (this.state.moveForward(this.grid)) {
      this.targetPos.copy(this.gridToWorld(this.state.col, this.state.row));
      this.targetPitch = this.pitchForCell(this.state.col, this.state.row);
      this.onMoveCallback?.(this.state.col, this.state.row);
    }
  }

  moveBack(): void {
    if (this.isAnimating()) return;
    if (this.state.moveBack(this.grid)) {
      this.targetPos.copy(this.gridToWorld(this.state.col, this.state.row));
      this.targetPitch = this.pitchForCell(this.state.col, this.state.row);
      this.onMoveCallback?.(this.state.col, this.state.row);
    }
  }

  strafeLeft(): void {
    if (this.isAnimating()) return;
    if (this.state.strafeLeft(this.grid)) {
      this.targetPos.copy(this.gridToWorld(this.state.col, this.state.row));
      this.targetPitch = this.pitchForCell(this.state.col, this.state.row);
      this.onMoveCallback?.(this.state.col, this.state.row);
    }
  }

  strafeRight(): void {
    if (this.isAnimating()) return;
    if (this.state.strafeRight(this.grid)) {
      this.targetPos.copy(this.gridToWorld(this.state.col, this.state.row));
      this.targetPitch = this.pitchForCell(this.state.col, this.state.row);
      this.onMoveCallback?.(this.state.col, this.state.row);
    }
  }

  turnLeft(): void {
    if (this.isAnimating()) return;
    this.state.turnLeft();
    this.targetAngle += Math.PI / 2;
    this.onTurnCallback?.();
  }

  turnRight(): void {
    if (this.isAnimating()) return;
    this.state.turnRight();
    this.targetAngle -= Math.PI / 2;
    this.onTurnCallback?.();
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

    this.currentPitch += (this.targetPitch - this.currentPitch) * alpha;
    if (Math.abs(this.currentPitch - this.targetPitch) < 0.005) {
      this.currentPitch = this.targetPitch;
    }

    this.camera.position.copy(this.currentPos);
    // Pull camera back from cell center along facing direction
    this.camera.position.x += Math.sin(this.currentAngle) * CAMERA_BACK_OFFSET;
    this.camera.position.z += Math.cos(this.currentAngle) * CAMERA_BACK_OFFSET;
    this.camera.rotation.y = this.currentAngle;
    this.camera.rotation.x = this.currentPitch;
  }

  getWorldPosition(): THREE.Vector3 {
    return this.currentPos.clone();
  }
}
