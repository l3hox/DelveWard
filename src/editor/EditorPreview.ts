import * as THREE from 'three';
import type { DungeonLevel } from '../core/types';
import type { Facing } from '../core/grid';
import { GameState } from '../core/gameState';
import { buildDungeon, LAYER_HEIGHT } from '../rendering/dungeon';
import { applyEnvironment } from '../rendering/environment';
import { Player } from '../rendering/player';
import { buildWalkableSet } from '../core/grid';
import { buildDoorMeshes } from '../rendering/doorRenderer';
import { buildSconceMeshes } from '../rendering/sconceRenderer';
import { buildPropMeshes } from '../rendering/propRenderer';
import { buildBarrelMeshes } from '../rendering/barrelRenderer';
import { buildBlockMeshes } from '../rendering/blockRenderer';
import { buildStairMeshes } from '../rendering/stairRenderer';
import { buildWallEntityMeshes } from '../rendering/wallEntityRenderer';
import { buildThinWallMeshes } from '../rendering/thinWallRenderer';
import { buildRampMeshes } from '../rendering/rampRenderer';
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

  // Per-layer dungeon groups for incremental rebuild
  private layerDungeonGroups: THREE.Group[] = [];
  private entityGroup: THREE.Group;

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

    // Input handling — only when focused
    canvas.tabIndex = 0;
    canvas.addEventListener('mousedown', () => this.focus());
    canvas.addEventListener('keydown', (e) => {
      if (!this.focused) return;
      this.keys.add(e.code);
      e.preventDefault();
    });
    canvas.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    canvas.addEventListener('blur', () => {
      this.keys.clear();
      this.setFocused(false);
    });

    // Render loop
    const loop = (time: number) => {
      requestAnimationFrame(loop);
      if (!this.active) return;

      const delta = Math.min((time - this.lastTime) / 1000, 0.05);
      this.lastTime = time;

      this.processDirtyState();

      if (this.cameraMode === 'freefly') {
        this.freeFly.update(delta);
      } else {
        this.processInput();
        if (this.player) this.player.update(delta);
      }

      // Sync torch lights to camera position
      this.torchLight.position.copy(this.camera.position);
      this.torchFillLight.position.copy(this.camera.position);
      this.torchFillLight.position.y -= 0.5;

      this.renderer.render(this.scene, this.camera);
      this.onFrameCallback?.();
    };
    requestAnimationFrame(loop);
  }

  focus(): void {
    this.canvas.focus();
    this.setFocused(true);
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

  setActive(active: boolean): void {
    this.active = active;
    if (active && this.level) {
      this.fullRebuildNeeded = true;
    }
  }

  // --- Scene building ---

  buildScene(level: DungeonLevel, activeLayerIndex: number): void {
    this.level = level;

    this.clearScene();

    applyEnvironment(level.environment, this.scene, this.ambient);

    const walkable = buildWalkableSet(level.charDefs);

    for (let li = 0; li < level.layers.length; li++) {
      const ld = level.layers[li];
      const yOffset = ld.yOffset ?? (li * LAYER_HEIGHT);
      const aboveGrid = level.layers[li + 1]?.grid;
      const belowGrid = level.layers[li - 1]?.grid;

      const dungeonGroup = buildDungeon(
        ld.grid,
        ld.defaults ?? level.defaults,
        ld.areas ?? level.areas,
        level.charDefs,
        li === level.layers.length - 1 ? (ld.ceiling ?? level.ceiling) !== false : true,
        new Set(), // stairPositions
        new Set(), // wallEntityCells
        undefined, // envZoneMap
        undefined, // doorCells
        aboveGrid,
        belowGrid,
      );
      dungeonGroup.position.y = yOffset;
      this.scene.add(dungeonGroup);
      this.layerDungeonGroups[li] = dungeonGroup;
    }

    this.rebuildAllEntities(level);

    const grid = level.layers[activeLayerIndex]?.grid ?? level.layers[0].grid;
    const ps = (level as any).playerStart;
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

    this.player = null;
  }

  private rebuildAllEntities(level: DungeonLevel): void {
    this.entityGroup.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
      }
    });
    this.entityGroup.clear();

    const gs = new GameState([], undefined, 'preview', level.layers);
    const walkable = buildWalkableSet(level.charDefs);

    for (let li = 0; li < level.layers.length; li++) {
      gs.activeLayerIndex = li;
      const ld = level.layers[li];
      const yOffset = ld.yOffset ?? (li * LAYER_HEIGHT);
      const defaults = ld.defaults ?? level.defaults;
      const areas = ld.areas ?? level.areas;

      // Wall entities (breakable + secret walls)
      const wallEntityCells = new Map<string, { col: number; row: number }>();
      for (const [k, v] of gs.breakableWalls) wallEntityCells.set(k, v);
      for (const [k, v] of gs.secretWalls) wallEntityCells.set(k, v);
      if (wallEntityCells.size > 0) {
        const wem = buildWallEntityMeshes(wallEntityCells, ld.grid, defaults, areas, level.charDefs);
        wem.group.position.y = yOffset;
        this.entityGroup.add(wem.group);
      }

      // Doors
      const doorMeshes = buildDoorMeshes(ld.grid, gs, walkable);
      doorMeshes.group.position.y = yOffset;
      this.entityGroup.add(doorMeshes.group);

      // Sconces
      const sconceMeshes = buildSconceMeshes(gs);
      sconceMeshes.group.position.y = yOffset;
      this.entityGroup.add(sconceMeshes.group);

      // Stairs
      const stairMeshes = buildStairMeshes(gs.stairs, defaults, areas, ld.grid, level.charDefs, walkable);
      stairMeshes.group.position.y = yOffset;
      this.entityGroup.add(stairMeshes.group);

      // Blocks
      const blockMeshes = buildBlockMeshes(gs);
      blockMeshes.group.position.y = yOffset;
      this.entityGroup.add(blockMeshes.group);

      // Barrels
      const barrelMeshes = buildBarrelMeshes(gs);
      barrelMeshes.group.position.y = yOffset;
      this.entityGroup.add(barrelMeshes.group);

      // Props
      const propMeshes = buildPropMeshes(gs);
      propMeshes.group.position.y = yOffset;
      this.entityGroup.add(propMeshes.group);

      // Thin walls
      const thinWallMeshes = buildThinWallMeshes(gs);
      thinWallMeshes.group.position.y = yOffset;
      this.entityGroup.add(thinWallMeshes.group);

      // Ramps
      const rampMeshes = buildRampMeshes(gs, ld.grid, defaults, level.charDefs, areas, walkable);
      rampMeshes.group.position.y = yOffset;
      this.entityGroup.add(rampMeshes.group);
    }
  }

  // --- Incremental updates ---

  setCameraMode(mode: PreviewCameraMode): void {
    if (mode === this.cameraMode) return;
    if (this.cameraMode === 'freefly') this.freeFly.release();
    this.cameraMode = mode;
    if (mode === 'freefly') this.freeFly.syncFromCamera();
  }

  getCameraMode(): PreviewCameraMode { return this.cameraMode; }

  /** Get camera grid position and Y-rotation for the 2D grid overlay indicator. */
  getCameraInfo(): { col: number; row: number; angle: number } | null {
    if (!this.active) return null;
    const CELL_SIZE = 2; // from dungeon.ts
    const pos = this.camera.position;
    return {
      col: pos.x / CELL_SIZE - 0.5,
      row: pos.z / CELL_SIZE - 0.5,
      angle: this.camera.rotation.y,
    };
  }

  /** Rebuild all geometry + entities but keep the camera/player position. */
  private rebuildSceneKeepCamera(level: DungeonLevel): void {
    this.level = level;
    applyEnvironment(level.environment, this.scene, this.ambient);

    // Remove old dungeon groups
    for (const g of this.layerDungeonGroups) {
      g.removeFromParent();
      g.traverse(child => { if (child instanceof THREE.Mesh) child.geometry?.dispose(); });
    }
    this.layerDungeonGroups = [];

    // Rebuild dungeon geometry for all layers
    for (let li = 0; li < level.layers.length; li++) {
      const ld = level.layers[li];
      const yOffset = ld.yOffset ?? (li * LAYER_HEIGHT);
      const aboveGrid = level.layers[li + 1]?.grid;
      const belowGrid = level.layers[li - 1]?.grid;

      const dungeonGroup = buildDungeon(
        ld.grid,
        ld.defaults ?? level.defaults,
        ld.areas ?? level.areas,
        level.charDefs,
        li === level.layers.length - 1 ? (ld.ceiling ?? level.ceiling) !== false : true,
        new Set(), new Set(), undefined, undefined,
        aboveGrid, belowGrid,
      );
      dungeonGroup.position.y = yOffset;
      this.scene.add(dungeonGroup);
      this.layerDungeonGroups[li] = dungeonGroup;
    }

    // Rebuild entities
    this.rebuildAllEntities(level);
  }

  markGeometryDirty(layerIndex: number): void {
    this.geometryDirtyLayers.add(layerIndex);
    this.dirty = true;
  }

  markEntitiesDirty(_layerIndex: number): void {
    // For simplicity, rebuild all entities (they're fast)
    this.fullRebuildNeeded = true;
    this.dirty = true;
  }

  markFullRebuild(): void {
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

      const ld = this.level.layers[li];
      const yOffset = ld.yOffset ?? (li * LAYER_HEIGHT);
      const aboveGrid = this.level.layers[li + 1]?.grid;
      const belowGrid = this.level.layers[li - 1]?.grid;

      const dungeonGroup = buildDungeon(
        ld.grid,
        ld.defaults ?? this.level.defaults,
        ld.areas ?? this.level.areas,
        this.level.charDefs,
        li === this.level.layers.length - 1 ? (ld.ceiling ?? this.level.ceiling) !== false : true,
        new Set(),
        new Set(),
        undefined,
        undefined,
        aboveGrid,
        belowGrid,
      );
      dungeonGroup.position.y = yOffset;
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
