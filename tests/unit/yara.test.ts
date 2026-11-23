import { describe, expect, it } from 'vitest';
import {
  detectYaraImports,
  emptyYaraScanLimits,
  normalizeYaraScanResult,
  validateYaraSource,
  yaraFileProblem,
  yaraSourceWarnings,
} from '@/core/rules/yara';
import {
  YARA_MAX_FILE_BYTES,
  YARA_MAX_SOURCE_BYTES,
} from '@/core/rules/yara-meta';

describe('YARA source checks', () => {
  it('rejects empty and oversized rule sources', () => {
    expect(validateYaraSource('   ')).toBe('The rule editor is empty.');
    expect(validateYaraSource('rule A { condition: true }')).toBeNull();
    expect(validateYaraSource('a'.repeat(YARA_MAX_SOURCE_BYTES + 1))).toMatch(/editor cap/u);
  });

  it('measures UTF-8 bytes rather than characters', () => {
    expect(validateYaraSource(`rule A { meta: x = "${'é'.repeat(YARA_MAX_SOURCE_BYTES / 2)}" condition: true }`)).toMatch(
      /editor cap/u,
    );
  });
});

describe('YARA imports', () => {
  it('finds top-level imports regardless of indentation', () => {
    const source = 'import "pe"\nimport "hash"\n  import "math"\nrule A { condition: true }';
    expect(detectYaraImports(source)).toEqual(['pe', 'hash', 'math']);
  });

  it('warns about unsupported or undocumented imports and includes', () => {
    const warnings = yaraSourceWarnings('import "vt"\nimport "magic"\ninclude "other.yar"\nrule A { condition: true }');
    expect(warnings.join('\n')).toMatch(/vt/u);
    expect(warnings.join('\n')).toMatch(/magic/u);
    expect(warnings.join('\n')).toMatch(/include/u);
  });

  it('does not warn for documented modules', () => {
    expect(yaraSourceWarnings('import "pe"\nrule A { condition: pe.is_pe }')).toEqual([]);
  });
});

describe('YARA file caps', () => {
  it('rejects empty and oversized files', () => {
    expect(yaraFileProblem('empty.bin', 0)).toMatch(/empty/u);
    expect(yaraFileProblem('large.bin', YARA_MAX_FILE_BYTES + 1)).toMatch(/MiB/u);
    expect(yaraFileProblem('sample.bin', 1024)).toBeNull();
  });

  it('describes the declared limits', () => {
    expect(emptyYaraScanLimits()).toMatchObject({
      maxFileBytes: YARA_MAX_FILE_BYTES,
      maxFiles: 10,
      maxMatchesPerPattern: 20,
    });
  });
});

describe('YARA scan result normalization', () => {
  const data = new TextEncoder().encode('BlueKit');

  it('maps matches, metadata, tags, patterns, offsets, and previews', () => {
    const outcome = normalizeYaraScanResult(
      {
        valid: true,
        errors: [],
        warnings: ['engine warning'],
        matches: [
          {
            identifier: 'Demo',
            namespace: 'default',
            isGlobal: false,
            isPrivate: false,
            tags: ['demo', 42, ' bluekit '],
            metadata: [
              { identifier: 'author', value: 'BlueKit' },
              { identifier: 'score', value: 7 },
              { identifier: 'enabled', value: true },
            ],
            patterns: [
              {
                identifier: '$text',
                kind: 'text',
                isPrivate: false,
                matches: [
                  { offset: 0, length: 4 },
                  { offset: 6, length: 4 },
                ],
              },
            ],
          },
        ],
      },
      { data },
    );

    expect(outcome.valid).toBe(true);
    expect(outcome.warnings).toEqual(['engine warning']);
    expect(outcome.matches).toHaveLength(1);
    expect(outcome.matches[0]).toMatchObject({
      identifier: 'Demo',
      namespace: 'default',
      tags: ['demo', 'bluekit'],
    });
    expect(outcome.matches[0]?.metadata).toEqual([
      { identifier: 'author', value: 'BlueKit' },
      { identifier: 'score', value: 7 },
      { identifier: 'enabled', value: true },
    ]);
    expect(outcome.matches[0]?.patterns[0]?.matches).toEqual([
      { offset: 0, length: 4, preview: '42 6c 75 65', ascii: 'Blue' },
      { offset: 6, length: 4, preview: '74 …', ascii: 't…' },
    ]);
  });

  it('caps rules, patterns, and matches and reports truncation', () => {
    const pattern = {
      identifier: '$a',
      kind: 'text',
      isPrivate: false,
      matches: [
        { offset: 0, length: 1 },
        { offset: 1, length: 1 },
      ],
    };
    const match = { identifier: 'R', patterns: [pattern, pattern] };

    const outcome = normalizeYaraScanResult(
      { valid: true, matches: [match, match] },
      { maxRules: 1, maxPatterns: 1, maxMatches: 1, data },
    );

    expect(outcome.matches).toHaveLength(1);
    expect(outcome.matches[0]?.patterns).toHaveLength(1);
    expect(outcome.matches[0]?.patterns[0]?.matches).toHaveLength(1);
    expect(outcome.matches[0]?.patterns[0]?.totalMatches).toBe(2);
    expect(outcome.matches[0]?.truncated).toBe(true);
    expect(outcome.truncated).toBe(true);
  });

  it('keeps engine errors and invalid state', () => {
    const outcome = normalizeYaraScanResult({
      valid: false,
      errors: ['scan timed out'],
      warnings: [],
      matches: [],
    });
    expect(outcome.valid).toBe(false);
    expect(outcome.errors).toEqual(['scan timed out']);
  });

  it('rejects an unexpected engine payload instead of pretending it scanned', () => {
    expect(normalizeYaraScanResult(null)).toMatchObject({
      valid: false,
      matches: [],
    });
    expect(normalizeYaraScanResult(null).errors[0]).toMatch(/unexpected/u);
  });
});
