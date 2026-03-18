import { describe, it, expect, vi } from 'vitest';
import { SignalManager } from './signalManager';

describe('SignalManager', () => {
  // --- Registration ---

  it('registers sources and receivers', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['door_1']);
    sm.registerReceiver('door_1');
    expect(sm.getSource('lever_1')).toBeDefined();
    expect(sm.getReceiver('door_1')).toBeDefined();
  });

  // --- Basic propagation ---

  it('activating a source activates its receiver', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['door_1']);
    sm.registerReceiver('door_1');

    sm.setSourceActive('lever_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(true);
  });

  it('deactivating a source deactivates its receiver', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['door_1']);
    sm.registerReceiver('door_1');

    sm.setSourceActive('lever_1', true);
    sm.setSourceActive('lever_1', false);
    expect(sm.isReceiverActive('door_1')).toBe(false);
  });

  // --- Callback ---

  it('fires receiver-changed callback on state change', () => {
    const sm = new SignalManager();
    const cb = vi.fn();
    sm.setReceiverChangedCallback(cb);
    sm.registerSource('lever_1', ['door_1']);
    sm.registerReceiver('door_1');

    sm.setSourceActive('lever_1', true);
    expect(cb).toHaveBeenCalledWith('door_1', true);

    sm.setSourceActive('lever_1', false);
    expect(cb).toHaveBeenCalledWith('door_1', false);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('does not fire callback when state unchanged', () => {
    const sm = new SignalManager();
    const cb = vi.fn();
    sm.setReceiverChangedCallback(cb);
    sm.registerSource('lever_1', ['door_1']);
    sm.registerReceiver('door_1');

    sm.setSourceActive('lever_1', true);
    sm.setSourceActive('lever_1', true); // same state
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // --- Multi-target fan-out ---

  it('one source activates multiple receivers', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['door_1', 'door_2']);
    sm.registerReceiver('door_1');
    sm.registerReceiver('door_2');

    sm.setSourceActive('lever_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(true);
    expect(sm.isReceiverActive('door_2')).toBe(true);
  });

  // --- Multi-source fan-in with OR ---

  it('OR mode: any active source activates receiver', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['door_1']);
    sm.registerSource('lever_2', ['door_1']);
    sm.registerReceiver('door_1', 'or');

    sm.setSourceActive('lever_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(true);

    sm.setSourceActive('lever_1', false);
    expect(sm.isReceiverActive('door_1')).toBe(false);

    sm.setSourceActive('lever_2', true);
    expect(sm.isReceiverActive('door_1')).toBe(true);
  });

  // --- AND gate mode ---

  it('AND mode: all sources must be active', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['door_1']);
    sm.registerSource('lever_2', ['door_1']);
    sm.registerReceiver('door_1', 'and');

    sm.setSourceActive('lever_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(false);

    sm.setSourceActive('lever_2', true);
    expect(sm.isReceiverActive('door_1')).toBe(true);

    sm.setSourceActive('lever_1', false);
    expect(sm.isReceiverActive('door_1')).toBe(false);
  });

  // --- XOR gate mode ---

  it('XOR mode: odd number of active sources activates', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['door_1']);
    sm.registerSource('lever_2', ['door_1']);
    sm.registerReceiver('door_1', 'xor');

    sm.setSourceActive('lever_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(true);

    sm.setSourceActive('lever_2', true);
    expect(sm.isReceiverActive('door_1')).toBe(false);

    sm.setSourceActive('lever_1', false);
    expect(sm.isReceiverActive('door_1')).toBe(true);
  });

  // --- Signal modes ---

  it('one_shot: source can only activate once', () => {
    const sm = new SignalManager();
    sm.registerSource('trigger_1', ['door_1'], 'one_shot');
    sm.registerReceiver('door_1');

    sm.setSourceActive('trigger_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(true);

    sm.deactivateSource('trigger_1');
    expect(sm.isReceiverActive('door_1')).toBe(false);

    // Second activation should be ignored
    sm.setSourceActive('trigger_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(false);
  });

  it('timed: source auto-deactivates after duration', () => {
    const sm = new SignalManager();
    sm.registerSource('plate_1', ['door_1'], 'timed', 2.0);
    sm.registerReceiver('door_1');

    sm.setSourceActive('plate_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(true);

    sm.tick(1.0);
    expect(sm.isReceiverActive('door_1')).toBe(true);

    sm.tick(1.5);
    expect(sm.isReceiverActive('door_1')).toBe(false);
  });

  it('momentary: source deactivated via deactivateSource', () => {
    const sm = new SignalManager();
    sm.registerSource('plate_1', ['door_1'], 'momentary');
    sm.registerReceiver('door_1');

    sm.setSourceActive('plate_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(true);

    sm.deactivateSource('plate_1');
    expect(sm.isReceiverActive('door_1')).toBe(false);
  });

  // --- Standalone gate entities ---

  it('AND gate: combines inputs and propagates to target', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['gate_1']);
    sm.registerSource('lever_2', ['gate_1']);
    sm.registerGate('gate_1', 'and', ['door_1']);
    sm.registerReceiver('door_1');

    sm.setSourceActive('lever_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(false);

    sm.setSourceActive('lever_2', true);
    expect(sm.isReceiverActive('door_1')).toBe(true);
  });

  it('NOT gate: inverts input signal', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['gate_1']);
    sm.registerGate('gate_1', 'not', ['door_1']);
    sm.registerReceiver('door_1');

    // No input → NOT outputs true
    sm.setSourceActive('lever_1', false);
    // propagate was called, gate should output true (no active inputs)
    expect(sm.isReceiverActive('door_1')).toBe(true);

    sm.setSourceActive('lever_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(false);
  });

  it('DELAY gate: activates output after delay', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['gate_1']);
    sm.registerGate('gate_1', 'delay', ['door_1'], 1.0);
    sm.registerReceiver('door_1');

    sm.setSourceActive('lever_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(false);

    sm.tick(0.5);
    expect(sm.isReceiverActive('door_1')).toBe(false);

    sm.tick(0.6);
    expect(sm.isReceiverActive('door_1')).toBe(true);
  });

  // --- Save/load state ---

  it('save and load preserves signal state', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['door_1']);
    sm.registerReceiver('door_1');
    sm.setSourceActive('lever_1', true);

    const state = sm.saveState();
    const sm2 = new SignalManager();
    sm2.loadState(state);
    expect(sm2.isSourceActive('lever_1')).toBe(true);
    expect(sm2.isReceiverActive('door_1')).toBe(true);
  });

  // --- Signal delay ---

  it('delayed source activates after delay elapses', () => {
    const sm = new SignalManager();
    sm.registerSource('plate_1', ['door_1'], 'toggle', undefined, 1.5);
    sm.registerReceiver('door_1');

    sm.setSourceActive('plate_1', true);
    // Should not activate immediately
    expect(sm.isReceiverActive('door_1')).toBe(false);
    expect(sm.isSourceActive('plate_1')).toBe(false);

    sm.tick(1.0);
    expect(sm.isReceiverActive('door_1')).toBe(false);

    sm.tick(0.6);
    expect(sm.isReceiverActive('door_1')).toBe(true);
    expect(sm.isSourceActive('plate_1')).toBe(true);
  });

  it('delayed timed source starts duration after delay', () => {
    const sm = new SignalManager();
    sm.registerSource('trigger_1', ['door_1'], 'timed', 1.0, 0.5);
    sm.registerReceiver('door_1');

    sm.setSourceActive('trigger_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(false);

    // After delay elapses, source activates with timed duration
    sm.tick(0.6);
    expect(sm.isReceiverActive('door_1')).toBe(true);

    // After timed duration elapses, source deactivates
    sm.tick(1.1);
    expect(sm.isReceiverActive('door_1')).toBe(false);
  });

  it('deactivation cancels pending delay', () => {
    const sm = new SignalManager();
    sm.registerSource('plate_1', ['door_1'], 'momentary', undefined, 1.0);
    sm.registerReceiver('door_1');

    sm.setSourceActive('plate_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(false);

    // Deactivate before delay elapses
    sm.deactivateSource('plate_1');
    sm.tick(1.5);
    expect(sm.isReceiverActive('door_1')).toBe(false);
  });

  // --- Clear ---

  it('clear removes all registrations', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['door_1']);
    sm.registerReceiver('door_1');
    sm.clear();
    expect(sm.getSource('lever_1')).toBeUndefined();
    expect(sm.getReceiver('door_1')).toBeUndefined();
  });

  // --- Edge cases ---

  it('setSourceActive on unknown source is a no-op', () => {
    const sm = new SignalManager();
    sm.setSourceActive('nonexistent', true);
    // Should not throw
  });

  it('isReceiverActive returns false for unknown receiver', () => {
    const sm = new SignalManager();
    expect(sm.isReceiverActive('nonexistent')).toBe(false);
  });

  it('deactivateSource on unknown source is a no-op', () => {
    const sm = new SignalManager();
    sm.deactivateSource('nonexistent');
    // Should not throw
  });
});
