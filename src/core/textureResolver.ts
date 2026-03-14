import type { TextureSet, TextureArea, CharDef } from './types';
import type { WallTextureName, FloorTextureName, CeilingTextureName } from './textureNames';

export function resolveTextures(
  col: number,
  row: number,
  char: string,
  defaults?: TextureSet,
  charDefMap?: Map<string, CharDef>,
  areas?: TextureArea[],
): { wall: WallTextureName; floor: FloorTextureName; ceiling: CeilingTextureName } {
  // Layer 1: hard-coded defaults
  let wall: string = 'stone';
  let floor: string = 'stone_tile';
  let ceiling: string = 'dark_rock';

  // Layer 2: level defaults
  if (defaults) {
    if (defaults.wallTexture) wall = defaults.wallTexture;
    if (defaults.floorTexture) floor = defaults.floorTexture;
    if (defaults.ceilingTexture) ceiling = defaults.ceilingTexture;
  }

  // Layer 3: charDefs — character-specific textures
  if (charDefMap) {
    const def = charDefMap.get(char);
    if (def) {
      if (def.wallTexture) wall = def.wallTexture;
      if (def.floorTexture) floor = def.floorTexture;
      if (def.ceilingTexture) ceiling = def.ceilingTexture;
    }
  }

  // Layer 4: areas (later entries win)
  if (areas) {
    for (const area of areas) {
      if (col >= area.fromCol && col <= area.toCol && row >= area.fromRow && row <= area.toRow) {
        if (area.wallTexture) wall = area.wallTexture;
        if (area.floorTexture) floor = area.floorTexture;
        if (area.ceilingTexture) ceiling = area.ceilingTexture;
      }
    }
  }

  return {
    wall: wall as WallTextureName,
    floor: floor as FloorTextureName,
    ceiling: ceiling as CeilingTextureName,
  };
}
