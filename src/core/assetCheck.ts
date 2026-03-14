// Startup asset checker — verifies all referenced PNG files exist.

import { itemDatabase } from './itemDatabase';

/** All enemy sprite paths (must match SPRITE_PATHS in enemyRenderer.ts). */
const ENEMY_SPRITE_PATHS = [
  '/sprites/rat.png',
  '/sprites/skeleton.png',
  '/sprites/orc.png',
  '/sprites/goblin.png',
  '/sprites/giant_bat.png',
  '/sprites/spider.png',
  '/sprites/kobold.png',
  '/sprites/zombie.png',
  '/sprites/troll.png',
];

/**
 * Check all referenced PNG assets exist on the server.
 * Logs console.error for each missing file. Call after itemDatabase.load().
 */
export async function checkAssets(): Promise<void> {
  const paths = new Set<string>();

  // Enemy sprites
  for (const p of ENEMY_SPRITE_PATHS) {
    paths.add(p);
  }

  // Item sprites (derived from item database icons)
  for (const item of itemDatabase.getAllItems()) {
    paths.add(`/sprites/items/${item.icon}.png`);
  }

  const results = await Promise.allSettled(
    [...paths].map(async (path) => {
      const res = await fetch(path, { method: 'HEAD' });
      if (!res.ok) return path;
      // Vite SPA fallback returns 200 with text/html for missing files
      const ct = res.headers.get('Content-Type') ?? '';
      if (!ct.startsWith('image/')) return path;
      return null;
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      console.error(`[asset-check] Missing PNG: ${result.value}`);
    } else if (result.status === 'rejected') {
      console.error(`[asset-check] Failed to check asset: ${result.reason}`);
    }
  }
}
