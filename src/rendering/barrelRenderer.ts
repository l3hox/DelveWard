import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { type GameState, type BarrelInstance } from '../core/gameState';

export interface BarrelMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Group>;
}

export function buildBarrelMeshes(gameState: GameState): BarrelMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Group>();

  const bodyGeo = new THREE.CylinderGeometry(0.38, 0.34, 0.8, 8);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x8b5e3c });

  const bandGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.03, 8);
  const bandMat = new THREE.MeshLambertMaterial({ color: 0x333333 });

  const BAND_Y_OFFSETS = [-0.18, 0.18];

  for (const [key, barrel] of gameState.barrels as Map<string, BarrelInstance>) {
    const cx = barrel.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = barrel.row * CELL_SIZE + CELL_SIZE / 2;

    const barrelGroup = new THREE.Group();

    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0, 0);
    barrelGroup.add(body);

    for (const yOffset of BAND_Y_OFFSETS) {
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.set(0, yOffset, 0);
      barrelGroup.add(band);
    }

    barrelGroup.position.set(cx, 0.4, cz);

    group.add(barrelGroup);
    meshMap.set(key, barrelGroup);
  }

  return { group, meshMap };
}
