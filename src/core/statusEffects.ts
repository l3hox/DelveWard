// Status effect system — pure logic, no Three.js dependency

export type StatusEffectType = 'poison' | 'slow' | 'burning';

export interface StatusEffect {
  type: StatusEffectType;
  remaining: number;      // seconds left
  tickTimer: number;       // accumulator for periodic damage
  tickInterval: number;    // seconds between damage ticks
  tickDamage: number;      // damage per tick (0 for slow)
}

export const STATUS_EFFECT_DEFAULTS: Record<StatusEffectType, Omit<StatusEffect, 'remaining'>> = {
  poison:  { type: 'poison',  tickTimer: 0, tickInterval: 1, tickDamage: 2 },
  slow:    { type: 'slow',    tickTimer: 0, tickInterval: 0, tickDamage: 0 },
  burning: { type: 'burning', tickTimer: 0, tickInterval: 1, tickDamage: 3 },
};

export interface TickResult {
  damage: number;
  expiredTypes: StatusEffectType[];
}

/** Add or refresh a status effect. Same-type refreshes to max(remaining, duration); no damage stacking. */
export function applyEffect(effects: StatusEffect[], type: StatusEffectType, duration: number): void {
  const existing = effects.find(e => e.type === type);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, duration);
  } else {
    const defaults = STATUS_EFFECT_DEFAULTS[type];
    effects.push({ ...defaults, remaining: duration });
  }
}

/** Tick all effects by delta seconds. Returns accumulated damage and list of newly-expired types. */
export function tickEffects(effects: StatusEffect[], delta: number): TickResult {
  let damage = 0;
  const expiredTypes: StatusEffectType[] = [];

  for (const effect of effects) {
    effect.remaining -= delta;

    if (effect.tickInterval > 0 && effect.tickDamage > 0) {
      effect.tickTimer += delta;
      while (effect.tickTimer >= effect.tickInterval) {
        effect.tickTimer -= effect.tickInterval;
        damage += effect.tickDamage;
      }
    }

    if (effect.remaining <= 0) {
      expiredTypes.push(effect.type);
    }
  }

  return { damage, expiredTypes };
}

/** Remove all effects of a given type. */
export function removeEffectsByType(effects: StatusEffect[], type: StatusEffectType): StatusEffect[] {
  return effects.filter(e => e.type !== type);
}

/** Check if an effect of the given type is active. */
export function hasEffect(effects: StatusEffect[], type: StatusEffectType): boolean {
  return effects.some(e => e.type === type);
}

/** Returns 2.0 if slow is active, 1.0 otherwise. */
export function getSlowMultiplier(effects: StatusEffect[]): number {
  return hasEffect(effects, 'slow') ? 2.0 : 1.0;
}
