import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_IDS,
  DATA_TYPES,
  type ToolManifest,
} from '@/core/schemas/types';
import { buildRegistry, ToolRegistry } from '@/core/registry';
import { validateManifest } from '@/core/registry/validate';

const validManifest: ToolManifest = {
  id: 'encoding.example-tool',
  name: 'Example Tool',
  version: '1.0.0',
  category: 'encoding',
  description: 'A manifest used only by tests.',
  tags: ['example'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.text }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
};

describe('manifest validation', () => {
  it('accepts a valid manifest', () => {
    expect(validateManifest(validManifest)).toEqual([]);
  });

  it('rejects malformed ids, versions, and categories', () => {
    const problems = validateManifest({
      ...validManifest,
      id: 'Bad Id',
      version: '1.0',
      category: 'nonsense' as ToolManifest['category'],
    });
    expect(problems.join('\n')).toMatch(/id must be dotted lowercase/u);
    expect(problems.join('\n')).toMatch(/not semver-like/u);
    expect(problems.join('\n')).toMatch(/unknown category/u);
  });

  it('requires worker.execute for non-main runtimes', () => {
    const problems = validateManifest({ ...validManifest, runtime: 'worker' });
    expect(problems).toContain(
      'manifest "encoding.example-tool": runtime "worker" requires the "worker.execute" capability.',
    );
  });

  it('requires network.direct for any network posture', () => {
    const problems = validateManifest({ ...validManifest, network: 'optional' });
    expect(problems.join('\n')).toMatch(/requires the "network\.direct" capability/u);
  });

  it('rejects unknown port types and capabilities', () => {
    const problems = validateManifest({
      ...validManifest,
      input: [{ type: 'text/x-nonsense' as ToolManifest['input'][number]['type'] }],
      capabilities: ['root.execute' as ToolManifest['capabilities'][number]],
    });
    expect(problems.join('\n')).toMatch(/unknown port data type/u);
    expect(problems.join('\n')).toMatch(/unknown capability/u);
  });
});

describe('registry', () => {
  it('loads without manifest problems and includes the implemented tools', () => {
    const registry = new ToolRegistry();
    expect(registry.problems).toEqual([]);
    expect(registry.available().map((entry) => entry.manifest.id)).toEqual(
      expect.arrayContaining([
        'encoding.base64-encode',
        'encoding.base64-decode',
        'encoding.hash',
        'email.eml-inspector',
        'email.header-analyzer',
        'email.auth-results',
        'email.url-extractor',
        'email.attachment-extractor',
      ]),
    );
    expect(registry.prototypes().map((entry) => entry.manifest.id)).toEqual(
      expect.arrayContaining(['windows.evtx-probe']),
    );
  });

  it('keeps runner field definitions internally consistent', () => {
    const registry = new ToolRegistry();
    for (const entry of registry.entries) {
      const fields = entry.manifest.ui?.fields ?? [];
      const keys = new Set<string>();
      for (const field of fields) {
        expect(field.key, entry.manifest.id).toMatch(/^[a-z][a-z0-9-]*$/u);
        expect(keys.has(field.key), `${entry.manifest.id} duplicate field ${field.key}`).toBe(false);
        keys.add(field.key);
        if (field.type === 'select') {
          expect(field.options?.length, `${entry.manifest.id} ${field.key} options`).toBeGreaterThan(0);
          if (field.defaultValue !== undefined) {
            expect(
              field.options?.some((option) => option.value === field.defaultValue),
              `${entry.manifest.id} ${field.key} default is not an option`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('keeps planned entries searchable but without an implementation', () => {
    const registry = new ToolRegistry();
    const planned = registry.planned();
    expect(planned.length).toBeGreaterThan(0);
    for (const entry of planned) {
      expect(entry.tool).toBeUndefined();
      expect(entry.manifest.status).toBe('planned');
    }
  });

  it('lets implemented entries win over planned metadata with the same id', () => {
    const result = buildRegistry(
      [
        {
          manifest: validManifest,
          execute: async () => ({ output: null }),
        },
      ],
      [{ ...validManifest, status: 'planned' }],
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.manifest.status).toBe('available');
    expect(result.entries[0]?.tool).toBeDefined();
  });

  it('ranks an exact name match above planned entries', () => {
    const registry = new ToolRegistry();
    const [first] = registry.search('Hash Calculator');
    expect(first?.manifest.id).toBe('encoding.hash');
  });

  it('returns no results for a query that matches nothing', () => {
    const registry = new ToolRegistry();
    expect(registry.search('zzzz-not-a-tool-zzzz')).toEqual([]);
  });

  it('groups categories and reports zero counts for empty categories', () => {
    const registry = new ToolRegistry();
    const counts = registry.categoryCounts();
    expect(Object.keys(counts).sort()).toEqual([...CATEGORY_IDS].sort());
    for (const category of CATEGORIES) {
      expect(counts[category.id]).toBeGreaterThanOrEqual(0);
    }
  });

  it('resolves related tools only when they exist', () => {
    const registry = new ToolRegistry();
    const entry = registry.get('encoding.base64-encode');
    expect(entry).toBeDefined();
    expect(registry.related(entry!).map((related) => related.manifest.id)).toEqual(
      expect.arrayContaining(['encoding.base64-decode', 'encoding.hash']),
    );
  });
});
