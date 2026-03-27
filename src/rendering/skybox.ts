// Procedural skybox — renders a star-filled night sky immune to fog and lighting.

import * as THREE from 'three';
import type { Skybox } from '../core/types';

// Must be within the camera far plane (200) to avoid frustum clipping
const SKYBOX_RADIUS = 180;

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

function generateDaylightTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Sky gradient: deep blue top to light blue bottom
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, '#3366aa');
  gradient.addColorStop(0.4, '#5588cc');
  gradient.addColorStop(0.7, '#88bbdd');
  gradient.addColorStop(1, '#aaccee');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Scattered clouds
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  for (let i = 0; i < 25; i++) {
    const cx = Math.random() * size;
    const cy = size * 0.1 + Math.random() * size * 0.5;
    const rw = 30 + Math.random() * 60;
    const rh = 10 + Math.random() * 20;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function generateSunsetTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Warm sunset gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, '#1a2244');
  gradient.addColorStop(0.3, '#443366');
  gradient.addColorStop(0.5, '#cc6633');
  gradient.addColorStop(0.7, '#ee8866');
  gradient.addColorStop(1, '#ffaa88');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Warm-tinted clouds
  ctx.fillStyle = 'rgba(255, 200, 150, 0.25)';
  for (let i = 0; i < 20; i++) {
    const cx = Math.random() * size;
    const cy = size * 0.15 + Math.random() * size * 0.4;
    const rw = 25 + Math.random() * 50;
    const rh = 8 + Math.random() * 15;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

export function createSkyboxMesh(skybox: Skybox = 'starry-night'): THREE.Mesh {
  let texture: THREE.CanvasTexture;
  switch (skybox) {
    case 'daylight': texture = generateDaylightTexture(); break;
    case 'sunset': texture = generateSunsetTexture(); break;
    default: texture = generateStarryNightTexture(); break;
  }

  const geometry = new THREE.SphereGeometry(SKYBOX_RADIUS, 32, 16);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1;
  return mesh;
}
