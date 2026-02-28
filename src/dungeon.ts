import * as THREE from 'three';

export const CELL_SIZE = 2;
export const WALL_HEIGHT = 2.5;
export const EYE_HEIGHT = 1.0;

const wallMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
const floorMat = new THREE.MeshLambertMaterial({ color: 0x2a2218 });
const ceilMat = new THREE.MeshLambertMaterial({ color: 0x1a1510 });

const wallGeo = new THREE.PlaneGeometry(CELL_SIZE, WALL_HEIGHT);
const tileGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);

export function buildDungeon(scene: THREE.Scene, map: number[][]): void {
  const rows = map.length;
  const cols = map[0].length;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (map[row][col] !== 0) continue;

      const cx = col * CELL_SIZE + CELL_SIZE / 2;
      const cz = row * CELL_SIZE + CELL_SIZE / 2;

      // Floor
      const floor = new THREE.Mesh(tileGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, 0, cz);
      scene.add(floor);

      // Ceiling
      const ceil = new THREE.Mesh(tileGeo, ceilMat);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(cx, WALL_HEIGHT, cz);
      scene.add(ceil);

      // North wall — faces +Z (south, toward player inside the room)
      if (row === 0 || map[row - 1][col] !== 0) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(cx, WALL_HEIGHT / 2, cz - CELL_SIZE / 2);
        scene.add(wall);
      }

      // South wall — faces -Z (north, toward player)
      if (row === rows - 1 || map[row + 1][col] !== 0) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.rotation.y = Math.PI;
        wall.position.set(cx, WALL_HEIGHT / 2, cz + CELL_SIZE / 2);
        scene.add(wall);
      }

      // East wall — faces -X (west, toward player)
      if (col === cols - 1 || map[row][col + 1] !== 0) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.rotation.y = -Math.PI / 2;
        wall.position.set(cx + CELL_SIZE / 2, WALL_HEIGHT / 2, cz);
        scene.add(wall);
      }

      // West wall — faces +X (east, toward player)
      if (col === 0 || map[row][col - 1] !== 0) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.rotation.y = Math.PI / 2;
        wall.position.set(cx - CELL_SIZE / 2, WALL_HEIGHT / 2, cz);
        scene.add(wall);
      }
    }
  }
}
