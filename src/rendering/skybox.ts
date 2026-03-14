// Procedural skybox — renders a star-filled night sky immune to fog and lighting.

import * as THREE from 'three';

// Must be within the camera far plane (100) to avoid frustum clipping
const SKYBOX_RADIUS = 90;

function generateStarryNightTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Very dark sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#01010a');
  grad.addColorStop(1, '#03030e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Stars — small dots, dense field
  const starCount = 1200;
  for (let i = 0; i < starCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = 0.3 + Math.random() * 0.7;
    const brightness = 150 + Math.floor(Math.random() * 105);
    ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${Math.min(255, brightness + 20)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

export function createSkyboxMesh(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(SKYBOX_RADIUS, 32, 16);
  const material = new THREE.MeshBasicMaterial({
    map: generateStarryNightTexture(),
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1;
  return mesh;
}
