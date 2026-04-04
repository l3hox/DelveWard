import * as THREE from 'three';
import type { GameState, ThinWallInstance } from '../core/gameState';
import { CELL_SIZE, WALL_HEIGHT } from './dungeon';
import { getThinWallTexture } from './textures';

export interface ThinWallMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Group>;
}

export function buildThinWallMeshes(gameState: GameState): ThinWallMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Group>();

  for (const [key, tw] of gameState.thinWalls) {
    const wallGroup = buildSingleThinWall(tw);
    group.add(wallGroup);
    meshMap.set(key, wallGroup);
  }

  return { group, meshMap };
}

function buildSingleThinWall(tw: ThinWallInstance): THREE.Group {
  const wallGroup = new THREE.Group();

  const height = tw.height === 'half' ? WALL_HEIGHT * 0.5 : WALL_HEIGHT;
  const yCenter = height / 2;

  const cx = tw.col * CELL_SIZE + CELL_SIZE / 2;
  const cz = tw.row * CELL_SIZE + CELL_SIZE / 2;

  const frontTex = getThinWallTexture(tw.texture);
  const backTex = tw.textureBack ? getThinWallTexture(tw.textureBack) : frontTex;

  const geo = new THREE.PlaneGeometry(CELL_SIZE, height);

  if (backTex === frontTex) {
    // Same texture both sides — single double-sided mesh
    // alphaTest discards transparent pixels (avoids multi-zone blending artifacts)
    const mat = new THREE.MeshLambertMaterial({
      map: frontTex,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = yCenter;
    wallGroup.add(mesh);
  } else {
    // Different textures — two single-sided planes facing opposite directions
    const frontMat = new THREE.MeshLambertMaterial({
      map: frontTex,
      side: THREE.FrontSide,
      alphaTest: 0.5,
    });
    const backMat = new THREE.MeshLambertMaterial({
      map: backTex,
      side: THREE.FrontSide,
      alphaTest: 0.5,
    });

    const frontMesh = new THREE.Mesh(geo, frontMat);
    frontMesh.position.y = yCenter;
    wallGroup.add(frontMesh);

    const backMesh = new THREE.Mesh(geo.clone(), backMat);
    backMesh.position.y = yCenter;
    backMesh.rotation.y = Math.PI; // face opposite direction within wallGroup local space
    wallGroup.add(backMesh);
  }

  // Black outline for visibility against any background
  const edgesGeo = new THREE.EdgesGeometry(geo);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x000000 });
  const outline = new THREE.LineSegments(edgesGeo, lineMat);
  outline.position.y = yCenter;
  wallGroup.add(outline);

  // Position and orient the wallGroup at the correct cell edge.
  //
  // PlaneGeometry faces +Z by default (normal points toward +Z).
  //
  // 'S' edge: south edge of cell at (cx, 0, cz + CELL_SIZE/2).
  //   Front should face north (-Z direction, into the owning cell).
  //   Rotate Y by PI so the plane normal flips from +Z to -Z.
  //
  // 'E' edge: east edge of cell at (cx + CELL_SIZE/2, 0, cz).
  //   Front should face west (-X direction, into the owning cell).
  //   Rotate Y by -PI/2 so the plane normal points toward -X.
  if (tw.wall === 'S') {
    wallGroup.position.set(cx, 0, cz + CELL_SIZE / 2);
    wallGroup.rotation.y = Math.PI;
  } else {
    // 'E'
    wallGroup.position.set(cx + CELL_SIZE / 2, 0, cz);
    wallGroup.rotation.y = -Math.PI / 2;
  }

  return wallGroup;
}
