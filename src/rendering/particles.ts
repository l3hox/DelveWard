import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT } from './dungeon';
import { WALKABLE_CELLS, buildWalkableSet } from '../core/grid';
import type { CharDef } from '../core/types';

// --- Dust motes: warm-tinted particles drifting lazily near the player torch ---

const DUST_COUNT = 40;
const DUST_SPAWN_RADIUS = 3.5;   // world units around player
const DUST_MIN_LIFETIME = 3;
const DUST_MAX_LIFETIME = 6;
const DUST_SIZE = 0.035;
const DUST_DRIFT_SPEED = 0.15;
const DUST_OPACITY = 0.25;
const DUST_COLOR = new THREE.Color(0xffddaa);

// --- Sconce embers: orange sparks rising from lit sconces ---

const EMBER_COUNT_PER_SCONCE = 4;
const EMBER_MIN_LIFETIME = 0.6;
const EMBER_MAX_LIFETIME = 1.4;
const EMBER_SIZE = 0.05;
const EMBER_RISE_SPEED = 0.8;
const EMBER_DRIFT = 0.3;
const EMBER_SPAWN_INTERVAL = 0.15;
const EMBER_COLOR = new THREE.Color(0xff6622);

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  lifetime: number;
}

// Shared circular point texture
let pointTexture: THREE.Texture | null = null;
function getPointTexture(): THREE.Texture {
  if (pointTexture) return pointTexture;
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  pointTexture = new THREE.CanvasTexture(canvas);
  return pointTexture;
}

export class DustMotes {
  private particles: Particle[] = [];
  private positions: Float32Array;
  private opacities: Float32Array;
  private geometry: THREE.BufferGeometry;
  private points: THREE.Points;

