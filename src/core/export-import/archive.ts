import type { StorageAdapter, StoreName } from '@/core/storage/db';

/**
 * Basic local archive export/import (spec §11.4).
 *
 * Phase 1 ships a versioned JSON archive. The `.bluekit` ZIP container with
 * embedded evidence blobs arrives with the investigation workspace; the
 * validation rules (size, entry count, path-like keys, schema version) are
 * implemented here so the format can grow without weakening import safety.
 */

export const ARCHIVE_FORMAT = 'bluekit.archive';
/** v2 adds `ruleRevisions`; v1 archives remain readable. */
export const ARCHIVE_SCHEMA_VERSION = 2;
export const SUPPORTED_ARCHIVE_SCHEMA_VERSIONS: readonly number[] = [1, 2];
export const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
export const MAX_ARCHIVE_RECORDS = 10_000;
export const MAX_KEY_LENGTH = 200;

/**
 * Session-only values (API keys, active inputs) are never persisted, so they
 * cannot leak into an archive by construction. Enrichment cache and import jobs
 * are transient and excluded.
 */
export const EXPORTABLE_STORES = [
  'settings',
  'favorites',
  'recentTools',
  'toolHistory',
  'recipes',
  'recipeRuns',
  'rules',
  'ruleRevisions',
  'ruleCollections',
  'ruleTestCases',
  'investigations',
  'evidenceItems',
  'iocItems',
  'datasetVersions',
] as const satisfies readonly StoreName[];

export interface ArchiveRecord {
  key: string;
  value: unknown;
}

export interface BlueKitArchive {
  format: typeof ARCHIVE_FORMAT;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  dataHandling: 'local-only';
  data: Partial<Record<(typeof EXPORTABLE_STORES)[number], ArchiveRecord[]>>;
}

export interface ArchiveStats {
  records: number;
  stores: number;
  bytes: number;
}

export class ArchiveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveValidationError';
  }
}

export async function exportArchive(adapter: StorageAdapter, appVersion: string): Promise<BlueKitArchive> {
  const data: BlueKitArchive['data'] = {};
  for (const store of EXPORTABLE_STORES) {
    const records = await adapter.getAll(store);
    if (records.length > 0) {
      data[store] = records.map((record) => ({ key: record.key, value: record.value }));
    }
  }
  return {
    format: ARCHIVE_FORMAT,
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    dataHandling: 'local-only',
    data,
  };
}

export function validateArchiveKey(key: unknown): key is string {
  if (typeof key !== 'string') return false;
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) return false;
  if (key.includes('/') || key.includes('\\') || key.includes('..')) return false;
  if (key.startsWith('.')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/u.test(key)) return false;
  return true;
}

export function parseArchive(text: string): { archive: BlueKitArchive; stats: ArchiveStats } {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_ARCHIVE_BYTES) {
    throw new ArchiveValidationError(
      `Archive is ${Math.round(bytes / 1024 / 1024)} MB; the import limit is ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new ArchiveValidationError('File is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ArchiveValidationError('Archive root must be a JSON object.');
  }
  const archive = parsed as Partial<BlueKitArchive>;

  if (archive.format !== ARCHIVE_FORMAT) {
    throw new ArchiveValidationError(`Not a BlueKit archive (expected format "${ARCHIVE_FORMAT}").`);
  }
  if (!SUPPORTED_ARCHIVE_SCHEMA_VERSIONS.includes(archive.schemaVersion as number)) {
    throw new ArchiveValidationError(
      `Unsupported archive schema version ${String(archive.schemaVersion)}; this build reads version ${SUPPORTED_ARCHIVE_SCHEMA_VERSIONS.join(' and ')}.`,
    );
  }
  if (archive.dataHandling !== 'local-only') {
    throw new ArchiveValidationError('Archive declares unexpected data handling.');
  }
  if (typeof archive.data !== 'object' || archive.data === null || Array.isArray(archive.data)) {
    throw new ArchiveValidationError('Archive "data" field must be an object.');
  }

  const allowed = new Set<string>(EXPORTABLE_STORES);
  let records = 0;
  let stores = 0;

  for (const [store, entries] of Object.entries(archive.data)) {
    if (!allowed.has(store)) {
      throw new ArchiveValidationError(`Archive contains an unsupported store "${store}".`);
    }
    if (!Array.isArray(entries)) {
      throw new ArchiveValidationError(`Store "${store}" must contain an array of records.`);
    }
    stores += 1;
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new ArchiveValidationError(`Store "${store}" contains a malformed record.`);
      }
      const record = entry as Partial<ArchiveRecord>;
      if (!validateArchiveKey(record.key)) {
        throw new ArchiveValidationError(`Store "${store}" contains an unsafe record key.`);
      }
      records += 1;
      if (records > MAX_ARCHIVE_RECORDS) {
        throw new ArchiveValidationError(`Archive exceeds the ${MAX_ARCHIVE_RECORDS} record limit.`);
      }
    }
  }

  if (records === 0) {
    throw new ArchiveValidationError('Archive contains no records.');
  }

  return {
    archive: archive as BlueKitArchive,
    stats: { records, stores, bytes },
  };
}

/**
 * Merge an archive into local storage.
 * Destructive "replace all" semantics are intentionally not offered yet.
 */
export async function applyArchive(adapter: StorageAdapter, archive: BlueKitArchive): Promise<ArchiveStats> {
  let records = 0;
  let stores = 0;
  for (const [store, entries] of Object.entries(archive.data)) {
    if (!entries || entries.length === 0) continue;
    stores += 1;
    for (const entry of entries) {
      await adapter.put(store as StoreName, entry.key, entry.value);
      records += 1;
    }
  }
  return { records, stores, bytes: 0 };
}

export function serializeArchive(archive: BlueKitArchive): string {
  return JSON.stringify(archive, null, 2);
}

export function archiveStats(archive: BlueKitArchive): ArchiveStats {
  let records = 0;
  let stores = 0;
  for (const entries of Object.values(archive.data)) {
    if (!entries || entries.length === 0) continue;
    stores += 1;
    records += entries.length;
  }
  return { records, stores, bytes: new TextEncoder().encode(JSON.stringify(archive)).byteLength };
}
