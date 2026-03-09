import * as THREE from 'three';
import { CELL_SIZE } from './dungeon';
import { doorKey, type GameState } from '../core/gameState';

const SPRITE_SIZES: Record<string, number> = {
  rat: 1.2,
  skeleton: 2.0,
  orc: 2.0,
};
const DEFAULT_SPRITE_SIZE = 1.2;

const SPRITE_PATHS: Record<string, string> = {
  rat: '/sprites/rat.png',
  skeleton: '/sprites/skeleton.png',
  orc: '/sprites/orc.png',
};

const loader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();

function getEnemyTexture(type: string): THREE.Texture {
  let tex = textureCache.get(type);
  if (!tex) {
    const path = SPRITE_PATHS[type] ?? SPRITE_PATHS['skeleton'];
    tex = loader.load(path);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    textureCache.set(type, tex);
  }
  return tex;
}

// Custom billboard shader: distance-only lighting (no NdotL angle dependence).
// Computes light in view space so brightness is stable regardless of camera rotation.
// Uses Three.js light uniforms via `lights: true` and built-in fog chunks.
function createNeutralLitMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      THREE.UniformsLib.fog,
      { map: { value: map }, tint: { value: new THREE.Color(0xffffff) } },
    ]),
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vViewCenter;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        // Compute object center in VIEW space (same space as Three.js light positions)
        // so lighting is consistent regardless of camera rotation.
        vViewCenter = (viewMatrix * vec4(modelMatrix[3].xyz, 1.0)).xyz;
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 tint;
      varying vec2 vUv;
      varying vec3 vViewCenter;

      // Three.js injects these structs with lights: true
      #include <common>
      #include <lights_pars_begin>
      #include <fog_pars_fragment>

      void main() {
        vec4 texColor = texture2D(map, vUv);
        if (texColor.a < 0.1) discard;

        // Accumulate light intensity (luminance only, no color).
        // Billboard uses object center for lighting — no NdotL, no per-vertex variation.
        float intensity = 0.0;

        // Point lights — positions are in view space, matching vViewCenter
        #if NUM_POINT_LIGHTS > 0
        for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
          float dist = length(vViewCenter - pointLights[i].position);
          float atten = getDistanceAttenuation(dist, pointLights[i].distance, pointLights[i].decay);
          float lum = dot(pointLights[i].color, vec3(0.299, 0.587, 0.114));
          intensity += lum * atten;
        }
        #endif

        // Ambient light
        intensity += dot(ambientLightColor, vec3(0.299, 0.587, 0.114));

        // Clamp to avoid overexposure near light sources
        intensity = min(intensity, 1.2);

        gl_FragColor = vec4(texColor.rgb * tint * intensity, texColor.a);
        #include <fog_fragment>
      }
    `,
    lights: true,
    fog: true,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

export interface EnemyMeshes {
  group: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
}

export function buildEnemyMeshes(gameState: GameState): EnemyMeshes {
  const group = new THREE.Group();
  const meshMap = new Map<string, THREE.Mesh>();

  for (const [mapKey, enemy] of gameState.enemies) {
    const size = SPRITE_SIZES[enemy.type] ?? DEFAULT_SPRITE_SIZE;
    const geo = new THREE.PlaneGeometry(size, size);
    const tex = getEnemyTexture(enemy.type);
    const mat = createNeutralLitMaterial(tex);

    const mesh = new THREE.Mesh(geo, mat);
    const cx = enemy.col * CELL_SIZE + CELL_SIZE / 2;
    const cz = enemy.row * CELL_SIZE + CELL_SIZE / 2;
    // Place sprite so bottom edge sits at floor level (PlaneGeometry is center-anchored)
    mesh.position.set(cx, size * 0.5, cz);

    group.add(mesh);
    meshMap.set(mapKey, mesh);
  }

  return { group, meshMap };
}

export function updateEnemyBillboards(
  meshMap: Map<string, THREE.Mesh>,
  camera: THREE.Camera,
): void {
  // All sprites face the camera's view plane (not the camera point)
  const facing = camera.rotation.y;
  for (const mesh of meshMap.values()) {
    if (!mesh.visible) continue;
    mesh.rotation.y = facing;
  }
}

export function hideEnemyMesh(
  meshMap: Map<string, THREE.Mesh>,
  col: number,
  row: number,
): void {
  const key = doorKey(col, row);
  const mesh = meshMap.get(key);
  if (mesh) mesh.visible = false;
}

export function updateEnemyMeshPosition(
  meshMap: Map<string, THREE.Mesh>,
  oldKey: string,
  newCol: number,
  newRow: number,
): void {
  const mesh = meshMap.get(oldKey);
  if (!mesh) return;
  meshMap.delete(oldKey);
  const newKey = doorKey(newCol, newRow);
  meshMap.set(newKey, mesh);
}
