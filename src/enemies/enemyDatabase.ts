// Enemy database — typed loader and query module.
// Loads from /data/enemies.json at runtime via fetch.

export interface EnemySpriteData {
  path: string;
  size?: number;
  yOffset?: number;
}

export interface EnemyBehavior {
  type: string;
  params: Record<string, unknown>;
}

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  atk: number;
  def: number;
  aggroRange: number;
  moveInterval: number;
  blocksMovement: boolean;
  xp: number;
  sprite: EnemySpriteData;
  behaviors: EnemyBehavior[];
}

export const DEFAULT_SPRITE_SIZE = 1.2;

interface EnemiesJsonPayload {
  version: string;
  enemies: EnemyDef[];
}

export class EnemyDatabase {
  private enemies: Map<string, EnemyDef>;
  private loaded: boolean;

  constructor() {
    this.enemies = new Map();
    this.loaded = false;
  }

  async load(): Promise<void> {
    const response = await fetch('/data/enemies.json');
    if (!response.ok) {
      throw new Error(`Failed to load enemy database: ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as EnemiesJsonPayload;
    this.enemies = new Map();
    for (const enemy of payload.enemies) {
      this.enemies.set(enemy.id, enemy);
    }
    this.loaded = true;
  }

  getEnemy(id: string): EnemyDef | undefined {
    return this.enemies.get(id);
  }

  getAllEnemies(): EnemyDef[] {
    return [...this.enemies.values()];
  }

  getAllEnemyIds(): string[] {
    return [...this.enemies.keys()];
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  hasBehavior(id: string, type: string): boolean {
    const def = this.enemies.get(id);
    if (!def) return false;
    return def.behaviors.some(b => b.type === type);
  }

  getBehavior(id: string, type: string): EnemyBehavior | undefined {
    const def = this.enemies.get(id);
    if (!def) return undefined;
    return def.behaviors.find(b => b.type === type);
  }
}

export const enemyDatabase = new EnemyDatabase();
