// Environment presets — control fog, background, and ambient light per level.

import * as THREE from 'three';
import type { Environment } from '../core/types';

export interface EnvironmentConfig {
  fogColor: number;
  fogNear: number;
  fogFar: number;
  ambientColor: number;
}

const ENVIRONMENTS: Record<Environment, EnvironmentConfig> = {
  dungeon: {
    fogColor: 0x000000,
    fogNear: 6,
    fogFar: 26,
    ambientColor: 0x1a1a22,
  },
  mist: {
    fogColor: 0x7a8a8f,
    fogNear: 2,
    fogFar: 14,
    ambientColor: 0x8899aa,
  },
};

let currentEnv: Environment = 'dungeon';

export function getEnvironment(): Environment {
  return currentEnv;
}

export function getEnvironmentConfig(env?: Environment): EnvironmentConfig {
  return ENVIRONMENTS[env ?? currentEnv];
}

export function applyEnvironment(
  env: Environment | undefined,
  scene: THREE.Scene,
  ambient: THREE.AmbientLight,
): void {
  currentEnv = env ?? 'dungeon';
  const cfg = ENVIRONMENTS[currentEnv];
  scene.background = new THREE.Color(cfg.fogColor);
  scene.fog = new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar);
  ambient.color.setHex(cfg.ambientColor);
}
