import { validateLevel, validateDungeon } from '../level/levelLoader';
import type { Dungeon, DungeonLevel, LayerDef } from '../core/types';

declare global {
  interface Window {
    __EDITOR_TOKEN?: string;
  }
}

export type OpenResult =
  | { type: 'level'; level: DungeonLevel }
  | { type: 'dungeon'; dungeon: Dungeon }
  | null;

// ---------------------------------------------------------------------------
// Serialization helpers (field ordering, omit absent optionals)
// ---------------------------------------------------------------------------

export function serializeLevel(level: DungeonLevel): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (level.id !== undefined) out.id = level.id;
  out.name = level.name;
  if (level.playerStart) out.playerStart = level.playerStart;
  if (level.environment !== undefined) out.environment = level.environment;
  if (level.skybox !== undefined) out.skybox = level.skybox;
  if (level.fireflies !== undefined) out.fireflies = level.fireflies;
  if (level.dustMotes !== undefined) out.dustMotes = level.dustMotes;
  if (level.waterDrips !== undefined) out.waterDrips = level.waterDrips;
  if (level.charDefs !== undefined && level.charDefs.length > 0) out.charDefs = level.charDefs;
  // Per-layer fields live only in layers, not duplicated at top level
  out.layers = level.layers.map(serializeLayerDef);
  return out;
}

function serializeLayerDef(layer: LayerDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (layer.id !== undefined) out.id = layer.id;
  if (layer.yOffset !== undefined) out.yOffset = layer.yOffset;
  out.grid = layer.grid;
  out.entities = layer.entities;
  if (layer.ceiling !== undefined) out.ceiling = layer.ceiling;
  if (layer.defaults !== undefined) out.defaults = layer.defaults;
  // charDefs are level-global, not serialized per-layer
  if (layer.areas !== undefined && layer.areas.length > 0) out.areas = layer.areas;
  return out;
}

export function serializeDungeon(dungeon: Dungeon): Record<string, unknown> {
  return {
    name: dungeon.name,
    playerStart: dungeon.playerStart,
    levels: dungeon.levels.map(l => {
      const serialized = serializeLevel(l);
      // playerStart is global on the dungeon, not per-level
      delete serialized.playerStart;
      return serialized;
    }),
  };
}

// ---------------------------------------------------------------------------
// File picker open / browser download export
// ---------------------------------------------------------------------------

export function openLevelFile(): Promise<OpenResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);

          if (data.levels && Array.isArray(data.levels)) {
            const dungeon = validateDungeon(data, file.name);
            resolve({ type: 'dungeon', dungeon });
          } else if (data.grid || data.layers) {
            resolve({ type: 'level', level: validateLevel(data, file.name) });
          } else {
            alert('Unrecognized JSON format: expected a dungeon or level file');
            resolve(null);
          }
        } catch (err) {
          alert(`Failed to load level: ${(err as Error).message}`);
          resolve(null);
        }
      };
      reader.readAsText(file);
    });

    input.addEventListener('cancel', () => resolve(null));

    input.click();
  });
}

export function exportLevelFile(level: DungeonLevel): void {
  const json = JSON.stringify(serializeLevel(level), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const safeName = (level.name || 'level').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

export function exportDungeonFile(dungeon: Dungeon): void {
  const json = JSON.stringify(serializeDungeon(dungeon), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const safeName = (dungeon.name || 'dungeon').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Dev server API client
// ---------------------------------------------------------------------------

let devServerAvailable: boolean | null = null;

function editorHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (window.__EDITOR_TOKEN) {
    headers['X-Editor-Token'] = window.__EDITOR_TOKEN;
  }
  return headers;
}

export async function isDevServer(): Promise<boolean> {
  if (devServerAvailable !== null) return devServerAvailable;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch('/api/editor/list', {
      headers: editorHeaders(),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    devServerAvailable = res.ok;
  } catch {
    devServerAvailable = false;
  }
  return devServerAvailable;
}

export async function listServerFiles(): Promise<string[]> {
  const res = await fetch('/api/editor/list', { headers: editorHeaders() });
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  const data = await res.json();
  return data.files as string[];
}

export async function loadFromServer(filename: string): Promise<OpenResult> {
  const res = await fetch(`/api/editor/load?file=${encodeURIComponent(filename)}`, {
    headers: editorHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Load failed: ${res.status}`);
  }
  const data = await res.json();

  if (data.levels && Array.isArray(data.levels)) {
    const dungeon = validateDungeon(data, filename);
    return { type: 'dungeon', dungeon };
  } else if (data.grid || data.layers) {
    return { type: 'level', level: validateLevel(data, filename) };
  } else {
    throw new Error('Unrecognized JSON format');
  }
}

export async function saveToServer(filename: string, content: string): Promise<void> {
  const res = await fetch('/api/editor/save', {
    method: 'POST',
    headers: editorHeaders(),
    body: JSON.stringify({ file: filename, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Save failed: ${res.status}`);
  }
}
