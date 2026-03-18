/**
 * SignalManager — centralized signal evaluation for the M2 signal system.
 *
 * Sources (levers, plates, triggers, tripwires) emit boolean signals.
 * Receivers (doors) compute their active state from incoming signals.
 * Gates are both receivers and sources — they transform incoming signals.
 */

export type SignalMode = 'toggle' | 'momentary' | 'one_shot' | 'timed';
export type GateMode = 'or' | 'and' | 'xor';
export type GateType = 'and' | 'or' | 'not' | 'delay' | 'pulse_edge' | 'pulse_repeat';

export interface SignalSource {
  entityId: string;
  targets: string[];       // receiver entity IDs
  signalMode: SignalMode;
  active: boolean;
  fired: boolean;          // for one_shot: already triggered
  duration?: number;       // for timed: total duration in seconds
  timer: number;           // for timed: remaining time
  delay?: number;          // optional activation delay in seconds
  delayTimer: number;      // countdown for pending delayed activation
  delayPending: boolean;   // true while waiting for delay to elapse
}

export interface SignalReceiver {
  entityId: string;
  gateMode: GateMode;
  active: boolean;         // computed state
}

export interface SignalGate {
  entityId: string;
  gateType: GateType;
  targets: string[];       // output receiver entity IDs
  active: boolean;         // computed output
  delay?: number;          // for delay gate
  interval?: number;       // for pulse_repeat gate
  timer: number;           // internal timer for delay/pulse
  pendingActivation: boolean; // for delay: waiting to activate
}

export type ReceiverChangedCallback = (entityId: string, active: boolean) => void;
export type SourceDeactivatedCallback = (entityId: string) => void;

export class SignalManager {
  private sources = new Map<string, SignalSource>();
  private receivers = new Map<string, SignalReceiver>();
  private gates = new Map<string, SignalGate>();
  private onReceiverChanged: ReceiverChangedCallback | null = null;
  private onSourceDeactivated: SourceDeactivatedCallback | null = null;

  setReceiverChangedCallback(cb: ReceiverChangedCallback): void {
    this.onReceiverChanged = cb;
  }

  setSourceDeactivatedCallback(cb: SourceDeactivatedCallback): void {
    this.onSourceDeactivated = cb;
  }

  registerSource(
    entityId: string,
    targets: string[],
    signalMode: SignalMode = 'toggle',
    duration?: number,
    delay?: number,
  ): void {
    this.sources.set(entityId, {
      entityId,
      targets,
      signalMode,
      active: false,
      fired: false,
      duration,
      timer: 0,
      delay,
      delayTimer: 0,
      delayPending: false,
    });
  }

  registerReceiver(entityId: string, gateMode: GateMode = 'or'): void {
    this.receivers.set(entityId, {
      entityId,
      gateMode,
      active: false,
    });
  }

  registerGate(
    entityId: string,
    gateType: GateType,
    targets: string[],
    delay?: number,
    interval?: number,
  ): void {
    this.gates.set(entityId, {
      entityId,
      gateType,
      targets,
      active: false,
      delay,
      interval,
      timer: 0,
      pendingActivation: false,
    });
  }

  setSourceActive(entityId: string, active: boolean): void {
    const source = this.sources.get(entityId);
    if (!source) return;

    // one_shot: ignore re-activation after first fire
    if (source.signalMode === 'one_shot' && source.fired) return;

    // Delayed activation: start countdown instead of activating immediately
    if (active && source.delay && source.delay > 0 && !source.delayPending && !source.active) {
      source.delayPending = true;
      source.delayTimer = source.delay;
      if (source.signalMode === 'one_shot') source.fired = true;
      return; // don't propagate yet — tick() will handle it
    }

    // Cancel pending delay on deactivation
    if (!active) {
      source.delayPending = false;
      source.delayTimer = 0;
    }

    source.active = active;

    if (active && source.signalMode === 'one_shot' && !source.fired) {
      source.fired = true;
    }

    if (active && source.signalMode === 'timed' && source.duration) {
      source.timer = source.duration;
    }

    this.propagate();
  }

  deactivateSource(entityId: string): void {
    const source = this.sources.get(entityId);
    if (!source) return;
    source.active = false;
    source.delayPending = false;
    source.delayTimer = 0;
    this.propagate();
  }

  /** Advance timed sources and delay/pulse gates. */
  tick(delta: number): void {
    let changed = false;

    // Delayed source activation: countdown and activate
    for (const source of this.sources.values()) {
      if (source.delayPending) {
        source.delayTimer -= delta;
        if (source.delayTimer <= 0) {
          source.delayTimer = 0;
          source.delayPending = false;
          source.active = true;
          if (source.signalMode === 'timed' && source.duration) {
            source.timer = source.duration;
          }
          changed = true;
        }
      }
    }

    // Timed sources: countdown and deactivate
    for (const source of this.sources.values()) {
      if (source.signalMode === 'timed' && source.active && source.timer > 0) {
        source.timer -= delta;
        if (source.timer <= 0) {
          source.timer = 0;
          source.active = false;
          changed = true;
          this.onSourceDeactivated?.(source.entityId);
        }
      }
    }

    // Delay gates: countdown and activate output
    for (const gate of this.gates.values()) {
      if (gate.gateType === 'delay' && gate.pendingActivation) {
        gate.timer -= delta;
        if (gate.timer <= 0) {
          gate.timer = 0;
          gate.pendingActivation = false;
          gate.active = true;
          changed = true;
        }
      }
      if (gate.gateType === 'pulse_repeat' && gate.active) {
        gate.timer -= delta;
        if (gate.timer <= 0) {
          gate.timer = gate.interval ?? 1;
          // Re-propagate to pulse the output
          changed = true;
        }
      }
    }

    if (changed) {
      this.propagate();
    }
  }

