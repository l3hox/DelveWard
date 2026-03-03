// Texture name constants — no Three.js, safe for test imports

export const WALL_TEXTURES = ['stone', 'brick', 'mossy', 'wood'] as const;
export const FLOOR_TEXTURES = ['stone_tile', 'dirt', 'cobblestone'] as const;
export const CEILING_TEXTURES = ['dark_rock', 'wooden_beams'] as const;

export type WallTextureName = (typeof WALL_TEXTURES)[number];
export type FloorTextureName = (typeof FLOOR_TEXTURES)[number];
export type CeilingTextureName = (typeof CEILING_TEXTURES)[number];

export const WALL_TEXTURE_SET = new Set<string>(WALL_TEXTURES);
export const FLOOR_TEXTURE_SET = new Set<string>(FLOOR_TEXTURES);
export const CEILING_TEXTURE_SET = new Set<string>(CEILING_TEXTURES);