  constructor() {
    this.positions = new Float32Array(DUST_COUNT * 3);
    this.opacities = new Float32Array(DUST_COUNT);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('opacity', new THREE.BufferAttribute(this.opacities, 1));

    const material = new THREE.PointsMaterial({
      size: DUST_SIZE,
      map: getPointTexture(),
      transparent: true,
      opacity: DUST_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: DUST_COLOR,
      fog: true,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;

    // Pre-fill particles (they'll reposition on first update)
    for (let i = 0; i < DUST_COUNT; i++) {
      this.particles.push(this.createParticle(0, 0, 0));
    }
  }

  getObject(): THREE.Points {
    return this.points;
  }

  setVisible(visible: boolean): void {
    this.points.visible = visible;
  }

  private createParticle(cx: number, cy: number, cz: number): Particle {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * DUST_SPAWN_RADIUS;
    return {
      x: cx + Math.cos(angle) * dist,
      y: WALL_HEIGHT * 0.5 + Math.random() * WALL_HEIGHT * 0.5,
      z: cz + Math.sin(angle) * dist,
      vx: (Math.random() - 0.5) * DUST_DRIFT_SPEED,
      vy: (Math.random() - 0.3) * DUST_DRIFT_SPEED * 0.5,
      vz: (Math.random() - 0.5) * DUST_DRIFT_SPEED,
      age: Math.random() * DUST_MAX_LIFETIME, // stagger initial ages
      lifetime: DUST_MIN_LIFETIME + Math.random() * (DUST_MAX_LIFETIME - DUST_MIN_LIFETIME),
    };
  }

  update(delta: number, playerX: number, playerY: number, playerZ: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.age += delta;

      if (p.age >= p.lifetime) {
        // Respawn near player
        this.particles[i] = this.createParticle(playerX, playerY, playerZ);
        this.particles[i].age = 0;
        continue;
      }

      // Gentle drift
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z += p.vz * delta;

      // Fade in/out
      const t = p.age / p.lifetime;
      let opacity: number;
      if (t < 0.15) {
        opacity = t / 0.15;
      } else if (t > 0.7) {
        opacity = 1 - (t - 0.7) / 0.3;
      } else {
        opacity = 1;
      }

      // Fade by distance from player
      const offX = p.x - playerX;
      const offZ = p.z - playerZ;
      const distSq = offX * offX + offZ * offZ;
      const distFade = Math.max(0, 1 - distSq / (DUST_SPAWN_RADIUS * DUST_SPAWN_RADIUS));

      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      this.opacities[i] = opacity * distFade * 0.35;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.opacity.needsUpdate = true;
  }
}

export class SconceEmbers {
  private sources: { x: number; y: number; z: number }[] = [];
  private particles: Particle[] = [];
  private maxParticles: number = 0;
  private positions: Float32Array = new Float32Array(0);
  private opacities: Float32Array = new Float32Array(0);
  private geometry: THREE.BufferGeometry;
  private points: THREE.Points;
  private spawnTimer = 0;

  constructor() {
    this.geometry = new THREE.BufferGeometry();

    const material = new THREE.PointsMaterial({
      size: EMBER_SIZE,
      map: getPointTexture(),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: EMBER_COLOR,
      fog: true,
    });

    this.points = new THREE.Points(this.geometry, material);
  }

  getObject(): THREE.Points {
    return this.points;
  }

  setSources(
    sconceMeshMap: Map<string, THREE.Group>,
    sconceLightMap: Map<string, THREE.PointLight>,
  ): void {
    this.sources = [];
    const worldPos = new THREE.Vector3();
    for (const [key, sconceGroup] of sconceMeshMap) {
      // Only emit from lit sconces
      const light = sconceLightMap.get(key);
      if (!light || light.intensity === 0) continue;
      // child[3] is the flame/head mesh
      const head = sconceGroup.children[3];
      if (head) {
        head.getWorldPosition(worldPos);
        this.sources.push({ x: worldPos.x, y: worldPos.y, z: worldPos.z });
      }
    }
    this.maxParticles = this.sources.length * EMBER_COUNT_PER_SCONCE;
    this.positions = new Float32Array(this.maxParticles * 3);
    this.opacities = new Float32Array(this.maxParticles);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('opacity', new THREE.BufferAttribute(this.opacities, 1));
    this.particles = [];
  }

  private spawnEmber(): void {
    if (this.sources.length === 0) return;
    if (this.particles.length >= this.maxParticles) return;

    const src = this.sources[Math.floor(Math.random() * this.sources.length)];
    this.particles.push({
      x: src.x + (Math.random() - 0.5) * 0.06,
      y: src.y,
      z: src.z + (Math.random() - 0.5) * 0.06,
      vx: (Math.random() - 0.5) * EMBER_DRIFT,
      vy: EMBER_RISE_SPEED + Math.random() * 0.3,
      vz: (Math.random() - 0.5) * EMBER_DRIFT,
      age: 0,
      lifetime: EMBER_MIN_LIFETIME + Math.random() * (EMBER_MAX_LIFETIME - EMBER_MIN_LIFETIME),
    });
  }

  update(delta: number): void {
    // Spawn new embers at interval
    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0) {
      this.spawnEmber();
      this.spawnTimer = EMBER_SPAWN_INTERVAL;
    }

    // Update existing
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += delta;

      if (p.age >= p.lifetime) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z += p.vz * delta;

      // Slow down horizontal drift
      p.vx *= 0.98;
      p.vz *= 0.98;
    }

    // Write to buffers
    for (let i = 0; i < this.maxParticles; i++) {
      if (i < this.particles.length) {
        const p = this.particles[i];
        const t = p.age / p.lifetime;
        // Bright start, fade out
        const opacity = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;

        this.positions[i * 3] = p.x;
        this.positions[i * 3 + 1] = p.y;
        this.positions[i * 3 + 2] = p.z;
        this.opacities[i] = opacity * 0.8;
      } else {
        // Hide unused slots
        this.positions[i * 3] = 0;
        this.positions[i * 3 + 1] = -10;
        this.positions[i * 3 + 2] = 0;
        this.opacities[i] = 0;
      }
    }

    if (this.maxParticles > 0) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.opacity.needsUpdate = true;
    }
  }
}

// --- Water drips: drops form on ceiling, fall, splash on floor ---

const DRIP_FORM_TIME = 1.5;       // seconds to grow on ceiling
const DRIP_FALL_SPEED = 6;        // units/sec downward
const DRIP_GRAVITY = 8;           // acceleration
const SPLASH_LIFETIME = 0.35;     // seconds for splash to fade
const SPLASH_RING_COUNT = 4;      // splash ring particles
const DRIP_MIN_INTERVAL = 2;      // min seconds between drips at a source
const DRIP_MAX_INTERVAL = 6;      // max seconds between drips
const DRIP_COLOR = 0x6699cc;
const DRIP_MAX_SOURCES = 8;       // max simultaneous drip points near player
const DRIP_SPAWN_RADIUS = 5;      // world units — pick cells within this range

type DripPhase = 'forming' | 'falling' | 'splash';

interface Drip {
  x: number;
  z: number;
  y: number;
  vy: number;
  phase: DripPhase;
  age: number;
  formDuration: number;
}

