import * as THREE from 'three';

const SPRITE_BASE = '/sprites/items/';

const threeLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();
const imageCache = new Map<string, HTMLImageElement>();

/** Get a Three.js texture for a given item icon name (for 3D ground rendering). */
export function getItemTexture(icon: string): THREE.Texture {
  let tex = textureCache.get(icon);
  if (!tex) {
    tex = threeLoader.load(`${SPRITE_BASE}${icon}.png`);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    textureCache.set(icon, tex);
  }
  return tex;
}

/** Get an HTMLImageElement for a given item icon name (for 2D canvas HUD rendering). */
export function getItemImage(icon: string): HTMLImageElement | null {
  const cached = imageCache.get(icon);
  if (cached) return cached.complete ? cached : null;

  const img = new Image();
  img.src = `${SPRITE_BASE}${icon}.png`;
  imageCache.set(icon, img);
  return null; // not loaded yet — will be available next frame
}

/** Preload all known item sprites so they're ready when needed. */
export async function preloadItemSprites(icons: string[]): Promise<void> {
  const unique = [...new Set(icons)];
  await Promise.all(
    unique.map(async (icon) => {
      // Preload Three.js texture
      if (!textureCache.has(icon)) {
        try {
          const tex = await threeLoader.loadAsync(`${SPRITE_BASE}${icon}.png`);
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          textureCache.set(icon, tex);
        } catch {
          // Sprite not available yet — will fall back to procedural
        }
      }
      // Preload HTMLImageElement for HUD
      if (!imageCache.has(icon)) {
        const img = new Image();
        img.src = `${SPRITE_BASE}${icon}.png`;
        imageCache.set(icon, img);
        await img.decode().catch(() => { /* not available yet */ });
      }
    }),
  );
}

/** Check if a sprite texture has been successfully loaded. */
export function hasItemTexture(icon: string): boolean {
  const tex = textureCache.get(icon);
  if (!tex) return false;
  const img = tex.image as HTMLImageElement | undefined;
  return !!img && img.width > 0;
}
