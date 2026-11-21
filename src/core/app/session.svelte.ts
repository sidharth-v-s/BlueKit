import {
  applyArchive,
  archiveStats,
  exportArchive,
  parseArchive,
  serializeArchive,
  type ArchiveStats,
} from '@/core/export-import/archive';
import { registry } from '@/core/registry';
import { openStorage, type StorageAdapter, type StoreName } from '@/core/storage/db';
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
  type RecentTool,
  type StorageSummary,
} from '@/core/storage/repositories';

export interface AppSettings {
  schemaVersion: 1;
  density: 'compact' | 'comfortable';
  reduceMotion: 'system' | 'reduced';
  sidebarCollapsed: boolean;
  showPlannedTools: boolean;
  externalRequestsRequireConfirmation: true;
}

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  density: 'compact',
  reduceMotion: 'system',
  sidebarCollapsed: false,
  showPlannedTools: true,
  externalRequestsRequireConfirmation: true,
};

export interface WorkspaceTab {
  id: string;
  title: string;
}

const MAX_TABS = 8;

function sanitizeSettings(input: unknown): AppSettings {
  if (typeof input !== 'object' || input === null) return { ...DEFAULT_SETTINGS };
  const candidate = input as Partial<AppSettings>;
  return {
    schemaVersion: 1,
    density: candidate.density === 'comfortable' ? 'comfortable' : 'compact',
    reduceMotion: candidate.reduceMotion === 'reduced' ? 'reduced' : 'system',
    sidebarCollapsed: Boolean(candidate.sidebarCollapsed),
    showPlannedTools: candidate.showPlannedTools !== false,
    externalRequestsRequireConfirmation: true,
  };
}

function tabFor(id: string): WorkspaceTab | null {
  const entry = registry.get(id);
  return entry ? { id, title: entry.manifest.name } : null;
}

/**
 * Session store: settings, favorites, recents, open tabs, and local storage.
 * All state is local. Nothing here touches the network.
 */
class SessionStore {
  adapter: StorageAdapter | null = null;
  ready = $state(false);
  storageNote = $state<string | null>(null);
  storageSummary = $state<StorageSummary | null>(null);
  settings = $state<AppSettings>({ ...DEFAULT_SETTINGS });
  favorites = $state<string[]>([]);
  recents = $state<RecentTool[]>([]);
  tabs = $state<WorkspaceTab[]>([]);
  busy = $state(false);

  get persistenceEnabled(): boolean {
    return this.adapter?.backend === 'indexeddb';
  }

  async init(): Promise<void> {
    const { adapter, note } = await openStorage();
    this.adapter = adapter;
    if (note) this.storageNote = note;

    try {
      const [storedSettings, favorites, recents, tabIds] = await Promise.all([
        readSettings<unknown>(adapter),
        readFavorites(adapter),
        readRecent(adapter),
        readWorkspaceTabs(adapter),
      ]);
      this.settings = sanitizeSettings(storedSettings);
      this.favorites = favorites.filter((id) => registry.has(id));
      this.recents = recents.filter((entry) => registry.has(entry.id));
      this.tabs = tabIds
        .map(tabFor)
        .filter((tab): tab is WorkspaceTab => tab !== null)
        .slice(0, MAX_TABS);
      this.storageSummary = await summarizeStorage(adapter);
    } catch (error) {
      this.storageNote = `Could not load local state: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.ready = true;
    }
  }

  private persist(task: Promise<void>): void {
    task.catch((error: unknown) => {
      this.storageNote = `Local save failed: ${error instanceof Error ? error.message : String(error)}`;
    });
  }

  async saveSettings(patch: Partial<AppSettings>): Promise<void> {
    this.settings = sanitizeSettings({ ...this.settings, ...patch });
    if (this.adapter) this.persist(writeSettings(this.adapter, this.settings));
  }

  isFavorite(id: string): boolean {
    return this.favorites.includes(id);
  }

  toggleFavorite(id: string): void {
    if (!registry.has(id)) return;
    this.favorites = this.isFavorite(id)
      ? this.favorites.filter((favorite) => favorite !== id)
      : [id, ...this.favorites];
    if (this.adapter) this.persist(writeFavorites(this.adapter, this.favorites));
  }

  recordOpen(id: string): void {
    if (!registry.has(id)) return;
    this.openTab(id);
    if (!this.adapter) return;
    this.persist(
      pushRecent(this.adapter, id).then((recent) => {
        this.recents = recent.filter((entry) => registry.has(entry.id));
      }),
    );
  }

  openTab(id: string): void {
    if (!registry.has(id)) return;
    if (!this.tabs.some((tab) => tab.id === id)) {
      const tab = tabFor(id);
      if (!tab) return;
      this.tabs = [...this.tabs, tab].slice(-MAX_TABS);
      this.persistTabs();
    }
  }

  /** Close a tab and return the id that should become active, if any. */
  closeTab(id: string): string | null {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return null;
    const next = [...this.tabs.slice(0, index), ...this.tabs.slice(index + 1)];
    this.tabs = next;
    this.persistTabs();
    return next[Math.min(index, next.length - 1)]?.id ?? null;
  }

  private persistTabs(): void {
    if (this.adapter) this.persist(writeWorkspaceTabs(this.adapter, this.tabs.map((tab) => tab.id)));
  }

  async refreshStorage(): Promise<void> {
    if (this.adapter) this.storageSummary = await summarizeStorage(this.adapter);
  }

  async clearRecentHistory(): Promise<void> {
    this.recents = [];
    if (this.adapter) await clearRecent(this.adapter);
    await this.refreshStorage();
  }

  async clearCachedEnrichment(): Promise<void> {
    if (this.adapter) await this.adapter.clear('enrichmentCache');
    await this.refreshStorage();
  }

  async deleteAllLocalData(): Promise<void> {
    if (!this.adapter) return;
    for (const store of [
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
    ] as const satisfies readonly StoreName[]) {
      await this.adapter.clear(store);
    }
    this.settings = { ...DEFAULT_SETTINGS };
    this.favorites = [];
    this.recents = [];
    this.tabs = [];
    await this.refreshStorage();
  }

  async buildExport(): Promise<{ json: string; stats: ArchiveStats }> {
    if (!this.adapter) throw new Error('Local storage is unavailable.');
    const archive = await exportArchive(this.adapter, '0.1.0');
    const stats = archiveStats(archive);
    return { json: serializeArchive(archive), stats };
  }

  async importFromText(text: string): Promise<ArchiveStats> {
    if (!this.adapter) throw new Error('Local storage is unavailable.');
    const { archive, stats } = parseArchive(text);
    await applyArchive(this.adapter, archive);
    const [storedSettings, favorites, recents, tabIds] = await Promise.all([
      readSettings<unknown>(this.adapter),
      readFavorites(this.adapter),
      readRecent(this.adapter),
      readWorkspaceTabs(this.adapter),
    ]);
    this.settings = sanitizeSettings(storedSettings);
    this.favorites = favorites.filter((id) => registry.has(id));
    this.recents = recents.filter((entry) => registry.has(entry.id));
    this.tabs = tabIds
      .map(tabFor)
      .filter((tab): tab is WorkspaceTab => tab !== null)
      .slice(0, MAX_TABS);
    await this.refreshStorage();
    return stats;
  }
}

export const session = new SessionStore();
