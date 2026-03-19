import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { Projectile } from '../core/projectileManager';

const PROJECTILE_HEIGHT = 1.2;

// --- Fireball explosion particles ---

const EXPLOSION_PARTICLE_COUNT = 18;
const EXPLOSION_LIFETIME = 0.45;       // seconds
const EXPLOSION_SPEED = 3.5;           // outward burst speed
const EXPLOSION_SIZE = 0.12;
const EXPLOSION_COLOR = new THREE.Color(0xFF4400);

// Shared soft-circle texture for explosion sparks
let explosionTexture: THREE.Texture | null = null;
function getExplosionTexture(): THREE.Texture {
  if (explosionTexture) return explosionTexture;
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  explosionTexture = new THREE.CanvasTexture(canvas);
  return explosionTexture;
}

interface ExplosionParticle {
  vx: number; vy: number; vz: number;
  age: number;
}

interface Explosion {
  particles: ExplosionParticle[];
  positions: Float32Array;
  geometry: THREE.BufferGeometry;
  points: THREE.Points;
  age: number;
  light: THREE.PointLight;
}

export class FireballExplosions {
  private active: Explosion[] = [];
  private group = new THREE.Group();

  getObject(): THREE.Group {
    return this.group;
  }

  spawn(worldX: number, worldZ: number): void {
    const particles: ExplosionParticle[] = [];
    const positions = new Float32Array(EXPLOSION_PARTICLE_COUNT * 3);

    for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI - Math.PI / 2;
      const speed = EXPLOSION_SPEED * (0.5 + Math.random() * 0.5);
      particles.push({
        vx: Math.cos(theta) * Math.cos(phi) * speed,
        vy: Math.sin(phi) * speed * 0.6 + 1.0,
        vz: Math.sin(theta) * Math.cos(phi) * speed,
        age: 0,
      });
      positions[i * 3] = worldX;
      positions[i * 3 + 1] = PROJECTILE_HEIGHT;
      positions[i * 3 + 2] = worldZ;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      size: EXPLOSION_SIZE,
      map: getExplosionTexture(),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: EXPLOSION_COLOR,
      fog: true,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.group.add(points);

    const light = new THREE.PointLight(0xFF4400, 6, 8);
    light.position.set(worldX, PROJECTILE_HEIGHT, worldZ);
    this.group.add(light);

    this.active.push({ particles, positions, geometry, points, age: 0, light });
  }

  update(delta: number): void {
    for (let e = this.active.length - 1; e >= 0; e--) {
      const exp = this.active[e];
      exp.age += delta;

      if (exp.age >= EXPLOSION_LIFETIME) {
        this.group.remove(exp.points);
        this.group.remove(exp.light);
        exp.geometry.dispose();
        (exp.points.material as THREE.Material).dispose();
        this.active.splice(e, 1);
        continue;
      }

      const t = exp.age / EXPLOSION_LIFETIME;
      // Fade out material opacity
      (exp.points.material as THREE.PointsMaterial).opacity = 1 - t;
      // Light: initial flash then fade out
      // 0–15%: bright flash peaking at 12, 15–100%: fade from 6 to 0
      const lightIntensity = t < 0.15
        ? 6 + 6 * Math.sin(t / 0.15 * Math.PI)
        : 6 * (1 - (t - 0.15) / 0.85);
      exp.light.intensity = lightIntensity;

      for (let i = 0; i < exp.particles.length; i++) {
        const p = exp.particles[i];
        p.age += delta;
        // Gravity + drag
        p.vy -= 4.0 * delta;
        const drag = 1 - 2.0 * delta;
        p.vx *= drag;
        p.vz *= drag;

        exp.positions[i * 3] += p.vx * delta;
        exp.positions[i * 3 + 1] += p.vy * delta;
        exp.positions[i * 3 + 2] += p.vz * delta;
      }

      exp.geometry.attributes.position.needsUpdate = true;
    }
  }

  clear(): void {
    for (const exp of this.active) {
      this.group.remove(exp.points);
      this.group.remove(exp.light);
      exp.geometry.dispose();
      (exp.points.material as THREE.Material).dispose();
    }
    this.active.length = 0;
  }
}

// --- Projectile rendering ---

const QUAD_SIZE: Record<string, number> = {
  dart:     0.15,
  arrow:    0.25,
  fireball: 0.35,
};

const COLORS: Record<string, number> = {
  dart:     0x8B7355, // brown wood
  arrow:    0x555555, // dark gray
  fireball: 0xFF4400, // bright orange
};

// Shared geometries and materials — created once, reused across all projectile meshes.
let sharedGeos: Map<string, THREE.PlaneGeometry> | null = null;
let sharedMats: Map<string, THREE.MeshBasicMaterial | THREE.MeshStandardMaterial> | null = null;

