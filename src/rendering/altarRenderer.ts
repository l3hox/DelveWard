import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { doorKey, type GameState, type AltarInstance } from '../core/gameState';

export interface AltarMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Group>;
}

export function buildAltarMeshes(gameState: GameState): AltarMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Group>();

  const platformGeo = new THREE.BoxGeometry(1.2, 0.2, 1.2);
  const platformMat = new THREE.MeshLambertMaterial({ color: 0x777777 });

  const pillarGeo = new THREE.BoxGeometry(0.5, 0.55, 0.5);

  for (const [key, altar] of gameState.altars as Map<string, AltarInstance>) {
    const cx = altar.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = altar.row * CELL_SIZE + CELL_SIZE / 2;

    const altarGroup = new THREE.Group();

    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.set(0, 0, 0);
    altarGroup.add(platform);

    const pillarMat =
      altar.state === 'active'
        ? new THREE.MeshLambertMaterial({
            color: 0x999999,
            emissive: new THREE.Color(0x443300),
            emissiveIntensity: 0.5,
          })
        : new THREE.MeshLambertMaterial({ color: 0x999999 });

    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.name = 'pillar';
    pillar.position.set(0, 0.375, 0);
    altarGroup.add(pillar);

    altarGroup.position.set(cx, 0.1, cz);

    group.add(altarGroup);
    meshMap.set(key, altarGroup);
  }

  return { group, meshMap };
}

export function markAltarUsed(
  meshMap: Map<string, THREE.Group>,
  col: number,
  row: number,
): void {
  const key = doorKey(col, row);
  const altarGroup = meshMap.get(key);
  if (!altarGroup) return;

  altarGroup.traverse(child => {
    if (child.name === 'pillar' && child instanceof THREE.Mesh) {
      (child.material as THREE.MeshLambertMaterial).emissive.setHex(0x000000);
    }
  });
}
