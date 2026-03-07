import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT } from './dungeon';

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
