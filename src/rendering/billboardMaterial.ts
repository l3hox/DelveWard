import * as THREE from 'three';

// Custom billboard shader: distance-only lighting (no NdotL angle dependence).
// Computes light in view space so brightness is stable regardless of camera rotation.
// Uses Three.js light uniforms via `lights: true` and built-in fog chunks.
export function createNeutralLitMaterial(map: THREE.Texture): THREE.ShaderMaterial {
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
        // Compute world matrix — includes instanceMatrix for InstancedMesh
        #ifdef USE_INSTANCING
          mat4 worldMatrix = modelMatrix * instanceMatrix;
        #else
          mat4 worldMatrix = modelMatrix;
        #endif
        // Object center in VIEW space (same space as Three.js light positions)
        vViewCenter = (viewMatrix * vec4(worldMatrix[3].xyz, 1.0)).xyz;
        vec4 mvPosition = viewMatrix * worldMatrix * vec4(position, 1.0);
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
        if (texColor.a < 0.5) discard;

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
    transparent: false,  // hard cutoff, no alpha blending — avoids cross-zone edge artifacts
    side: THREE.DoubleSide,
    depthWrite: true,
  });
}
