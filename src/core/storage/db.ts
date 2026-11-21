/**
 * Tiny IndexedDB adapter (spec §11.1).
 *
 * Deliberately small: the app owns its schema, migrations, and failure modes.
 * If IndexedDB is unavailable or fails to open, the app falls back to memory so
 * read-only tools still work; the UI must show that persistence is disabled.
 */

export const DATABASE_NAME = 'bluekit';
export const DATABASE_VERSION = 1;

export const STORES = [
  'meta',
  'settings',
  'favorites',
  'recentTools',
  'toolHistory',
  'recipes',
  'recipeRuns',
  'rules',
  'ruleCollections',
  'ruleTestCases',
  'investigations',
  'evidenceItems',
  'iocItems',
  'enrichmentCache',
  'datasetVersions',
  'importJobs',
] as const;

export type StoreName = (typeof STORES)[number];

export interface StoredRecord<T = unknown> {
  key: string;
  value: T;
  updatedAt: string;
}

export interface StorageAdapter {
  readonly backend: 'indexeddb' | 'memory';
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getRecord<T>(store: StoreName, key: string): Promise<StoredRecord<T> | undefined>;
  getAll<T>(store: StoreName): Promise<StoredRecord<T>[]>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
  count(store: StoreName): Promise<number>;
  close(): void;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IndexedDbAdapter implements StorageAdapter {
  readonly backend = 'indexeddb' as const;
  private constructor(private readonly db: IDBDatabase) {}

  static open(name = DATABASE_NAME, factory: IDBFactory | undefined = globalThis.indexedDB): Promise<IndexedDbAdapter> {
    if (!factory) return Promise.reject(new Error('IndexedDB is not available in this browser.'));
    return new Promise((resolve, reject) => {
      const request = factory.open(name, DATABASE_VERSION);
      request.onupgradeneeded = (event) => migrate(request.result, event.oldVersion, request.transaction);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(new IndexedDbAdapter(db));
      };
      request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
      request.onblocked = () =>
        reject(new Error('IndexedDB upgrade is blocked by another open BlueKit tab. Close it and reload.'));
    });
  }

  async getRecord<T>(store: StoreName, key: string): Promise<StoredRecord<T> | undefined> {
    const tx = this.db.transaction(store, 'readonly');
    const result = await requestToPromise(tx.objectStore(store).get(key) as IDBRequest<StoredRecord<T> | undefined>);
    return result;
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return (await this.getRecord<T>(store, key))?.value;
  }

  async getAll<T>(store: StoreName): Promise<StoredRecord<T>[]> {
    const tx = this.db.transaction(store, 'readonly');
    return requestToPromise(tx.objectStore(store).getAll() as IDBRequest<StoredRecord<T>[]>);
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).put({ key, value, updatedAt: new Date().toISOString() } satisfies StoredRecord<T>);
    await transactionDone(tx);
  }

  async delete(store: StoreName, key: string): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    await transactionDone(tx);
  }

  async clear(store: StoreName): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    await transactionDone(tx);
  }

  async count(store: StoreName): Promise<number> {
    const tx = this.db.transaction(store, 'readonly');
    return requestToPromise(tx.objectStore(store).count());
  }

  close(): void {
    this.db.close();
  }
}

export class MemoryAdapter implements StorageAdapter {
  readonly backend = 'memory' as const;
  private data = new Map<StoreName, Map<string, StoredRecord>>();

  private store(name: StoreName): Map<string, StoredRecord> {
    let map = this.data.get(name);
    if (!map) {
      map = new Map();
      this.data.set(name, map);
    }
    return map;
  }

  async getRecord<T>(store: StoreName, key: string): Promise<StoredRecord<T> | undefined> {
    return this.store(store).get(key) as StoredRecord<T> | undefined;
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return (await this.getRecord<T>(store, key))?.value;
  }

  async getAll<T>(store: StoreName): Promise<StoredRecord<T>[]> {
    return [...this.store(store).values()] as StoredRecord<T>[];
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    this.store(store).set(key, { key, value, updatedAt: new Date().toISOString() });
  }

  async delete(store: StoreName, key: string): Promise<void> {
    this.store(store).delete(key);
  }

  async clear(store: StoreName): Promise<void> {
    this.store(store).clear();
  }

  async count(store: StoreName): Promise<number> {
    return this.store(store).size;
  }

  close(): void {
    this.data.clear();
  }
}

function migrate(db: IDBDatabase, oldVersion: number, transaction: IDBTransaction | null): void {
  // v1: create every logical store. Future versions add stores/indexes here and
  // must keep existing user data intact (spec §11.2, §13.3).
  for (const store of STORES) {
    if (!db.objectStoreNames.contains(store)) {
      db.createObjectStore(store, { keyPath: 'key' });
    }
  }

  if (oldVersion === 0) {
    const meta = transaction?.objectStore('meta');
    meta?.put({
      key: 'schema',
      value: { schemaVersion: DATABASE_VERSION, createdAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    } satisfies StoredRecord);
  }
}

export interface OpenStorageResult {
  adapter: StorageAdapter;
  note?: string;
}

/** Open IndexedDB, falling back to memory. Never throws. */
export async function openStorage(
  options: { name?: string; factory?: IDBFactory } = {},
): Promise<OpenStorageResult> {
  try {
    const adapter = await IndexedDbAdapter.open(options.name ?? DATABASE_NAME, options.factory);
    return { adapter };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      adapter: new MemoryAdapter(),
      note: `Local persistence is disabled for this session (${reason}). Export your work before closing the tab.`,
    };
  }
}