// Elongated drop texture
let dropTexture: THREE.Texture | null = null;
function getDropTexture(): THREE.Texture {
  if (dropTexture) return dropTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 8, 16);
  // Teardrop shape
  const grad = ctx.createRadialGradient(4, 10, 0, 4, 10, 5);
  grad.addColorStop(0, 'rgba(150,200,255,0.9)');
  grad.addColorStop(0.6, 'rgba(100,160,220,0.5)');
  grad.addColorStop(1, 'rgba(100,160,220,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(4, 10, 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Bright top point
  ctx.fillStyle = 'rgba(200,230,255,0.8)';
  ctx.beginPath();
  ctx.ellipse(4, 6, 1.5, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  dropTexture = new THREE.CanvasTexture(canvas);
  dropTexture.magFilter = THREE.NearestFilter;
  dropTexture.minFilter = THREE.NearestFilter;
  return dropTexture;
}

// Small ring/splash texture
let splashTexture: THREE.Texture | null = null;
function getSplashTexture(): THREE.Texture {
  if (splashTexture) return splashTexture;
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  // Ring
  ctx.strokeStyle = 'rgba(150,200,255,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 5, 0, Math.PI * 2);
  ctx.stroke();
  // Center dot
  ctx.fillStyle = 'rgba(180,220,255,0.6)';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 2, 0, Math.PI * 2);
  ctx.fill();
  splashTexture = new THREE.CanvasTexture(canvas);
  return splashTexture;
}

export class WaterDrips {
  private group = new THREE.Group();
  private drips: Drip[] = [];
  private dropSprites: THREE.Sprite[] = [];
  private splashSprites: THREE.Sprite[] = [];
  private dropMaterial: THREE.SpriteMaterial;
  private splashMaterial: THREE.SpriteMaterial;
  private walkableCells: { x: number; z: number }[] = [];
  private sourceTimers: Map<string, number> = new Map();

  constructor() {
    this.dropMaterial = new THREE.SpriteMaterial({
      map: getDropTexture(),
      transparent: true,
      color: DRIP_COLOR,
      fog: true,
      depthWrite: false,
    });
    this.splashMaterial = new THREE.SpriteMaterial({
      map: getSplashTexture(),
      transparent: true,
      color: DRIP_COLOR,
      fog: true,
      depthWrite: false,
    });
  }

