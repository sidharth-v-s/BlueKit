import { describe, expect, it } from 'vitest';
import { detectRegexRisks, runRegexTool } from '@/tools/encoding/regex';
import type { RunnerInput } from '@/core/runtime/types';

const signal = new AbortController().signal;

function run(input: RunnerInput) {
  return runRegexTool(input, () => {}, signal);
}

describe('regex tester', () => {
  it('extracts matches with named and numbered groups', async () => {
    const result = await run({
      text: 'Contact alice@example.com and bob@test.org.',
      params: {
        pattern: '(?<user>[a-z]+)@([a-z.]+)',
        flags: 'gi',
        mode: 'matches',
      },
    });
    expect(result.output.matchCount).toBe(2);
    expect(result.output.matches[0]?.value).toBe('alice@example.com');
    expect(result.output.matches[0]?.groups).toEqual(['alice', 'example.com']);
    expect(result.output.matches[0]?.named).toMatchObject({ user: 'alice' });
  });

  it('replaces with capture references', async () => {
    const result = await run({
      text: 'alice@example.com',
      params: {
        pattern: '([a-z]+)@example\\.com',
        flags: 'g',
        mode: 'replace',
        replacement: '$1 [at] example',
      },
    });
    expect(result.output.replaced).toBe('alice [at] example');
    expect(result.output.matchCount).toBe(1);
  });

  it('rejects invalid patterns with a clear failure', async () => {
    await expect(
      run({ text: 'x', params: { pattern: '(', flags: 'g' } }),
    ).rejects.toThrowError(/Invalid regular expression/u);
  });

  it('rejects unsupported flags', async () => {
    await expect(
      run({ text: 'x', params: { pattern: 'x', flags: 'gq' } }),
    ).rejects.toThrowError(/Unsupported regex flags/u);
  });

  it('stops obvious catastrophic backtracking shapes', async () => {
    expect(detectRegexRisks('(a+)+$')).toEqual(
      expect.arrayContaining([expect.stringMatching(/Nested quantifiers/u)]),
    );
    await expect(
      run({ text: 'aaaaaaaaaaaaaaaaaaaa', params: { pattern: '(a+)+$', flags: 'g' } }),
    ).rejects.toThrowError(/ReDoS guard/u);
  });

  it('does not flag escaped quantifiers or character classes', () => {
    expect(detectRegexRisks('\\++')).toEqual([]);
    expect(detectRegexRisks('[+*]+')).toEqual([]);
  });

  it('truncates very large match sets', async () => {
    const text = Array.from({ length: 1100 }, () => 'a').join(' ');
    const result = await run({ text, params: { pattern: 'a', flags: 'g' } });
    expect(result.output.matches).toHaveLength(1000);
    expect(result.output.truncated).toBe(true);
    expect(result.warnings?.[0]?.code).toBe('regex-truncated');
  });
});
