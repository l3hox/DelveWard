import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuestManager } from './questManager';
import type { QuestDef } from './questManager';
import type { GameState } from './gameState';
import { evaluateCondition } from './dialogManager';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDef(id: string, stageCount = 2, lastStageRewards: QuestDef['stages'][number]['rewards'] = {}): QuestDef {
  return {
    id,
    name: `Quest ${id}`,
    description: `Description for ${id}`,
    stages: Array.from({ length: stageCount }, (_, i) => ({
      description: `Stage ${i}`,
      ...(i === stageCount - 1 ? { rewards: lastStageRewards } : {}),
    })),
  };
}

function injectDef(qm: QuestManager, def: QuestDef): void {
  (qm as any).defs.set(def.id, def);
}

function makeMockGameState(): GameState {
  return {
    addXp: vi.fn(),
    gold: 0,
    entityRegistry: {
      nextBackpackSlot: vi.fn(() => 0),
      createItem: vi.fn(),
    },
    setFlag: vi.fn(),
  } as unknown as GameState;
}

// ---------------------------------------------------------------------------
// 1. State transitions
// ---------------------------------------------------------------------------

describe('QuestManager — state transitions', () => {
  let qm: QuestManager;

  beforeEach(() => {
    qm = new QuestManager();
  });

  it('unknown quest returns undiscovered', () => {
    expect(qm.getStatus('nonexistent')).toBe('undiscovered');
  });

  it('startQuest sets status to active at stageIndex 0', () => {
    qm.startQuest('q1');
    expect(qm.getStatus('q1')).toBe('active');
    expect(qm.getStageIndex('q1')).toBe(0);
  });

  it('startQuest is a no-op if quest is already started', () => {
    qm.startQuest('q1');
    // Manually advance to stage 1 via internal state to prove no-op
    (qm as any).state.get('q1').stageIndex = 1;
    qm.startQuest('q1');
    expect(qm.getStageIndex('q1')).toBe(1);
  });

  it('advanceQuest increments stageIndex', () => {
    const def = makeDef('q1', 3);
    injectDef(qm, def);
    qm.startQuest('q1');
    qm.advanceQuest('q1', makeMockGameState());
    expect(qm.getStageIndex('q1')).toBe(1);
  });

  it('advanceQuest completes the quest when past the last stage', () => {
    const def = makeDef('q1', 2);
    injectDef(qm, def);
    qm.startQuest('q1');
    const gs = makeMockGameState();
    qm.advanceQuest('q1', gs); // advances from stage 0 to 1 — still within bounds
    expect(qm.getStatus('q1')).toBe('active');
    qm.advanceQuest('q1', gs); // advances from stage 1 to 2 — past last, marks complete
    expect(qm.getStatus('q1')).toBe('complete');
  });

  it('advanceQuest is a no-op on undiscovered quest', () => {
    const def = makeDef('q1', 2);
    injectDef(qm, def);
    qm.advanceQuest('q1', makeMockGameState());
    expect(qm.getStatus('q1')).toBe('undiscovered');
  });

  it('advanceQuest is a no-op on already-completed quest', () => {
    const def = makeDef('q1', 1);
    injectDef(qm, def);
    qm.startQuest('q1');
    const gs = makeMockGameState();
    qm.advanceQuest('q1', gs); // completes
    expect(qm.getStatus('q1')).toBe('complete');
    qm.advanceQuest('q1', gs); // no-op
    expect(qm.getStatus('q1')).toBe('complete');
    expect(qm.getStageIndex('q1')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Reward application
// ---------------------------------------------------------------------------

describe('QuestManager — reward application', () => {
  let qm: QuestManager;

  beforeEach(() => {
    qm = new QuestManager();
  });

  it('XP reward calls addXp with the correct amount', () => {
    const def = makeDef('q1', 1, { xp: 50 });
    injectDef(qm, def);
    qm.startQuest('q1');
    const gs = makeMockGameState();
    qm.advanceQuest('q1', gs);
    expect(gs.addXp).toHaveBeenCalledWith(50);
  });

  it('gold reward increments gameState.gold', () => {
    const def = makeDef('q1', 1, { gold: 100 });
    injectDef(qm, def);
    qm.startQuest('q1');
    const gs = makeMockGameState();
    qm.advanceQuest('q1', gs);
    expect(gs.gold).toBe(100);
  });

  it('item reward calls nextBackpackSlot and createItem', () => {
    const def = makeDef('q1', 1, { items: ['sword_iron'] });
    injectDef(qm, def);
    qm.startQuest('q1');
    const gs = makeMockGameState();
    qm.advanceQuest('q1', gs);
    expect(gs.entityRegistry.nextBackpackSlot).toHaveBeenCalled();
    expect(gs.entityRegistry.createItem).toHaveBeenCalledWith('sword_iron', 'common', { kind: 'backpack', slot: 0 });
  });

  it('item reward is skipped when backpack is full (nextBackpackSlot returns null)', () => {
    const def = makeDef('q1', 1, { items: ['sword_iron'] });
    injectDef(qm, def);
    qm.startQuest('q1');
    const gs = makeMockGameState();
    (gs.entityRegistry.nextBackpackSlot as ReturnType<typeof vi.fn>).mockReturnValue(null);
    qm.advanceQuest('q1', gs);
    expect(gs.entityRegistry.createItem).not.toHaveBeenCalled();
  });

  it('flag reward calls setFlag for each flag', () => {
    const def = makeDef('q1', 1, { flags: ['quest_done', 'gate_open'] });
    injectDef(qm, def);
    qm.startQuest('q1');
    const gs = makeMockGameState();
    qm.advanceQuest('q1', gs);
    expect(gs.setFlag).toHaveBeenCalledWith('quest_done');
    expect(gs.setFlag).toHaveBeenCalledWith('gate_open');
    expect(gs.setFlag).toHaveBeenCalledTimes(2);
  });

  it('no rewards: none of the reward methods are called', () => {
    const def = makeDef('q1', 1, {});
    injectDef(qm, def);
    qm.startQuest('q1');
    const gs = makeMockGameState();
    qm.advanceQuest('q1', gs);
    expect(gs.addXp).not.toHaveBeenCalled();
    expect(gs.gold).toBe(0);
    expect(gs.entityRegistry.createItem).not.toHaveBeenCalled();
    expect(gs.setFlag).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Serialization roundtrip
// ---------------------------------------------------------------------------

describe('QuestManager — serialization', () => {
  let qm: QuestManager;

  beforeEach(() => {
    qm = new QuestManager();
  });

  it('getSerializableState returns a plain object', () => {
    qm.startQuest('q1');
    const out = qm.getSerializableState();
    expect(out).not.toBeInstanceOf(Map);
    expect(typeof out).toBe('object');
    expect(out['q1']).toEqual({ status: 'active', stageIndex: 0 });
  });

  it('restoreState rebuilds state from a plain object', () => {
    qm.restoreState({ q1: { status: 'active', stageIndex: 2 }, q2: { status: 'complete', stageIndex: 3 } });
    expect(qm.getStatus('q1')).toBe('active');
    expect(qm.getStageIndex('q1')).toBe(2);
    expect(qm.getStatus('q2')).toBe('complete');
    expect(qm.getStageIndex('q2')).toBe(3);
  });

  it('serialization roundtrip preserves status and stageIndex', () => {
    const def = makeDef('q1', 3);
    injectDef(qm, def);
    qm.startQuest('q1');
    qm.advanceQuest('q1', makeMockGameState());

    const snapshot = qm.getSerializableState();

    const qm2 = new QuestManager();
    qm2.restoreState(snapshot);

    expect(qm2.getStatus('q1')).toBe('active');
    expect(qm2.getStageIndex('q1')).toBe(1);
  });

  it('restoreState clears previously tracked quests', () => {
    qm.startQuest('old');
    qm.restoreState({ q1: { status: 'active', stageIndex: 0 } });
    expect(qm.getStatus('old')).toBe('undiscovered');
    expect(qm.getStatus('q1')).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// 4. getActiveQuests / getCompletedQuests
// ---------------------------------------------------------------------------

describe('QuestManager — getActiveQuests / getCompletedQuests', () => {
  let qm: QuestManager;

  beforeEach(() => {
    qm = new QuestManager();
  });

  it('getActiveQuests returns IDs of active quests', () => {
    qm.startQuest('q1');
    qm.startQuest('q2');
    const active = qm.getActiveQuests();
    expect(active).toContain('q1');
    expect(active).toContain('q2');
    expect(active).toHaveLength(2);
  });

  it('getCompletedQuests returns IDs of completed quests', () => {
    const def = makeDef('q1', 1);
    injectDef(qm, def);
    qm.startQuest('q1');
    qm.advanceQuest('q1', makeMockGameState());
    expect(qm.getCompletedQuests()).toContain('q1');
    expect(qm.getCompletedQuests()).toHaveLength(1);
  });

  it('getActiveQuests excludes completed quests', () => {
    const def = makeDef('q1', 1);
    injectDef(qm, def);
    qm.startQuest('q1');
    qm.advanceQuest('q1', makeMockGameState());
    expect(qm.getActiveQuests()).not.toContain('q1');
  });

  it('returns empty arrays when no quests match', () => {
    expect(qm.getActiveQuests()).toEqual([]);
    expect(qm.getCompletedQuests()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. getStageIndex
// ---------------------------------------------------------------------------

describe('QuestManager — getStageIndex', () => {
  let qm: QuestManager;

  beforeEach(() => {
    qm = new QuestManager();
  });

  it('returns -1 for undiscovered quest', () => {
    expect(qm.getStageIndex('q1')).toBe(-1);
  });

  it('returns 0 after startQuest', () => {
    qm.startQuest('q1');
    expect(qm.getStageIndex('q1')).toBe(0);
  });

  it('increments after advanceQuest', () => {
    const def = makeDef('q1', 3);
    injectDef(qm, def);
    qm.startQuest('q1');
    qm.advanceQuest('q1', makeMockGameState());
    expect(qm.getStageIndex('q1')).toBe(1);
    qm.advanceQuest('q1', makeMockGameState());
    expect(qm.getStageIndex('q1')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 6. Condition evaluator integration
// ---------------------------------------------------------------------------

describe('QuestManager — installConditionEvaluator', () => {
  it('questStage condition returns true for undiscovered when quest has not started', () => {
    const qm = new QuestManager();
    qm.installConditionEvaluator();

    const gs = makeMockGameState();
    const condition = { type: 'questStage' as const, questId: 'q1', stage: 'undiscovered' };
    expect(evaluateCondition(condition, gs)).toBe(true);
  });

  it('questStage undiscovered becomes false after startQuest', () => {
    const qm = new QuestManager();
    qm.installConditionEvaluator();

    const gs = makeMockGameState();
    qm.startQuest('q1');

    const condition = { type: 'questStage' as const, questId: 'q1', stage: 'undiscovered' };
    expect(evaluateCondition(condition, gs)).toBe(false);
  });

  it('questStage active is true while quest is in progress', () => {
    const qm = new QuestManager();
    qm.installConditionEvaluator();

    const gs = makeMockGameState();
    qm.startQuest('q1');

    const condition = { type: 'questStage' as const, questId: 'q1', stage: 'active' };
    expect(evaluateCondition(condition, gs)).toBe(true);
  });

  it('questStage complete is true after quest is finished', () => {
    const qm = new QuestManager();
    qm.installConditionEvaluator();

    const def = makeDef('q1', 1);
    injectDef(qm, def);
    qm.startQuest('q1');
    qm.advanceQuest('q1', makeMockGameState());

    const gs = makeMockGameState();
    const condition = { type: 'questStage' as const, questId: 'q1', stage: 'complete' };
    expect(evaluateCondition(condition, gs)).toBe(true);
  });

  it('questStage returns false when questId is missing from condition', () => {
    const qm = new QuestManager();
    qm.installConditionEvaluator();

    const gs = makeMockGameState();
    const condition = { type: 'questStage' as const, stage: 'undiscovered' };
    expect(evaluateCondition(condition, gs)).toBe(false);
  });

  it('questStage returns false for an unrecognised stage value', () => {
    const qm = new QuestManager();
    qm.installConditionEvaluator();

    const gs = makeMockGameState();
    const condition = { type: 'questStage' as const, questId: 'q1', stage: 'in_progress' };
    expect(evaluateCondition(condition, gs)).toBe(false);
  });
});
