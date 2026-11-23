import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '@/core/storage/db';
import { buildRuleRecord, type RuleMetadata, type RuleRecord } from '@/core/rules/library';
import {
  deleteRuleRevisions,
  diffRevision,
  MAX_RULE_REVISIONS,
  readRuleRevisions,
  recordRuleRevision,
  restoreRuleRevision,
  revisionFromRecord,
  revisionKey,
} from '@/core/rules/revisions';

const META: RuleMetadata = {
  title: 'Suspicious PowerShell',
  sigmaId: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  status: 'experimental',
  level: 'high',
  author: 'BlueKit tests',
  description: 'Fixture rule',
  logsource: { product: 'windows', category: 'process_creation' },
  tags: ['attack.t1059.001'],
  warnings: [],
  schemaValid: true,
  schemaSha256: 'eb95ddb1',
};

function content(level: string, extra = ''): string {
  return `title: Suspicious PowerShell\nid: 3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d\nlevel: ${level}\n${extra}`;
}

function record(value: string, previous: RuleRecord | null = null): RuleRecord {
  return buildRuleRecord({
    content: value,
    metadata: { ...META, level: /level: (\w+)/u.exec(value)?.[1] ?? 'high' },
    previous,
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

describe('rule revision snapshots', () => {
  it('stores a snapshot for the record revision and reads it back', async () => {
    const adapter = new MemoryAdapter();
    const first = record(content('low'));

    const stored = await recordRuleRevision(adapter, first, new Date('2026-01-02T03:04:05Z'));
    expect(stored).toMatchObject({
      ruleId: first.id,
      revision: 1,
      content: first.content,
      source: 'local',
      recordedAt: '2026-01-02T03:04:05.000Z',
    });
    expect(await adapter.get('ruleRevisions', revisionKey(first.id, 1))).toMatchObject({
      revision: 1,
    });

    const revisions = await readRuleRevisions(adapter, first.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.metadata).toEqual({ ...META, level: 'low' });
  });

  it('overwrites the same revision instead of creating a duplicate', async () => {
    const adapter = new MemoryAdapter();
    const first = record(content('low'));

    await recordRuleRevision(adapter, first);
    await recordRuleRevision(adapter, first);

    expect(await readRuleRevisions(adapter, first.id)).toHaveLength(1);
  });

  it('lists revisions newest first and keeps them scoped to one rule', async () => {
    const adapter = new MemoryAdapter();
    const first = record(content('low'));
    const second = record(content('high'), first);
    const other = record(content('medium'));

    await recordRuleRevision(adapter, first);
    await recordRuleRevision(adapter, second);
    await recordRuleRevision(adapter, other);

    const revisions = await readRuleRevisions(adapter, first.id);
    expect(revisions.map((revision) => revision.revision)).toEqual([2, 1]);
    expect(await readRuleRevisions(adapter, other.id)).toHaveLength(1);
  });

  it('prunes the oldest snapshots beyond the cap', async () => {
    const adapter = new MemoryAdapter();
    let current = record(content('low'));

    for (let index = 0; index < MAX_RULE_REVISIONS + 5; index += 1) {
      if (index > 0) current = record(content(index % 2 === 0 ? 'low' : 'high'), current);
      await recordRuleRevision(adapter, current);
    }

    const revisions = await readRuleRevisions(adapter, current.id);
    expect(revisions).toHaveLength(MAX_RULE_REVISIONS);
    expect(revisions[0]?.revision).toBe(current.revision);
    expect(revisions.at(-1)?.revision).toBe(current.revision - MAX_RULE_REVISIONS + 1);
  });

  it('deletes every snapshot for one rule and leaves other rules alone', async () => {
    const adapter = new MemoryAdapter();
    const first = record(content('low'));
    const other = record(content('high'));
    await recordRuleRevision(adapter, first);
    await recordRuleRevision(adapter, other);

    await deleteRuleRevisions(adapter, first.id);

    expect(await readRuleRevisions(adapter, first.id)).toEqual([]);
    expect(await readRuleRevisions(adapter, other.id)).toHaveLength(1);
  });

  it('ignores malformed or foreign stored snapshots', async () => {
    const adapter = new MemoryAdapter();
    await adapter.put('ruleRevisions', 'bad-1', { ruleId: 'x', revision: 1 });
    await adapter.put('ruleRevisions', 'bad-2', {
      ...revisionFromRecord(record(content('low'))),
      schemaVersion: 99,
    });

    expect(await readRuleRevisions(adapter, 'x')).toEqual([]);
  });
});

describe('rule revision restore and diff', () => {
  it('restores an old revision as a new working revision', async () => {
    const adapter = new MemoryAdapter();
    const first = record(content('low', 'author: first\n'));
    const second = record(content('high', 'author: second\n'), first);
    await recordRuleRevision(adapter, first);
    await recordRuleRevision(adapter, second);

    const [latest, previous] = await readRuleRevisions(adapter, first.id);
    expect(latest?.revision).toBe(2);
    expect(previous?.revision).toBe(1);

    const restored = restoreRuleRevision(second, previous!, new Date('2026-02-01T00:00:00Z'));
    expect(restored).toMatchObject({
      id: first.id,
      revision: 3,
      content: first.content,
      level: 'low',
      author: 'BlueKit tests',
      createdAt: first.createdAt,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });

    await recordRuleRevision(adapter, restored);
    expect((await readRuleRevisions(adapter, first.id)).map((revision) => revision.revision)).toEqual([
      3, 2, 1,
    ]);
  });

  it('rejects a revision that belongs to a different rule', () => {
    const first = record(content('low'));
    const other = record(content('high'));
    const snapshot = revisionFromRecord(other);
    expect(() => restoreRuleRevision(first, snapshot)).toThrow(/different rule/u);
    expect(() => diffRevision(first, snapshot)).toThrow(/different rule/u);
  });

  it('produces a unified diff from the old revision to the current content', async () => {
    const adapter = new MemoryAdapter();
    const first = record(content('low', 'author: first\n'));
    const second = record(content('high', 'author: second\n'), first);
    await recordRuleRevision(adapter, first);

    const [previous] = await readRuleRevisions(adapter, first.id);
    const diff = diffRevision(second, previous!);

    expect(diff.fromRevision).toBe(1);
    expect(diff.toRevision).toBe(2);
    expect(diff.added).toBeGreaterThan(0);
    expect(diff.removed).toBeGreaterThan(0);
    expect(diff.diff).toContain('-level: low');
    expect(diff.diff).toContain('+level: high');
    expect(diff.diff).toContain('-author: first');
    expect(diff.diff).toContain('+author: second');
  });

  it('reports no differences when content is unchanged', async () => {
    const adapter = new MemoryAdapter();
    const first = record(content('low'));
    const second = record(content('low'), first);
    await recordRuleRevision(adapter, first);

    const [previous] = await readRuleRevisions(adapter, first.id);
    const diff = diffRevision(second, previous!);
    expect(diff.diff).toBe('No differences.\n');
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
  });
});
