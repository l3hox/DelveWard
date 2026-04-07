import * as THREE from 'three';
import { CELL_SIZE, EYE_HEIGHT, LAYER_HEIGHT } from './dungeon';
import { PlayerState, Facing, FACING_ANGLE, FACING_DELTA, TURN_LEFT, TURN_RIGHT } from '../core/grid';
import { doorKey, type StairInstance } from '../core/gameState';

const TWEEN_SPEED = 20;
const ANIM_THRESHOLD = 0.05;
const CAMERA_BACK_OFFSET = 0.95; // pull camera back from cell center to see tile edges
const STAIR_Y_OFFSET = 0.35; // camera dips/rises when stepping onto stairs
const STAIR_PITCH = 0.15; // camera tilts down/up on stairs (radians, ~8.5°)
const MAX_QUEUED_COMMANDS = 3;

// Fall physics
const FALL_TERMINAL_VELOCITY = 12;  // units/sec
const FALL_ACCEL_DISTANCE = 2 * LAYER_HEIGHT; // accelerate over 2 layers (5.0 units)
const FALL_ACCEL = (FALL_TERMINAL_VELOCITY * FALL_TERMINAL_VELOCITY) / (2 * FALL_ACCEL_DISTANCE);
const FALL_CAMERA_PITCH = -0.4;     // radians — look down during fall
const FALL_TRIGGER_PROGRESS = 0.667; // activate fall at 2/3 of walk tween

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
  private onMoveBlocked?: (col: number, row: number) => void;
  private onTurnCallback?: () => void;
  private onFallLandCallback?: (landingLayer: number) => void;
  private commandQueue: Array<() => void> = [];

  public slowMultiplier = 1;
  public yOffset = 0;         // additional Y offset (used for layer positioning)
  public targetYOffset = 0;   // target Y offset (lerped in update)
  public debugNoClip = false;  // bypass walkability + blocked checks (bounds only)

  // Fall state
  private isFalling = false;
  private fallVelocity = 0;
  private fallDistance = 0;
  private fallTargetYOffset = 0;
  private fallLandingLayer = 0;
  private pendingFall: { landingLayer: number; totalDistance: number } | null = null;
  private moveStartPos: THREE.Vector3 | null = null;
  private moveStartDist = 0;

  private stairs?: Map<string, StairInstance>;

  constructor(
    camera: THREE.PerspectiveCamera,
    grid: string[],
    startCol: number,
    startRow: number,
    facing: Facing,
    walkable?: Set<string>,
    isDoorOpen?: (col: number, row: number) => boolean,
    isBlocked?: (col: number, row: number) => boolean,
    stairs?: Map<string, StairInstance>,
    isEdgeBlocked?: (fromCol: number, fromRow: number, toCol: number, toRow: number) => boolean,
    isRampAccessible?: (fromCol: number, fromRow: number, toCol: number, toRow: number) => boolean,
  ) {
    this.camera = camera;
    this.grid = grid;
    this.stairs = stairs;
    this.state = new PlayerState(startCol, startRow, facing, walkable, isDoorOpen, isBlocked, isEdgeBlocked, isRampAccessible);

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
    const stair = this.stairs?.get(doorKey(col, row));
    if (stair?.direction === 'down') y -= STAIR_Y_OFFSET;
    if (stair?.direction === 'up') y += STAIR_Y_OFFSET;
    return new THREE.Vector3(
      col * CELL_SIZE + CELL_SIZE / 2,
      y,
      row * CELL_SIZE + CELL_SIZE / 2
    );
  }

  private pitchForCell(col: number, row: number): number {
    const stair = this.stairs?.get(doorKey(col, row));
    if (stair?.direction === 'down') return -STAIR_PITCH;
    if (stair?.direction === 'up') return STAIR_PITCH;
    return 0;
  }

  private isAnimating(): boolean {
    return (
      this.isFalling ||
      this.pendingFall !== null ||
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

  setOnMoveBlocked(callback: (col: number, row: number) => void): void {
    this.onMoveBlocked = callback;
  }

  setOnTurn(callback: () => void): void {
    this.onTurnCallback = callback;
  }

  setOnFallLand(callback: (landingLayer: number) => void): void {
    this.onFallLandCallback = callback;
  }

  setPendingFall(landingLayer: number, totalDistance: number): void {
    this.pendingFall = { landingLayer, totalDistance };
  }

  get falling(): boolean {
    return this.isFalling || this.pendingFall !== null;
  }

  /** Debug noclip move: only check grid bounds, skip walkability/blocked. */
  private debugMove(dc: number, dr: number): boolean {
    const nc = this.state.col + dc;
    const nr = this.state.row + dr;
    if (nr < 0 || nr >= this.grid.length || nc < 0 || nc >= this.grid[0].length) return false;
    this.state.col = nc;
    this.state.row = nr;
    return true;
  }

  private trackMoveStart(): void {
    this.moveStartPos = this.currentPos.clone();
    this.moveStartDist = this.moveStartPos.distanceTo(this.targetPos);
  }

  moveForward(): void {
    if (this.isAnimating()) { this.enqueue(() => this.moveForward()); return; }
    const [dc, dr] = FACING_DELTA[this.state.facing];
    const moved = this.debugNoClip ? this.debugMove(dc, dr) : this.state.moveForward(this.grid);
    if (moved) {
      this.targetPos.copy(this.gridToWorld(this.state.col, this.state.row));
      this.targetPitch = this.pitchForCell(this.state.col, this.state.row);
      this.trackMoveStart();
      this.onMoveCallback?.(this.state.col, this.state.row);
    } else if (!this.debugNoClip) {
      this.onMoveBlocked?.(this.state.col + dc, this.state.row + dr);
    }
  }

  moveBack(): void {
    if (this.isAnimating()) { this.enqueue(() => this.moveBack()); return; }
    const [dc, dr] = FACING_DELTA[this.state.facing];
    const moved = this.debugNoClip ? this.debugMove(-dc, -dr) : this.state.moveBack(this.grid);
    if (moved) {
      this.targetPos.copy(this.gridToWorld(this.state.col, this.state.row));
      this.targetPitch = this.pitchForCell(this.state.col, this.state.row);
      this.trackMoveStart();
      this.onMoveCallback?.(this.state.col, this.state.row);
    }
  }

  strafeLeft(): void {
    if (this.isAnimating()) { this.enqueue(() => this.strafeLeft()); return; }
    const [dc, dr] = FACING_DELTA[TURN_LEFT[this.state.facing]];
    const moved = this.debugNoClip ? this.debugMove(dc, dr) : this.state.strafeLeft(this.grid);
    if (moved) {
      this.targetPos.copy(this.gridToWorld(this.state.col, this.state.row));
      this.targetPitch = this.pitchForCell(this.state.col, this.state.row);
      this.trackMoveStart();
      this.onMoveCallback?.(this.state.col, this.state.row);
    }
  }

  strafeRight(): void {
    if (this.isAnimating()) { this.enqueue(() => this.strafeRight()); return; }
    const [dc, dr] = FACING_DELTA[TURN_RIGHT[this.state.facing]];
    const moved = this.debugNoClip ? this.debugMove(dc, dr) : this.state.strafeRight(this.grid);
    if (moved) {
      this.targetPos.copy(this.gridToWorld(this.state.col, this.state.row));
      this.targetPitch = this.pitchForCell(this.state.col, this.state.row);
      this.trackMoveStart();
      this.onMoveCallback?.(this.state.col, this.state.row);
    }
  }

  turnLeft(): void {
    if (this.isAnimating()) { this.enqueue(() => this.turnLeft()); return; }
    this.state.turnLeft();
    this.targetAngle += Math.PI / 2;
    this.onTurnCallback?.();
  }

  turnRight(): void {
    if (this.isAnimating()) { this.enqueue(() => this.turnRight()); return; }
    this.state.turnRight();
    this.targetAngle -= Math.PI / 2;
    this.onTurnCallback?.();
  }

  private enqueue(cmd: () => void): void {
    if (this.commandQueue.length < MAX_QUEUED_COMMANDS) {
      this.commandQueue.push(cmd);
    }
  }

  update(delta: number): void {
    const alpha = Math.min(1, (TWEEN_SPEED / this.slowMultiplier) * delta);

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

    // Check if a pending fall should activate (at 2/3 of walk progress)
    if (this.pendingFall && this.moveStartPos && this.moveStartDist > 0) {
      const remainDist = this.currentPos.distanceTo(this.targetPos);
      const progress = 1 - remainDist / this.moveStartDist;
      if (progress >= FALL_TRIGGER_PROGRESS) {
        this.isFalling = true;
        this.fallVelocity = 0;
        this.fallDistance = 0;
        this.fallTargetYOffset = this.pendingFall.landingLayer * LAYER_HEIGHT;
        this.fallLandingLayer = this.pendingFall.landingLayer;
        this.targetPitch = FALL_CAMERA_PITCH;
        this.commandQueue = [];
        this.pendingFall = null;
        this.moveStartPos = null;
      }
    }

    // Y offset: gravity physics during fall, normal lerp otherwise
    if (this.isFalling) {
      if (this.fallDistance < FALL_ACCEL_DISTANCE) {
        this.fallVelocity = Math.min(
          this.fallVelocity + FALL_ACCEL * delta,
          FALL_TERMINAL_VELOCITY,
        );
      }
      const dy = this.fallVelocity * delta;
      this.yOffset -= dy;
      this.fallDistance += dy;

      if (this.yOffset <= this.fallTargetYOffset) {
        this.yOffset = this.fallTargetYOffset;
        this.targetYOffset = this.fallTargetYOffset;
        this.isFalling = false;
        this.fallVelocity = 0;
        this.fallDistance = 0;
        this.targetPitch = 0;
        this.onFallLandCallback?.(this.fallLandingLayer);
      }
    } else {
      this.yOffset += (this.targetYOffset - this.yOffset) * alpha;
      if (Math.abs(this.yOffset - this.targetYOffset) < 0.005) {
        this.yOffset = this.targetYOffset;
      }
    }

    this.camera.position.copy(this.currentPos);
    this.camera.position.y += this.yOffset;
    // Pull camera back from cell center along facing direction
    this.camera.position.x += Math.sin(this.currentAngle) * CAMERA_BACK_OFFSET;
    this.camera.position.z += Math.cos(this.currentAngle) * CAMERA_BACK_OFFSET;
    this.camera.rotation.y = this.currentAngle;
    this.camera.rotation.x = this.currentPitch;

    // Drain one queued command per frame when animation completes (not during fall)
    if (!this.isFalling && !this.isAnimating() && this.commandQueue.length > 0) {
      const next = this.commandQueue.shift()!;
      next();
    }
  }

  getWorldPosition(): THREE.Vector3 {
    return this.currentPos.clone();
  }

  /** Switch the grid and walkable set (used when changing layers). */
  switchGrid(grid: string[], walkable: Set<string>, stairs?: Map<string, StairInstance>): void {
    this.grid = grid;
    this.stairs = stairs;
    this.state.setWalkable(walkable);
  }
}
