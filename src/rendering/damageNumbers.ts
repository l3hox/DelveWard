import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';

const FLOAT_SPEED = 1.5;    // units/sec upward
const LIFETIME = 0.7;       // seconds
const NUMBER_SIZE = 0.5;    // world units

interface DamageNumber {
  sprite: THREE.Sprite;
  age: number;
}

export class DamageNumberManager {
  private active: DamageNumber[] = [];
  private group = new THREE.Group();

  getGroup(): THREE.Group {
    return this.group;
  }

  spawn(col: number, row: number, damage: number): void {
    const tex = this.renderNumberTexture(damage);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);

    const cx = col * CELL_SIZE + CELL_SIZE / 2;
    const cz = row * CELL_SIZE + CELL_SIZE / 2;
    sprite.position.set(cx, 1.4, cz);
    sprite.scale.set(NUMBER_SIZE, NUMBER_SIZE, 1);

    this.group.add(sprite);
    this.active.push({ sprite, age: 0 });
  }

  update(delta: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const dn = this.active[i];
      dn.age += delta;

      if (dn.age >= LIFETIME) {
        this.group.remove(dn.sprite);
        (dn.sprite.material as THREE.SpriteMaterial).dispose();
        (dn.sprite.material as THREE.SpriteMaterial).map?.dispose();
        this.active.splice(i, 1);
        continue;
      }

      // Float up
      dn.sprite.position.y += FLOAT_SPEED * delta;

      // Fade out in the second half
      const t = dn.age / LIFETIME;
      const opacity = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6;
      (dn.sprite.material as THREE.SpriteMaterial).opacity = opacity;

      // Scale up slightly as it rises
      const scale = NUMBER_SIZE * (1 + t * 0.3);
      dn.sprite.scale.set(scale, scale, 1);
    }
  }

  private renderNumberTexture(damage: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 64, 64);

    const text = String(damage);

    // Black outline
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    for (const [dx, dy] of [[-2,0],[2,0],[0,-2],[0,2],[-2,-2],[2,-2],[-2,2],[2,2]]) {
      ctx.fillText(text, 32 + dx, 32 + dy);
    }

    // White fill
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 32, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }
}
