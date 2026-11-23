import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '@/core/storage/db';
import {
  buildRuleRecord,
  createRulesBundle,
  deleteRuleRecord,
  exportRuleText,
  MAX_RULES_PER_BUNDLE,
  metadataFromReport,
  parseRulesBundle,
  readRuleRecords,
  RuleLibraryError,
  ruleFilename,
  saveRuleRecord,
  serializeRulesBundle,
  type RuleMetadata,
  type RuleRecord,
} from '@/core/rules/library';
import type { SigmaValidationReport } from '@/core/rules/sigma';

const METADATA: RuleMetadata = {
  title: 'Suspicious PowerShell',
  sigmaId: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  status: 'experimental',
  level: 'medium',
  author: 'BlueKit test',
  description: 'Detects encoded PowerShell.',
  logsource: { product: 'windows', category: 'process_creation' },
  tags: ['attack.execution'],
  warnings: ['Local test only.'],
  schemaValid: true,
  schemaSha256: 'a'.repeat(64),
};

const CONTENT = `title: Suspicious PowerShell
logsource:
  product: windows
detection:
  selection:
    Image|endswith: '\\powershell.exe'
  condition: selection
`;

function build(overrides: Partial<Parameters<typeof buildRuleRecord>[0]> = {}): RuleRecord {
  return buildRuleRecord({
    content: CONTENT,
    metadata: METADATA,
    now: new Date('2026-11-23T00:00:00.000Z'),
    ...overrides,
  });
}

describe('rule records', () => {
  it('builds a local record with normalized metadata', () => {
    const record = build();

    expect(record).toMatchObject({
      schemaVersion: 1,
      format: 'sigma',
      title: 'Suspicious PowerShell',
      sigmaId: METADATA.sigmaId,
      source: 'local',
      attribution: null,
      createdAt: '2026-11-23T00:00:00.000Z',
      updatedAt: '2026-11-23T00:00:00.000Z',
      revision: 1,
    });
    expect(record.id.length).toBeGreaterThan(0);
    expect(record.content).toBe(CONTENT);
  });

  it('trims metadata and drops malformed list entries', () => {
    const record = build({
      metadata: {
        ...METADATA,
        title: '  Trimmed  ',
        tags: [' attack.execution ', '', 42 as unknown as string, 'attack.execution'],
        warnings: ['one', 'two', 'three'].slice(0, 40),
      },
    });

    expect(record.title).toBe('Trimmed');
    expect(record.tags).toEqual(['attack.execution']);
  });

  it('rejects empty and oversized content', () => {
    expect(() => build({ content: '   ' })).toThrow(RuleLibraryError);
    expect(() => build({ content: 'a'.repeat(1024 * 1024 + 1) })).toThrow(/limit/u);
  });

  it('updates an existing record without changing its identity', () => {
    const first = build();
    const second = build({
      content: `${CONTENT}    ParentImage|endswith: '\\explorer.exe'\n`,
      previous: first,
      now: new Date('2026-11-23T01:00:00.000Z'),
    });

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBe('2026-11-23T01:00:00.000Z');
    expect(second.revision).toBe(2);
    expect(second.content).toContain('ParentImage');
  });

  it('preserves source and attribution across local edits', () => {
    const imported = build({
      source: 'imported',
      attribution: { source: 'sigma-rules.zip', license: 'DRL-1.1', url: 'https://example.test' },
    });
    const edited = build({ previous: imported });

    expect(edited.source).toBe('imported');
    expect(edited.attribution).toEqual(imported.attribution);
  });
});

describe('rule storage', () => {
  it('saves, lists newest first, and deletes records', async () => {
    const adapter = new MemoryAdapter();
    const older = build({ now: new Date('2026-11-22T00:00:00.000Z') });
    const newer = build({ now: new Date('2026-11-23T00:00:00.000Z'), metadata: { ...METADATA, title: 'Newer' } });

    await saveRuleRecord(adapter, older);
    await saveRuleRecord(adapter, newer);

    const records = await readRuleRecords(adapter);
    expect(records.map((record) => record.title)).toEqual(['Newer', 'Suspicious PowerShell']);

    await deleteRuleRecord(adapter, newer.id);
    expect((await readRuleRecords(adapter)).map((record) => record.id)).toEqual([older.id]);
  });

  it('ignores malformed persisted records instead of crashing the library', async () => {
    const adapter = new MemoryAdapter();
    await adapter.put('rules', 'bad', { id: 'bad', content: 42 });
    await adapter.put('rules', 'empty', { id: 'empty', content: '   ' });
    await adapter.put('rules', 'good', build());

    const records = await readRuleRecords(adapter);
    expect(records).toHaveLength(1);
    expect(records[0]?.title).toBe('Suspicious PowerShell');
  });
});

