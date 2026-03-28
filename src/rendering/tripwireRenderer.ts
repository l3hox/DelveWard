import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState } from '../core/gameState';

const WIRE_HEIGHT = 0.25; // ankle height
const WIRE_RADIUS = 0.008; // thin wire thickness

export interface TripwireMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
}

export function buildTripwireMeshes(gameState: GameState): TripwireMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  const mat = new THREE.MeshBasicMaterial({
    color: 0x444444,
    transparent: true,
    opacity: 0.1,
  });

  for (const [key, tw] of gameState.tripwires) {
    if (tw.triggered) continue;

    const cx = tw.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = tw.row * CELL_SIZE + CELL_SIZE / 2;

    // Cylinder running wall-to-wall across the cell
    const geo = new THREE.CylinderGeometry(WIRE_RADIUS, WIRE_RADIUS, CELL_SIZE, 4);
    // CylinderGeometry is vertical by default — rotate to horizontal
    geo.rotateZ(Math.PI / 2);

    const mesh = new THREE.Mesh(geo, mat);

    if (tw.orientation === 'NS') {
      // North-south: wire runs along Z axis
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(cx, WIRE_HEIGHT, cz);
    } else {
      // East-west: wire runs along X axis (default after rotateZ)
      mesh.position.set(cx, WIRE_HEIGHT, cz);
    }

    group.add(mesh);
    meshMap.set(key, mesh);
  }

  return { group, meshMap };
}

export function hideTripwire(meshMap: Map<string, THREE.Mesh>, key: string): void {
  const mesh = meshMap.get(key);
  if (mesh) mesh.visible = false;
}
