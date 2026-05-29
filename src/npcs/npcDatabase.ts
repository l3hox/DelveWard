// NPC database — typed loader and query module.
// Loads from /data/npcs.json at runtime via fetch.

import { registerNpcRegistry } from '../core/typeRegistries';

export interface NpcSpriteData {
  path: string;
  size?: number;
  yOffset?: number;
}

export interface NpcDef {
  id: string;
  name: string;
  sprite: NpcSpriteData;
  dialog: string;           // dialog file id (loads from /data/dialogs/{dialog}.json)
  stock?: string[];          // item IDs for merchants
  markup?: number;           // buy price multiplier (default 1.5)
  facing?: string;           // default facing direction
}

interface NpcsJsonPayload {
  version: string;
  npcs: NpcDef[];
}

export const DEFAULT_NPC_SPRITE_SIZE = 2.0;

export class NpcDatabase {
  private npcs: Map<string, NpcDef>;
  private loaded: boolean;

  constructor() {
    this.npcs = new Map();
    this.loaded = false;
  }

  async load(): Promise<void> {
    const response = await fetch('/data/npcs.json');
    if (!response.ok) {
      throw new Error(`Failed to load NPC database: ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as NpcsJsonPayload;
    this.npcs = new Map();
    for (const npc of payload.npcs) {
      this.npcs.set(npc.id, npc);
    }
    this.loaded = true;
  }

  getNpc(id: string): NpcDef | undefined {
    return this.npcs.get(id);
  }

  getAllNpcs(): NpcDef[] {
    return [...this.npcs.values()];
  }

  getAllNpcIds(): string[] {
    return [...this.npcs.keys()];
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

export const npcDatabase = new NpcDatabase();

registerNpcRegistry({
    hasNpc: (id) => npcDatabase.getNpc(id) !== undefined,
});
