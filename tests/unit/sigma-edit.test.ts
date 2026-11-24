import { describe, expect, it } from 'vitest';
import {
  emptySigmaMetadata,
  formatSigmaRule,
  metadataListFromText,
  readSigmaMetadata,
  SigmaEditError,
  updateSigmaMetadata,
} from '@/core/rules/sigma-edit';

const RULE = `# BlueKit test rule
title:   Suspicious PowerShell   # keep this note
id: 3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d
status: experimental
description: Detects encoded PowerShell.
author: BlueKit test
date: 2026-11-21
logsource:
    product: windows
    category: process_creation
detection:
    selection_image:
        Image|endswith: '\\\\powershell.exe'
    selection_command:
        CommandLine|contains:
            - ' -enc '
            - ' -encodedcommand '
    condition: selection_image and selection_command
falsepositives:
    - Legitimate administrative scripts
level: medium
tags:
    - attack.execution
    - attack.t1059.001
x_custom: keep me
`;

describe('formatSigmaRule', () => {
  it('normalizes indentation and keeps comments, detection, and unknown fields', () => {
    const formatted = formatSigmaRule(RULE);

    expect(formatted).toContain('# BlueKit test rule');
    expect(formatted).toContain('title: Suspicious PowerShell # keep this note');
    expect(formatted).toContain('  selection_command:');
    expect(formatted).toContain("    Image|endswith: '\\\\powershell.exe'");
    expect(formatted).toContain('      - \' -encodedcommand \'');
    expect(formatted).toContain('x_custom: keep me');
    expect(formatted.endsWith('\n')).toBe(true);
  });

  it('preserves the rule data and is idempotent', () => {
    const formatted = formatSigmaRule(RULE);
    expect(formatSigmaRule(formatted)).toBe(formatted);
    expect(readSigmaMetadata(formatted)).toEqual(readSigmaMetadata(RULE));
  });

  it('converts CRLF input to LF', () => {
    const formatted = formatSigmaRule(RULE.replace(/\n/gu, '\r\n'));
    expect(formatted).not.toContain('\r');
    expect(formatted).toContain('title: Suspicious PowerShell');
  });

  it('rejects empty input', () => {
    expect(() => formatSigmaRule('   ')).toThrow(SigmaEditError);
    expect(() => formatSigmaRule('   ')).toThrow(/empty/u);
  });

  it('rejects invalid YAML with a position', () => {
    expect(() => formatSigmaRule('title: [\n')).toThrow(/line 2, column 1/u);
  });

  it('rejects multiple documents and non-mapping documents', () => {
    expect(() => formatSigmaRule('title: one\n---\ntitle: two\n')).toThrow(/multiple documents/u);
    expect(() => formatSigmaRule('- one\n- two\n')).toThrow(/mapping at the top level/u);
  });

  it('rejects input over the editor cap', () => {
    expect(() => formatSigmaRule(`title: ${'x'.repeat(1024 * 1024)}`)).toThrow(/1024 KiB/u);
  });
});

describe('readSigmaMetadata', () => {
  it('reads scalars, lists, and logsource fields', () => {
    expect(readSigmaMetadata(RULE)).toEqual({
      title: 'Suspicious PowerShell',
      id: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      status: 'experimental',
      description: 'Detects encoded PowerShell.',
      author: 'BlueKit test',
      date: '2026-11-21',
      modified: '',
      level: 'medium',
      references: [],
      falsepositives: ['Legitimate administrative scripts'],
      tags: ['attack.execution', 'attack.t1059.001'],
      logsource: {
        product: 'windows',
        category: 'process_creation',
        service: '',
        definition: '',
      },
    });
  });

  it('returns an empty draft for missing metadata', () => {
    expect(readSigmaMetadata('detection:\n  condition: selection\n')).toEqual({
      ...emptySigmaMetadata(),
      logsource: { product: '', category: '', service: '', definition: '' },
    });
  });

  it('tolerates a string where a list is expected', () => {
    const draft = readSigmaMetadata('tags: attack.execution\n');
    expect(draft.tags).toEqual(['attack.execution']);
  });

  it('ignores non-scalar list entries and a non-map logsource', () => {
    const draft = readSigmaMetadata(
      'tags:\n  - attack.execution\n  - [nested]\n  - 42\nlogsource: windows\n',
    );
    expect(draft.tags).toEqual(['attack.execution', '42']);
    expect(draft.logsource).toEqual({ product: '', category: '', service: '', definition: '' });
  });

  it('keeps dates as strings', () => {
    expect(readSigmaMetadata('date: 2026-11-21\n').date).toBe('2026-11-21');
  });
});

