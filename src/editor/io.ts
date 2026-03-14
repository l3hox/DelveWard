import { validateLevel, validateDungeon } from '../level/levelLoader';
import type { DungeonLevel } from '../core/types';

export function openLevelFile(): Promise<DungeonLevel | null> {
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
            resolve(dungeon.levels[0]); // load first level
          } else if (data.grid) {
            resolve(validateLevel(data, file.name));
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
