import * as THREE from 'three';
import type { DungeonLevel } from '../core/types';
import type { Facing } from '../core/grid';
import { GameState } from '../core/gameState';
import { LAYER_HEIGHT } from '../rendering/dungeon';
import { applyEnvironment } from '../rendering/environment';
import { createSkyboxMesh } from '../rendering/skybox';
import { Player } from '../rendering/player';
import { buildWalkableSet, FACING_ANGLE } from '../core/grid';
import { updateForestBillboards, type ForestMeshes } from '../rendering/forestRenderer';
import { buildLayerEntityMeshes, buildLayerDungeonGeometry } from '../rendering/sceneUtils';
import { FreeFlyCamera } from './FreeFlyCamera';

export type PreviewCameraMode = 'noclip' | 'freefly';

export class EditorPreview {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private ambient: THREE.AmbientLight;
  private torchLight: THREE.PointLight;
  private torchFillLight: THREE.PointLight;

  private player: Player | null = null;
  private freeFly: FreeFlyCamera;
  private cameraMode: PreviewCameraMode = 'noclip';
  private level: DungeonLevel | null = null;

  private geometryDirtyLayers = new Set<number>();
  private fullRebuildNeeded = false;
  needsPlayerReset = false;
  pendingPlayerStart: { col: number; row: number; facing?: string } | null = null;

  // Per-layer dungeon groups for incremental rebuild
  private layerDungeonGroups: THREE.Group[] = [];
  private entityGroup: THREE.Group;
  private billboardMeshes: THREE.Mesh[] = []; // sprites that face camera each frame
  private skyboxMesh: THREE.Mesh | null = null;
  private forestMeshes: ForestMeshes = { group: new THREE.Group(), instances: [] };

  private dirty = true;
  active = false;

  private lastTime = 0;
  private keys = new Set<string>();
  private focused = false;

