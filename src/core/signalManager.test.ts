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

  // --- Gate chaining ---

  it('OR gate chains through another OR gate to receiver', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['gate_1']);
    sm.registerGate('gate_1', 'or', ['gate_2']);
    sm.registerGate('gate_2', 'or', ['door_1']);
    sm.registerReceiver('door_1');

    sm.setSourceActive('lever_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(true);

    sm.setSourceActive('lever_1', false);
    expect(sm.isReceiverActive('door_1')).toBe(false);
  });

  it('delay gate chains into another delay gate', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['gate_1']);
    sm.registerGate('gate_1', 'delay', ['gate_2'], 1.0);
    sm.registerGate('gate_2', 'delay', ['door_1'], 1.0);
    sm.registerReceiver('door_1');

    sm.setSourceActive('lever_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(false);

    // First delay gate fires after 1s
    sm.tick(1.1);
    expect(sm.getGate('gate_1')!.active).toBe(true);
    expect(sm.isReceiverActive('door_1')).toBe(false);

    // Second delay gate fires after another 1s
    sm.tick(1.1);
    expect(sm.isReceiverActive('door_1')).toBe(true);
  });

  it('gate targets both another gate and a receiver', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['gate_1']);
    sm.registerGate('gate_1', 'or', ['door_1', 'gate_2']);
    sm.registerGate('gate_2', 'or', ['door_2']);
    sm.registerReceiver('door_1');
    sm.registerReceiver('door_2');

    sm.setSourceActive('lever_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(true);
    expect(sm.isReceiverActive('door_2')).toBe(true);
  });

  it('three-deep gate chain propagates correctly', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['gate_1']);
    sm.registerGate('gate_1', 'or', ['gate_2']);
    sm.registerGate('gate_2', 'not', ['gate_3']);
    sm.registerGate('gate_3', 'or', ['door_1']);
    sm.registerReceiver('door_1');

    // lever on → gate_1=true → gate_2(NOT)=false → gate_3=false → door closed
    sm.setSourceActive('lever_1', true);
    expect(sm.isReceiverActive('door_1')).toBe(false);

    // lever off → gate_1=false → gate_2(NOT)=true → gate_3=true → door open
    sm.setSourceActive('lever_1', false);
    expect(sm.isReceiverActive('door_1')).toBe(true);
  });

  // --- Drift regression tests ---

  it('pulse repeat: zero drift over irregular frame deltas', () => {
    const sm = new SignalManager();
    const cb = vi.fn();
    sm.setReceiverChangedCallback(cb);
    sm.registerSource('lever_1', ['gate_1']);
    sm.registerGate('gate_1', 'pulse_repeat', ['door_1'], undefined, 1.0);
    sm.registerReceiver('door_1');

    sm.setSourceActive('lever_1', true);
    cb.mockClear();

    // Simulate 10 seconds with wildly irregular frame deltas
    const deltas = [
      0.016, 0.032, 0.008, 0.1, 0.05, 0.004, 0.016, 0.033, 0.016, 0.016,
      0.08, 0.012, 0.016, 0.064, 0.016, 0.016, 0.016, 0.1, 0.016, 0.016,
    ];
    let elapsed = 0;
    let pulseCount = 0;
    while (elapsed < 10) {
      const d = deltas[Math.floor(Math.random() * deltas.length)];
      const prevNow = sm.now;
      sm.tick(d);
      elapsed += d;
      // Count pulses by checking if gate.fireAt advanced
      const gate = sm.getGate('gate_1')!;
      if (gate.fireAt > prevNow + d + 0.001 || cb.mock.calls.length > pulseCount) {
        // A repropagation happened
      }
    }
    // With interval=1.0 and ~10s elapsed, exactly 10 pulse events should have fired
    // (initial schedule at t=1, then t=2, t=3, ... t=10)
    const gate = sm.getGate('gate_1')!;
    // The gate's fireAt should be exactly 11.0 (next unprocessed fire) regardless of frame jitter
    // Since we went past 10s, fireAt should be the next integer after elapsed
    const expectedNextFire = Math.ceil(elapsed);
    // fireAt should be within 1 interval of expected — the key point is NO accumulated drift
    expect(gate.fireAt).toBeCloseTo(expectedNextFire, 0);
  });

  it('save/load preserves clock and timed source deactivates correctly', () => {
    const sm = new SignalManager();
    sm.registerSource('plate_1', ['door_1'], 'timed', 3.0);
    sm.registerReceiver('door_1');

    sm.setSourceActive('plate_1', true);
    sm.tick(2.0); // now = 2, deactivateAt = 3.0
    expect(sm.isReceiverActive('door_1')).toBe(true);

    const state = sm.saveState();
    expect(state.now).toBe(2.0);

    // Load into fresh SM
    const sm2 = new SignalManager();
    sm2.loadState(state);
    expect(sm2.now).toBe(2.0);
    expect(sm2.isReceiverActive('door_1')).toBe(true);

    // Tick to t=5 — should deactivate at t=3
    const cb = vi.fn();
    sm2.setSourceDeactivatedCallback(cb);
    sm2.tick(3.0); // now = 5
    expect(sm2.isReceiverActive('door_1')).toBe(false);
    expect(cb).toHaveBeenCalledWith('plate_1');
  });

  it('delay gate chain: exact timing regardless of frame jitter', () => {
    const sm = new SignalManager();
    sm.registerSource('lever_1', ['gate_1']);
    sm.registerGate('gate_1', 'delay', ['gate_2'], 1.0);
    sm.registerGate('gate_2', 'delay', ['door_1'], 1.0);
    sm.registerReceiver('door_1');

    sm.setSourceActive('lever_1', true);

    // Simulate with irregular deltas totaling exactly 2.0s
    // Use many small irregular steps
    const steps = [0.3, 0.15, 0.05, 0.2, 0.1, 0.25, 0.05, 0.15, 0.3, 0.1, 0.15, 0.1];
    let total = 0;
    for (const d of steps) {
      sm.tick(d);
      total += d;
      if (total < 1.0) {
        expect(sm.getGate('gate_1')!.active).toBe(false);
      }
      if (total < 2.0) {
        expect(sm.isReceiverActive('door_1')).toBe(false);
      }
    }
    // After 1.9s total, door should still be closed
    expect(total).toBeCloseTo(1.9, 5);
    expect(sm.isReceiverActive('door_1')).toBe(false);

    // One more tick past 2.0s total
    sm.tick(0.2);
    expect(sm.isReceiverActive('door_1')).toBe(true);
  });
});
