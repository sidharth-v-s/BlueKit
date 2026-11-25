import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { validateSigmaRule } from '@/core/rules/sigma';
import {
  buildSigmaRule,
  emptySigmaBuilderDraft,
  emptySigmaBuilderSelection,
  sigmaBuilderFieldKey,
  SIGMA_BUILDER_MAX_SELECTIONS,
  SIGMA_BUILDER_MAX_TITLE_LENGTH,
  SIGMA_BUILDER_MAX_VALUES,
  SigmaBuilderError,
  type SigmaBuilderDraft,
  type SigmaBuilderSelection,
} from '@/core/rules/sigma-builder';

function selection(overrides: Partial<SigmaBuilderSelection> = {}): SigmaBuilderSelection {
  return {
    name: 'selection',
    field: 'Image',
    modifier: 'endswith',
    cased: false,
    match: 'any',
    negate: false,
    values: ['\\powershell.exe'],
    ...overrides,
  };
}

function draft(overrides: Partial<SigmaBuilderDraft> = {}): SigmaBuilderDraft {
  return {
    ...emptySigmaBuilderDraft({ id: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', date: '2026-11-25' }),
    title: 'Suspicious PowerShell',
    author: 'Analyst',
    description: 'Detects PowerShell with an encoded command.',
    selections: [selection()],
    ...overrides,
  };
}

function parseRule(text: string): Record<string, any> {
  return parse(text) as Record<string, any>;
}

describe('emptySigmaBuilderDraft', () => {
  it('starts with a Windows process-creation logsource and one selection', () => {
    const value = emptySigmaBuilderDraft({ id: 'id-1', date: '2026-11-25' });
    expect(value.id).toBe('id-1');
    expect(value.date).toBe('2026-11-25');
    expect(value.status).toBe('experimental');
    expect(value.level).toBe('medium');
    expect(value.logsource).toEqual({
      product: 'windows',
      category: 'process_creation',
      service: '',
      definition: '',
    });
    expect(value.selections).toHaveLength(1);
    expect(value.selections[0]).toMatchObject({ name: 'selection', values: [''] });
  });

  it('numbers additional selections', () => {
    expect(emptySigmaBuilderSelection(1).name).toBe('selection');
    expect(emptySigmaBuilderSelection(2).name).toBe('selection_2');
  });
});

describe('sigmaBuilderFieldKey', () => {
  it('omits the modifier for equality', () => {
    expect(sigmaBuilderFieldKey(selection({ modifier: 'equals' }))).toBe('Image');
  });

  it('adds the transformation, all, and cased modifiers in order', () => {
    expect(
      sigmaBuilderFieldKey(
        selection({ modifier: 'contains', match: 'all', cased: true, values: ['a', 'b'] }),
      ),
    ).toBe('Image|contains|all|cased');
  });

  it('does not add all for a single value', () => {
    expect(sigmaBuilderFieldKey(selection({ modifier: 'contains', match: 'all' }))).toBe(
      'Image|contains',
    );
  });
});

describe('buildSigmaRule', () => {
  it('builds a rule with metadata, logsource, detection, and condition', () => {
    const result = buildSigmaRule(draft());
    const rule = parseRule(result.text);

    expect(result.text.endsWith('\n')).toBe(true);
    expect(rule.title).toBe('Suspicious PowerShell');
    expect(rule.id).toBe('3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d');
    expect(rule.status).toBe('experimental');
    expect(rule.description).toContain('encoded command');
    expect(rule.author).toBe('Analyst');
    expect(rule.date).toBe('2026-11-25');
    expect(rule.level).toBe('medium');
    expect(rule.logsource).toEqual({ category: 'process_creation', product: 'windows' });
    expect(rule.detection.selection).toEqual({ 'Image|endswith': '\\powershell.exe' });
    expect(rule.detection.condition).toBe('selection');
    expect(result.warnings).toEqual([]);
  });

  it('writes a list for multiple values and an |all key for match all', () => {
    const rule = parseRule(
      buildSigmaRule(
        draft({
          selections: [
            selection({
              name: 'selection_command',
              field: 'CommandLine',
              modifier: 'contains',
              match: 'all',
              values: [' -enc ', ' -nop ', ''],
            }),
          ],
        }),
      ).text,
    );
    expect(rule.detection.selection_command).toEqual({
      'CommandLine|contains|all': [' -enc ', ' -nop '],
    });
  });

  it('chains cased after the transformation', () => {
    const rule = parseRule(
      buildSigmaRule(
        draft({
          selections: [selection({ field: 'Image', modifier: 'contains', cased: true, values: ['cmd'] })],
        }),
      ).text,
    );
    expect(rule.detection.selection).toEqual({ 'Image|contains|cased': 'cmd' });
  });

  it('builds all/any conditions across selections', () => {
    const selections = [
      selection({ name: 'selection_image' }),
      selection({ name: 'selection_command', field: 'CommandLine', modifier: 'contains' }),
    ];
    expect(parseRule(buildSigmaRule(draft({ selections, match: 'all' })).text).detection.condition).toBe(
      '(selection_image and selection_command)',
    );
    expect(parseRule(buildSigmaRule(draft({ selections, match: 'any' })).text).detection.condition).toBe(
      '(selection_image or selection_command)',
    );
  });

  it('negates filters and keeps them out of the positive join', () => {
    const selections = [
      selection({ name: 'selection_image' }),
      selection({ name: 'selection_command', field: 'CommandLine', modifier: 'contains' }),
      selection({ name: 'filter_system', field: 'User', modifier: 'equals', negate: true, values: ['SYSTEM'] }),
    ];
    expect(parseRule(buildSigmaRule(draft({ selections, match: 'any' })).text).detection.condition).toBe(
      '(selection_image or selection_command) and not filter_system',
    );
  });

  it('groups multiple filters under one negation', () => {
    const selections = [
      selection({ name: 'selection_image' }),
      selection({ name: 'filter_system', field: 'User', modifier: 'equals', negate: true, values: ['SYSTEM'] }),
      selection({ name: 'filter_admin', field: 'User', modifier: 'equals', negate: true, values: ['Administrator'] }),
    ];
    expect(parseRule(buildSigmaRule(draft({ selections })).text).detection.condition).toBe(
      'selection_image and not (filter_system or filter_admin)',
    );
  });

  it('trims and de-duplicates metadata lists and drops empty fields', () => {
    const rule = parseRule(
      buildSigmaRule(
        draft({
          id: '',
          status: '',
          description: '',
          author: '',
          date: '',
          level: '',
          references: [' https://a.test ', 'https://a.test', ''],
          tags: [' attack.execution ', 'attack.execution'],
          falsepositives: [' Admin scripts ', 'Admin scripts'],
        }),
      ).text,
    );
    expect(rule.id).toBeUndefined();
    expect(rule.status).toBeUndefined();
    expect(rule.description).toBeUndefined();
    expect(rule.author).toBeUndefined();
    expect(rule.date).toBeUndefined();
    expect(rule.level).toBeUndefined();
    expect(rule.references).toEqual(['https://a.test']);
    expect(rule.tags).toEqual(['attack.execution']);
    expect(rule.falsepositives).toEqual(['Admin scripts']);
  });

  it('includes logsource definition and omits empty keys', () => {
    const rule = parseRule(
      buildSigmaRule(
        draft({
          logsource: {
            product: ' windows ',
            category: '',
            service: 'security',
            definition: ' Security channel ',
          },
        }),
      ).text,
    );
    expect(rule.logsource).toEqual({
      product: 'windows',
      service: 'security',
      definition: 'Security channel',
    });
  });

  it('produces YAML that passes the vendored Sigma schema', () => {
    const result = buildSigmaRule(
      draft({
        selections: [
          selection({ name: 'selection_image', field: 'Image', modifier: 'endswith' }),
          selection({
            name: 'selection_command',
            field: 'CommandLine',
            modifier: 'contains',
            match: 'all',
            cased: true,
            values: [' -enc ', ' -encodedcommand '],
          }),
          selection({
            name: 'filter_system',
            field: 'User',
            modifier: 'equals',
            values: ['SYSTEM'],
            negate: true,
          }),
        ],
        references: ['https://example.test/rule'],
        tags: ['attack.execution', 'attack.t1059.001'],
        falsepositives: ['Legitimate administrative scripts'],
      }),
    );
    const report = validateSigmaRule(result.text);
    expect(report.issues).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it('warns about missing id, author, and description', () => {
    const result = buildSigmaRule(draft({ id: '', author: '', description: '' }));
    expect(result.warnings).toEqual([
      'No rule id. Add one before sharing or importing.',
      'No author.',
      'No description.',
    ]);
  });

  it('rejects missing title, logsource, and selections', () => {
    expect(() => buildSigmaRule(draft({ title: ' ' }))).toThrow(/title is required/u);
    expect(() =>
      buildSigmaRule(draft({ logsource: { product: '', category: '', service: '', definition: '' } })),
    ).toThrow(/at least one of logsource/u);
    expect(() => buildSigmaRule(draft({ selections: [] }))).toThrow(/at least one selection/u);
  });

  it('rejects bad selection names, fields, values, and modifiers', () => {
    expect(() => buildSigmaRule(draft({ selections: [selection({ name: '' })] }))).toThrow(
      /needs a name/u,
    );
    expect(() => buildSigmaRule(draft({ selections: [selection({ name: 'bad-name' })] }))).toThrow(
      /letters, digits, and underscores/u,
    );
    expect(() => buildSigmaRule(draft({ selections: [selection({ name: 'condition' })] }))).toThrow(
      /reserved/u,
    );
    expect(() =>
      buildSigmaRule(
        draft({ selections: [selection({ name: 'one' }), selection({ name: 'one' })] }),
      ),
    ).toThrow(/Duplicate selection name/u);
    expect(() => buildSigmaRule(draft({ selections: [selection({ field: '' })] }))).toThrow(
      /needs a field/u,
    );
    expect(() => buildSigmaRule(draft({ selections: [selection({ field: 'Image|endswith' })] }))).toThrow(
      /Field "Image\|endswith"/u,
    );
    expect(() => buildSigmaRule(draft({ selections: [selection({ values: ['', ''] })] }))).toThrow(
      /needs at least one value/u,
    );
    expect(() =>
      buildSigmaRule(
        draft({
          selections: [selection({ modifier: 'regex' as SigmaBuilderSelection['modifier'] })],
        }),
      ),
    ).toThrow(/Unsupported modifier/u);
  });

  it('rejects a rule with only negated selections', () => {
    expect(() =>
      buildSigmaRule(draft({ selections: [selection({ negate: true })] })),
    ).toThrow(/non-negated selection/u);
  });

  it('rejects an invalid date and an over-long title', () => {
    expect(() => buildSigmaRule(draft({ date: '25-11-2026' }))).toThrow(/YYYY-MM-DD/u);
    expect(() =>
      buildSigmaRule(draft({ title: 'x'.repeat(SIGMA_BUILDER_MAX_TITLE_LENGTH + 1) })),
    ).toThrow(/character limit/u);
  });

  it('bounds selections and values', () => {
    const tooManySelections = Array.from({ length: SIGMA_BUILDER_MAX_SELECTIONS + 1 }, (_, index) =>
      selection({ name: `selection_${index}`, field: 'Image' }),
    );
    expect(() => buildSigmaRule(draft({ selections: tooManySelections }))).toThrow(
      /at most 20 selections/u,
    );

    const tooManyValues = Array.from({ length: SIGMA_BUILDER_MAX_VALUES + 1 }, (_, index) =>
      `value_${index}`,
    );
    expect(() => buildSigmaRule(draft({ selections: [selection({ values: tooManyValues })] }))).toThrow(
      /100 value limit/u,
    );
  });
});