function ensureSharedAssets(): void {
  if (sharedGeos) return;
  sharedGeos = new Map();
  sharedMats = new Map();

  for (const [type, size] of Object.entries(QUAD_SIZE)) {
    sharedGeos.set(type, new THREE.PlaneGeometry(size, size));
  }

  sharedMats.set('dart', new THREE.MeshBasicMaterial({
    color: COLORS.dart,
    side: THREE.DoubleSide,
  }));
  sharedMats.set('arrow', new THREE.MeshBasicMaterial({
    color: COLORS.arrow,
    side: THREE.DoubleSide,
  }));
  // Fireball glows — use MeshStandardMaterial with emissive for the bloom effect.
  sharedMats.set('fireball', new THREE.MeshStandardMaterial({
    color: COLORS.fireball,
    emissive: COLORS.fireball,
    emissiveIntensity: 2,
    side: THREE.DoubleSide,
  }));
}

// Returns a fallback size for unknown projectile types.
function quadSizeFor(type: string): number {
  return QUAD_SIZE[type] ?? 0.2;
}

function colorFor(type: string): number {
  return COLORS[type] ?? 0xffffff;
}

/**
 * Creates a billboard quad mesh for the given projectile type.
 * Reuses the shared geometry and material for known types.
 * For unknown types a minimal fallback mesh is produced.
 */
export function createProjectileMesh(type: string): THREE.Mesh {
  ensureSharedAssets();

  const geo = sharedGeos!.get(type)
    ?? new THREE.PlaneGeometry(quadSizeFor(type), quadSizeFor(type));

  const mat = sharedMats!.get(type)
    ?? new THREE.MeshBasicMaterial({ color: colorFor(type), side: THREE.DoubleSide });

  const mesh = new THREE.Mesh(geo, mat);

  if (type === 'fireball') {
    const light = new THREE.PointLight(0xFF4400, 3, 6);
    mesh.add(light);
  }

  return mesh;
}

export interface ProjectileMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
}

export function createProjectileMeshes(): ProjectileMeshes {
  return { group: new THREE.Group(), meshMap: new Map() };
}

/**
 * Per-frame sync: adds meshes for newly spawned projectiles, removes meshes for
 * expired ones, updates world positions, and billboards everything toward the camera.
 *
 * Projectile col/row are already fractional with the 0.5 spawn offset baked in,
 * so world X/Z are a direct multiply — no additional CELL_SIZE/2 offset needed.
 */
export function updateProjectileMeshes(
  group: THREE.Group,
  meshMap: Map<string, THREE.Mesh>,
  projectiles: Projectile[],
  camera: THREE.Camera,
): void {
  const activeIds = new Set(projectiles.map((p) => p.id));

  // Remove meshes for expired projectiles.
  for (const [id, mesh] of meshMap) {
    if (!activeIds.has(id)) {
      group.remove(mesh);
      meshMap.delete(id);
    }
  }

  // Add meshes for new projectiles, then update all positions.
  for (const projectile of projectiles) {
    if (!meshMap.has(projectile.id)) {
      const mesh = createProjectileMesh(projectile.projectileType);
      group.add(mesh);
      meshMap.set(projectile.id, mesh);
    }

    const mesh = meshMap.get(projectile.id)!;
    mesh.position.set(
      projectile.col * CELL_SIZE,
      PROJECTILE_HEIGHT,
      projectile.row * CELL_SIZE,
    );

    // Billboard: face the camera so the quad is always visible head-on.
    mesh.lookAt(camera.position);
  }
}

/**
 * Pre-compile projectile and explosion shader programs so the GPU doesn't
 * stall on the first fireball spawn.  Call once during init after the scene
 * has lighting and fog set up (shader variants depend on those).
 */
export function warmUpProjectileMaterials(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): void {
  ensureSharedAssets();

  const tempGroup = new THREE.Group();
  tempGroup.position.set(0, -1000, 0);

  // Projectile meshes — fireball's MeshStandardMaterial is the expensive one
  for (const type of ['dart', 'arrow', 'fireball']) {
    tempGroup.add(createProjectileMesh(type));
  }

  // Explosion particles (PointsMaterial + AdditiveBlending + CanvasTexture)
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const mat = new THREE.PointsMaterial({
    size: EXPLOSION_SIZE,
    map: getExplosionTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: EXPLOSION_COLOR,
    fog: true,
  });
  tempGroup.add(new THREE.Points(geo, mat));

  scene.add(tempGroup);
  renderer.compile(scene, camera);
  scene.remove(tempGroup);

  geo.dispose();
  mat.dispose();
}

/**
 * Removes all projectile meshes from the group and clears the map.
 * Call this when changing levels or resetting the scene.
 */
export function clearProjectileMeshes(
  group: THREE.Group,
  meshMap: Map<string, THREE.Mesh>,
): void {
  for (const mesh of meshMap.values()) {
    group.remove(mesh);
  }
  meshMap.clear();
}
