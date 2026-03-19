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
  deactivateAt: number;    // for timed: absolute time to deactivate (0 = not scheduled)
  delay?: number;          // optional activation delay in seconds
  delayFireAt: number;     // absolute time for delayed activation (0 = not scheduled)
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
  fireAt: number;          // absolute time for next gate event (0 = not scheduled)
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
  now = 0;

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
      deactivateAt: 0,
      delay,
      delayFireAt: 0,
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
      fireAt: 0,
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
      source.delayFireAt = this.now + source.delay;
      if (source.signalMode === 'one_shot') source.fired = true;
      return; // don't propagate yet — tick() will handle it
    }

    // Cancel pending delay on deactivation
    if (!active) {
      source.delayPending = false;
      source.delayFireAt = 0;
    }

    source.active = active;

    if (active && source.signalMode === 'one_shot' && !source.fired) {
      source.fired = true;
    }

    if (active && source.signalMode === 'timed' && source.duration) {
      source.deactivateAt = this.now + source.duration;
    }

    this.propagate();
  }

  deactivateSource(entityId: string): void {
    const source = this.sources.get(entityId);
    if (!source) return;
    source.active = false;
    source.delayPending = false;
    source.delayFireAt = 0;
    source.deactivateAt = 0;
    this.propagate();
  }

  /** Advance timed sources and delay/pulse gates. */
  tick(delta: number): void {
    this.now += delta;
    let changed = false;

    // Delayed source activation
    for (const source of this.sources.values()) {
      if (source.delayPending && source.delayFireAt > 0 && this.now >= source.delayFireAt) {
        source.delayPending = false;
        source.active = true;
        if (source.signalMode === 'timed' && source.duration) {
          // Schedule deactivation from INTENDED activation time (not this.now)
          source.deactivateAt = source.delayFireAt + source.duration;
        }
        source.delayFireAt = 0;
        changed = true;
      }
    }

    // Timed sources: deactivate at scheduled time
    for (const source of this.sources.values()) {
      if (source.signalMode === 'timed' && source.active && source.deactivateAt > 0 && this.now >= source.deactivateAt) {
        source.deactivateAt = 0;
        source.active = false;
        changed = true;
        this.onSourceDeactivated?.(source.entityId);
      }
    }

    // Delay gates and pulse repeat gates
    for (const gate of this.gates.values()) {
      if (gate.gateType === 'delay' && gate.pendingActivation && gate.fireAt > 0 && this.now >= gate.fireAt) {
        gate.fireAt = 0;
        gate.pendingActivation = false;
        gate.active = true;
        changed = true;
      }
      if (gate.gateType === 'pulse_repeat' && gate.active && gate.fireAt > 0 && this.now >= gate.fireAt) {
        gate.fireAt = gate.fireAt + (gate.interval ?? 1);  // NOT this.now + interval — drift-free
        changed = true;
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
    this.now = 0;
  }

  /** Save signal state for level snapshot. */
  saveState(): { sources: [string, SignalSource][]; receivers: [string, SignalReceiver][]; gates: [string, SignalGate][]; now: number } {
    return {
      sources: Array.from(this.sources.entries()).map(([k, v]) => [k, { ...v }]),
      receivers: Array.from(this.receivers.entries()).map(([k, v]) => [k, { ...v }]),
      gates: Array.from(this.gates.entries()).map(([k, v]) => [k, { ...v }]),
      now: this.now,
    };
  }

  /** Restore signal state from level snapshot. */
  loadState(state: { sources: [string, SignalSource][]; receivers: [string, SignalReceiver][]; gates: [string, SignalGate][]; now?: number }): void {
    this.now = state.now ?? 0;
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

  private propagateInternal(_visited: Set<string>): void {
    // 1. Topologically sort gates so upstream gates evaluate before downstream.
    //    Gates in cycles are skipped (cycle guard).
    const sortedGates = this.topologicalSortGates();

    // 2. Evaluate gates in order. Each gate collects inputs from sources + upstream gates.
    for (const gate of sortedGates) {
      const inputs: boolean[] = [];
      // Inputs from sources
      for (const source of this.sources.values()) {
        if (source.targets.includes(gate.entityId)) {
          inputs.push(source.active);
        }
      }
      // Inputs from upstream gates (already evaluated)
      for (const other of this.gates.values()) {
        if (other === gate) continue;
        if (other.targets.includes(gate.entityId)) {
          inputs.push(other.active);
        }
      }

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
            gate.fireAt = this.now + (gate.delay ?? 0);
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
            gate.fireAt = this.now + (gate.interval ?? 1);
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

  /** Kahn's algorithm: returns gates in topological order. Gates in cycles are excluded. */
  private topologicalSortGates(): SignalGate[] {
    // Build in-degree counts (only gate→gate edges matter for ordering)
    const inDegree = new Map<string, number>();
    for (const gate of this.gates.values()) {
      if (!inDegree.has(gate.entityId)) inDegree.set(gate.entityId, 0);
    }
    for (const gate of this.gates.values()) {
      for (const targetId of gate.targets) {
        if (this.gates.has(targetId)) {
          inDegree.set(targetId, (inDegree.get(targetId) ?? 0) + 1);
        }
      }
    }

    // Start with gates that have no gate inputs (roots)
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: SignalGate[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      sorted.push(this.gates.get(id)!);
      const gate = this.gates.get(id)!;
      for (const targetId of gate.targets) {
        if (this.gates.has(targetId)) {
          const newDeg = (inDegree.get(targetId) ?? 1) - 1;
          inDegree.set(targetId, newDeg);
          if (newDeg === 0) queue.push(targetId);
        }
      }
    }

    return sorted;
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
