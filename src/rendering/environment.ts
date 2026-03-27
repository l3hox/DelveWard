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
  forest: {
    fogColor: 0x1a2e1a,
    fogNear: 4,
    fogFar: 20,
    ambientColor: 0x3a5530,
  },
  outdoor: {
    fogColor: 0x88aacc,
    fogNear: 20,
    fogFar: 80,
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

export function lerpEnvironment(
  scene: THREE.Scene,
  ambient: THREE.AmbientLight,
  target: EnvironmentConfig,
  t: number,
): void {
  const fog = scene.fog as THREE.Fog | null;
  if (!fog) return;

  fog.near += (target.fogNear - fog.near) * t;
  fog.far += (target.fogFar - fog.far) * t;
  fog.color.lerp(new THREE.Color(target.fogColor), t);

  const bg = scene.background as THREE.Color;
  if (bg) bg.lerp(new THREE.Color(target.fogColor), t);

  ambient.color.lerp(new THREE.Color(target.ambientColor), t);
}

export function resolveEnvironmentAtCell(
  col: number,
  row: number,
  levelEnv: Environment,
  areas?: Array<{ fromCol: number; toCol: number; fromRow: number; toRow: number; environment?: Environment }>,
): Environment {
  if (!areas) return levelEnv;
  let env = levelEnv;
  for (const area of areas) {
    if (area.environment && col >= area.fromCol && col <= area.toCol && row >= area.fromRow && row <= area.toRow) {
      env = area.environment;
    }
  }
  return env;
}

/**
 * Build a map of cell positions to Three.js rendering layer indices for multi-pass
 * environment rendering. Each unique environment zone gets a layer (1-based).
 * Returns the zone map, list of unique zones, and whether multi-pass is needed.
 */
export function buildEnvZoneMap(
  grid: string[],
  levelEnv: Environment,
  areas?: Array<{ fromCol: number; toCol: number; fromRow: number; toRow: number; environment?: Environment }>,
): { zoneMap: Map<string, number>; zones: Environment[]; multiZone: boolean } {
  const zoneMap = new Map<string, number>();
  const zoneIndex = new Map<Environment, number>();
  const zones: Environment[] = [];

  const rows = grid.length;
  const cols = grid[0].length;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const env = resolveEnvironmentAtCell(col, row, levelEnv, areas);
      if (!zoneIndex.has(env)) {
        zones.push(env);
        zoneIndex.set(env, zones.length); // 1-based layer index
      }
      zoneMap.set(`${col},${row}`, zoneIndex.get(env)!);
    }
  }

  return { zoneMap, zones, multiZone: zones.length > 1 };
}
