// Paperdoll slot icons — loaded from PNGs, cached as Image elements.

import type { EquipSlot } from '../core/entities';

const PAPERDOLL_PATHS: Record<EquipSlot, string> = {
  weapon:  '/sprites/paper/right_hand.png',
  shield:  '/sprites/paper/left_hand.png',
  head:    '/sprites/paper/head.png',
  chest:   '/sprites/paper/torso.png',
  hands:   '/sprites/paper/hands.png',
  legs:    '/sprites/paper/legs.png',
  feet:    '/sprites/paper/feet.png',
  ring1:   '/sprites/paper/ring.png',
  ring2:   '/sprites/paper/ring.png',
  amulet:  '/sprites/paper/amulet.png',
};

const cache = new Map<string, HTMLImageElement>();

/** Get (or start loading) a paperdoll icon. Returns null until loaded. */
export function getPaperdollIcon(slot: EquipSlot): HTMLImageElement | null {
  const path = PAPERDOLL_PATHS[slot];
  if (!path) return null;
  let img = cache.get(path);
  if (img) return img.complete ? img : null;
  img = new Image();
  img.src = path;
  cache.set(path, img);
  return null;
}
