import * as THREE from 'three';

const BAR_CANVAS_WIDTH = 32;
const BAR_CANVAS_HEIGHT = 4;

const BAR_SPRITE_WIDTH = 0.6;
const BAR_SPRITE_HEIGHT = 0.08;
const BAR_Y_OFFSET = 0.15;

const COLOR_BG = '#333333';
const COLOR_FILL = '#cc3333';

interface HealthBarEntry {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lastHp: number;
  lastMaxHp: number;
}

export class EnemyHealthBarManager {
  entries: Map<string, HealthBarEntry> = new Map();
  group: THREE.Group = new THREE.Group();

  getGroup(): THREE.Group {
    return this.group;
  }

  create(key: string, enemyMesh: THREE.Mesh, maxHp: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = BAR_CANVAS_WIDTH;
    canvas.height = BAR_CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    // Draw initial full bar (will be hidden)
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, BAR_CANVAS_WIDTH, BAR_CANVAS_HEIGHT);
    ctx.fillStyle = COLOR_FILL;
    ctx.fillRect(0, 0, BAR_CANVAS_WIDTH, BAR_CANVAS_HEIGHT);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);

    sprite.scale.set(BAR_SPRITE_WIDTH, BAR_SPRITE_HEIGHT, 1);

    const barY = enemyMesh.position.y + sprite.scale.y / 2 + BAR_Y_OFFSET;
    sprite.position.set(enemyMesh.position.x, barY, enemyMesh.position.z);

    // Start hidden — enemy is at full HP
    sprite.visible = false;

    this.group.add(sprite);
    this.entries.set(key, { sprite, material, canvas, ctx, lastHp: maxHp, lastMaxHp: maxHp });
  }

  update(key: string, hp: number, maxHp: number): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (hp === entry.lastHp && maxHp === entry.lastMaxHp) return;

    entry.lastHp = hp;
    entry.lastMaxHp = maxHp;

    // Re-render canvas
    const { ctx, canvas, material } = entry;
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const ratio = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
    const fillWidth = Math.floor(canvas.width * ratio);
    if (fillWidth > 0) {
      ctx.fillStyle = COLOR_FILL;
      ctx.fillRect(0, 0, fillWidth, canvas.height);
    }

    material.map!.needsUpdate = true;

    entry.sprite.visible = hp < maxHp;
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
      const barY = mesh.position.y + entry.sprite.scale.y / 2 + BAR_Y_OFFSET;
      entry.sprite.position.set(mesh.position.x, barY, mesh.position.z);
    }
  }

  updateBillboards(camera: THREE.Camera): void {
    for (const entry of this.entries.values()) {
      entry.sprite.rotation.y = camera.rotation.y;
    }
  }
}