  isReceiverActive(entityId: string): boolean {
    const receiver = this.receivers.get(entityId);
    return receiver ? receiver.active : false;
  }

  isSourceActive(entityId: string): boolean {
    const source = this.sources.get(entityId);
    return source ? source.active : false;
  }

  getSource(entityId: string): SignalSource | undefined {
    return this.sources.get(entityId);
  }

  getReceiver(entityId: string): SignalReceiver | undefined {
    return this.receivers.get(entityId);
  }

  getGate(entityId: string): SignalGate | undefined {
    return this.gates.get(entityId);
  }

  /** Clear all registrations. */
  clear(): void {
    this.sources.clear();
    this.receivers.clear();
    this.gates.clear();
  }

  /** Save signal state for level snapshot. */
  saveState(): { sources: [string, SignalSource][]; receivers: [string, SignalReceiver][]; gates: [string, SignalGate][] } {
    return {
      sources: Array.from(this.sources.entries()).map(([k, v]) => [k, { ...v }]),
      receivers: Array.from(this.receivers.entries()).map(([k, v]) => [k, { ...v }]),
      gates: Array.from(this.gates.entries()).map(([k, v]) => [k, { ...v }]),
    };
  }

  /** Restore signal state from level snapshot. */
  loadState(state: { sources: [string, SignalSource][]; receivers: [string, SignalReceiver][]; gates: [string, SignalGate][] }): void {
    this.sources.clear();
    for (const [k, v] of state.sources) this.sources.set(k, { ...v });
    this.receivers.clear();
    for (const [k, v] of state.receivers) this.receivers.set(k, { ...v });
    this.gates.clear();
    for (const [k, v] of state.gates) this.gates.set(k, { ...v });
  }

  /** Propagate signal state from sources through gates to receivers. */
  private propagate(): void {
    const visited = new Set<string>();
    this.propagateInternal(visited);
  }

  private propagateInternal(visited: Set<string>): void {
    // 1. Collect source-only inputs for gates (sources → gates)
    const gateInputs = new Map<string, boolean[]>();
    for (const source of this.sources.values()) {
      for (const targetId of source.targets) {
        if (this.gates.has(targetId)) {
          if (!gateInputs.has(targetId)) gateInputs.set(targetId, []);
          gateInputs.get(targetId)!.push(source.active);
        }
      }
    }

    // 2. Evaluate gates (as receivers of source signals)
    for (const gate of this.gates.values()) {
      if (visited.has(gate.entityId)) continue; // cycle detection
      visited.add(gate.entityId);

      const inputs = gateInputs.get(gate.entityId) ?? [];
      const inputActive = inputs.some(v => v);

      switch (gate.gateType) {
        case 'and':
        case 'or': {
          const mode = gate.gateType === 'and' ? 'and' : 'or';
          gate.active = this.evaluateGateMode(mode, inputs);
          break;
        }
        case 'not':
          gate.active = !inputActive;
          break;
        case 'delay':
          if (inputActive && !gate.pendingActivation && !gate.active) {
            gate.pendingActivation = true;
            gate.timer = gate.delay ?? 0;
          }
          if (!inputActive) {
            gate.pendingActivation = false;
            gate.active = false;
          }
          break;
        case 'pulse_edge':
          gate.active = inputActive && !gate.active;
          break;
        case 'pulse_repeat':
          if (inputActive && !gate.active) {
            gate.active = true;
            gate.timer = gate.interval ?? 1;
          }
          if (!inputActive) {
            gate.active = false;
          }
          break;
      }
    }

    // 3. Collect all inputs for receivers (from sources + gates)
    const receiverInputs = new Map<string, boolean[]>();

    for (const source of this.sources.values()) {
      for (const targetId of source.targets) {
        if (this.receivers.has(targetId)) {
          if (!receiverInputs.has(targetId)) receiverInputs.set(targetId, []);
          receiverInputs.get(targetId)!.push(source.active);
        }
      }
    }

    for (const gate of this.gates.values()) {
      for (const targetId of gate.targets) {
        if (this.receivers.has(targetId)) {
          if (!receiverInputs.has(targetId)) receiverInputs.set(targetId, []);
          receiverInputs.get(targetId)!.push(gate.active);
        }
      }
    }

    // 4. Evaluate receivers
    for (const receiver of this.receivers.values()) {
      const inputs = receiverInputs.get(receiver.entityId) ?? [];
      const oldActive = receiver.active;
      receiver.active = this.evaluateGateMode(receiver.gateMode, inputs);

      if (receiver.active !== oldActive) {
        this.onReceiverChanged?.(receiver.entityId, receiver.active);
      }
    }
  }

  private evaluateGateMode(mode: GateMode | 'and' | 'or', inputs: boolean[]): boolean {
    if (inputs.length === 0) return false;

    switch (mode) {
      case 'or':
        return inputs.some(v => v);
      case 'and':
        return inputs.every(v => v);
      case 'xor':
        return inputs.filter(v => v).length % 2 === 1;
      default:
        return inputs.some(v => v);
    }
  }
}
