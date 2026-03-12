// Pure combat logic — no Three.js

import type { GameState } from './gameState';
import type { DropsOverride } from './lootTable';
import type { PlayerState } from './grid';
import { getFacingCell, FACING_DELTA } from './grid';
import type { WeaponSubtype } from './itemDatabase';

export const PLAYER_ATTACK_COOLDOWN = 0.8; // seconds — default fallback

// --- Weapon subtype behavior table ---

export interface WeaponBehavior {
  cooldown: number;
  damageMultiplier: number;
}

export const WEAPON_BEHAVIOR: Record<WeaponSubtype, WeaponBehavior> = {
  sword:  { cooldown: 0.8, damageMultiplier: 1.0 },
  axe:    { cooldown: 1.2, damageMultiplier: 1.5 },
  dagger: { cooldown: 0.5, damageMultiplier: 0.7 },
  mace:   { cooldown: 1.1, damageMultiplier: 1.3 },
  spear:  { cooldown: 0.9, damageMultiplier: 1.1 },
  staff:  { cooldown: 1.0, damageMultiplier: 0.8 },
};

/**
 * Get the attack cooldown for the currently equipped weapon.
 * Falls back to PLAYER_ATTACK_COOLDOWN if no weapon or unknown subtype.
 */
export function getWeaponCooldown(gameState: GameState): number {
  const weaponDef = gameState.getEquippedWeaponDef();
  if (!weaponDef) return PLAYER_ATTACK_COOLDOWN;
  const behavior = WEAPON_BEHAVIOR[weaponDef.subtype as WeaponSubtype];
  return behavior ? behavior.cooldown : PLAYER_ATTACK_COOLDOWN;
}

export interface CombatResult {
  type: 'miss' | 'hit' | 'kill' | 'no_target' | 'cooldown';
  damage?: number;
  targetCol?: number;
  targetRow?: number;
  enemyType?: string;
  dropsOverride?: DropsOverride;  // NEW
}

export interface EnemyAttackResult {
  type: 'hit';
  damage: number;
  enemyType: string;
}

/**
 * Calculate damage: max(1, ATK - DEF + random(-1..+1))
 * Always deals at least 1 damage.
 */
export function calculateDamage(atk: number, def: number): number {
  const roll = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
  return Math.max(1, atk - def + roll);
}

/**
 * Resolve weapon effect: applies weapon subtype multiplier and specials.
 *
 * Returns the final damage for a single-target hit.
 * - Axe: ignore 1 DEF
 * - Dagger: crit chance overridden to 10% (flat, not additive)
 * - Mace: +2 damage if enemy has DEF > 0
 * - Sword/Spear/Staff: no special per-hit modification (spear 2-cell handled at caller)
 */
export function resolveWeaponEffect(
  subtype: WeaponSubtype | undefined,
  atk: number,
  enemyDef: number,
  critChance: number,
): { damage: number; isCrit: boolean } {
  const behavior = subtype ? WEAPON_BEHAVIOR[subtype] : undefined;
  const multiplier = behavior ? behavior.damageMultiplier : 1.0;

  let effectiveDef = enemyDef;
  let bonusDamage = 0;
  let effectiveCritChance = critChance;

  if (subtype === 'axe') {
    // Ignore 1 DEF
    effectiveDef = Math.max(0, enemyDef - 1);
  } else if (subtype === 'dagger') {
    // Override crit chance to 10%
    effectiveCritChance = 10;
  } else if (subtype === 'mace') {
    // +2 damage vs armored enemies (DEF > 0)
    if (enemyDef > 0) bonusDamage = 2;
  }

  const isCrit = Math.random() * 100 < effectiveCritChance;
  const baseDamage = calculateDamage(atk, effectiveDef);
  let finalDamage = Math.floor(baseDamage * multiplier) + bonusDamage;
  if (isCrit) finalDamage = Math.floor(finalDamage * 1.5);
  finalDamage = Math.max(1, finalDamage);

  return { damage: finalDamage, isCrit };
}

/**
 * Player attacks the cell they're facing.
 * Handles weapon subtype specials including spear 2-cell range.
 * Returns results for all cells hit.
 */
export function playerAttack(
  playerState: PlayerState,
  gameState: GameState,
): CombatResult[] {
  if (gameState.attackCooldown > 0) {
    return [{ type: 'cooldown' }];
  }

  const cooldown = getWeaponCooldown(gameState);
  const weaponDef = gameState.getEquippedWeaponDef();
  const subtype = weaponDef?.subtype as WeaponSubtype | undefined;
  const stats = gameState.getEffectiveStats();

  const { col: frontCol, row: frontRow } = getFacingCell(playerState);

  // Determine cells to attack — spear hits 2 cells deep
  const cells: Array<{ col: number; row: number }> = [{ col: frontCol, row: frontRow }];
  if (subtype === 'spear') {
    const [dc, dr] = FACING_DELTA[playerState.facing];
    cells.push({ col: frontCol + dc, row: frontRow + dr });
  }

  const results: CombatResult[] = [];
  let hitAnything = false;

  for (const cell of cells) {
    const enemy = gameState.getEnemy(cell.col, cell.row);
    if (!enemy) continue;

    hitAnything = true;
    const { damage, isCrit: _isCrit } = resolveWeaponEffect(
      subtype, stats.atk, enemy.def, stats.critChance,
    );
    const killed = gameState.damageEnemy(cell.col, cell.row, damage);
    results.push({
      type: killed ? 'kill' : 'hit',
      damage,
      targetCol: cell.col,
      targetRow: cell.row,
      enemyType: enemy.type,
      dropsOverride: killed ? enemy.drops : undefined,
    });
  }

  gameState.attackCooldown = cooldown;

  if (!hitAnything) {
    return [{ type: 'no_target' }];
  }

  return results;
}

/**
 * Enemy attacks the player. Called when enemy AI emits an attack action.
 */
export function enemyAttackPlayer(
  gameState: GameState,
  enemyAtk: number,
): EnemyAttackResult {
  const damage = calculateDamage(enemyAtk, gameState.getEffectiveDef());
  gameState.hp = Math.max(0, gameState.hp - damage);
  return { type: 'hit', damage, enemyType: '' };
}