describe('rule bundles', () => {
  it('round-trips rules with fresh ids and preserved attribution', () => {
    const original = build({
      source: 'imported',
      attribution: { source: 'SigmaHQ rules', license: 'DRL-1.1', url: 'https://github.com/SigmaHQ/sigma' },
    });
    const text = serializeRulesBundle([original], new Date('2026-11-23T02:00:00.000Z'));

    expect(JSON.parse(text)).toMatchObject({
      format: 'bluekit.rules',
      schemaVersion: 1,
      dataHandling: 'local-only',
    });

    const imported = parseRulesBundle(text);
    expect(imported).toHaveLength(1);
    expect(imported[0]?.id).not.toBe(original.id);
    expect(imported[0]?.source).toBe('imported');
    expect(imported[0]?.attribution).toEqual(original.attribution);
    expect(imported[0]?.content).toBe(original.content);
  });

  it('adds a fallback attribution to imported rules without one', () => {
    const text = JSON.stringify(createRulesBundle([build()]));
    const imported = parseRulesBundle(text);
    expect(imported[0]?.attribution?.source).toMatch(/imported BlueKit rule bundle/iu);
  });

  it('rejects malformed bundles', () => {
    const record = build();
    const base = () => createRulesBundle([record]);

    expect(() => parseRulesBundle('not json')).toThrow(/not valid JSON/u);
    expect(() => parseRulesBundle(JSON.stringify({ ...base(), format: 'other' }))).toThrow(
      /Not a BlueKit rule bundle/u,
    );
    expect(() => parseRulesBundle(JSON.stringify({ ...base(), schemaVersion: 99 }))).toThrow(
      /Unsupported rule bundle schema/u,
    );
    expect(() => parseRulesBundle(JSON.stringify({ ...base(), dataHandling: 'uploaded' }))).toThrow(
      /unexpected data handling/u,
    );
    expect(() => parseRulesBundle(JSON.stringify({ ...base(), rules: [] }))).toThrow(/contains no rules/u);
    expect(() => parseRulesBundle(JSON.stringify({ ...base(), rules: [{ content: 42 }] }))).toThrow(
      /missing a valid "content"/u,
    );
    expect(() => parseRulesBundle(JSON.stringify({ ...base(), rules: [{}] }))).toThrow(
      /missing a valid "content"/u,
    );
  });

  it('refuses to export more than the bundle rule limit', () => {
    const record = build();
    expect(() => createRulesBundle(Array.from({ length: MAX_RULES_PER_BUNDLE + 1 }, () => record))).toThrow(
      /export at most/u,
    );
  });
});

describe('rule export text', () => {
  it('prepends attribution and validation metadata to ordinary YAML', () => {
    const record = build({
      source: 'imported',
      attribution: { source: 'SigmaHQ rules', license: 'DRL-1.1', url: 'https://github.com/SigmaHQ/sigma' },
    });
    const text = exportRuleText(record);

    expect(text).toContain('# BlueKit rule export');
    expect(text).toContain('# Source: SigmaHQ rules');
    expect(text).toContain('# License: DRL-1.1');
    expect(text).toContain('# Validation: schema valid');
    expect(text.endsWith(CONTENT)).toBe(true);
  });

  it('does not prepend comments before a YAML directive', () => {
    const content = '%YAML 1.2\n---\ntitle: Directive rule\n';
    const record = build({ content });
    expect(exportRuleText(record)).toBe(content);
  });

  it('creates a safe filename', () => {
    expect(ruleFilename(build({ metadata: { ...METADATA, sigmaId: null, title: 'Suspicious PowerShell / Encoded' } }))).toBe(
      'suspicious-powershell-encoded.yml',
    );
    expect(ruleFilename(build({ metadata: { ...METADATA, sigmaId: null, title: null } }))).toBe('sigma-rule.yml');
  });
});

describe('report metadata', () => {
  it('maps a validation report to library metadata', () => {
    const report: SigmaValidationReport = {
      valid: true,
      schemaValid: true,
      issues: [],
      warnings: ['warning'],
      summary: {
        title: 'Rule',
        id: 'id',
        status: 'test',
        level: 'low',
        author: null,
        description: null,
        logsource: { product: 'windows' },
        condition: 'selection',
        tags: ['attack.execution'],
        detectionKeys: ['selection'],
      },
      schemaTitle: 'schema',
      schemaSha256: 'b'.repeat(64),
      validator: 'ajv',
    };

    expect(metadataFromReport(report)).toMatchObject({
      title: 'Rule',
      sigmaId: 'id',
      tags: ['attack.execution'],
      warnings: ['warning'],
      schemaValid: true,
      schemaSha256: 'b'.repeat(64),
    });
  });
});
