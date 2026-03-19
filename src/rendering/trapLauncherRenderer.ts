import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState } from '../core/gameState';
import type { Facing } from '../core/grid';

const LAUNCHER_HEIGHT = 1.2; // matches PROJECTILE_HEIGHT — nozzle is at projectile eye level

// Launcher body dimensions.
const BODY_WIDTH  = 0.20;
const BODY_HEIGHT = 0.15;
const BODY_DEPTH  = 0.10;

// Inner nozzle hole — slightly smaller, inset so it reads as a dark opening.
const HOLE_WIDTH  = 0.10;
const HOLE_HEIGHT = 0.07;
const HOLE_DEPTH  = 0.02; // thin dark slab that sits proud of the body face

// WALL_DIR maps a Facing to the unit offset that pushes toward that wall
// and the Y rotation that makes a mesh face outward from that wall.
// Matches the convention in leverRenderer.ts exactly.
const WALL_DIR: Record<Facing, { dx: number; dz: number; rotY: number }> = {
  N: { dx:  0, dz: -1, rotY: 0            },
  S: { dx:  0, dz:  1, rotY: Math.PI      },
  E: { dx:  1, dz:  0, rotY: -Math.PI / 2 },
  W: { dx: -1, dz:  0, rotY:  Math.PI / 2 },
};

// The launcher body sits in a walkable cell and fires in `facing`. Because the
// projectile exits through a wall, the launcher is mounted against the wall
// OPPOSITE to the firing direction (the back wall of the nozzle).
const OPPOSITE: Record<Facing, Facing> = { N: 'S', S: 'N', E: 'W', W: 'E' };

const bodyGeo = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH);
const holeGeo = new THREE.BoxGeometry(HOLE_WIDTH, HOLE_HEIGHT, HOLE_DEPTH);

// Dark iron body; even darker recess for the nozzle opening.
const bodyMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
const holeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

/**
 * Builds static meshes for all trap launchers in gameState.
 * Returns a single Group that can be added to the scene.
 * The structure mirrors leverRenderer.buildLeverMeshes — one child Group per launcher.
 */
export function buildTrapLauncherMeshes(gameState: GameState): { group: THREE.Group } {
  const group = new THREE.Group();

  for (const [, launcher] of gameState.trapLaunchers) {
    const mountWall = OPPOSITE[launcher.facing];
    const dir = WALL_DIR[mountWall];

    // Cell center in world space.
    const cx = launcher.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = launcher.row * CELL_SIZE + CELL_SIZE / 2;

    const launcherGroup = new THREE.Group();

    // Body plate — the main rectangular block embedded in the wall.
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    launcherGroup.add(body);

    // Nozzle hole — a darker slab sitting on the face of the body (toward the cell interior).
    // In local space the body face toward the cell is at +Z (since we haven't rotated yet),
    // so the hole sits at BODY_DEPTH/2 + HOLE_DEPTH/2 in local Z.
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.set(0, 0, BODY_DEPTH / 2 + HOLE_DEPTH / 2);
    launcherGroup.add(hole);

    // Push the launcher flush against the mount wall.
    // offsetDist centers the body so its back face meets the wall surface.
    const offsetDist = CELL_SIZE / 2 - BODY_DEPTH / 2;
    launcherGroup.position.set(
      cx + dir.dx * offsetDist,
      LAUNCHER_HEIGHT,
      cz + dir.dz * offsetDist,
    );

    // Rotate so the nozzle points inward (toward the firing direction).
    // WALL_DIR.rotY for the mount wall makes the front of the group face away
    // from the wall, which is the firing direction.
    launcherGroup.rotation.y = dir.rotY;

    group.add(launcherGroup);
  }

  return { group };
}
