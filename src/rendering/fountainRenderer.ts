import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import type { GameState, FountainInstance } from '../core/gameState';

export interface FountainMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Group>;
}

export function buildFountainMeshes(gameState: GameState): FountainMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Group>();

  const basinGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8);
  const basinMat = new THREE.MeshLambertMaterial({ color: 0x888888 });

  const pedestalGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6);
  const pedestalMat = new THREE.MeshLambertMaterial({ color: 0x999999 });

  const waterGeo = new THREE.CircleGeometry(0.3, 8);
  const waterMat = new THREE.MeshLambertMaterial({
    color: 0x4488cc,
    transparent: true,
    opacity: 0.6,
  });

  for (const [key, fountain] of gameState.fountains as Map<string, FountainInstance>) {
    const cx = fountain.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = fountain.row * CELL_SIZE + CELL_SIZE / 2;

    const fountainGroup = new THREE.Group();

    const basin = new THREE.Mesh(basinGeo, basinMat);
    basin.position.set(0, 0.25, 0);
    fountainGroup.add(basin);

    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.set(0, 0.3, 0);
    fountainGroup.add(pedestal);

    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.name = 'water';
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(0, 0.51, 0);
    fountainGroup.add(waterMesh);

    if (fountain.state === 'used') {
      waterMesh.visible = false;
    }

    fountainGroup.position.set(cx, 0, cz);

    group.add(fountainGroup);
    meshMap.set(key, fountainGroup);
  }

  return { group, meshMap };
}

export function markFountainUsed(
  meshMap: Map<string, THREE.Group>,
  key: string,
): void {
  const fountainGroup = meshMap.get(key);
  if (!fountainGroup) return;

  fountainGroup.traverse(child => {
    if (child.name === 'water') {
      child.visible = false;
    }
  });
}
