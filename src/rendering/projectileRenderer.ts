import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { Projectile } from '../core/projectileManager';

const PROJECTILE_HEIGHT = 1.2; // eye-ish height for in-flight projectiles

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
