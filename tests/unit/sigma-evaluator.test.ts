import { describe, expect, it } from 'vitest';
import { runSigmaLocalTest, SIGMA_MAX_EVENTS } from '@/core/rules/sigma-evaluator';

const POWERSHELL_RULE = `title: PowerShell encoded command
logsource:
  product: windows
  category: process_creation
detection:
  selection_image:
    Image|endswith: '\\powershell.exe'
  selection_command:
    CommandLine|contains:
      - ' -enc '
      - ' -encodedcommand '
  condition: selection_image and selection_command
`;

function fieldRule(detection: string, condition = 'selection'): string {
  return `title: Local test rule
logsource:
  product: windows
detection:
${detection}
  condition: ${condition}
`;
}

function run(rule: string, events: unknown) {
  return runSigmaLocalTest(rule, JSON.stringify(events));
}

describe('Sigma local test evaluator', () => {
  it('matches fields case-insensitively and combines selections', () => {
    const result = run(POWERSHELL_RULE, [
      {
        Image: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        CommandLine: 'powershell.exe -NoProfile -enc SQBFAFgA',
      },
      { Image: 'C:\\Windows\\System32\\notepad.exe', CommandLine: 'notepad.exe' },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.eventCount).toBe(2);
    expect(result.matchedCount).toBe(1);
    expect(result.events[0]?.matched).toBe(true);
    expect(result.events[0]?.selectionResults).toEqual({
      selection_image: true,
      selection_command: true,
    });
    expect(result.events[1]?.matched).toBe(false);
    expect(result.condition).toBe('selection_image and selection_command');
    expect(result.warnings.join(' ')).toMatch(/does not verify the detection/iu);
  });

  it('supports all and any modifiers on a field list', () => {
    const allRule = fieldRule(`  selection:
    CommandLine|contains|all:
      - alpha
      - beta`);
    const anyRule = fieldRule(`  selection:
    CommandLine|contains|any:
      - alpha
      - beta`);

    const allResult = run(allRule, [
      { CommandLine: 'alpha only' },
      { CommandLine: 'alpha and beta' },
    ]);
    expect(allResult.ok).toBe(true);
    if (allResult.ok) {
      expect(allResult.events.map((event) => event.matched)).toEqual([false, true]);
    }

    const anyResult = run(anyRule, [{ CommandLine: 'alpha only' }]);
    expect(anyResult.ok).toBe(true);
    if (anyResult.ok) expect(anyResult.events[0]?.matched).toBe(true);
  });

  it('treats a keyword list as OR across all leaf values', () => {
    const rule = `title: Keyword rule
logsource:
  product: windows
detection:
  keywords:
    - evil.example
    - powershell
  condition: keywords
`;

    const result = run(rule, [
      { CommandLine: 'curl https://EVIL.EXAMPLE/a' },
      { Parent: { Image: 'C:\\Windows\\powershell.exe' } },
      { CommandLine: 'cmd.exe' },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events.map((event) => event.matched)).toEqual([true, true, false]);
    }
  });

  it('evaluates boolean conditions, wildcards, and quantifiers', () => {
    const rule = fieldRule(
      `  selection_a:
    EventID: 1
  selection_b:
    EventID: 2
  selection_c:
    EventID: 3`,
      'not (selection_a and selection_b) and 1 of selection_*',
    );

    const result = run(rule, [
      { EventID: 1 },
      { EventID: 2 },
      { EventID: 9 },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events.map((event) => event.matched)).toEqual([true, true, false]);
      expect(result.selections).toEqual(['selection_a', 'selection_b', 'selection_c']);
    }
  });

  it('supports all of them', () => {
    const rule = fieldRule(
      `  selection_a:
    EventID: 1
  selection_b:
    User: alice`,
      'all of them',
    );

    const result = run(rule, [
      { EventID: 1, User: 'alice' },
      { EventID: 1, User: 'bob' },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events.map((event) => event.matched)).toEqual([true, false]);
    }
  });

  it('honours the cased modifier and wildcards', () => {
    const rule = fieldRule(`  selection:
    Name|cased: 'PowerShell*'`);

    const result = run(rule, [
      { Name: 'PowerShell.exe' },
      { Name: 'powershell.exe' },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events.map((event) => event.matched)).toEqual([true, false]);
    }
  });

  it('fails visibly on modifiers outside the subset', () => {
    const rule = fieldRule(`  selection:
    Image|re: '.*powershell.*'`);

    const result = run(rule, [{ Image: 'powershell.exe' }]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.unsupported.map((item) => item.feature)).toContain('modifier:re');
    expect(result.error).toMatch(/outside the local test subset/iu);
  });

  it('fails visibly on aggregation, time windows, and near', () => {
    const aggregation = run(
      fieldRule(`  selection:
    EventID: 1`, 'selection | count() > 5'),
      [{ EventID: 1 }],
    );
    expect(aggregation.ok).toBe(false);
    if (!aggregation.ok) {
      expect(aggregation.unsupported.map((item) => item.feature)).toContain('aggregation');
    }

    const timeframe = run(
      `title: Time window
logsource:
  product: windows
detection:
  selection:
    EventID: 1
  timeframe: 5m
  condition: selection
`,
      [{ EventID: 1 }],
    );
    expect(timeframe.ok).toBe(false);
    if (!timeframe.ok) {
      expect(timeframe.unsupported.map((item) => item.feature)).toContain('timeframe');
    }

    const near = run(
      fieldRule(`  selection:
    EventID: 1
  other:
    EventID: 2`, 'selection near other'),
      [{ EventID: 1 }, { EventID: 2 }],
    );
    expect(near.ok).toBe(false);
    if (!near.ok) {
      expect(near.unsupported.map((item) => item.feature)).toContain('near');
    }
  });

  it('rejects unknown selections and malformed conditions', () => {
    const unknown = run(
      fieldRule(`  selection:
    EventID: 1`, 'missing'),
      [{ EventID: 1 }],
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toMatch(/unknown selection/iu);

    const malformed = run(
      fieldRule(`  selection:
    EventID: 1`, 'selection and'),
      [{ EventID: 1 }],
    );
    expect(malformed.ok).toBe(false);
  });

  it('enforces the event count and object-shape limits', () => {
    const rule = fieldRule(`  selection:
    EventID: 1`);
    const tooMany = run(rule, Array.from({ length: SIGMA_MAX_EVENTS + 1 }, () => ({ EventID: 1 })));
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error).toMatch(/500-event limit/iu);

    const notObject = runSigmaLocalTest(rule, '["not an object"]');
    expect(notObject.ok).toBe(false);
    if (!notObject.ok) expect(notObject.error).toMatch(/not a JSON object/iu);
  });

  it('does not use logsource to filter events', () => {
    const result = run(POWERSHELL_RULE, [
      { EventID: 1, Image: 'C:\\Windows\\powershell.exe', CommandLine: ' -enc ' },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events[0]?.matched).toBe(true);
      expect(result.warnings.join(' ')).toMatch(/logsource is displayed as metadata/iu);
    }
  });
});
