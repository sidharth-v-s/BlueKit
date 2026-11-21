import type { StorageAdapter } from './db';

/** Typed repositories over the key/value storage adapter. */

export interface RecentTool {
  id: string;
  at: string;
}

export const SETTINGS_KEY = 'app';
export const WORKSPACE_KEY = 'workspace';
export const FAVORITES_KEY = 'toolIds';

export async function readSettings<T>(adapter: StorageAdapter): Promise<T | undefined> {
  return adapter.get<T>('settings', SETTINGS_KEY);
}

export async function writeSettings<T>(adapter: StorageAdapter, value: T): Promise<void> {
  await adapter.put('settings', SETTINGS_KEY, value);
}

export async function readFavorites(adapter: StorageAdapter): Promise<string[]> {
  return (await adapter.get<string[]>('favorites', FAVORITES_KEY)) ?? [];
}

export async function writeFavorites(adapter: StorageAdapter, ids: string[]): Promise<void> {
  await adapter.put('favorites', FAVORITES_KEY, [...new Set(ids)]);
}

export async function readRecent(adapter: StorageAdapter): Promise<RecentTool[]> {
  const recent = (await adapter.get<RecentTool[]>('recentTools', 'recent')) ?? [];
  return recent.filter(
    (entry): entry is RecentTool =>
      typeof entry === 'object' && entry !== null && typeof entry.id === 'string' && typeof entry.at === 'string',
  );
}

export async function pushRecent(
  adapter: StorageAdapter,
  toolId: string,
  limit = 12,
): Promise<RecentTool[]> {
  const current = await readRecent(adapter);
  const next = [{ id: toolId, at: new Date().toISOString() }, ...current.filter((entry) => entry.id !== toolId)].slice(
    0,
    limit,
  );
  await adapter.put('recentTools', 'recent', next);
  return next;
}

export async function clearRecent(adapter: StorageAdapter): Promise<void> {
  await adapter.put('recentTools', 'recent', []);
}

export async function readWorkspaceTabs(adapter: StorageAdapter): Promise<string[]> {
  return (await adapter.get<string[]>('settings', WORKSPACE_KEY)) ?? [];
}

export async function writeWorkspaceTabs(adapter: StorageAdapter, toolIds: string[]): Promise<void> {
  await adapter.put('settings', WORKSPACE_KEY, [...new Set(toolIds)]);
}

export interface StorageSummary {
  backend: StorageAdapter['backend'];
  counts: Record<string, number>;
  usageBytes?: number;
  quotaBytes?: number;
}

export async function summarizeStorage(adapter: StorageAdapter): Promise<StorageSummary> {
  const counts: Record<string, number> = {};
  for (const store of ['settings', 'favorites', 'recipes', 'rules', 'investigations', 'iocItems'] as const) {
    counts[store] = await adapter.count(store);
  }
  let usageBytes: number | undefined;
  let quotaBytes: number | undefined;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      usageBytes = estimate.usage;
      quotaBytes = estimate.quota;
    }
  } catch {
    // Storage estimation is advisory.
  }
  return {
    backend: adapter.backend,
    counts,
    ...(usageBytes !== undefined ? { usageBytes } : {}),
    ...(quotaBytes !== undefined ? { quotaBytes } : {}),
  };
}
