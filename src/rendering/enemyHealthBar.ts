import * as THREE from 'three';

const BAR_CANVAS_WIDTH = 34; // 1px border on each side + 32px bar
const BAR_CANVAS_HEIGHT = 6; // 1px border on each side + 4px bar

const BAR_SPRITE_WIDTH = 0.6;
const BAR_SPRITE_HEIGHT = 0.1;
const BAR_Y_OFFSET = 0.12; // gap between top of sprite and bar

const BORDER_COLOR = '#000000';
const BG_COLOR = '#222222';

function getFillColor(ratio: number): string {
  if (ratio > 0.7) return '#33cc33';
  if (ratio > 0.3) return '#cccc33';
  return '#cc3333';
}

interface HealthBarEntry {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lastHp: number;
  lastMaxHp: number;
  spriteHeight: number; // height of the enemy sprite (world units)
}

export class EnemyHealthBarManager {
  entries: Map<string, HealthBarEntry> = new Map();
  group: THREE.Group = new THREE.Group();

  getGroup(): THREE.Group {
    return this.group;
  }

  create(key: string, enemyMesh: THREE.Mesh, maxHp: number, spriteHeight: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = BAR_CANVAS_WIDTH;
    canvas.height = BAR_CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    _renderBar(ctx, canvas, 1.0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    const material = new THREE.SpriteMaterial({ map: texture, depthTest: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);

    sprite.scale.set(BAR_SPRITE_WIDTH, BAR_SPRITE_HEIGHT, 1);

    const barY = spriteHeight + BAR_Y_OFFSET;
    sprite.position.set(enemyMesh.position.x, barY, enemyMesh.position.z);

    // Start hidden — enemy is at full HP
    sprite.visible = false;

    this.group.add(sprite);
    this.entries.set(key, { sprite, material, canvas, ctx, lastHp: maxHp, lastMaxHp: maxHp, spriteHeight });
  }

  update(key: string, hp: number, maxHp: number): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (hp === entry.lastHp && maxHp === entry.lastMaxHp) return;

    entry.lastHp = hp;
    entry.lastMaxHp = maxHp;

    const ratio = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
    _renderBar(entry.ctx, entry.canvas, ratio);
    entry.material.map!.needsUpdate = true;

    entry.sprite.visible = hp < maxHp;
  }

  rekey(oldKey: string, newKey: string): void {
    const entry = this.entries.get(oldKey);
    if (!entry) return;
    this.entries.delete(oldKey);
    this.entries.set(newKey, entry);
  }

  remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;

    entry.material.map?.dispose();
    entry.material.dispose();
    this.group.remove(entry.sprite);
    this.entries.delete(key);
  }

  updatePositions(meshMap: Map<string, THREE.Mesh>): void {
    for (const [key, entry] of this.entries) {
      const mesh = meshMap.get(key);
      if (!mesh) continue;
      const barY = entry.spriteHeight + BAR_Y_OFFSET;
      entry.sprite.position.set(mesh.position.x, barY, mesh.position.z);
    }
  }

  updateBillboards(camera: THREE.Camera): void {
    for (const entry of this.entries.values()) {
      entry.sprite.rotation.y = camera.rotation.y;
    }
  }
}

function _renderBar(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, ratio: number): void {
  const w = canvas.width;
  const h = canvas.height;

  // Black border
  ctx.fillStyle = BORDER_COLOR;
  ctx.fillRect(0, 0, w, h);

  // Background inside border
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(1, 1, w - 2, h - 2);

  // Filled portion
  const fillWidth = Math.floor((w - 2) * ratio);
  if (fillWidth > 0) {
    ctx.fillStyle = getFillColor(ratio);
    ctx.fillRect(1, 1, fillWidth, h - 2);
  }
}
