import { validateLevel, validateDungeon } from '../level/levelLoader';
import type { Dungeon, DungeonLevel } from '../core/types';

export type OpenResult =
  | { type: 'level'; level: DungeonLevel }
  | { type: 'dungeon'; dungeon: Dungeon }
  | null;

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

          // Detect shape: multi-level dungeon or single level
          if (data.levels && Array.isArray(data.levels)) {
            const dungeon = validateDungeon(data, file.name);
            resolve({ type: 'dungeon', dungeon });
          } else if (data.grid) {
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

    // Handle cancel (no file selected)
    input.addEventListener('cancel', () => resolve(null));

    input.click();
  });
}

export function exportLevelFile(level: DungeonLevel): void {
  const output: Record<string, unknown> = {};

  // Required fields in intentional order
  if (level.id !== undefined) output.id = level.id;
  output.name = level.name;
  output.grid = level.grid;
  output.playerStart = level.playerStart;
  output.entities = level.entities;

  // Optional fields — omit if absent
  if (level.environment !== undefined) output.environment = level.environment;
  if (level.ceiling !== undefined) output.ceiling = level.ceiling;
  if (level.skybox !== undefined) output.skybox = level.skybox;
  if (level.dustMotes !== undefined) output.dustMotes = level.dustMotes;
  if (level.waterDrips !== undefined) output.waterDrips = level.waterDrips;
  if (level.defaults !== undefined) output.defaults = level.defaults;
  if (level.charDefs !== undefined && level.charDefs.length > 0) output.charDefs = level.charDefs;
  if (level.areas !== undefined && level.areas.length > 0) output.areas = level.areas;

  const json = JSON.stringify(output, null, 2);
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
  const output: Record<string, unknown> = {
    name: dungeon.name,
    levels: dungeon.levels.map(level => {
      const out: Record<string, unknown> = {};
      if (level.id !== undefined) out.id = level.id;
      out.name = level.name;
      out.grid = level.grid;
      out.playerStart = level.playerStart;
      out.entities = level.entities;
      if (level.environment !== undefined) out.environment = level.environment;
      if (level.ceiling !== undefined) out.ceiling = level.ceiling;
      if (level.skybox !== undefined) out.skybox = level.skybox;
      if (level.dustMotes !== undefined) out.dustMotes = level.dustMotes;
      if (level.waterDrips !== undefined) out.waterDrips = level.waterDrips;
      if (level.defaults !== undefined) out.defaults = level.defaults;
      if (level.charDefs !== undefined && level.charDefs.length > 0) out.charDefs = level.charDefs;
      if (level.areas !== undefined && level.areas.length > 0) out.areas = level.areas;
      return out;
    }),
  };

  const json = JSON.stringify(output, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const safeName = (dungeon.name || 'dungeon').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.json`;
  a.click();

  URL.revokeObjectURL(url);
}
