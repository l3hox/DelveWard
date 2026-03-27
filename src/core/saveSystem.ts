import type { LevelSnapshot, GameState } from './gameState';
import type {
  DoorInstance,
  KeyInstance,
  LeverInstance,
  PlateInstance,
  TriggerInstance,
  TripwireInstance,
  GateInstance,
  TrapLauncherInstance,
  SconceInstance,
  StairInstance,
  BreakableWallInstance,
  SecretWallInstance,
  BlockInstance,
  ChestInstance,
  SignInstance,
  NPCInstance,
  FountainInstance,
  BookshelfInstance,
  AltarInstance,
  BarrelInstance,
  TempBuff,
} from './gameState';
import type { ItemEntity } from './entities';
import type { Facing } from './grid';
import type { StatusEffect } from './statusEffects';
import type { Dungeon } from './types';

// ---------------------------------------------------------------------------
// Serialized forms — Maps become Records, Sets become string arrays.
// All values are plain objects so JSON.stringify/parse roundtrips cleanly.
// ---------------------------------------------------------------------------

interface SerializedLevelSnapshot {
  doors: Record<string, DoorInstance>;
  keys: Record<string, KeyInstance>;
  levers: Record<string, LeverInstance>;
  plates: Record<string, PlateInstance>;
  triggers: Record<string, TriggerInstance>;
  tripwires: Record<string, TripwireInstance>;
  gates: Record<string, GateInstance>;
  trapLaunchers: Record<string, TrapLauncherInstance>;
  sconces: Record<string, SconceInstance>;
  stairs: Record<string, StairInstance>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enemies: Record<string, any>;
  breakableWalls: Record<string, BreakableWallInstance>;
  secretWalls: Record<string, SecretWallInstance>;
  blocks: Record<string, BlockInstance>;
  chests: Record<string, ChestInstance>;
  signs: Record<string, SignInstance>;
  npcs: Record<string, NPCInstance>;
  fountains?: Record<string, FountainInstance>;
  bookshelves?: Record<string, BookshelfInstance>;
  altars?: Record<string, AltarInstance>;
  barrels?: Record<string, BarrelInstance>;
  destroyedWalls: string[];
  exploredCells: string[];
  registrySnapshot: ItemEntity[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signalState?: any;
}

export interface SaveData {
  version: 1;
  timestamp: number;
  dungeonName: string;
  currentLevelId: string;
  player: {
    col: number;
    row: number;
    facing: Facing;
    hp: number;
    maxHp: number;
    str: number;
    dex: number;
    vit: number;
    wis: number;
    xp: number;
    level: number;
    attributePoints: number;
    playerName: string;
    gold: number;
    torchFuel: number;
    maxTorchFuel: number;
    statusEffects: StatusEffect[];
    hunger?: number;
    maxHunger?: number;
    tempBuffs?: TempBuff[];
  };
  keys: string[];
  entityRegistry: ItemEntity[];
  flags: string[];
  levelSnapshots: Record<string, SerializedLevelSnapshot>;
  levelGrids: Record<string, string[]>;
  quests?: Record<string, { status: string; stageIndex: number }>;
}

export interface SlotMetadata {
  savedAt: number;
  playerName: string;
  levelId: string;
  characterLevel: number;
  dungeonName: string;
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

export function mapToRecord<T>(map: Map<string, T>): Record<string, T> {
  return Object.fromEntries(map);
}

export function recordToMap<T>(record: Record<string, T>): Map<string, T> {
  return new Map(Object.entries(record));
}

export function setToArray(set: Set<string>): string[] {
  return Array.from(set);
}

export function arrayToSet(arr: string[]): Set<string> {
  return new Set(arr);
}

export function serializeLevelSnapshot(snapshot: LevelSnapshot): SerializedLevelSnapshot {
  return {
    doors: mapToRecord(snapshot.doors),
    keys: mapToRecord(snapshot.keys),
    levers: mapToRecord(snapshot.levers),
    plates: mapToRecord(snapshot.plates),
    triggers: mapToRecord(snapshot.triggers),
    tripwires: mapToRecord(snapshot.tripwires),
    gates: mapToRecord(snapshot.gates),
    trapLaunchers: mapToRecord(snapshot.trapLaunchers),
    sconces: mapToRecord(snapshot.sconces),
    stairs: mapToRecord(snapshot.stairs),
    enemies: mapToRecord(snapshot.enemies),
    breakableWalls: mapToRecord(snapshot.breakableWalls),
    secretWalls: mapToRecord(snapshot.secretWalls),
    blocks: mapToRecord(snapshot.blocks),
    chests: mapToRecord(snapshot.chests),
    signs: mapToRecord(snapshot.signs),
    npcs: mapToRecord(snapshot.npcs),
    fountains: mapToRecord(snapshot.fountains),
    bookshelves: mapToRecord(snapshot.bookshelves),
    altars: mapToRecord(snapshot.altars),
    barrels: mapToRecord(snapshot.barrels),
    destroyedWalls: setToArray(snapshot.destroyedWalls),
    exploredCells: setToArray(snapshot.exploredCells),
    registrySnapshot: snapshot.registrySnapshot,
    signalState: snapshot.signalState,
  };
}

export function deserializeLevelSnapshot(data: SerializedLevelSnapshot): LevelSnapshot {
  return {
    doors: recordToMap(data.doors),
    keys: recordToMap(data.keys),
    levers: recordToMap(data.levers),
    plates: recordToMap(data.plates),
    triggers: recordToMap(data.triggers),
    tripwires: recordToMap(data.tripwires),
    gates: recordToMap(data.gates),
    trapLaunchers: recordToMap(data.trapLaunchers),
    sconces: recordToMap(data.sconces),
    stairs: recordToMap(data.stairs),
    enemies: recordToMap(data.enemies),
    breakableWalls: recordToMap(data.breakableWalls),
    secretWalls: recordToMap(data.secretWalls),
    blocks: recordToMap(data.blocks),
    chests: recordToMap(data.chests),
    signs: recordToMap(data.signs),
    npcs: recordToMap(data.npcs ?? {}),
    fountains: recordToMap(data.fountains ?? {}),
    bookshelves: recordToMap(data.bookshelves ?? {}),
    altars: recordToMap(data.altars ?? {}),
    barrels: recordToMap(data.barrels ?? {}),
    destroyedWalls: arrayToSet(data.destroyedWalls),
    exploredCells: arrayToSet(data.exploredCells),
    registrySnapshot: data.registrySnapshot,
    signalState: data.signalState,
  };
}

// ---------------------------------------------------------------------------
// Save/load assembly
// ---------------------------------------------------------------------------

interface BuildSaveDataParams {
  gameState: GameState;
  playerCol: number;
  playerRow: number;
  playerFacing: Facing;
  currentLevelId: string;
  levelSnapshots: Map<string, LevelSnapshot>;
  dungeon: Dungeon;
  questState?: Record<string, { status: string; stageIndex: number }>;
}

export function buildSaveData(params: BuildSaveDataParams): SaveData {
  const { gameState, playerCol, playerRow, playerFacing, currentLevelId, levelSnapshots, dungeon } =
    params;

  // Flush the currently-active level into a snapshot so it's included.
  const activeSnapshot = gameState.saveLevelState();

  // Merge all known snapshots: previously-visited levels + the active level.
  // The active level's snapshot wins (it's freshest).
  const allSnapshots = new Map<string, LevelSnapshot>(levelSnapshots);
  allSnapshots.set(currentLevelId, activeSnapshot);

  // Capture the full registry AFTER saveLevelState so that the active level's
  // ground items are reflected (saveLevelState updates registrySnapshot for the
  // current level, but entityRegistry itself is the authoritative state).
  const fullRegistry = gameState.entityRegistry.snapshot();

  // Serialize all level snapshots.
  const serializedSnapshots: Record<string, SerializedLevelSnapshot> = {};
  for (const [id, snapshot] of allSnapshots) {
    serializedSnapshots[id] = serializeLevelSnapshot(snapshot);
  }

  // Capture each level's current grid (may have been mutated by breakable walls, etc.).
  const levelGrids: Record<string, string[]> = {};
  for (const level of dungeon.levels) {
    const id = level.id ?? level.name;
    levelGrids[id] = [...level.grid];
  }

  return {
    version: 1,
    timestamp: Date.now(),
    dungeonName: dungeon.name,
    currentLevelId,
    player: {
      col: playerCol,
      row: playerRow,
      facing: playerFacing,
      hp: gameState.hp,
      maxHp: gameState.maxHp,
      str: gameState.str,
      dex: gameState.dex,
      vit: gameState.vit,
      wis: gameState.wis,
      xp: gameState.xp,
      level: gameState.level,
      attributePoints: gameState.attributePoints,
      playerName: gameState.playerName,
      gold: gameState.gold,
      torchFuel: gameState.torchFuel,
      maxTorchFuel: gameState.maxTorchFuel,
      statusEffects: gameState.playerStatusEffects.map(e => ({ ...e })),
      hunger: gameState.hunger,
      maxHunger: gameState.maxHunger,
      tempBuffs: gameState.tempBuffs.map(b => ({ ...b })),
    },
    keys: Array.from(gameState.inventory),
    entityRegistry: fullRegistry,
    flags: Array.from(gameState.flags),
    levelSnapshots: serializedSnapshots,
    levelGrids,
    quests: params.questState,
  };
}

interface ApplySaveDataResult {
  targetLevelId: string;
  levelSnapshots: Map<string, LevelSnapshot>;
  playerCol: number;
  playerRow: number;
  playerFacing: Facing;
  questState: Record<string, { status: string; stageIndex: number }>;
}

export function applySaveData(
  data: SaveData,
  gameState: GameState,
  dungeon: Dungeon,
): ApplySaveDataResult {
  // Restore mutated grids onto dungeon levels.
  for (const level of dungeon.levels) {
    const id = level.id ?? level.name;
    if (data.levelGrids[id]) {
      level.grid = [...data.levelGrids[id]];
    }
  }

  // Deserialize all level snapshots except the active one — that goes through
  // loadLevelState below, which also re-initialises the signal manager.
  const levelSnapshots = new Map<string, LevelSnapshot>();
  for (const [id, serialized] of Object.entries(data.levelSnapshots)) {
    if (id !== data.currentLevelId) {
      levelSnapshots.set(id, deserializeLevelSnapshot(serialized));
    }
  }

  // Restore the active level via the GameState API so the signal machinery,
  // entity index, and internal Maps are all rebuilt consistently.
  const activeSerializedSnapshot = data.levelSnapshots[data.currentLevelId];
  if (activeSerializedSnapshot) {
    const activeSnapshot = deserializeLevelSnapshot(activeSerializedSnapshot);
    gameState.currentLevelId = data.currentLevelId;
    gameState.loadLevelState(activeSnapshot);
  }

  // Restore the full entity registry AFTER loadLevelState.
  // loadLevelState calls entityRegistry.restore() for the level's registrySnapshot
  // which only covers ground items for that level. We need backpack and equipped
  // items too, so we overwrite with the full save.
  gameState.entityRegistry.restore(data.entityRegistry);

  // Restore player stats.
  const p = data.player;
  gameState.hp = p.hp;
  gameState.maxHp = p.maxHp;
  gameState.str = p.str;
  gameState.dex = p.dex;
  gameState.vit = p.vit;
  gameState.wis = p.wis;
  gameState.xp = p.xp;
  gameState.level = p.level;
  gameState.attributePoints = p.attributePoints;
  gameState.playerName = p.playerName;
  gameState.gold = p.gold;
  gameState.torchFuel = p.torchFuel;
  gameState.maxTorchFuel = p.maxTorchFuel;
  gameState.playerStatusEffects = p.statusEffects.map(e => ({ ...e }));
  gameState.hunger = p.hunger ?? 100;
  gameState.maxHunger = p.maxHunger ?? 100;
  gameState.tempBuffs = (p.tempBuffs ?? []).map(b => ({ ...b }));

  // Restore key inventory.
  gameState.inventory.clear();
  for (const keyId of data.keys) {
    gameState.inventory.add(keyId);
  }

  // Restore global flags.
  gameState.flags.clear();
  if (data.flags) {
    for (const flag of data.flags) {
      gameState.flags.add(flag);
    }
  }

  return {
    targetLevelId: data.currentLevelId,
    levelSnapshots,
    playerCol: p.col,
    playerRow: p.row,
    playerFacing: p.facing,
    questState: data.quests ?? {},
  };
}

// ---------------------------------------------------------------------------
// Slot management
// ---------------------------------------------------------------------------

export const SAVE_SLOT_KEYS = [
  'delveward_save_1',
  'delveward_save_2',
  'delveward_save_3',
  'delveward_save_4',
  'delveward_save_5',
];

export const AUTOSAVE_KEY = 'delveward_autosave';

export function saveToSlot(key: string, data: SaveData): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadFromSlot(key: string): SaveData | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function deleteSlot(key: string): void {
  localStorage.removeItem(key);
}

export function getSlotMetadata(key: string): SlotMetadata | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.version !== 1) return null;
    return {
      savedAt: parsed.timestamp,
      playerName: parsed.player.playerName,
      levelId: parsed.currentLevelId,
      characterLevel: parsed.player.level,
      dungeonName: parsed.dungeonName,
    };
  } catch {
    return null;
  }
}

export function getAllSlotMetadata(): Record<string, SlotMetadata | null> {
  const result: Record<string, SlotMetadata | null> = {};
  for (const key of [...SAVE_SLOT_KEYS, AUTOSAVE_KEY]) {
    result[key] = getSlotMetadata(key);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

export function exportSaveFile(data: SaveData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const date = new Date(data.timestamp);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const filename = `delveward_save_${yyyy}-${mm}-${dd}.json`;

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function importSaveFile(): Promise<SaveData> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string) as SaveData;
          if (parsed.version !== 1) {
            reject(new Error(`Unsupported save version: ${(parsed as SaveData).version}`));
            return;
          }
          resolve(parsed);
        } catch (err) {
          reject(new Error(`Failed to parse save file: ${err}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  });
}
