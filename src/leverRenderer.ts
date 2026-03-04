import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState } from './gameState';
import type { Facing } from './grid';

const LEVER_HEIGHT = 1.2; // eye-ish height on wall
const BASE_SIZE = 0.15;
const HANDLE_LENGTH = 0.3;
const HANDLE_RADIUS = 0.02;

const WALL_DIR: Record<Facing, { dx: number; dz: number; rotY: number }> = {
  N: { dx: 0, dz: -1, rotY: Math.PI },     // N wall → face south
  S: { dx: 0, dz: 1, rotY: 0 },            // S wall → face north
  E: { dx: 1, dz: 0, rotY: -Math.PI / 2 }, // E wall → face west
  W: { dx: -1, dz: 0, rotY: Math.PI / 2 }, // W wall → face east
};

export interface LeverMeshes {
  group: THREE.Group;
}

export function buildLeverMeshes(
  gameState: GameState,
): LeverMeshes {
  const group = new THREE.Group();

  const baseMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const handleMat = new THREE.MeshLambertMaterial({ color: 0x886644 });
  const knobMat = new THREE.MeshLambertMaterial({ color: 0x444444 });

  const baseGeo = new THREE.BoxGeometry(BASE_SIZE, BASE_SIZE, 0.04);
  const handleGeo = new THREE.CylinderGeometry(HANDLE_RADIUS, HANDLE_RADIUS, HANDLE_LENGTH, 6);
  const knobGeo = new THREE.SphereGeometry(0.04, 6, 6);

  for (const lever of gameState.levers.values()) {
    const cx = lever.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = lever.row * CELL_SIZE + CELL_SIZE / 2;

    const dir = WALL_DIR[lever.wall];
    const leverGroup = new THREE.Group();

    // Metal base plate on the wall
    const base = new THREE.Mesh(baseGeo, baseMat);
    leverGroup.add(base);

    // Wooden handle sticking out — angled upward
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(0, HANDLE_LENGTH / 2 - 0.02, 0.04);
    handle.rotation.x = -0.4; // slight tilt away from wall
    leverGroup.add(handle);

    // Knob at top of handle
    const knob = new THREE.Mesh(knobGeo, knobMat);
    knob.position.set(0, HANDLE_LENGTH - 0.04, 0.04 + Math.sin(0.4) * HANDLE_LENGTH * 0.3);
    leverGroup.add(knob);

    // Position against the wall
    const offsetDist = CELL_SIZE / 2 - 0.02;
    leverGroup.position.set(
      cx + dir.dx * offsetDist,
      LEVER_HEIGHT,
      cz + dir.dz * offsetDist,
    );
    leverGroup.rotation.y = dir.rotY;

    group.add(leverGroup);
  }

  return { group };
}
