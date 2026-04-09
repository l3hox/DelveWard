import * as THREE from 'three';

const FLY_SPEED = 8;       // units/sec
const MOUSE_SENSITIVITY = 0.002;

export class FreeFlyCamera {
  private camera: THREE.PerspectiveCamera;
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private keys = new Set<string>();
  private locked = false;
  private attachedCanvas: HTMLCanvasElement | null = null;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  /** Call once with the preview canvas to set up pointer lock and input. */
  attach(canvas: HTMLCanvasElement): void {
    this.attachedCanvas = canvas;
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.keys.clear();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.euler.y -= e.movementX * MOUSE_SENSITIVITY;
      this.euler.x -= e.movementY * MOUSE_SENSITIVITY;
      this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
      this.camera.quaternion.setFromEuler(this.euler);
    });
    // Keyboard handled by EditorPreview's document-level listeners
    // FreeFlyCamera reads from its own keys set, fed by update()
  }

  /** Sync euler from current camera rotation (call when switching to this mode). */
  syncFromCamera(): void {
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
  }

  get isLocked(): boolean { return this.locked; }

  /** Request pointer lock on the attached canvas. */
  requestLock(): void {
    if (!this.locked && this.attachedCanvas) this.attachedCanvas.requestPointerLock();
  }

  update(delta: number, keys?: Set<string>): void {
    if (!this.locked) return;

    const k = keys ?? this.keys;
    const speed = FLY_SPEED * delta;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);

    if (k.has('KeyW')) this.camera.position.addScaledVector(forward, speed);
    if (k.has('KeyS')) this.camera.position.addScaledVector(forward, -speed);
    if (k.has('KeyA')) this.camera.position.addScaledVector(right, -speed);
    if (k.has('KeyD')) this.camera.position.addScaledVector(right, speed);
    if (k.has('Space')) this.camera.position.y += speed;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) this.camera.position.y -= speed;
  }

  release(): void {
    if (this.locked) document.exitPointerLock();
    this.keys.clear();
  }
}
