// Dialog system — loads per-NPC dialog trees, evaluates conditions, executes effects.

import type { GameState } from './gameState';

// --- Dialog data types ---

export interface DialogCondition {
  type: 'hasFlag' | 'hasItem' | 'questStage' | 'statCheck';
  flag?: string;
  itemId?: string;
  questId?: string;
  stage?: string;
  stat?: string;
  min?: number;
}

export interface DialogEffect {
  type: 'setFlag' | 'giveItem' | 'takeItem' | 'startQuest' | 'advanceQuest' | 'openShop';
  flag?: string;
  itemId?: string;
  questId?: string;
}

export interface DialogChoice {
  text: string;
  next: string | null;            // next node ID, or null to end dialog
  conditions?: DialogCondition[];  // all must be true for choice to appear
  effects?: DialogEffect[];        // executed when choice is selected
}

export interface DialogNode {
  speaker?: string;
  text: string;
  choices?: DialogChoice[];        // if present, show as clickable options
  next?: string | null;            // linear advance (used when no choices)
  effects?: DialogEffect[];        // effects applied when node is displayed
  conditions?: DialogCondition[];  // if present, all must be true to show this node
}

export interface DialogTree {
  startNode: string;
  nodes: Record<string, DialogNode>;
}

// --- Condition evaluator ---

export type ConditionEvaluator = (condition: DialogCondition, gameState: GameState) => boolean;

const defaultEvaluators: Record<string, ConditionEvaluator> = {
  hasFlag: (c, gs) => !!c.flag && gs.hasFlag(c.flag),
  hasItem: (c, gs) => {
    if (!c.itemId) return false;
    // Check entity registry for item in backpack or equipped
    const items = gs.entityRegistry.snapshot();
    return items.some(e => e.itemId === c.itemId && (e.location.kind === 'backpack' || e.location.kind === 'equipped'));
  },
  questStage: (_c, _gs) => {
    // Will be implemented by QuestManager in Phase C
    // For now, 'undiscovered' is always true (quest hasn't started)
    return _c.stage === 'undiscovered';
  },
  statCheck: (c, gs) => {
    if (!c.stat || c.min === undefined) return false;
    const val = (gs as unknown as Record<string, number>)[c.stat];
    return typeof val === 'number' && val >= c.min;
  },
};

export function evaluateCondition(condition: DialogCondition, gameState: GameState): boolean {
  const evaluator = defaultEvaluators[condition.type];
  if (!evaluator) return false;
  return evaluator(condition, gameState);
}

export function evaluateConditions(conditions: DialogCondition[] | undefined, gameState: GameState): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every(c => evaluateCondition(c, gameState));
}

// --- Effect executor ---

export type EffectExecutor = (effect: DialogEffect, gameState: GameState) => void;

// External hooks — set by main.ts to wire quest/shop systems
let onStartQuest: ((questId: string) => void) | null = null;
let onAdvanceQuest: ((questId: string) => void) | null = null;
let onOpenShop: ((npcId: string) => void) | null = null;

// The current NPC id being dialogued with
let currentNpcId: string | null = null;

export function setDialogHooks(hooks: {
  onStartQuest?: (questId: string) => void;
  onAdvanceQuest?: (questId: string) => void;
  onOpenShop?: (npcId: string) => void;
}): void {
  if (hooks.onStartQuest) onStartQuest = hooks.onStartQuest;
  if (hooks.onAdvanceQuest) onAdvanceQuest = hooks.onAdvanceQuest;
  if (hooks.onOpenShop) onOpenShop = hooks.onOpenShop;
}

const defaultExecutors: Record<string, EffectExecutor> = {
  setFlag: (e, gs) => { if (e.flag) gs.setFlag(e.flag); },
  giveItem: (e, gs) => {
    if (!e.itemId) return;
    const slot = gs.entityRegistry.nextBackpackSlot();
    if (slot === null) return; // backpack full — item silently not given
    gs.entityRegistry.createItem(e.itemId, 'common', { kind: 'backpack', slot });
  },
  takeItem: (e, gs) => {
    if (!e.itemId) return;
    const items = gs.entityRegistry.snapshot();
    const found = items.find(i => i.itemId === e.itemId && (i.location.kind === 'backpack' || i.location.kind === 'equipped'));
    if (found) {
      gs.entityRegistry.removeItem(found.instanceId);
    }
  },
  startQuest: (e, _gs) => { if (e.questId && onStartQuest) onStartQuest(e.questId); },
  advanceQuest: (e, _gs) => { if (e.questId && onAdvanceQuest) onAdvanceQuest(e.questId); },
  openShop: (_e, _gs) => { if (currentNpcId && onOpenShop) onOpenShop(currentNpcId); },
};

export function executeEffect(effect: DialogEffect, gameState: GameState): void {
  const executor = defaultExecutors[effect.type];
  if (executor) executor(effect, gameState);
}

export function executeEffects(effects: DialogEffect[] | undefined, gameState: GameState): void {
  if (!effects) return;
  for (const effect of effects) {
    executeEffect(effect, gameState);
  }
}

// --- Dialog tree loader + cache ---

const dialogCache = new Map<string, DialogTree>();

export async function loadDialog(npcId: string): Promise<DialogTree> {
  let tree = dialogCache.get(npcId);
  if (tree) return tree;

  const response = await fetch(`/data/dialogs/${npcId}.json`);
  if (!response.ok) {
    throw new Error(`Failed to load dialog for ${npcId}: ${response.status}`);
  }
  tree = (await response.json()) as DialogTree;
  dialogCache.set(npcId, tree);
  return tree;
}

export function clearDialogCache(): void {
  dialogCache.clear();
}

// --- Dialog session state ---

export interface DialogSession {
  npcId: string;
  tree: DialogTree;
  currentNodeId: string;
}

export function startDialog(npcId: string, tree: DialogTree): DialogSession {
  currentNpcId = npcId;
  return { npcId, tree, currentNodeId: tree.startNode };
}

export function getCurrentNode(session: DialogSession): DialogNode | null {
  return session.tree.nodes[session.currentNodeId] ?? null;
}

export function getAvailableChoices(session: DialogSession, gameState: GameState): DialogChoice[] {
  const node = getCurrentNode(session);
  if (!node || !node.choices) return [];
  return node.choices.filter(c => evaluateConditions(c.conditions, gameState));
}

export function selectChoice(session: DialogSession, choiceIndex: number, gameState: GameState): string | null {
  const choices = getAvailableChoices(session, gameState);
  const choice = choices[choiceIndex];
  if (!choice) return null;

  // Execute choice effects
  executeEffects(choice.effects, gameState);

  if (choice.next === null) {
    currentNpcId = null;
    return null; // end dialog
  }

  session.currentNodeId = choice.next;
  // Execute node entry effects for the new node
  const newNode = getCurrentNode(session);
  if (newNode) {
    executeEffects(newNode.effects, gameState);
  }
  return choice.next;
}

export function advanceDialog(session: DialogSession, gameState: GameState): string | null {
  const node = getCurrentNode(session);
  if (!node) return null;

  if (node.next === null || node.next === undefined) {
    currentNpcId = null;
    return null; // end dialog
  }

  session.currentNodeId = node.next;
  const newNode = getCurrentNode(session);
  if (newNode) {
    executeEffects(newNode.effects, gameState);
  }
  return node.next;
}
