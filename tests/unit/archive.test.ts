import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '@/core/storage/db';
import {
  applyArchive,
  archiveStats,
  ArchiveValidationError,
  ARCHIVE_FORMAT,
  ARCHIVE_SCHEMA_VERSION,
  exportArchive,
  parseArchive,
  serializeArchive,
  validateArchiveKey,
  type BlueKitArchive,
} from '@/core/export-import/archive';

async function populatedAdapter(): Promise<MemoryAdapter> {
  const adapter = new MemoryAdapter();
  await adapter.put('settings', 'app', { showPlannedTools: true });
  await adapter.put('favorites', 'toolIds', ['encoding.hash']);
  await adapter.put('enrichmentCache', 'transient', { should: 'not be exported' });
  return adapter;
}

describe('archive keys', () => {
  it('accepts ordinary keys and rejects path-like or control-character keys', () => {
    expect(validateArchiveKey('encoding.hash')).toBe(true);
    expect(validateArchiveKey('toolIds')).toBe(true);
    expect(validateArchiveKey('')).toBe(false);
    expect(validateArchiveKey('../escape')).toBe(false);
    expect(validateArchiveKey('nested/key')).toBe(false);
    expect(validateArchiveKey('nested\\key')).toBe(false);
    expect(validateArchiveKey('.hidden')).toBe(false);
    expect(validateArchiveKey('bad\u0000key')).toBe(false);
    expect(validateArchiveKey(42)).toBe(false);
    expect(validateArchiveKey('x'.repeat(201))).toBe(false);
  });
});

describe('archive export', () => {
  it('exports only allow-listed stores with a local-only declaration', async () => {
    const archive = await exportArchive(await populatedAdapter(), '0.1.0');
    expect(archive.format).toBe(ARCHIVE_FORMAT);
    expect(archive.schemaVersion).toBe(ARCHIVE_SCHEMA_VERSION);
    expect(archive.dataHandling).toBe('local-only');
    expect(archive.data.settings).toEqual([{ key: 'app', value: { showPlannedTools: true } }]);
    expect(archive.data.favorites).toEqual([{ key: 'toolIds', value: ['encoding.hash'] }]);
    expect(archive.data).not.toHaveProperty('enrichmentCache');
  });

  it('reports record and store counts', async () => {
    const archive = await exportArchive(await populatedAdapter(), '0.1.0');
    expect(archiveStats(archive)).toMatchObject({ records: 2, stores: 2 });
  });

  it('includes rule revision snapshots in exports', async () => {
    const adapter = await populatedAdapter();
    await adapter.put('ruleRevisions', 'rule-1:1', { ruleId: 'rule-1', revision: 1 });

    const archive = await exportArchive(adapter, '0.1.0');

    expect(archive.data.ruleRevisions).toEqual([
      { key: 'rule-1:1', value: { ruleId: 'rule-1', revision: 1 } },
    ]);
  });
});

describe('archive import validation', () => {
  const valid = (): BlueKitArchive => ({
    format: ARCHIVE_FORMAT,
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    appVersion: '0.1.0',
    exportedAt: new Date().toISOString(),
    dataHandling: 'local-only',
    data: {
      settings: [{ key: 'app', value: { showPlannedTools: false } }],
    },
  });

  it('round-trips an exported archive through serialization and parsing', async () => {
    const original = await exportArchive(await populatedAdapter(), '0.1.0');
    const text = serializeArchive(original);
    const { archive, stats } = parseArchive(text);
    expect(archive).toEqual(original);
    expect(stats.records).toBe(2);
    expect(stats.stores).toBe(2);
  });

  it('still reads a version 1 archive that predates revision history', () => {
    const text = JSON.stringify({ ...valid(), schemaVersion: 1 });
    const { archive } = parseArchive(text);
    expect(archive.schemaVersion).toBe(1);
    expect(archive.data.settings).toHaveLength(1);
  });

  it('applies a parsed archive to a fresh adapter', async () => {
    const { archive } = parseArchive(serializeArchive(valid()));
    const target = new MemoryAdapter();
    const stats = await applyArchive(target, archive);
    expect(stats).toEqual({ records: 1, stores: 1, bytes: 0 });
    expect(await target.get('settings', 'app')).toEqual({ showPlannedTools: false });
  });

  it.each([
    ['invalid JSON', 'not json', /not valid JSON/u],
    ['wrong root', '[]', /root must be a JSON object/u],
    ['wrong format', JSON.stringify({ ...valid(), format: 'other' }), /Not a BlueKit archive/u],
    ['wrong version', JSON.stringify({ ...valid(), schemaVersion: 99 }), /Unsupported archive schema/u],
    ['wrong handling', JSON.stringify({ ...valid(), dataHandling: 'uploaded' }), /unexpected data handling/u],
    ['missing data', JSON.stringify({ ...valid(), data: null }), /"data" field must be an object/u],
    [
      'unsupported store',
      JSON.stringify({ ...valid(), data: { enrichmentCache: [{ key: 'x', value: 1 }] } }),
      /unsupported store/u,
    ],
    [
      'unsafe key',
      JSON.stringify({ ...valid(), data: { settings: [{ key: '../x', value: 1 }] } }),
      /unsafe record key/u,
    ],
    ['empty data', JSON.stringify({ ...valid(), data: {} }), /contains no records/u],
  ])('rejects %s', (_label, text, message) => {
    expect(() => parseArchive(text)).toThrow(ArchiveValidationError);
    expect(() => parseArchive(text)).toThrow(message);
  });

  it('rejects malformed records inside a store', () => {
    const archive = valid();
    (archive.data as Record<string, unknown>).settings = ['not-an-object'];
    expect(() => parseArchive(JSON.stringify(archive))).toThrow(/malformed record/u);
  });
});
