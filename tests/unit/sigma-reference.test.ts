import { describe, expect, it } from 'vitest';
import {
  describeSigmaField,
  fieldsForLogSource,
  isKnownLogSourceValue,
  isLocalTestModifier,
  logSourceCategories,
  logSourceIsEmpty,
  logSourceKey,
  logSourceProducts,
  logSourceServices,
  logSourceSummary,
  modifierByName,
  normalizeSigmaReference,
  searchFields,
  searchLogSources,
  searchModifiers,
  SIGMA_LOCAL_TEST_MODIFIERS,
  SIGMA_MAX_REFERENCE_RESULTS,
  SIGMA_REFERENCE_DATASET,
  SigmaReferenceError,
  type SigmaReferenceDataset,
} from '@/core/rules/sigma-reference';

const EMPTY_DESCRIPTION = '';

function logSource(product: string, category: string, service: string) {
  return { product, category, service, description: EMPTY_DESCRIPTION };
}

const MINI_DATASET: SigmaReferenceDataset = {
  schemaVersion: 1,
  specVersion: 'test',
  released: '2026-01-01',
  retrieved: '2026-01-02',
  source: 'https://example.test/sigma',
  sourcePath: 'taxonomy.md',
  sourceSha256: 'a'.repeat(64),
  modifiersPath: 'modifiers.md',
  modifiersSha256: 'b'.repeat(64),
  license: 'public domain',
  logSources: [
    logSource('windows', 'process_creation', ''),
    logSource('linux', 'process_creation', ''),
    logSource('windows', 'file_event', ''),
    logSource('windows', '', 'security'),
    logSource('', 'proxy', ''),
    logSource('', 'network', 'dns'),
    logSource('', 'network', 'connection'),
    logSource('', 'firewall', ''),
  ],
  fields: [
    {
      name: 'Image',
      description: 'Executable path',
      example: 'C:\\Windows\\System32\\cmd.exe',
      categories: ['process_creation'],
      products: [],
      services: [],
    },
    {
      name: 'CommandLine',
      description: 'Full command line',
      example: 'cmd.exe /c whoami',
      categories: ['process_creation'],
      products: [],
      services: [],
    },
    {
      name: 'EventID',
      description: 'Windows event id',
      example: '4688',
      categories: [],
      products: ['windows'],
      services: [],
    },
    {
      name: 'c-uri',
      description: 'Requested URL',
      example: '/index.html',
      categories: ['proxy'],
      products: [],
      services: [],
    },
    {
      name: 'src_ip',
      description: 'Source address',
      example: '10.0.0.1',
      categories: ['firewall'],
      products: [],
      services: [],
    },
    {
      name: 'dns.question.name',
      description: 'DNS question',
      example: 'example.test',
      categories: ['network'],
      products: [],
      services: ['dns'],
    },
    {
      name: 'network.state',
      description: 'Connection state',
      example: 'S0',
      categories: ['network'],
      products: [],
      services: ['connection'],
    },
  ],
  modifiers: [
    { name: 'all', group: 'Generic', description: 'AND values' },
    { name: 'contains', group: 'Generic', description: 'Match anywhere' },
    { name: 'cased', group: 'Generic', description: 'Case-sensitive' },
    { name: 're', group: 'String', description: 'Regular expression' },
    { name: 'base64', group: 'String', description: 'Base64 encode' },
    { name: 'gt', group: 'Numeric', description: 'Greater than' },
  ],
};

