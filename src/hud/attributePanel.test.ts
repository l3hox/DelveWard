import { describe, it, expect, beforeEach } from 'vitest';
import { AttributePanel } from './attributePanel';
import { GameState } from '../core/gameState';

function makeGameState(): GameState {
  const gs = new GameState([], undefined, 'test_level');
  return gs;
}

function makeGameStateWithPoints(points: number): GameState {
  const gs = makeGameState();
  gs.attributePoints = points;
  return gs;
}

// ---------------------------------------------------------------------------
// open / isOpen / tryClose
// ---------------------------------------------------------------------------

describe('AttributePanel open/close', () => {
  it('starts closed', () => {
    const panel = new AttributePanel();
    expect(panel.isOpen()).toBe(false);
  });

  it('open() opens the panel', () => {
    const panel = new AttributePanel();
    panel.open(makeGameState());
    expect(panel.isOpen()).toBe(true);
  });

  it('opens in stats mode when no points available', () => {
    const panel = new AttributePanel();
    panel.open(makeGameState());
    expect(panel.mode).toBe('stats');
  });

  it('opens in levelup mode when points are available', () => {
    const panel = new AttributePanel();
    panel.open(makeGameStateWithPoints(3));
    expect(panel.mode).toBe('levelup');
  });

  it('tryClose succeeds in stats mode', () => {
    const panel = new AttributePanel();
    const gs = makeGameState();
    panel.open(gs);
    expect(panel.tryClose(gs)).toBe(true);
    expect(panel.isOpen()).toBe(false);
  });

  it('tryClose fails in levelup mode with unspent points', () => {
    const panel = new AttributePanel();
    const gs = makeGameStateWithPoints(3);
    panel.open(gs);
    expect(panel.tryClose(gs)).toBe(false);
    expect(panel.isOpen()).toBe(true);
  });

  it('tryClose succeeds in levelup mode when all points are spent', () => {
    const panel = new AttributePanel();
    const gs = makeGameStateWithPoints(3);
    panel.open(gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    expect(panel.tryClose(gs)).toBe(true);
    expect(panel.isOpen()).toBe(false);
  });

  it('resets selected stat to 0 on open', () => {
    const panel = new AttributePanel();
    const gs = makeGameStateWithPoints(6);
    panel.open(gs);
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.tryClose(gs);

    // Re-open — should reset to first stat
    gs.attributePoints = 3;
    panel.open(gs);
    const strBefore = gs.str;
    panel.handleKey('ArrowRight', gs);
    // Verify first stat (STR) was incremented, not VIT
    // Close to apply
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.tryClose(gs);
    expect(gs.str).toBe(strBefore + 3);
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe('AttributePanel navigation', () => {
  let panel: AttributePanel;
  let gs: GameState;

  beforeEach(() => {
    panel = new AttributePanel();
    gs = makeGameStateWithPoints(10);
    panel.open(gs);
  });

  it('ArrowDown advances selection (allocate to DEX to verify)', () => {
    panel.handleKey('ArrowDown', gs);
    const dexBefore = gs.dex;
    // Allocate all 10 to DEX and close
    for (let i = 0; i < 10; i++) panel.handleKey('ArrowRight', gs);
    panel.tryClose(gs);
    expect(gs.dex).toBe(dexBefore + 10);
  });

  it('ArrowDown wraps from last stat back to first', () => {
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowDown', gs); // wraps to STR
    const strBefore = gs.str;
    for (let i = 0; i < 10; i++) panel.handleKey('ArrowRight', gs);
    panel.tryClose(gs);
    expect(gs.str).toBe(strBefore + 10);
  });

  it('ArrowUp wraps from first stat to last', () => {
    panel.handleKey('ArrowUp', gs); // wraps to WIS
    const wisBefore = gs.wis;
    for (let i = 0; i < 10; i++) panel.handleKey('ArrowRight', gs);
    panel.tryClose(gs);
    expect(gs.wis).toBe(wisBefore + 10);
  });

  it('navigation keys return true (consumed)', () => {
    expect(panel.handleKey('ArrowDown', gs)).toBe(true);
    expect(panel.handleKey('ArrowUp', gs)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Allocation — ArrowRight / Enter add, ArrowLeft removes
// ---------------------------------------------------------------------------

describe('AttributePanel allocation', () => {
  let panel: AttributePanel;

  beforeEach(() => {
    panel = new AttributePanel();
  });

  it('ArrowRight adds a pending point', () => {
    const gs = makeGameStateWithPoints(3);
    const strBefore = gs.str;
    panel.open(gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.tryClose(gs);
    expect(gs.str).toBe(strBefore + 3);
    expect(gs.attributePoints).toBe(0);
  });

  it('Enter adds a pending point', () => {
    const gs = makeGameStateWithPoints(2);
    const strBefore = gs.str;
    panel.open(gs);
    panel.handleKey('Enter', gs);
    panel.handleKey('Enter', gs);
    panel.tryClose(gs);
    expect(gs.str).toBe(strBefore + 2);
  });

  it('ArrowLeft removes a pending point', () => {
    const gs = makeGameStateWithPoints(3);
    const strBefore = gs.str;
    panel.open(gs);
    // Add 2 to STR, remove 1, add 1 back → net +2 to STR
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowLeft', gs);
    // Move to DEX and add 1
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowRight', gs);
    // Move to VIT and add 1
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowRight', gs);
    panel.tryClose(gs);
    expect(gs.str).toBe(strBefore + 1);
  });

  it('ArrowLeft cannot go below zero pending (baseline is preserved)', () => {
    const gs = makeGameStateWithPoints(3);
    const strBefore = gs.str;
    panel.open(gs);
    panel.handleKey('ArrowLeft', gs); // no pending to remove
    // Allocate all 3 to STR
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.tryClose(gs);
    expect(gs.str).toBe(strBefore + 3);
  });

  it('cannot add more points than remaining', () => {
    const gs = makeGameStateWithPoints(2);
    const strBefore = gs.str;
    panel.open(gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs); // should do nothing — no points left
    panel.tryClose(gs);
    expect(gs.str).toBe(strBefore + 2);
  });

  it('does not modify gameState stats until tryClose', () => {
    const gs = makeGameStateWithPoints(3);
    const strBefore = gs.str;
    panel.open(gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    // Stats unchanged while panel is open
    expect(gs.str).toBe(strBefore);
    panel.handleKey('ArrowRight', gs);
    panel.tryClose(gs);
    // Now applied
    expect(gs.str).toBe(strBefore + 3);
  });

  it('spreads points across multiple stats', () => {
    const gs = makeGameStateWithPoints(4);
    panel.open(gs);
    panel.handleKey('ArrowRight', gs);            // +1 STR
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowRight', gs);            // +1 DEX
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowRight', gs);            // +1 VIT
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowRight', gs);            // +1 WIS
    const [strB, dexB, vitB, wisB] = [gs.str, gs.dex, gs.vit, gs.wis];
    panel.tryClose(gs);
    expect(gs.str).toBe(strB + 1);
    expect(gs.dex).toBe(dexB + 1);
    expect(gs.vit).toBe(vitB + 1);
    expect(gs.wis).toBe(wisB + 1);
  });

  it('allocation keys return true (consumed)', () => {
    const gs = makeGameStateWithPoints(3);
    panel.open(gs);
    expect(panel.handleKey('ArrowRight', gs)).toBe(true);
    expect(panel.handleKey('ArrowLeft', gs)).toBe(true);
    expect(panel.handleKey('Enter', gs)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stats mode — read-only
// ---------------------------------------------------------------------------

describe('AttributePanel stats mode', () => {
  it('ArrowRight does nothing in stats mode', () => {
    const panel = new AttributePanel();
    const gs = makeGameState();
    const strBefore = gs.str;
    panel.open(gs);
    panel.handleKey('ArrowRight', gs);
    panel.tryClose(gs);
    expect(gs.str).toBe(strBefore);
  });

  it('ArrowLeft does nothing in stats mode', () => {
    const panel = new AttributePanel();
    const gs = makeGameState();
    panel.open(gs);
    expect(panel.handleKey('ArrowLeft', gs)).toBe(true);
    // No crash, no state change
  });
});

// ---------------------------------------------------------------------------
// VIT allocation recalculates maxHp
// ---------------------------------------------------------------------------

describe('AttributePanel VIT allocation', () => {
  it('recalculates maxHp on close when VIT was increased', () => {
    const panel = new AttributePanel();
    const gs = makeGameStateWithPoints(3);
    const maxHpBefore = gs.maxHp;
    gs.hp = gs.maxHp; // at full HP

    panel.open(gs);
    // Move to VIT (index 2)
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.handleKey('ArrowRight', gs);
    panel.tryClose(gs);

    expect(gs.maxHp).toBeGreaterThan(maxHpBefore);
    expect(gs.hp).toBe(gs.maxHp); // was at full, should stay at full
  });
});

// ---------------------------------------------------------------------------
// Point accumulation (multi-level)
// ---------------------------------------------------------------------------

describe('AttributePanel point accumulation', () => {
  it('handles 6 accumulated points (2 level-ups)', () => {
    const panel = new AttributePanel();
    const gs = makeGameStateWithPoints(6);
    panel.open(gs);

    // Must allocate all 6
    expect(panel.tryClose(gs)).toBe(false);

    for (let i = 0; i < 6; i++) panel.handleKey('ArrowRight', gs);
    expect(panel.tryClose(gs)).toBe(true);
    expect(gs.attributePoints).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Unknown keys
// ---------------------------------------------------------------------------

describe('AttributePanel unknown keys', () => {
  it('returns false for unrecognised key codes', () => {
    const panel = new AttributePanel();
    const gs = makeGameState();
    panel.open(gs);
    expect(panel.handleKey('KeyZ', gs)).toBe(false);
    expect(panel.handleKey('Space', gs)).toBe(false);
    expect(panel.handleKey('Escape', gs)).toBe(false);
  });
});
