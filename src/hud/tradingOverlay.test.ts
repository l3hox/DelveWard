import { describe, it, expect } from 'vitest';
import { buyPrice, sellPrice } from './tradingOverlay';
import type { ItemDef } from '../core/itemDatabase';

function makeItem(value: number): ItemDef {
  return {
    id: 'test_item',
    name: 'Test Item',
    type: 'consumable',
    subtype: 'health_potion',
    quality: 'common',
    icon: 'red-potion',
    weight: 1,
    value,
    description: 'A test item.',
    stats: {},
    modifiers: [],
    requirements: {},
  };
}

describe('buyPrice', () => {
  it('applies markup and rounds up', () => {
    expect(buyPrice(makeItem(10), 1.5)).toBe(15);
  });

  it('rounds up fractional prices', () => {
    // 7 * 1.5 = 10.5 → ceil → 11
    expect(buyPrice(makeItem(7), 1.5)).toBe(11);
  });

  it('works with markup of 1.0', () => {
    expect(buyPrice(makeItem(10), 1.0)).toBe(10);
  });

  it('handles zero value items', () => {
    expect(buyPrice(makeItem(0), 1.5)).toBe(0);
  });

  it('handles high markup', () => {
    expect(buyPrice(makeItem(10), 3.0)).toBe(30);
  });
});

describe('sellPrice', () => {
  it('halves value and rounds down', () => {
    expect(sellPrice(makeItem(10))).toBe(5);
  });

  it('rounds down fractional prices', () => {
    // 7 * 0.5 = 3.5 → floor → 3
    expect(sellPrice(makeItem(7))).toBe(3);
  });

  it('returns 0 for zero-value items', () => {
    expect(sellPrice(makeItem(0))).toBe(0);
  });

  it('returns 0 for value 1 items', () => {
    // 1 * 0.5 = 0.5 → floor → 0
    expect(sellPrice(makeItem(1))).toBe(0);
  });
});
