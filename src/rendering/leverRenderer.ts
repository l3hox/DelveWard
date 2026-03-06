import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState } from '../core/gameState';
import type { Facing } from '../core/grid';

const LEVER_HEIGHT = 1.2; // eye-ish height on wall
const BASE_SIZE = 0.15;
const HANDLE_LENGTH = 0.3;
const HANDLE_RADIUS = 0.02;

// Handle pivot rotation angles (around X in local space)
const ANGLE_UP = -1.047;   // ~60° above horizontal
const ANGLE_DOWN = 1.047;  // ~60° below horizontal

const WALL_DIR: Record<Facing, { dx: number; dz: number; rotY: number }> = {
  N: { dx: 0, dz: -1, rotY: 0 },     // N wall -> face south
  S: { dx: 0, dz: 1, rotY: Math.PI },            // S wall -> face north
  E: { dx: 1, dz: 0, rotY: -Math.PI / 2 }, // E wall -> face west
  W: { dx: -1, dz: 0, rotY: Math.PI / 2 }, // W wall -> face east
};



export interface LeverMeshes {
  group: THREE.Group;
  handleMap: Map<string, THREE.Group>; // pivot groups keyed by "col,row"
}

export function buildLeverMeshes(
  gameState: GameState,
): LeverMeshes {
  const group = new THREE.Group();
  const handleMap = new Map<string, THREE.Group>();

  const baseMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const handleMat = new THREE.MeshLambertMaterial({ color: 0x886644 });
  const knobMat = new THREE.MeshLambertMaterial({ color: 0x444444 });

  const baseGeo = new THREE.BoxGeometry(BASE_SIZE, BASE_SIZE, 0.04);
  const handleGeo = new THREE.CylinderGeometry(HANDLE_RADIUS, HANDLE_RADIUS, HANDLE_LENGTH, 6);
  const knobGeo = new THREE.SphereGeometry(0.04, 6, 6);

  for (const [key, lever] of gameState.levers) {
    const cx = lever.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = lever.row * CELL_SIZE + CELL_SIZE / 2;

    const dir = WALL_DIR[lever.wall];
    const leverGroup = new THREE.Group();

    // Metal base plate on the wall
    const base = new THREE.Mesh(baseGeo, baseMat);
    leverGroup.add(base);

    // Pivot group for handle + knob (rotates around base)
    const pivot = new THREE.Group();
    pivot.position.set(0, 0, 0.02); // slightly off wall

    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.rotation.x = Math.PI / 2; // orient along Z (outward from wall)
    handle.position.set(0, 0, HANDLE_LENGTH / 2);
    pivot.add(handle);

    const knob = new THREE.Mesh(knobGeo, knobMat);
    knob.position.set(0, 0, HANDLE_LENGTH);
    pivot.add(knob);

    // Set initial angle
    const angle = lever.state === 'up' ? ANGLE_UP : ANGLE_DOWN;
    pivot.rotation.x = angle;

    leverGroup.add(pivot);

    // Position against the wall
    const offsetDist = CELL_SIZE / 2 - 0.02;
    leverGroup.position.set(
      cx + dir.dx * offsetDist,
      LEVER_HEIGHT,
      cz + dir.dz * offsetDist,
    );
    leverGroup.rotation.y = dir.rotY;

    group.add(leverGroup);
    handleMap.set(key, pivot);
  }

  return { group, handleMap };
}

