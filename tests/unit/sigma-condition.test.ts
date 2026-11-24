import { describe, expect, it } from 'vitest';
import {
  appendSigmaSelection,
  readSigmaCondition,
  SigmaEditError,
  sigmaConditionPresets,
  SIGMA_MAX_CONDITION_LENGTH,
  updateSigmaCondition,
} from '@/core/rules/sigma-edit';

const RULE = `title: Test rule
detection:
  selection_image:
    Image|endswith: '\\\\powershell.exe'
  selection_command:
    CommandLine|contains: ' -enc '
  filter_system:
    User: SYSTEM
  condition: selection_image and selection_command
  timeframe: 5m
`;

describe('readSigmaCondition', () => {
  it('reads the condition and selection names in document order', () => {
    expect(readSigmaCondition(RULE)).toEqual({
      condition: 'selection_image and selection_command',
      selections: ['selection_image', 'selection_command', 'filter_system'],
      hasDetection: true,
    });
  });

  it('returns an empty draft when detection is missing or not a map', () => {
    expect(readSigmaCondition('title: Test\n')).toEqual({
      condition: '',
      selections: [],
      hasDetection: false,
    });
    expect(readSigmaCondition('detection: selection\n')).toEqual({
      condition: '',
      selections: [],
      hasDetection: false,
    });
  });

  it('reports a detection map with no selections', () => {
    expect(readSigmaCondition('detection:\n  condition: 1 of them\n')).toEqual({
      condition: '1 of them',
      selections: [],
      hasDetection: true,
    });
  });
});

describe('updateSigmaCondition', () => {
  it('writes only the condition and preserves selections and comments', () => {
    const source = `# header
detection:
  # image selection
  selection_image:
    Image|endswith: '\\\\powershell.exe'
  condition: selection_image # old
fields:
  - Image
`;
    const result = updateSigmaCondition(source, ' 1 of them ');

    expect(result.changed).toBe(true);
    expect(result.text).toContain('condition: 1 of them # old');
    expect(result.text).toContain('# header');
    expect(result.text).toContain('# image selection');
    expect(result.text).toContain('fields:\n  - Image');
    expect(readSigmaCondition(result.text).selections).toEqual(['selection_image']);
  });

  it('adds a missing condition at the end of the detection map', () => {
    const result = updateSigmaCondition('detection:\n  selection:\n    EventID: 1\n', 'selection');
    expect(result.text).toContain('condition: selection');
    expect(result.text.indexOf('condition:')).toBeGreaterThan(result.text.indexOf('EventID: 1'));
  });

  it('returns changed=false when the condition already matches', () => {
    const result = updateSigmaCondition(RULE, 'selection_image and selection_command');
    expect(result.changed).toBe(false);
    expect(result.text).toBe(RULE);
  });

  it('rejects an empty condition', () => {
    expect(() => updateSigmaCondition(RULE, '   ')).toThrow(SigmaEditError);
    expect(() => updateSigmaCondition(RULE, '   ')).toThrow(/cannot be empty/u);
  });

  it('rejects an over-long condition', () => {
    expect(() => updateSigmaCondition(RULE, 'a'.repeat(SIGMA_MAX_CONDITION_LENGTH + 1))).toThrow(
      /character limit/u,
    );
  });

  it('rejects a rule without a detection map', () => {
    expect(() => updateSigmaCondition('title: Test\n', 'selection')).toThrow(/no detection map/u);
  });

  it('rejects invalid YAML', () => {
    expect(() => updateSigmaCondition('detection: [\n', 'selection')).toThrow(SigmaEditError);
  });
});

describe('sigmaConditionPresets', () => {
  it('builds all and any presets from the selection names', () => {
    expect(sigmaConditionPresets(['selection_a', 'selection_b'])).toEqual([
      { id: 'all', label: 'All selections', expression: 'selection_a and selection_b' },
      { id: 'any', label: 'Any selection', expression: 'selection_a or selection_b' },
      { id: 'one-of-them', label: 'One of them', expression: '1 of them' },
      { id: 'all-of-them', label: 'All of them', expression: 'all of them' },
      { id: 'one-of-prefix', label: 'One of selection_*', expression: '1 of selection_*' },
      { id: 'all-of-prefix', label: 'All of selection_*', expression: 'all of selection_*' },
    ]);
  });

  it('omits the shared-prefix presets when names do not share a usable prefix', () => {
    const presets = sigmaConditionPresets(['image', 'command']);
    expect(presets.map((preset) => preset.id)).toEqual([
      'all',
      'any',
      'one-of-them',
      'all-of-them',
    ]);
  });

  it('does not offer "of them" presets for a single selection', () => {
    expect(sigmaConditionPresets(['selection']).map((preset) => preset.id)).toEqual([
      'all',
      'any',
    ]);
  });

  it('de-duplicates and trims names', () => {
    const presets = sigmaConditionPresets([' selection ', 'selection', '', 'other']);
    expect(presets[0]?.expression).toBe('selection and other');
  });

  it('returns no presets for an empty list', () => {
    expect(sigmaConditionPresets([])).toEqual([]);
  });
});

describe('appendSigmaSelection', () => {
  it('starts an empty condition with the selection', () => {
    expect(appendSigmaSelection('', 'selection', 'and')).toBe('selection');
    expect(appendSigmaSelection('   ', ' selection ', 'or')).toBe('selection');
  });

  it('appends a simple selection without parentheses', () => {
    expect(appendSigmaSelection('selection_a', 'selection_b', 'and')).toBe(
      'selection_a and selection_b',
    );
  });

  it('parenthesizes a compound condition before appending', () => {
    expect(appendSigmaSelection('selection_a or selection_b', 'filter_system', 'and')).toBe(
      '(selection_a or selection_b) and filter_system',
    );
    expect(appendSigmaSelection('selection_a and selection_b', 'selection_c', 'or')).toBe(
      '(selection_a and selection_b) or selection_c',
    );
  });

  it('does not double-parenthesize an already wrapped condition', () => {
    expect(appendSigmaSelection('(selection_a or selection_b)', 'selection_c', 'and')).toBe(
      '(selection_a or selection_b) and selection_c',
    );
  });

  it('treats a quantifier as a compound condition', () => {
    expect(appendSigmaSelection('1 of them', 'filter_system', 'and')).toBe(
      '(1 of them) and filter_system',
    );
  });

  it('ignores an empty selection name', () => {
    expect(appendSigmaSelection('selection', '  ', 'and')).toBe('selection');
  });
});
