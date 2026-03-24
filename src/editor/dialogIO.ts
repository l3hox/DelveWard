import type { DialogTree } from '../core/dialogManager';
import type { QuestDef } from '../core/questManager';

function editorHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (window.__EDITOR_TOKEN) {
    headers['X-Editor-Token'] = window.__EDITOR_TOKEN;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Quest ID list
// ---------------------------------------------------------------------------

let cachedQuestIds: string[] | null = null;

export async function loadQuestIds(): Promise<string[]> {
  if (cachedQuestIds) return cachedQuestIds;
  try {
    const res = await fetch('/api/editor/quests/list', { headers: editorHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    cachedQuestIds = data.ids as string[];
    return cachedQuestIds;
  } catch {
    return [];
  }
}

export function getQuestIds(): string[] {
  return cachedQuestIds ?? [];
}

// ---------------------------------------------------------------------------
// Quest file API
// ---------------------------------------------------------------------------

export async function loadQuestFromServer(questId: string): Promise<QuestDef> {
  const res = await fetch(`/api/editor/quests/load?file=${encodeURIComponent(`${questId}.json`)}`, {
    headers: editorHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Load failed: ${res.status}`);
  }
  return res.json() as Promise<QuestDef>;
}

export async function saveQuestToServer(questId: string, quest: QuestDef): Promise<void> {
  const res = await fetch('/api/editor/quests/save', {
    method: 'POST',
    headers: editorHeaders(),
    body: JSON.stringify({ file: `${questId}.json`, content: JSON.stringify(quest, null, 2) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Save failed: ${res.status}`);
  }
  // Invalidate cached quest IDs so new quests appear in dropdowns
  cachedQuestIds = null;
  await loadQuestIds();
}

// ---------------------------------------------------------------------------
// Dialog file API
// ---------------------------------------------------------------------------

export async function listDialogFiles(): Promise<string[]> {
  const res = await fetch('/api/editor/dialogs/list', { headers: editorHeaders() });
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  const data = await res.json();
  return data.files as string[];
}

export async function loadDialogFromServer(npcId: string): Promise<DialogTree> {
  const res = await fetch(`/api/editor/dialogs/load?file=${encodeURIComponent(`${npcId}.json`)}`, {
    headers: editorHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Load failed: ${res.status}`);
  }
  return res.json() as Promise<DialogTree>;
}

export async function saveDialogToServer(npcId: string, tree: DialogTree): Promise<void> {
  const res = await fetch('/api/editor/dialogs/save', {
    method: 'POST',
    headers: editorHeaders(),
    body: JSON.stringify({ file: `${npcId}.json`, content: JSON.stringify(tree, null, 2) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Save failed: ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Dialog layout API (node positions in the editor canvas)
// ---------------------------------------------------------------------------

export async function loadDialogLayout(
  npcId: string,
): Promise<Record<string, { x: number; y: number }> | null> {
  const res = await fetch(
    `/api/editor/dialogs/load?file=${encodeURIComponent(`${npcId}.layout.json`)}`,
    { headers: editorHeaders() },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Load layout failed: ${res.status}`);
  }
  return res.json() as Promise<Record<string, { x: number; y: number }>>;
}

export async function saveDialogLayout(
  npcId: string,
  layout: Record<string, { x: number; y: number }>,
): Promise<void> {
  const res = await fetch('/api/editor/dialogs/save', {
    method: 'POST',
    headers: editorHeaders(),
    body: JSON.stringify({ file: `${npcId}.layout.json`, content: JSON.stringify(layout, null, 2) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Save layout failed: ${res.status}`);
  }
}
