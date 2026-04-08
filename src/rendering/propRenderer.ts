import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT } from './dungeon';
import type { Facing } from '../core/grid';
import type { GameState } from '../core/gameState';

export interface PropMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Group>;
}

const WALL_DIR: Record<string, { dx: number; dz: number; rotY: number }> = {
  N: { dx: 0,  dz: -1, rotY: 0 },
  S: { dx: 0,  dz:  1, rotY: Math.PI },
  E: { dx:  1, dz:  0, rotY: -Math.PI / 2 },
  W: { dx: -1, dz:  0, rotY:  Math.PI / 2 },
};

export function buildPropMeshes(gameState: GameState): PropMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Group>();

  // --- Shared geometries ---
  const pillarGeo    = new THREE.CylinderGeometry(0.25, 0.25, WALL_HEIGHT, 8);
  const rubbleGeo    = new THREE.BoxGeometry(0.15, 0.1, 0.12);
  const stalactiteGeo = new THREE.ConeGeometry(0.15, 0.6, 6);
  const stalagmiteGeo = new THREE.ConeGeometry(0.18, 0.5, 6);
  const pedestalGeo  = new THREE.BoxGeometry(0.5, 0.3, 0.5);
  const torsoGeo     = new THREE.BoxGeometry(0.3, 0.5, 0.2);
  const headGeo      = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const crateBottomGeo = new THREE.BoxGeometry(0.6, 0.4, 0.5);
  const crateTopGeo    = new THREE.BoxGeometry(0.45, 0.35, 0.4);
  const bannerGeo    = new THREE.PlaneGeometry(0.5, 0.7);

  // --- Shared materials ---
  const pillarMat     = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const rubbleMat     = new THREE.MeshLambertMaterial({ color: 0x666666 });
  const stalactiteMat = new THREE.MeshLambertMaterial({ color: 0x777766 });
  const pedestalMat   = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const statueMat     = new THREE.MeshLambertMaterial({ color: 0x777777 });
  const crateBottomMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  const crateTopMat    = new THREE.MeshLambertMaterial({ color: 0x9B7924 });
  const bannerMat     = new THREE.MeshLambertMaterial({ color: 0x8B1A1A, side: THREE.DoubleSide });

  for (const [key, prop] of gameState.props) {
    const cx = prop.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = prop.row * CELL_SIZE + CELL_SIZE / 2;

    const propGroup = new THREE.Group();
    propGroup.position.set(cx, 0, cz);

    switch (prop.propId) {
      case 'pillar': {
        const mesh = new THREE.Mesh(pillarGeo, pillarMat);
        mesh.position.set(0, WALL_HEIGHT / 2, 0);
        propGroup.add(mesh);
        break;
      }

      case 'rubble': {
        // 4 rocks at deterministic offsets derived from grid position
        const offsets: [number, number][] = [
          [((prop.col * 7  + prop.row * 13) % 5) / 10 - 0.25,
           ((prop.col * 11 + prop.row * 7)  % 5) / 10 - 0.25],
          [((prop.col * 13 + prop.row * 3)  % 5) / 10 - 0.25,
           ((prop.col * 5  + prop.row * 11) % 5) / 10 - 0.25],
          [((prop.col * 3  + prop.row * 17) % 5) / 10 - 0.25,
           ((prop.col * 17 + prop.row * 5)  % 5) / 10 - 0.25],
          [((prop.col * 19 + prop.row * 2)  % 5) / 10 - 0.25,
           ((prop.col * 2  + prop.row * 19) % 5) / 10 - 0.25],
        ];
        for (const [ox, oz] of offsets) {
          const rock = new THREE.Mesh(rubbleGeo, rubbleMat);
          rock.position.set(ox, 0.05, oz);
          propGroup.add(rock);
        }
        break;
      }

      case 'stalactite': {
        const mesh = new THREE.Mesh(stalactiteGeo, stalactiteMat);
        mesh.rotation.z = Math.PI;
        mesh.position.set(0, WALL_HEIGHT - 0.3, 0);
        propGroup.add(mesh);
        break;
      }

      case 'stalagmite': {
        const mesh = new THREE.Mesh(stalagmiteGeo, stalactiteMat);
        mesh.position.set(0, 0.25, 0);
        propGroup.add(mesh);
        break;
      }

      case 'statue': {
        const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
        pedestal.position.set(0, 0.15, 0);
        propGroup.add(pedestal);

        const torso = new THREE.Mesh(torsoGeo, statueMat);
        torso.position.set(0, 0.55, 0);
        propGroup.add(torso);

        const head = new THREE.Mesh(headGeo, statueMat);
        head.position.set(0, 0.9, 0);
        propGroup.add(head);

        propGroup.rotation.y = (prop.rotation ?? 0) * Math.PI / 2;
        break;
      }

      case 'crate_stack': {
        const bottom = new THREE.Mesh(crateBottomGeo, crateBottomMat);
        bottom.position.set(0, 0.2, 0);
        propGroup.add(bottom);

        const top = new THREE.Mesh(crateTopGeo, crateTopMat);
        top.position.set(0.05, 0.575, 0);
        propGroup.add(top);

        propGroup.rotation.y = (prop.rotation ?? 0) * Math.PI / 2;
        break;
      }

      case 'banner': {
        const wallId = (prop.wall ?? 'N') as Facing;
        const dir = WALL_DIR[wallId];
        const offsetDist = CELL_SIZE / 2 - 0.02;

        // Position is relative to propGroup origin (cell center at y=0).
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.set(
          dir.dx * offsetDist,
          WALL_HEIGHT * 0.65,
          dir.dz * offsetDist,
        );
        banner.rotation.y = dir.rotY;
        propGroup.add(banner);
        break;
      }

      default:
        break;
    }

    group.add(propGroup);
    meshMap.set(key, propGroup);
  }

  return { group, meshMap };
}