describe('vendored Sigma reference dataset', () => {
  it('carries specification version, provenance, and checksums', () => {
    expect(SIGMA_REFERENCE_DATASET.schemaVersion).toBe(1);
    expect(SIGMA_REFERENCE_DATASET.specVersion).toBe('2.1.0');
    expect(SIGMA_REFERENCE_DATASET.released).toBe('2025-08-02');
    expect(SIGMA_REFERENCE_DATASET.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(SIGMA_REFERENCE_DATASET.source).toContain('github.com/SigmaHQ/sigma-specification');
    expect(SIGMA_REFERENCE_DATASET.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(SIGMA_REFERENCE_DATASET.modifiersSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('has unique logsources and usable field and modifier lists', () => {
    const keys = SIGMA_REFERENCE_DATASET.logSources.map(logSourceKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(SIGMA_REFERENCE_DATASET.logSources.length).toBeGreaterThan(100);
    expect(SIGMA_REFERENCE_DATASET.fields.length).toBeGreaterThan(80);
    expect(SIGMA_REFERENCE_DATASET.modifiers.length).toBeGreaterThan(20);
  });

  it('contains known logsources, fields, and modifiers', () => {
    expect(
      SIGMA_REFERENCE_DATASET.logSources.find(
        (entry) => entry.product === 'windows' && entry.category === 'process_creation',
      ),
    ).toMatchObject({ description: expect.stringContaining('EventID: 1') });
    expect(
      SIGMA_REFERENCE_DATASET.logSources.find(
        (entry) => entry.product === 'windows' && entry.service === 'security',
      ),
    ).toMatchObject({ description: expect.stringContaining('Security') });
    expect(describeSigmaField('Image')).toMatchObject({ categories: ['process_creation'] });
    expect(modifierByName('contains')).toMatchObject({ group: 'Generic Modifiers' });
    expect(modifierByName('base64')).toMatchObject({ group: 'String Modifiers' });
  });
});

describe('logSourceSummary', () => {
  it('lists the non-empty parts in a stable order', () => {
    expect(logSourceSummary(logSource('windows', 'process_creation', ''))).toBe(
      'category: process_creation · product: windows',
    );
    expect(logSourceSummary(logSource('', '', 'security'))).toBe('service: security');
    expect(logSourceSummary(logSource('', '', ''))).toBe('');
  });

  it('detects empty logsource rows', () => {
    expect(logSourceIsEmpty(logSource('', '', ''))).toBe(true);
    expect(logSourceIsEmpty(logSource('', 'proxy', ''))).toBe(false);
  });
});

describe('searchLogSources', () => {
  it('ranks exact values before prefixes and substrings', () => {
    const results = searchLogSources('process_creation', {}, MINI_DATASET);
    expect(results.map(logSourceKey)).toEqual([
      'linux|process_creation|',
      'windows|process_creation|',
    ]);
  });

  it('matches products, categories, services, and descriptions', () => {
    expect(searchLogSources('linux', {}, MINI_DATASET).map(logSourceKey)).toEqual([
      'linux|process_creation|',
    ]);
    expect(searchLogSources('dns', {}, MINI_DATASET).map(logSourceKey)).toEqual([
      '|network|dns',
    ]);
  });

  it('applies exact filters', () => {
    expect(
      searchLogSources('', { product: 'windows', category: 'process_creation' }, MINI_DATASET).map(
        logSourceKey,
      ),
    ).toEqual(['windows|process_creation|']);
    expect(searchLogSources('', { service: 'security' }, MINI_DATASET).map(logSourceKey)).toEqual([
      'windows||security',
    ]);
    expect(searchLogSources('', { product: 'linux', service: 'dns' }, MINI_DATASET)).toEqual([]);
  });

  it('sorts unfiltered results by key and respects the limit', () => {
    const results = searchLogSources('', { limit: 3 }, MINI_DATASET);
    expect(results).toHaveLength(3);
    expect(results.map(logSourceKey)).toEqual([
      '|firewall|',
      '|network|connection',
      '|network|dns',
    ]);
  });

  it('bounds limits and returns nothing for a missing query', () => {
    expect(searchLogSources('', { limit: 0 }, MINI_DATASET)).toHaveLength(1);
    expect(searchLogSources('', { limit: 100_000 }, MINI_DATASET)).toHaveLength(
      MINI_DATASET.logSources.length,
    );
    expect(searchLogSources('no-such-source', {}, MINI_DATASET)).toEqual([]);
  });

  it('caps results at the reference maximum', () => {
    const many = Array.from({ length: SIGMA_MAX_REFERENCE_RESULTS + 20 }, (_, index) =>
      logSource('', 'category', `service_${index}`),
    );
    expect(
      searchLogSources('', { limit: 100_000 }, { ...MINI_DATASET, logSources: many }),
    ).toHaveLength(SIGMA_MAX_REFERENCE_RESULTS);
  });
});

describe('logsource value lists', () => {
  it('lists unique sorted products, categories, and services', () => {
    expect(logSourceProducts(MINI_DATASET)).toEqual(['linux', 'windows']);
    expect(logSourceCategories(MINI_DATASET)).toEqual([
      'file_event',
      'firewall',
      'network',
      'process_creation',
      'proxy',
    ]);
    expect(logSourceServices({}, MINI_DATASET)).toEqual([
      'connection',
      'dns',
      'security',
    ]);
    expect(logSourceServices({ product: 'windows' }, MINI_DATASET)).toEqual(['security']);
    expect(logSourceServices({ category: 'network' }, MINI_DATASET)).toEqual([
      'connection',
      'dns',
    ]);
  });

  it('checks known values without treating an empty value as unknown', () => {
    expect(isKnownLogSourceValue('product', 'windows', MINI_DATASET)).toBe(true);
    expect(isKnownLogSourceValue('product', ' WINDOWS ', MINI_DATASET)).toBe(true);
    expect(isKnownLogSourceValue('category', 'proxy', MINI_DATASET)).toBe(true);
    expect(isKnownLogSourceValue('service', 'security', MINI_DATASET)).toBe(true);
    expect(isKnownLogSourceValue('service', 'unknown', MINI_DATASET)).toBe(false);
    expect(isKnownLogSourceValue('product', '', MINI_DATASET)).toBe(true);
  });
});

describe('fieldsForLogSource', () => {
  it('returns category and matching product fields for process creation', () => {
    expect(
      fieldsForLogSource(logSource('windows', 'process_creation', ''), MINI_DATASET).map(
        (field) => field.name,
      ),
    ).toEqual(['CommandLine', 'EventID', 'Image']);
    expect(
      fieldsForLogSource(logSource('linux', 'process_creation', ''), MINI_DATASET).map(
        (field) => field.name,
      ),
    ).toEqual(['CommandLine', 'Image']);
  });

  it('matches product fields', () => {
    expect(
      fieldsForLogSource(logSource('windows', '', 'security'), MINI_DATASET).map(
        (field) => field.name,
      ),
    ).toEqual(['EventID']);
  });

  it('requires service-specific network fields to match the service', () => {
    expect(
      fieldsForLogSource(logSource('', 'network', 'dns'), MINI_DATASET).map((field) => field.name),
    ).toEqual(['dns.question.name']);
    expect(
      fieldsForLogSource(logSource('', 'network', 'connection'), MINI_DATASET).map(
        (field) => field.name,
      ),
    ).toEqual(['network.state']);
  });

  it('returns nothing for an empty logsource', () => {
    expect(fieldsForLogSource(logSource('', '', ''), MINI_DATASET)).toEqual([]);
  });
});

describe('searchFields', () => {
  it('searches names, descriptions, and examples', () => {
    expect(searchFields('image', {}, MINI_DATASET).map((field) => field.name)).toEqual(['Image']);
    expect(searchFields('full command', {}, MINI_DATASET).map((field) => field.name)).toEqual([
      'CommandLine',
    ]);
    expect(searchFields('whoami', {}, MINI_DATASET).map((field) => field.name)).toEqual([
      'CommandLine',
    ]);
  });

  it('filters by logsource or category', () => {
    expect(
      searchFields('', { logSource: logSource('', 'proxy', '') }, MINI_DATASET).map(
        (field) => field.name,
      ),
    ).toEqual(['c-uri']);
    expect(searchFields('', { category: 'firewall' }, MINI_DATASET).map((field) => field.name)).toEqual([
      'src_ip',
    ]);
  });

  it('bounds results', () => {
    expect(searchFields('', { limit: 2 }, MINI_DATASET)).toHaveLength(2);
    expect(searchFields('', { limit: 0 }, MINI_DATASET)).toHaveLength(1);
    expect(searchFields('no-such-field', {}, MINI_DATASET)).toEqual([]);
  });

  it('describes fields case-insensitively', () => {
    expect(describeSigmaField(' image ', MINI_DATASET)).toMatchObject({ name: 'Image' });
    expect(describeSigmaField('missing', MINI_DATASET)).toBeNull();
    expect(describeSigmaField('', MINI_DATASET)).toBeNull();
  });
});

describe('modifiers', () => {
  it('marks the documented local-test subset', () => {
    expect([...SIGMA_LOCAL_TEST_MODIFIERS].sort()).toEqual([
      'all',
      'any',
      'cased',
      'contains',
      'endswith',
      'startswith',
    ]);
    expect(isLocalTestModifier('contains')).toBe(true);
    expect(isLocalTestModifier(' CONTAINS ')).toBe(true);
    expect(isLocalTestModifier('base64')).toBe(false);
  });

  it('searches names, groups, and descriptions', () => {
    expect(searchModifiers('base64', {}, MINI_DATASET).map((modifier) => modifier.name)).toEqual([
      'base64',
    ]);
    expect(searchModifiers('numeric', {}, MINI_DATASET).map((modifier) => modifier.name)).toEqual([
      'gt',
    ]);
    expect(searchModifiers('regular', {}, MINI_DATASET).map((modifier) => modifier.name)).toEqual([
      're',
    ]);
  });

  it('filters by local-test support and bounds results', () => {
    expect(
      searchModifiers('', { localTestOnly: true }, MINI_DATASET).map((modifier) => modifier.name),
    ).toEqual(['all', 'contains', 'cased']);
    expect(
      searchModifiers('', { localTestOnly: false }, MINI_DATASET).map((modifier) => modifier.name),
    ).toEqual(['re', 'base64', 'gt']);
    expect(searchModifiers('', { limit: 2 }, MINI_DATASET)).toHaveLength(2);
    expect(searchModifiers('', { limit: 0 }, MINI_DATASET)).toHaveLength(1);
    expect(searchModifiers('missing', {}, MINI_DATASET)).toEqual([]);
  });

  it('looks up a modifier by name', () => {
    expect(modifierByName(' re ', MINI_DATASET)).toMatchObject({ name: 're' });
    expect(modifierByName('missing', MINI_DATASET)).toBeNull();
    expect(modifierByName('', MINI_DATASET)).toBeNull();
  });
});

describe('normalizeSigmaReference', () => {
  const base = {
    schemaVersion: 1,
    specVersion: '9.9',
    released: '2026-01-01',
    retrieved: '2026-01-02',
    source: 'https://example.test',
    sourcePath: 'taxonomy.md',
    sourceSha256: 'a'.repeat(64),
    modifiersPath: 'modifiers.md',
    modifiersSha256: 'b'.repeat(64),
    license: 'public domain',
    logSources: [
      { product: ' Windows ', category: ' Process_Creation ', service: '', description: ' one ' },
      { product: 'windows', category: 'process_creation', service: '', description: 'duplicate' },
      { product: '', category: '', service: '' },
      { product: 'linux', category: '', service: 'auth' },
      'not-an-object',
    ],
    fields: [
      { name: ' Image ', categories: ['Process_Creation'] },
      { name: 'Image', categories: ['process_creation'] },
      { name: '', categories: ['process_creation'] },
      { name: 'NoSelector' },
      { name: 'EventID', products: ['Windows'], services: ['Security'] },
    ],
    modifiers: [
      { name: ' Contains ', group: 'Generic', description: 'x' },
      { name: 'contains', group: 'Duplicate', description: 'y' },
      { name: '' },
    ],
  };

  it('normalizes case and drops malformed or duplicate entries', () => {
    const dataset = normalizeSigmaReference(base);
    expect(dataset.specVersion).toBe('9.9');
    expect(dataset.logSources).toEqual([
      { product: 'windows', category: 'process_creation', service: '', description: 'one' },
      { product: 'linux', category: '', service: 'auth', description: '' },
    ]);
    expect(dataset.fields).toEqual([
      {
        name: 'Image',
        description: '',
        example: '',
        categories: ['process_creation'],
        products: [],
        services: [],
      },
      {
        name: 'EventID',
        description: '',
        example: '',
        categories: [],
        products: ['windows'],
        services: ['security'],
      },
    ]);
    expect(dataset.modifiers).toEqual([
      { name: 'contains', group: 'Generic', description: 'x' },
    ]);
  });

  it('rejects a bad schema version, a missing version, and non-objects', () => {
    expect(() => normalizeSigmaReference({ ...base, schemaVersion: 2 })).toThrow(/schema version/u);
    expect(() => normalizeSigmaReference({ ...base, specVersion: ' ' })).toThrow(/no specification/u);
    expect(() => normalizeSigmaReference(null)).toThrow(SigmaReferenceError);
    expect(() => normalizeSigmaReference([])).toThrow(SigmaReferenceError);
  });
});
