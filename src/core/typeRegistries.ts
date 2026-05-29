// Registry injection seam — lets core/ call enemies/ and npcs/ without importing them.
// enemies/enemyTypes.ts and npcs/npcDatabase.ts call register*() at module load time.

import type { EnemyInstance } from './entities';

export interface IEnemyRegistry {
    createEnemy(col: number, row: number, type: string): EnemyInstance | undefined;
    getEnemyBehavior(type: string, behaviorName: string): { params: Record<string, unknown> } | undefined;
    getAllEnemySpritePaths(): string[];
}

export interface INpcRegistry {
    hasNpc(id: string): boolean;
}

const noopEnemyRegistry: IEnemyRegistry = {
    createEnemy: () => undefined,
    getEnemyBehavior: () => undefined,
    getAllEnemySpritePaths: () => [],
};

const noopNpcRegistry: INpcRegistry = {
    hasNpc: () => false,
};

let enemyRegistry: IEnemyRegistry = noopEnemyRegistry;
let npcRegistry: INpcRegistry = noopNpcRegistry;

export function registerEnemyRegistry(registry: IEnemyRegistry): void {
    enemyRegistry = registry;
}

export function registerNpcRegistry(registry: INpcRegistry): void {
    npcRegistry = registry;
}

export function getEnemyRegistry(): IEnemyRegistry {
    return enemyRegistry;
}

export function getNpcRegistry(): INpcRegistry {
    return npcRegistry;
}