  /** Called every preview frame so the 2D grid can update the camera indicator. */
  onFrameCallback: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);

    this.ambient = new THREE.AmbientLight(0x1a1a22);
    this.scene.add(this.ambient);

    this.torchLight = new THREE.PointLight(0xff994d, 6, 14, 2);
    this.scene.add(this.torchLight);
    this.torchFillLight = new THREE.PointLight(0xff994d, 2, 10, 2);
    this.scene.add(this.torchFillLight);

    this.entityGroup = new THREE.Group();
    this.scene.add(this.entityGroup);

    this.freeFly = new FreeFlyCamera(this.camera);
    this.freeFly.attach(canvas);

    // Input handling — document-level, gated by focused flag
    document.addEventListener('keydown', (e) => {
      if (!this.focused || !this.active) return;
      this.keys.add(e.code);
      e.preventDefault();
      e.stopPropagation();
    }, true); // capture phase — intercept before editor shortcuts
    document.addEventListener('keyup', (e) => {
      if (!this.focused || !this.active) return;
      this.keys.delete(e.code);
    }, true);

    // Render loop
    const loop = (time: number) => {
      requestAnimationFrame(loop);
      if (!this.active) return;

      const delta = Math.min((time - this.lastTime) / 1000, 0.05);
      this.lastTime = time;

      this.processDirtyState();

      if (this.cameraMode === 'freefly') {
        this.freeFly.update(delta, this.keys);
      } else {
        this.processInput();
        if (this.player) this.player.update(delta);
      }

      // Sync torch lights to camera position
      this.torchLight.position.copy(this.camera.position);
      this.torchFillLight.position.copy(this.camera.position);
      this.torchFillLight.position.y -= 0.5;

      // Skybox follows camera
      if (this.skyboxMesh) this.skyboxMesh.position.copy(this.camera.position);

      // Billboard sprites face camera (Y-axis only)
      const camY = this.camera.rotation.y;
      for (const m of this.billboardMeshes) m.rotation.y = camY;
      if (this.forestMeshes.instances.length > 0) {
        updateForestBillboards(this.forestMeshes, this.camera);
      }

      this.renderer.render(this.scene, this.camera);
      this.onFrameCallback?.();
    };
    requestAnimationFrame(loop);
  }

  focus(): void {
    this.canvas.focus();
    this.setFocused(true);
  }

  blur(): void {
    this.keys.clear();
    this.setFocused(false);
  }

  private setFocused(f: boolean): void {
    this.focused = f;
    this.canvas.classList.toggle('focused', f);
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  get hasScene(): boolean { return this.level !== null && this.layerDungeonGroups.length > 0; }

  /** Full rebuild including player reset to playerStart. Call on file open. */
  resetScene(level: DungeonLevel, activeLayerIndex: number, playerStart?: { col: number; row: number; facing?: string }): void {
    this.level = level;
    this.pendingPlayerStart = playerStart ?? null;
    this.needsPlayerReset = true;
    if (this.active) {
      this.buildScene(level, activeLayerIndex);
    }
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  // --- Scene building ---

  buildScene(level: DungeonLevel, activeLayerIndex: number): void {
    this.level = level;

    this.clearScene();

    applyEnvironment(level.environment, this.scene, this.ambient);
    this.updateSkybox(level);

    const walkable = buildWalkableSet(level.charDefs);
    const gs = new GameState([], undefined, 'preview', level.layers);

    for (let li = 0; li < level.layers.length; li++) {
      gs.activeLayerIndex = li;
      const { group: dungeonGroup } = buildLayerDungeonGeometry(gs, li, level.layers[li], level, level.layers.length);
      this.scene.add(dungeonGroup);
      this.layerDungeonGroups[li] = dungeonGroup;
    }

    this.rebuildAllEntities(level);

    const grid = level.layers[activeLayerIndex]?.grid ?? level.layers[0].grid;
    const ps = this.pendingPlayerStart ?? level.playerStart;
    this.pendingPlayerStart = null;
    const startCol = ps?.col ?? 1;
    const startRow = ps?.row ?? 1;
    const startFacing: Facing = (ps?.facing as Facing) ?? 'S';

    this.player = new Player(
      this.camera,
      grid,
      startCol,
      startRow,
      startFacing,
      walkable,
      undefined, // isDoorOpen
      undefined, // isBlocked
      undefined, // stairs
      undefined, // isEdgeBlocked
      undefined, // isRampAccessible
    );
    this.player.debugNoClip = true;
    this.player.yOffset = activeLayerIndex * LAYER_HEIGHT;
    this.player.targetYOffset = activeLayerIndex * LAYER_HEIGHT;

    this.dirty = true;
    this.fullRebuildNeeded = false;
    this.needsPlayerReset = false;
  }

  private clearScene(): void {
    for (const g of this.layerDungeonGroups) {
      g.removeFromParent();
      g.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
        }
      });
    }
    this.layerDungeonGroups = [];

    this.entityGroup.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
      }
    });
    this.entityGroup.clear();

    if (this.skyboxMesh) {
      this.scene.remove(this.skyboxMesh);
      this.skyboxMesh.geometry.dispose();
      this.skyboxMesh = null;
    }

    this.player = null;
  }

  private updateSkybox(level: DungeonLevel): void {
    if (this.skyboxMesh) {
      this.scene.remove(this.skyboxMesh);
      this.skyboxMesh.geometry.dispose();
      this.skyboxMesh = null;
    }
    if (level.skybox) {
      this.skyboxMesh = createSkyboxMesh(level.skybox);
      this.scene.add(this.skyboxMesh);
    }
  }

  private rebuildAllEntities(level: DungeonLevel): void {
    this.entityGroup.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
      }
    });
    this.entityGroup.clear();
    this.billboardMeshes = [];
    this.forestMeshes.instances = [];

    const gs = new GameState([], undefined, 'preview', level.layers);
    const walkable = buildWalkableSet(level.charDefs);

    for (let li = 0; li < level.layers.length; li++) {
      gs.activeLayerIndex = li;
      const ld = level.layers[li];
      const yOffset = ld.yOffset ?? (li * LAYER_HEIGHT);
      const result = buildLayerEntityMeshes(gs, ld, level, walkable, yOffset);
      this.entityGroup.add(result.group);
      this.billboardMeshes.push(...result.billboardMeshes);
      this.forestMeshes.instances.push(...result.forestInstances);
    }
  }

  // --- Incremental updates ---

  setCameraMode(mode: PreviewCameraMode): void {
    if (mode === this.cameraMode) return;

    if (this.cameraMode === 'freefly' && mode === 'noclip' && this.player) {
      // Snap player to nearest grid cell + closest cardinal facing from current camera
      this.freeFly.release();
      const CELL_SIZE = 2;
      const pos = this.camera.position;
      const col = Math.round(pos.x / CELL_SIZE - 0.5);
      const row = Math.round(pos.z / CELL_SIZE - 0.5);

      // Find closest cardinal facing from camera Y rotation
      const angle = this.camera.rotation.y;
      const facings: Facing[] = ['N', 'E', 'S', 'W'];
      let bestFacing: Facing = 'N';
      let bestDist = Infinity;
      for (const f of facings) {
        let diff = Math.abs(angle - FACING_ANGLE[f]);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < bestDist) { bestDist = diff; bestFacing = f; }
      }

      this.player.teleport(col, row, bestFacing);
      // Sync Y offset to camera height
      const eyeHeight = 1.625;
      const layerY = Math.round((pos.y - eyeHeight) / LAYER_HEIGHT) * LAYER_HEIGHT;
      this.player.yOffset = layerY;
      this.player.targetYOffset = layerY;
    }

    if (this.cameraMode === 'noclip' && mode === 'freefly') {
      this.freeFly.syncFromCamera();
    }

    this.cameraMode = mode;
  }

  getCameraMode(): PreviewCameraMode { return this.cameraMode; }

  /** Request pointer lock for free-fly mode. */
  requestPointerLock(): void {
    this.freeFly.requestLock();
  }

  /** Get camera grid position, Y-rotation, and approximate layer index for the 2D grid overlay indicator. */
  getCameraInfo(): { col: number; row: number; angle: number; layerIndex: number } | null {
    if (!this.active) return null;
    const CELL_SIZE = 2; // from dungeon.ts
    const pos = this.camera.position;
    const eyeHeight = 1.625; // EYE_HEIGHT from dungeon.ts
    const layerIndex = Math.round((pos.y - eyeHeight) / LAYER_HEIGHT);
    return {
      col: pos.x / CELL_SIZE - 0.5,
      row: pos.z / CELL_SIZE - 0.5,
      angle: this.camera.rotation.y,
      layerIndex: Math.max(0, layerIndex),
    };
  }

  /** Rebuild all geometry + entities but keep the camera/player position. */
  private rebuildSceneKeepCamera(level: DungeonLevel): void {
    this.level = level;
    applyEnvironment(level.environment, this.scene, this.ambient);
    this.updateSkybox(level);

    // Remove old dungeon groups
    for (const g of this.layerDungeonGroups) {
      g.removeFromParent();
      g.traverse(child => { if (child instanceof THREE.Mesh) child.geometry?.dispose(); });
    }
    this.layerDungeonGroups = [];

    // Rebuild dungeon geometry for all layers
    const gsRebuild = new GameState([], undefined, 'preview', level.layers);
    for (let li = 0; li < level.layers.length; li++) {
      gsRebuild.activeLayerIndex = li;
      const { group: dungeonGroup } = buildLayerDungeonGeometry(gsRebuild, li, level.layers[li], level, level.layers.length);
      this.scene.add(dungeonGroup);
      this.layerDungeonGroups[li] = dungeonGroup;
    }

    // Rebuild entities
    this.rebuildAllEntities(level);
  }

  markGeometryDirty(layerIndex: number, level?: DungeonLevel): void {
    if (level) this.level = level;
    this.geometryDirtyLayers.add(layerIndex);
    this.dirty = true;
  }

  markEntitiesDirty(_layerIndex: number): void {
    // For simplicity, rebuild all entities (they're fast)
    this.fullRebuildNeeded = true;
    this.dirty = true;
  }

  markFullRebuild(level?: DungeonLevel): void {
    if (level) this.level = level;
    this.fullRebuildNeeded = true;
    this.dirty = true;
  }

  private processDirtyState(): void {
    if (!this.level) return;

    if (this.fullRebuildNeeded) {
      this.rebuildSceneKeepCamera(this.level);
      this.fullRebuildNeeded = false;
      return;
    }

    // Rebuild only dirty layer geometry
    for (const li of this.geometryDirtyLayers) {
      if (li < 0 || li >= this.level.layers.length) continue;
      const old = this.layerDungeonGroups[li];
      if (old) {
        old.removeFromParent();
        old.traverse(child => {
          if (child instanceof THREE.Mesh) child.geometry?.dispose();
        });
      }

      const gsIncr = new GameState([], undefined, 'preview', this.level.layers);
      gsIncr.activeLayerIndex = li;
      const { group: dungeonGroup } = buildLayerDungeonGeometry(gsIncr, li, this.level.layers[li], this.level, this.level.layers.length);
      this.scene.add(dungeonGroup);
      this.layerDungeonGroups[li] = dungeonGroup;
    }
    this.geometryDirtyLayers.clear();
  }

  // --- Input ---

  private processInput(): void {
    if (!this.player || !this.focused) return;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      this.player.moveForward();
      this.keys.delete('KeyW');
      this.keys.delete('ArrowUp');
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      this.player.moveBack();
      this.keys.delete('KeyS');
      this.keys.delete('ArrowDown');
    }
    if (this.keys.has('KeyA')) {
      this.player.strafeLeft();
      this.keys.delete('KeyA');
    }
    if (this.keys.has('KeyD')) {
      this.player.strafeRight();
      this.keys.delete('KeyD');
    }
    if (this.keys.has('KeyQ') || this.keys.has('ArrowLeft')) {
      this.player.turnLeft();
      this.keys.delete('KeyQ');
      this.keys.delete('ArrowLeft');
    }
    if (this.keys.has('KeyE') || this.keys.has('ArrowRight')) {
      this.player.turnRight();
      this.keys.delete('KeyE');
      this.keys.delete('ArrowRight');
    }
    // Y/H for vertical movement (layer navigation)
    if (this.keys.has('KeyY')) {
      this.player.targetYOffset += LAYER_HEIGHT;
      this.keys.delete('KeyY');
    }
    if (this.keys.has('KeyH')) {
      this.player.targetYOffset = Math.max(0, this.player.targetYOffset - LAYER_HEIGHT);
      this.keys.delete('KeyH');
    }
  }

  dispose(): void {
    this.clearScene();
    this.renderer.dispose();
  }
}