  getObject(): THREE.Group {
    return this.group;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  setLevel(grid: string[], charDefs?: CharDef[]): void {
    // Clear existing
    this.clear();
    this.walkableCells = [];
    this.sourceTimers.clear();

    const walkable = buildWalkableSet(charDefs);
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[0].length; col++) {
        const ch = grid[row][col];
        if (walkable.has(ch) && ch !== 'S' && ch !== 'U' && ch !== 'D') {
          this.walkableCells.push({
            x: col * CELL_SIZE + CELL_SIZE / 2,
            z: row * CELL_SIZE + CELL_SIZE / 2,
          });
        }
      }
    }
  }

  private clear(): void {
    for (const s of this.dropSprites) {
      this.group.remove(s);
      s.material.dispose();
    }
    for (const s of this.splashSprites) {
      this.group.remove(s);
      s.material.dispose();
    }
    this.dropSprites = [];
    this.splashSprites = [];
    this.drips = [];
  }

  update(delta: number, playerX: number, playerZ: number): void {
    if (this.walkableCells.length === 0) return;

    // Try to spawn new drips at nearby cells
    this.trySpawn(delta, playerX, playerZ);

    // Update existing drips
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const drip = this.drips[i];
      drip.age += delta;

      if (drip.phase === 'forming') {
        // Grow on ceiling
        const t = drip.age / drip.formDuration;
        const sprite = this.dropSprites[i];
        const scale = 0.02 + t * 0.06;
        sprite.scale.set(scale, scale * 2, 1);
        sprite.material.opacity = 0.3 + t * 0.5;
        // Slowly sag
        sprite.position.y = WALL_HEIGHT - 0.02 - t * 0.04;

        if (drip.age >= drip.formDuration) {
          drip.phase = 'falling';
          drip.age = 0;
          drip.y = sprite.position.y;
          drip.vy = 0;
        }
      } else if (drip.phase === 'falling') {
        // Accelerate downward
        drip.vy += DRIP_GRAVITY * delta;
        drip.y -= drip.vy * delta;

        const sprite = this.dropSprites[i];
        sprite.position.y = drip.y;
        // Stretch as it falls
        const speed = drip.vy;
        const stretch = Math.min(3, 1 + speed * 0.15);
        sprite.scale.set(0.06, 0.06 * stretch, 1);
        sprite.material.opacity = 0.8;

        // Hit the floor
        if (drip.y <= 0.01) {
          drip.phase = 'splash';
          drip.age = 0;
          // Hide drop sprite
          sprite.visible = false;
          // Create splash
          this.createSplash(i, drip.x, drip.z);
        }
      } else if (drip.phase === 'splash') {
        const t = drip.age / SPLASH_LIFETIME;
        if (t >= 1) {
          // Remove drip and its sprites
          this.removeDrip(i);
          continue;
        }
        // Expand and fade splash rings
        const splashStart = i * SPLASH_RING_COUNT;
        for (let r = 0; r < SPLASH_RING_COUNT; r++) {
          const si = splashStart + r;
          if (si >= this.splashSprites.length) break;
          const sprite = this.splashSprites[si];
          const ringDelay = r * 0.06;
          const rt = Math.max(0, (drip.age - ringDelay) / (SPLASH_LIFETIME - ringDelay));
          const scale = 0.03 + rt * 0.15;
          sprite.scale.set(scale, scale * 0.3, 1);
          sprite.material.opacity = (1 - rt) * 0.6;
        }
      }
    }
  }

  private trySpawn(delta: number, playerX: number, playerZ: number): void {
    // Find walkable cells near player
    const nearbyCells: { x: number; z: number }[] = [];
    for (const cell of this.walkableCells) {
      const dx = cell.x - playerX;
      const dz = cell.z - playerZ;
      if (dx * dx + dz * dz <= DRIP_SPAWN_RADIUS * DRIP_SPAWN_RADIUS) {
        nearbyCells.push(cell);
      }
    }
    if (nearbyCells.length === 0) return;

    // Update timers and spawn
    for (const cell of nearbyCells) {
      const key = `${cell.x},${cell.z}`;
      let timer = this.sourceTimers.get(key);
      if (timer === undefined) {
        // Initialize with random delay
        timer = DRIP_MIN_INTERVAL + Math.random() * (DRIP_MAX_INTERVAL - DRIP_MIN_INTERVAL);
        this.sourceTimers.set(key, timer);
      }
      timer -= delta;
      if (timer <= 0 && this.drips.length < DRIP_MAX_SOURCES) {
        this.spawnDrip(cell.x, cell.z);
        timer = DRIP_MIN_INTERVAL + Math.random() * (DRIP_MAX_INTERVAL - DRIP_MIN_INTERVAL);
      }
      this.sourceTimers.set(key, timer);
    }
  }

  private spawnDrip(x: number, z: number): void {
    // Random offset within cell
    const ox = (Math.random() - 0.5) * CELL_SIZE * 0.6;
    const oz = (Math.random() - 0.5) * CELL_SIZE * 0.6;
    const dx = x + ox;
    const dz = z + oz;

    const drip: Drip = {
      x: dx, z: dz,
      y: WALL_HEIGHT,
      vy: 0,
      phase: 'forming',
      age: 0,
      formDuration: DRIP_FORM_TIME * (0.7 + Math.random() * 0.6),
    };
    this.drips.push(drip);

    const sprite = new THREE.Sprite(this.dropMaterial.clone());
    sprite.position.set(dx, WALL_HEIGHT - 0.02, dz);
    sprite.scale.set(0.02, 0.04, 1);
    this.group.add(sprite);
    this.dropSprites.push(sprite);
  }

  private createSplash(dripIndex: number, x: number, z: number): void {
    // Insert splash sprites — we maintain a parallel array
    // For simplicity, add at end (splash indices tracked by dripIndex * SPLASH_RING_COUNT)
    // Since we remove in order, we rebuild splash array each time
    for (let r = 0; r < SPLASH_RING_COUNT; r++) {
      const sprite = new THREE.Sprite(this.splashMaterial.clone());
      sprite.position.set(x, 0.02, z);
      sprite.scale.set(0.03, 0.01, 1);
      this.group.add(sprite);
      this.splashSprites.push(sprite);
    }
  }

  private removeDrip(index: number): void {
    // Remove drop sprite
    const dropSprite = this.dropSprites[index];
    this.group.remove(dropSprite);
    dropSprite.material.dispose();
    this.dropSprites.splice(index, 1);

    // Remove splash sprites (last SPLASH_RING_COUNT added for this drip)
    // Splash sprites are appended in order, so for drip at `index`,
    // its splashes are the last ones added when it entered splash phase.
    // Since only one drip enters splash at a time and we remove immediately
    // after lifetime, we remove from the end.
    const splashEnd = this.splashSprites.length;
    const splashStart = splashEnd - SPLASH_RING_COUNT;
    for (let r = splashStart; r < splashEnd; r++) {
      const s = this.splashSprites[r];
      if (s) {
        this.group.remove(s);
        s.material.dispose();
      }
    }
    this.splashSprites.splice(splashStart, SPLASH_RING_COUNT);

    this.drips.splice(index, 1);
  }
}
