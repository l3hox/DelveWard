import { describe, it, expect } from 'vitest';
import {
  applyEffect,
  tickEffects,
  removeEffectsByType,
  hasEffect,
  getSlowMultiplier,
  type StatusEffect,
} from './statusEffects';

function makeEffects(): StatusEffect[] {
  return [];
}

describe('applyEffect', () => {
  it('adds a new effect', () => {
    const effects = makeEffects();
    applyEffect(effects, 'poison', 5);
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('poison');
    expect(effects[0].remaining).toBe(5);
    expect(effects[0].tickDamage).toBe(2);
    expect(effects[0].tickInterval).toBe(1);
  });

  it('refreshes duration on same type (no stacking)', () => {
    const effects = makeEffects();
    applyEffect(effects, 'poison', 5);
    applyEffect(effects, 'poison', 3);
    expect(effects).toHaveLength(1);
    expect(effects[0].remaining).toBe(5); // max(5, 3) = 5

    applyEffect(effects, 'poison', 8);
    expect(effects).toHaveLength(1);
    expect(effects[0].remaining).toBe(8); // max(5, 8) = 8
  });

  it('allows different types simultaneously', () => {
    const effects = makeEffects();
    applyEffect(effects, 'poison', 5);
    applyEffect(effects, 'burning', 3);
    applyEffect(effects, 'slow', 4);
    expect(effects).toHaveLength(3);
    expect(effects.map(e => e.type).sort()).toEqual(['burning', 'poison', 'slow']);
  });
});

describe('tickEffects', () => {
  it('applies damage at correct intervals', () => {
    const effects = makeEffects();
    applyEffect(effects, 'poison', 5); // tickInterval=1, tickDamage=2

    // 0.5s — not yet a full tick
    const r1 = tickEffects(effects, 0.5);
    expect(r1.damage).toBe(0);

    // another 0.5s — completes one tick
    const r2 = tickEffects(effects, 0.5);
    expect(r2.damage).toBe(2);

    // 1.0s — another full tick
    const r3 = tickEffects(effects, 1.0);
    expect(r3.damage).toBe(2);
  });

  it('returns expired types', () => {
    const effects = makeEffects();
    applyEffect(effects, 'poison', 1.5);

    const r1 = tickEffects(effects, 1.0);
    expect(r1.expiredTypes).toEqual([]);

    const r2 = tickEffects(effects, 0.6);
    expect(r2.expiredTypes).toEqual(['poison']);
  });

  it('handles multiple simultaneous effects', () => {
    const effects = makeEffects();
    applyEffect(effects, 'poison', 5);  // tickDamage=2
    applyEffect(effects, 'burning', 3); // tickDamage=3

    // After 1s, both should tick
    const r = tickEffects(effects, 1.0);
    expect(r.damage).toBe(5); // 2 + 3
  });

  it('slow does not deal damage', () => {
    const effects = makeEffects();
    applyEffect(effects, 'slow', 5);

    const r = tickEffects(effects, 2.0);
    expect(r.damage).toBe(0);
  });

  it('handles large delta with multiple ticks', () => {
    const effects = makeEffects();
    applyEffect(effects, 'poison', 10); // tickInterval=1, tickDamage=2

    const r = tickEffects(effects, 3.0);
    expect(r.damage).toBe(6); // 3 ticks × 2 damage
  });
});

describe('getSlowMultiplier', () => {
  it('returns 2.0 when slow is active', () => {
    const effects = makeEffects();
    applyEffect(effects, 'slow', 5);
    expect(getSlowMultiplier(effects)).toBe(2.0);
  });

  it('returns 1.0 when slow is not active', () => {
    const effects = makeEffects();
    expect(getSlowMultiplier(effects)).toBe(1.0);

    applyEffect(effects, 'poison', 5);
    expect(getSlowMultiplier(effects)).toBe(1.0);
  });
});

describe('removeEffectsByType', () => {
  it('clears specific type', () => {
    const effects = makeEffects();
    applyEffect(effects, 'poison', 5);
    applyEffect(effects, 'burning', 3);

    const result = removeEffectsByType(effects, 'poison');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('burning');
  });

  it('leaves others untouched', () => {
    const effects = makeEffects();
    applyEffect(effects, 'poison', 5);
    applyEffect(effects, 'slow', 4);
    applyEffect(effects, 'burning', 3);

    const result = removeEffectsByType(effects, 'slow');
    expect(result).toHaveLength(2);
    expect(result.map(e => e.type).sort()).toEqual(['burning', 'poison']);
  });

  it('returns empty array when removing only effect', () => {
    const effects = makeEffects();
    applyEffect(effects, 'poison', 5);

    const result = removeEffectsByType(effects, 'poison');
    expect(result).toHaveLength(0);
  });
});

describe('hasEffect', () => {
  it('returns true for active effect', () => {
    const effects = makeEffects();
    applyEffect(effects, 'burning', 3);
    expect(hasEffect(effects, 'burning')).toBe(true);
  });

  it('returns false for absent effect', () => {
    const effects = makeEffects();
    expect(hasEffect(effects, 'burning')).toBe(false);

    applyEffect(effects, 'poison', 5);
    expect(hasEffect(effects, 'burning')).toBe(false);
  });
});
