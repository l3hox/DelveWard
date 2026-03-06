import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState } from '../core/gameState';
import type { Facing } from '../core/grid';

const SCONCE_HEIGHT = 1.4;
const TORCH_COLOR = 0xff994d;
const TORCH_INTENSITY = 1.5;
const TORCH_DISTANCE = 6;

// Rotations face the sconce INTO the room (away from the wall).
// Opposite of leverRenderer's WALL_DIR which faces geometry toward the wall.
// const WALL_DIR: Record<Facing, { dx: number; dz: number; rotY: number }> = {
//   N: { dx: 0, dz: 1, rotY: Math.PI },
//   S: { dx: 0, dz: -1, rotY: 0 },
//   E: { dx: 1, dz: 0, rotY: -Math.PI / 2 },
//   W: { dx: -1, dz: 0, rotY: Math.PI / 2 },
// };

const WALL_DIR: Record<Facing, { dx: number; dz: number; rotY: number }> = {
  N: { dx: 0, dz: -1, rotY: 0 },     // N wall -> face south
  S: { dx: 0, dz: 1, rotY: Math.PI },            // S wall -> face north
  E: { dx: 1, dz: 0, rotY: -Math.PI / 2 }, // E wall -> face west
  W: { dx: -1, dz: 0, rotY: Math.PI / 2 }, // W wall -> face east
};

export interface SconceMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Group>;   // sconce group per "col,row"
  lightMap: Map<string, THREE.PointLight>;
}

export function buildSconceMeshes(gameState: GameState): SconceMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Group>();
  const lightMap = new Map<string, THREE.PointLight>();

  // Shared geometry
  const bracketGeo = new THREE.BoxGeometry(0.08, 0.12, 0.15);
  const armGeo = new THREE.BoxGeometry(0.04, 0.04, 0.18);
  const torchHandleGeo = new THREE.CylinderGeometry(0.03, 0.025, 0.35, 6);
  const torchHeadGeo = new THREE.ConeGeometry(0.06, 0.12, 6);

  // Shared materials
  const bracketMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const armMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const torchHandleMat = new THREE.MeshLambertMaterial({ color: 0x664422 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
  const deadFlameMat = new THREE.MeshLambertMaterial({ color: 0x332211 });

  for (const [key, sconce] of gameState.sconces) {
    const cx = sconce.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = sconce.row * CELL_SIZE + CELL_SIZE / 2;
    const dir = WALL_DIR[sconce.wall];

    const sconceGroup = new THREE.Group();

    // Iron bracket on wall
    const bracket = new THREE.Mesh(bracketGeo, bracketMat);
    sconceGroup.add(bracket);

    // Arm extending outward from wall
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(0, 0, 0.12);
    sconceGroup.add(arm);

    // Torch handle (angled upward)
    const handle = new THREE.Mesh(torchHandleGeo, torchHandleMat);
    handle.position.set(0, 0.15, 0.2);
    handle.rotation.x = 0.3; // slight upward tilt
    sconceGroup.add(handle);

    // Flame / head
    const head = new THREE.Mesh(torchHeadGeo, sconce.lit ? flameMat : deadFlameMat);
    head.position.set(0, 0.35, 0.25);
    sconceGroup.add(head);

    // Position against the wall
    const offsetDist = CELL_SIZE / 2 - 0.02;
    sconceGroup.position.set(
      cx + dir.dx * offsetDist,
      SCONCE_HEIGHT,
      cz + dir.dz * offsetDist,
    );
    sconceGroup.rotation.y = dir.rotY;

    group.add(sconceGroup);
    meshMap.set(key, sconceGroup);

    // Point light
    if (sconce.lit) {
      const light = new THREE.PointLight(TORCH_COLOR, TORCH_INTENSITY, TORCH_DISTANCE);
      // Position light slightly in front of sconce (toward room center)
      light.position.set(
        cx + dir.dx * (offsetDist - 0.4),
        SCONCE_HEIGHT + 0.3,
        cz + dir.dz * (offsetDist - 0.4),
      );
      group.add(light);
      lightMap.set(key, light);
    }
  }

  return { group, meshMap, lightMap };
}

export function extinguishSconce(
  meshMap: Map<string, THREE.Group>,
  lightMap: Map<string, THREE.PointLight>,
  col: number,
  row: number,
): void {
  const key = `${col},${row}`;
  const sconceGroup = meshMap.get(key);
  if (sconceGroup) {
    // Hide torch handle and flame — only bracket + arm remain
    const handle = sconceGroup.children[2];
    const head = sconceGroup.children[3];
    if (handle) handle.visible = false;
    if (head) head.visible = false;
  }
  const light = lightMap.get(key);
  if (light) {
    light.intensity = 0;
  }
}
