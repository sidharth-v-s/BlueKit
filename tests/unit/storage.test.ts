import { afterEach, describe, expect, it } from 'vitest';
import {
  DATABASE_NAME,
  IndexedDbAdapter,
  MemoryAdapter,
  openStorage,
  STORES,
  type StorageAdapter,
} from '@/core/storage/db';
import {
  clearRecent,
  pushRecent,
  readFavorites,
  readRecent,
  readSettings,
  readWorkspaceTabs,
  summarizeStorage,
  writeFavorites,
  writeSettings,
  writeWorkspaceTabs,
} from '@/core/storage/repositories';

const opened: StorageAdapter[] = [];
const databaseNames: string[] = [];

function uniqueName(): string {
  const name = `${DATABASE_NAME}-test-${Math.random().toString(16).slice(2)}`;
  databaseNames.push(name);
  return name;
}

async function adapter(): Promise<StorageAdapter> {
  const result = await openStorage({ name: uniqueName() });
  opened.push(result.adapter);
  return result.adapter;
}

afterEach(async () => {
  for (const store of opened.splice(0)) store.close();
  await Promise.all(
    databaseNames.splice(0).map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        }),
    ),
  );
});

describe('MemoryAdapter', () => {
  it('supports the storage contract', async () => {
    const store = new MemoryAdapter();
    expect(store.backend).toBe('memory');
    await store.put('settings', 'k', { value: 1 });
    expect(await store.get('settings', 'k')).toEqual({ value: 1 });
    expect(await store.count('settings')).toBe(1);
    expect(await store.getAll('settings')).toHaveLength(1);
    await store.delete('settings', 'k');
    expect(await store.get('settings', 'k')).toBeUndefined();
    await store.put('settings', 'a', 1);
    await store.clear('settings');
    expect(await store.count('settings')).toBe(0);
  });
});

describe('IndexedDbAdapter', () => {
  it('opens every declared store and records the schema version', async () => {
    const store = await adapter();
    expect(store.backend).toBe('indexeddb');
    for (const name of STORES) {
      expect(await store.count(name)).toBe(name === 'meta' ? 1 : 0);
    }
    const schema = await store.get<{ schemaVersion: number }>('meta', 'schema');
    expect(schema?.schemaVersion).toBe(2);
  });

  it('round-trips typed values with timestamps', async () => {
    const store = await adapter();
    await store.put('recipes', 'recipe-1', { steps: ['a', 'b'] });
    const record = await store.getRecord<{ steps: string[] }>('recipes', 'recipe-1');
    expect(record?.value).toEqual({ steps: ['a', 'b'] });
    expect(record?.key).toBe('recipe-1');
    expect(record?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });

  it('upgrades a version 1 database without losing records', async () => {
    const name = uniqueName();
    const v1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORES) {
          if (store !== 'ruleRevisions' && !db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'key' });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('open failed'));
    });
    await new Promise<void>((resolve, reject) => {
      const tx = v1.transaction('rules', 'readwrite');
      tx.objectStore('rules').put({ key: 'r1', value: { content: 'x' }, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('write failed'));
    });
    v1.close();

    const result = await openStorage({ name });
    opened.push(result.adapter);

    expect(result.adapter.backend).toBe('indexeddb');
    expect(await result.adapter.get('rules', 'r1')).toEqual({ content: 'x' });
    expect(await result.adapter.count('ruleRevisions')).toBe(0);
    const schema = await result.adapter.get<{ schemaVersion: number }>('meta', 'schema');
    expect(schema?.schemaVersion).toBe(2);
  });

  it('falls back to memory when IndexedDB cannot open', async () => {
    const result = await openStorage({
      name: uniqueName(),
      // Simulate a browser where IndexedDB exists but is unavailable.
      factory: null as unknown as IDBFactory,
    });
    expect(result.adapter.backend).toBe('memory');
    expect(result.note).toMatch(/persistence is disabled/u);
    result.adapter.close();
  });
});

describe('repositories', () => {
  it('persists settings, favorites, tabs, and recents', async () => {
    const store = await adapter();
    await writeSettings(store, { theme: 'dark', showPlannedTools: false });
    expect(await readSettings(store)).toEqual({ theme: 'dark', showPlannedTools: false });

    await writeFavorites(store, ['encoding.hash', 'encoding.hash', 'email.eml-inspector']);
    expect(await readFavorites(store)).toEqual(['encoding.hash', 'email.eml-inspector']);

    await writeWorkspaceTabs(store, ['encoding.hash', 'encoding.hash', 'windows.evtx-probe']);
    expect(await readWorkspaceTabs(store)).toEqual(['encoding.hash', 'windows.evtx-probe']);

    let recent = await pushRecent(store, 'encoding.hash');
    recent = await pushRecent(store, 'email.eml-inspector');
    expect(recent.map((entry) => entry.id)).toEqual(['email.eml-inspector', 'encoding.hash']);

    recent = await pushRecent(store, 'encoding.hash');
    expect(recent.map((entry) => entry.id)).toEqual(['encoding.hash', 'email.eml-inspector']);
    expect(await readRecent(store)).toHaveLength(2);

    await clearRecent(store);
    expect(await readRecent(store)).toEqual([]);
  });

  it('drops malformed recent records instead of trusting storage', async () => {
    const store = await adapter();
    await store.put('recentTools', 'recent', [
      { id: 'encoding.hash', at: new Date().toISOString() },
      { id: 42 },
      null,
    ]);
    expect(await readRecent(store)).toHaveLength(1);
  });

  it('summarizes counts for the storage settings view', async () => {
    const store = await adapter();
    await writeFavorites(store, ['encoding.hash']);
    const summary = await summarizeStorage(store);
    expect(summary.backend).toBe('indexeddb');
    expect(summary.counts.favorites).toBe(1);
    expect(summary.counts.settings).toBeGreaterThanOrEqual(0);
  });
});