describe('updateSigmaMetadata', () => {
  it('writes only the requested fields and preserves the detection block', () => {
    const result = updateSigmaMetadata(RULE, {
      title: 'Renamed rule',
      status: 'test',
      tags: ['attack.execution', 'attack.t1059.001', 'attack.defense_evasion'],
    });

    expect(result.changed).toBe(true);
    expect(result.text).toContain('title: Renamed rule');
    expect(result.text).toContain('status: test');
    expect(result.text).toContain('  - attack.defense_evasion');
    expect(result.text).toContain('# BlueKit test rule');
    expect(result.text).toContain('# keep this note');
    expect(result.text).toContain('x_custom: keep me');
    expect(result.text).toContain('condition: selection_image and selection_command');
    expect(result.text).toContain("CommandLine|contains:");

    const before = readSigmaMetadata(RULE);
    const after = readSigmaMetadata(result.text);
    expect(after.description).toBe(before.description);
    expect(after.author).toBe(before.author);
    expect(after.logsource).toEqual(before.logsource);
    expect(after.falsepositives).toEqual(before.falsepositives);
  });

  it('removes fields set to an empty value', () => {
    const result = updateSigmaMetadata(RULE, {
      author: '   ',
      references: [],
      tags: [],
      falsepositives: ['', '  '],
    });

    expect(result.text).not.toContain('author:');
    expect(result.text).not.toContain('tags:');
    expect(result.text).not.toContain('falsepositives:');
    expect(result.text).toContain('title: Suspicious PowerShell');
  });

  it('adds missing fields without reordering the detection block', () => {
    const result = updateSigmaMetadata('detection:\n  condition: selection\n', {
      title: 'New rule',
      references: ['https://example.test/rule'],
      logsource: { product: 'windows' },
    });

    expect(result.text).toContain('title: New rule');
    expect(result.text).toContain('references:\n  - https://example.test/rule');
    expect(result.text).toContain('logsource:\n  product: windows');
    expect(result.text.indexOf('detection:')).toBeLessThan(result.text.indexOf('title:'));
  });

  it('updates and clears nested logsource fields', () => {
    const updated = updateSigmaMetadata(RULE, {
      logsource: { product: 'linux', category: '', service: 'sshd', definition: 'Auditd' },
    });
    const logsource = readSigmaMetadata(updated.text).logsource;
    expect(logsource).toEqual({
      product: 'linux',
      category: '',
      service: 'sshd',
      definition: 'Auditd',
    });

    const cleared = updateSigmaMetadata(updated.text, {
      logsource: { product: '', service: '', definition: '' },
    });
    expect(cleared.text).not.toContain('logsource:');
  });

  it('replaces a non-map logsource when values are supplied', () => {
    const result = updateSigmaMetadata('logsource: windows\ndetection:\n  condition: selection\n', {
      logsource: { product: 'windows' },
    });
    expect(result.text).toContain('logsource:\n  product: windows');
  });

  it('leaves a non-map logsource alone when no values are supplied', () => {
    const result = updateSigmaMetadata('logsource: windows\n', {
      logsource: { product: '', category: '' },
    });
    expect(result.text).toContain('logsource: windows');
  });

  it('trims and de-duplicates list values', () => {
    const result = updateSigmaMetadata('title: Test\n', {
      references: [' https://a.test ', 'https://a.test', '', 'https://b.test'],
    });
    expect(result.text).toContain('references:\n  - https://a.test\n  - https://b.test');
  });

  it('keeps a leading comment when its field is removed', () => {
    const result = updateSigmaMetadata('# licence header\ntitle: Test\nid: abc\n', {
      title: '',
    });
    expect(result.text).toBe('# licence header\nid: abc\n');
  });

  it('keeps a trailing comment when the last field is removed', () => {
    const result = updateSigmaMetadata('title: Test\n# footer\nid: abc\n', { id: '' });
    expect(result.text).toBe('title: Test\n# footer\n');
  });

  it('keeps a comment on a list field when the list is rewritten', () => {
    const result = updateSigmaMetadata('tags: # tag note\n  - attack.execution\nnext: x\n', {
      tags: ['attack.execution', 'attack.t1059'],
    });
    expect(result.text).toBe(
      'tags:\n  # tag note\n  - attack.execution\n  - attack.t1059\nnext: x\n',
    );
  });

  it('returns changed=false when the rule is already formatted with the same values', () => {
    const formatted = formatSigmaRule(RULE);
    const result = updateSigmaMetadata(formatted, readSigmaMetadata(formatted));
    expect(result.changed).toBe(false);
    expect(result.text).toBe(formatted);
  });

  it('rejects invalid YAML instead of rewriting it', () => {
    expect(() => updateSigmaMetadata('title: [\n', { title: 'x' })).toThrow(SigmaEditError);
  });
});

describe('metadataListFromText', () => {
  it('splits lines, trims, drops blanks, and de-duplicates', () => {
    expect(metadataListFromText(' attack.execution \n\nattack.execution\nattack.t1059\n')).toEqual([
      'attack.execution',
      'attack.t1059',
    ]);
  });
});
