import { describe, it, expect, beforeEach } from 'vitest';
import { AttributePanel } from './attributePanel';
import { GameState } from '../core/gameState';

function makeGameState(): GameState {
  const gs = new GameState([], undefined, 'test_level');
  return gs;
}

function makeGameStateWithPoints(points: number): GameState {
  const gs = makeGameState();
  // Inject points directly — allocatePoint guards against <= 0
  gs.attributePoints = points;
  return gs;
}

// ---------------------------------------------------------------------------
// Toggle / isOpen
// ---------------------------------------------------------------------------

describe('AttributePanel.toggle', () => {
  it('starts closed', () => {
    const panel = new AttributePanel();
    expect(panel.isOpen()).toBe(false);
  });

  it('toggle opens the panel', () => {
    const panel = new AttributePanel();
    panel.toggle();
    expect(panel.isOpen()).toBe(true);
  });

  it('toggle twice closes the panel', () => {
    const panel = new AttributePanel();
    panel.toggle();
    panel.toggle();
    expect(panel.isOpen()).toBe(false);
  });

  it('resets selected stat to 0 on open', () => {
    const panel = new AttributePanel();
    panel.toggle(); // open
    const gs = makeGameStateWithPoints(3);
    // Navigate down twice to select stat index 2
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowDown', gs);
    panel.toggle(); // close
    panel.toggle(); // re-open — should reset selection
    // Verify by pressing ArrowUp (which wraps at 0 -> 3), then checking allocation
    // goes to stat 3 (wis), not stat 2
    gs.attributePoints = 3;
    const wisBefore = gs.wis;
    // Wrap from 0 -> 3
    panel.handleKey('ArrowUp', gs);
    panel.handleKey('ArrowRight', gs);
    expect(gs.wis).toBe(wisBefore + 1);
  });
});

// ---------------------------------------------------------------------------
// Navigation — ArrowUp / ArrowDown wraps around 4 stats
// ---------------------------------------------------------------------------

describe('AttributePanel navigation', () => {
  let panel: AttributePanel;
  let gs: GameState;

  beforeEach(() => {
    panel = new AttributePanel();
    panel.toggle();
    gs = makeGameStateWithPoints(10);
  });

  it('ArrowDown advances selection', () => {
    // Start at STR (0). Move to DEX (1), then allocate to verify.
    panel.handleKey('ArrowDown', gs);
    const dexBefore = gs.dex;
    panel.handleKey('ArrowRight', gs);
    expect(gs.dex).toBe(dexBefore + 1);
  });

  it('ArrowDown wraps from last stat back to first', () => {
    // Navigate to stat index 3 (WIS)
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowDown', gs);
    // One more down wraps back to index 0 (STR)
    panel.handleKey('ArrowDown', gs);
    const strBefore = gs.str;
    panel.handleKey('ArrowRight', gs);
    expect(gs.str).toBe(strBefore + 1);
  });

  it('ArrowUp wraps from first stat to last', () => {
    // At index 0 (STR). ArrowUp wraps to index 3 (WIS).
    panel.handleKey('ArrowUp', gs);
    const wisBefore = gs.wis;
    panel.handleKey('ArrowRight', gs);
    expect(gs.wis).toBe(wisBefore + 1);
  });

  it('ArrowUp navigates backwards', () => {
    // Go to index 2 (VIT), then ArrowUp -> index 1 (DEX)
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowUp', gs);
    const dexBefore = gs.dex;
    panel.handleKey('ArrowRight', gs);
    expect(gs.dex).toBe(dexBefore + 1);
  });

  it('navigation keys return true (consumed)', () => {
    expect(panel.handleKey('ArrowDown', gs)).toBe(true);
    expect(panel.handleKey('ArrowUp', gs)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Allocation — ArrowRight / Enter
// ---------------------------------------------------------------------------

describe('AttributePanel allocation', () => {
  let panel: AttributePanel;

  beforeEach(() => {
    panel = new AttributePanel();
    panel.toggle();
  });

  it('ArrowRight allocates a point to the selected stat when points available', () => {
    const gs = makeGameStateWithPoints(3);
    const strBefore = gs.str;
    panel.handleKey('ArrowRight', gs);
    expect(gs.str).toBe(strBefore + 1);
    expect(gs.attributePoints).toBe(2);
  });

  it('Enter allocates a point to the selected stat when points available', () => {
    const gs = makeGameStateWithPoints(2);
    const strBefore = gs.str;
    panel.handleKey('Enter', gs);
    expect(gs.str).toBe(strBefore + 1);
    expect(gs.attributePoints).toBe(1);
  });

  it('allocates to the currently selected stat', () => {
    const gs = makeGameStateWithPoints(5);
    // Move to VIT (index 2)
    panel.handleKey('ArrowDown', gs);
    panel.handleKey('ArrowDown', gs);
    const vitBefore = gs.vit;
    panel.handleKey('ArrowRight', gs);
    expect(gs.vit).toBe(vitBefore + 1);
    // STR and DEX should be unchanged
    expect(gs.str).toBe(5);
    expect(gs.dex).toBe(5);
  });

  it('allocation keys return true (consumed)', () => {
    const gs = makeGameStateWithPoints(3);
    expect(panel.handleKey('ArrowRight', gs)).toBe(true);
    expect(panel.handleKey('Enter', gs)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Disabled — no allocation when attributePoints is 0
// ---------------------------------------------------------------------------

describe('AttributePanel allocation when no points available', () => {
  let panel: AttributePanel;

  beforeEach(() => {
    panel = new AttributePanel();
    panel.toggle();
  });

  it('does not change stat when no points remain', () => {
    const gs = makeGameState(); // attributePoints starts at 0
    const strBefore = gs.str;
    panel.handleKey('ArrowRight', gs);
    expect(gs.str).toBe(strBefore);
    expect(gs.attributePoints).toBe(0);
  });

  it('still returns true for ArrowRight (key was consumed by panel)', () => {
    const gs = makeGameState();
    expect(panel.handleKey('ArrowRight', gs)).toBe(true);
  });

  it('still returns true for Enter (key was consumed by panel)', () => {
    const gs = makeGameState();
    expect(panel.handleKey('Enter', gs)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unknown keys return false (not consumed)
// ---------------------------------------------------------------------------

describe('AttributePanel unknown keys', () => {
  it('returns false for unrecognised key codes', () => {
    const panel = new AttributePanel();
    panel.toggle();
    const gs = makeGameState();
    expect(panel.handleKey('KeyZ', gs)).toBe(false);
    expect(panel.handleKey('Space', gs)).toBe(false);
    expect(panel.handleKey('Escape', gs)).toBe(false);
  });
});
