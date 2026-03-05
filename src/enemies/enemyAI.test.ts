import { describe, it, expect } from 'vitest';
import { executeEnemyTurns } from './enemyAI';
import { GameState, doorKey } from '../core/gameState';
import { WALKABLE_CELLS } from '../core/grid';
import type { Entity } from '../core/types';

const grid = [
  '#######',
  '#.....#',
  '#.....#',
  '#.....#',
  '#.....#',
  '#.....#',
  '#######',
];

const isDoorOpen = () => true;

function makeState(entities: Entity[]): GameState {
  return new GameState(entities, grid);
}

function enemyEntity(col: number, row: number, enemyType: string): Entity {
  return { col, row, type: 'enemy', enemyType };
}

// --- GameState enemy helpers ---

describe('GameState enemy support', () => {
  it('parses enemy entities into enemies map', () => {
    const gs = makeState([
      enemyEntity(1, 1, 'rat'),
      enemyEntity(3, 3, 'skeleton'),
    ]);
    expect(gs.enemies.size).toBe(2);
    expect(gs.getEnemy(1, 1)).toBeDefined();
    expect(gs.getEnemy(3, 3)).toBeDefined();
  });

  it('ignores enemy entities with unknown type', () => {
    const gs = makeState([enemyEntity(1, 1, 'dragon')]);
    expect(gs.enemies.size).toBe(0);
  });

  it('isEnemyAt returns correct boolean', () => {
    const gs = makeState([enemyEntity(2, 2, 'rat')]);
    expect(gs.isEnemyAt(2, 2)).toBe(true);
    expect(gs.isEnemyAt(3, 3)).toBe(false);
  });

  it('moveEnemy re-keys the map', () => {
    const gs = makeState([enemyEntity(1, 1, 'rat')]);
    gs.moveEnemy(1, 1, 3, 3);
    expect(gs.isEnemyAt(1, 1)).toBe(false);
    expect(gs.isEnemyAt(3, 3)).toBe(true);
    const moved = gs.getEnemy(3, 3)!;
    expect(moved.col).toBe(3);
    expect(moved.row).toBe(3);
  });

  it('damageEnemy reduces HP and returns false when alive', () => {
    const gs = makeState([enemyEntity(1, 1, 'orc')]); // orc has 15 HP
    const killed = gs.damageEnemy(1, 1, 5);
    expect(killed).toBe(false);
    expect(gs.getEnemy(1, 1)!.hp).toBe(10);
  });

  it('damageEnemy returns true on kill and removes from map', () => {
    const gs = makeState([enemyEntity(1, 1, 'rat')]); // rat has 4 HP
    const killed = gs.damageEnemy(1, 1, 10);
    expect(killed).toBe(true);
    expect(gs.isEnemyAt(1, 1)).toBe(false);
  });
});

// --- Enemy AI ---

describe('executeEnemyTurns', () => {
  it('idle enemy stays idle when player is far away', () => {
    const gs = makeState([enemyEntity(1, 1, 'rat')]); // aggroRange 3
    // Player at (5, 5), distance = 8
    const actions = executeEnemyTurns(gs, 5, 5, grid, WALKABLE_CELLS, isDoorOpen);
    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe('idle');
  });

  it('enemy transitions to chase when player within aggro range', () => {
    const gs = makeState([enemyEntity(3, 3, 'rat')]); // aggroRange 3
    // Player at (3, 1), distance = 2
    const actions = executeEnemyTurns(gs, 3, 1, grid, WALKABLE_CELLS, isDoorOpen);
    expect(actions[0].type).toBe('move');
    const enemy = gs.getEnemy(actions[0].toCol!, actions[0].toRow!);
    expect(enemy).toBeDefined();
    expect(enemy!.aiState).toBe('chase');
  });

  it('enemy moves toward player during chase', () => {
    const gs = makeState([enemyEntity(1, 3, 'rat')]); // aggroRange 3
    // Player at (1, 1), distance = 2
    const actions = executeEnemyTurns(gs, 1, 1, grid, WALKABLE_CELLS, isDoorOpen);
    expect(actions[0].type).toBe('move');
    // Should move closer to player
    expect(actions[0].toRow!).toBeLessThan(3);
  });

  it('enemy attacks when adjacent to player', () => {
    const gs = makeState([enemyEntity(2, 1, 'rat')]); // aggroRange 3
    // Player at (1, 1), distance = 1
    const actions = executeEnemyTurns(gs, 1, 1, grid, WALKABLE_CELLS, isDoorOpen);
    expect(actions[0].type).toBe('attack');
  });

  it('enemy returns to idle when player moves out of aggro + buffer range', () => {
    const gs = makeState([enemyEntity(1, 1, 'rat')]); // aggroRange 3, DEAGGRO_BUFFER = 2

    // First turn: player in range, enemy chases
    executeEnemyTurns(gs, 1, 3, grid, WALKABLE_CELLS, isDoorOpen);
    // Get the enemy wherever it moved
    const enemies = [...gs.enemies.values()];
    expect(enemies[0].aiState).toBe('chase');

    // Now player far away: distance > aggroRange + DEAGGRO_BUFFER (3 + 2 = 5)
    // Enemy is around (1,2), player at (5,5): distance ~7, which is > 5
    executeEnemyTurns(gs, 5, 5, grid, WALKABLE_CELLS, isDoorOpen);
    const enemyAfter = [...gs.enemies.values()][0];
    expect(enemyAfter.aiState).toBe('idle');
  });

  it('speed gating: skeleton only acts on even turns', () => {
    const gs = makeState([enemyEntity(3, 3, 'skeleton')]); // speed 2
    // Player at (3, 1), distance = 2, within aggroRange 4

    // Turn 1: turnCounter becomes 1, 1 % 2 !== 0, should idle
    const actions1 = executeEnemyTurns(gs, 3, 1, grid, WALKABLE_CELLS, isDoorOpen);
    expect(actions1[0].type).toBe('idle');

    // Turn 2: turnCounter becomes 2, 2 % 2 === 0, should act
    const actions2 = executeEnemyTurns(gs, 3, 1, grid, WALKABLE_CELLS, isDoorOpen);
    expect(actions2[0].type).not.toBe('idle');
  });

  it('two enemies do not stack on the same cell', () => {
    const gs = makeState([
      enemyEntity(1, 1, 'rat'),
      enemyEntity(1, 3, 'rat'),
    ]);
    // Player at (1, 2), both rats will want to move toward row 2
    executeEnemyTurns(gs, 1, 2, grid, WALKABLE_CELLS, isDoorOpen);

    const positions = [...gs.enemies.values()].map(
      (e) => doorKey(e.col, e.row),
    );
    const unique = new Set(positions);
    expect(unique.size).toBe(positions.length);
  });

  it('enemy does not move onto player cell', () => {
    const gs = makeState([enemyEntity(2, 1, 'rat')]); // aggroRange 3
    // Player at (1, 1), distance = 1 -> attack, not move
    // But also test with distance 2 where path goes through player
    const gs2 = makeState([enemyEntity(3, 1, 'rat')]);
    // Player at (1, 1), distance = 2
    const actions = executeEnemyTurns(gs2, 1, 1, grid, WALKABLE_CELLS, isDoorOpen);

    if (actions[0].type === 'move') {
      const movedTo = doorKey(actions[0].toCol!, actions[0].toRow!);
      expect(movedTo).not.toBe(doorKey(1, 1));
    }
  });
});
