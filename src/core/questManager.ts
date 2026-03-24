// Quest system — loads quest definitions, tracks per-quest runtime state, applies rewards.

import type { GameState } from './gameState';
import { setConditionEvaluator } from './dialogManager';
import type { ConditionEvaluator } from './dialogManager';

// --- Quest data types ---

export interface QuestStage {
  description: string;
  rewards?: {
    xp?: number;
    gold?: number;
    items?: string[];
    flags?: string[];
  };
}

export interface QuestDef {
  id: string;
  name: string;
  description: string;
  stages: QuestStage[];
}

// --- Runtime state ---

export type QuestStatus = 'undiscovered' | 'active' | 'complete' | 'failed';

interface QuestRuntimeState {
  status: 'active' | 'complete' | 'failed';
  stageIndex: number;
}

// --- QuestManager ---

export class QuestManager {
  private readonly defs = new Map<string, QuestDef>();
  private readonly state = new Map<string, QuestRuntimeState>();

  async loadQuest(questId: string): Promise<QuestDef> {
    const cached = this.defs.get(questId);
    if (cached) return cached;

    const response = await fetch(`/data/quests/${questId}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load quest ${questId}: ${response.status}`);
    }
    const def = (await response.json()) as QuestDef;
    this.defs.set(questId, def);
    return def;
  }

  getStatus(questId: string): QuestStatus {
    return this.state.get(questId)?.status ?? 'undiscovered';
  }

  startQuest(questId: string): void {
    if (this.state.has(questId)) return;
    this.state.set(questId, { status: 'active', stageIndex: 0 });
  }

  advanceQuest(questId: string, gameState: GameState): void {
    const runtime = this.state.get(questId);
    if (!runtime || runtime.status !== 'active') return;

    const def = this.defs.get(questId);
    if (!def) return;

    // Apply rewards from the current stage before advancing
    const currentStage = def.stages[runtime.stageIndex];
    if (currentStage?.rewards) {
      this._applyRewards(currentStage.rewards, gameState);
    }

    runtime.stageIndex += 1;

    if (runtime.stageIndex >= def.stages.length) {
      runtime.status = 'complete';
    }
  }

  private _applyRewards(
    rewards: NonNullable<QuestStage['rewards']>,
    gameState: GameState,
  ): void {
    if (rewards.xp !== undefined) {
      gameState.addXp(rewards.xp);
    }

    if (rewards.gold !== undefined) {
      gameState.gold += rewards.gold;
    }

    if (rewards.items) {
      for (const itemId of rewards.items) {
        const slot = gameState.entityRegistry.nextBackpackSlot();
        if (slot === null) continue; // backpack full
        gameState.entityRegistry.createItem(itemId, 'common', { kind: 'backpack', slot });
      }
    }

    if (rewards.flags) {
      for (const flag of rewards.flags) {
        gameState.setFlag(flag);
      }
    }
  }

  getStageIndex(questId: string): number {
    return this.state.get(questId)?.stageIndex ?? -1;
  }

  getQuestDef(questId: string): QuestDef | undefined {
    return this.defs.get(questId);
  }

  getActiveQuests(): string[] {
    const result: string[] = [];
    for (const [id, runtime] of this.state) {
      if (runtime.status === 'active') result.push(id);
    }
    return result;
  }

  getCompletedQuests(): string[] {
    const result: string[] = [];
    for (const [id, runtime] of this.state) {
      if (runtime.status === 'complete') result.push(id);
    }
    return result;
  }

  getSerializableState(): Record<string, { status: string; stageIndex: number }> {
    const out: Record<string, { status: string; stageIndex: number }> = {};
    for (const [id, runtime] of this.state) {
      out[id] = { status: runtime.status, stageIndex: runtime.stageIndex };
    }
    return out;
  }

  restoreState(data: Record<string, { status: string; stageIndex: number }>): void {
    this.state.clear();
    for (const [id, entry] of Object.entries(data)) {
      const status = entry.status as 'active' | 'complete' | 'failed';
      this.state.set(id, { status, stageIndex: entry.stageIndex });
    }
  }

  installConditionEvaluator(): void {
    const evaluator: ConditionEvaluator = (condition, _gameState) => {
      if (!condition.questId) return false;
      const status = this.getStatus(condition.questId);
      if (condition.stage === 'undiscovered') return status === 'undiscovered';
      if (condition.stage === 'active') return status === 'active';
      if (condition.stage === 'complete') return status === 'complete';
      if (condition.stage === 'failed') return status === 'failed';
      return false;
    };

    setConditionEvaluator('questStage', evaluator);
  }
}

export const questManager = new QuestManager();
