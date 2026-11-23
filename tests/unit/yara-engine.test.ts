import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileYaraRule, validateYaraRule } from '@/core/rules/yara-engine';

const wasmBytes = readFileSync(
  new URL('../../node_modules/@virustotal/yara-x/pkg/yara_x_js_bg.wasm', import.meta.url),
);
const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/yara/${name}`, import.meta.url), 'utf8');

/**
 * These tests exercise the real pinned YARA-X WASM build in Node. The browser
 * worker uses the same wrapper but initialises the package's same-origin WASM.
 */
describe('YARA-X engine wrapper', () => {
  it('compiles and scans a rule with text, hex, regex, metadata, and tags', async () => {
    const { report, rules } = await compileYaraRule(fixture('basic.yar'), {
      moduleBytes: wasmBytes,
    });

    expect(report).toMatchObject({
      valid: true,
      errors: [],
      engine: { name: 'YARA-X', version: '1.23.0' },
    });
    expect(rules).not.toBeNull();

    try {
      const data = new TextEncoder().encode('BlueKit phase-4 Blue');
      const outcome = rules!.scan(data);

      expect(outcome.valid).toBe(true);
      expect(outcome.errors).toEqual([]);
      expect(outcome.matches).toHaveLength(1);
      expect(outcome.matches[0]).toMatchObject({
        identifier: 'BlueKit_Demo',
        namespace: 'default',
        tags: ['demo', 'bluekit'],
      });
      expect(outcome.matches[0]?.metadata).toEqual(
        expect.arrayContaining([
          { identifier: 'author', value: 'BlueKit tests' },
          { identifier: 'score', value: 7 },
        ]),
      );

      const patterns = outcome.matches[0]?.patterns ?? [];
      expect(patterns.map((pattern) => pattern.identifier)).toEqual(
        expect.arrayContaining(['$text', '$hex', '$re']),
      );
      const text = patterns.find((pattern) => pattern.identifier === '$text');
      expect(text?.matches[0]).toMatchObject({ offset: 0, length: 7 });
      expect(text?.matches[0]?.preview).toBe('42 6c 75 65 4b 69 74');
    } finally {
      rules!.free();
    }
  });

  it('returns a valid report with no matches when the rule does not fire', async () => {
    const { report, rules } = await compileYaraRule(fixture('no-match.yar'), {
      moduleBytes: wasmBytes,
    });
    expect(report.valid).toBe(true);

    try {
      const outcome = rules!.scan(new TextEncoder().encode('BlueKit phase-4 Blue'));
      expect(outcome.valid).toBe(true);
      expect(outcome.matches).toEqual([]);
    } finally {
      rules!.free();
    }
  });

  it('surfaces the engine compile error for an invalid rule', async () => {
    const { report, rules } = await compileYaraRule(fixture('invalid.yar'), {
      moduleBytes: wasmBytes,
    });

    expect(rules).toBeNull();
    expect(report.valid).toBe(false);
    expect(report.errors.join('\n')).toMatch(/syntax error|E001/u);
  });

  it('keeps engine warnings from compilation', async () => {
    const { report, rules } = await compileYaraRule('rule Always { condition: true }', {
      moduleBytes: wasmBytes,
    });
    expect(report.valid).toBe(true);
    expect(report.warnings.join('\n')).toMatch(/invariant/u);
    rules?.free();
  });

  it('frees compiled rules once and refuses later scans', async () => {
    const { report, rules } = await compileYaraRule('rule A { condition: true }', {
      moduleBytes: wasmBytes,
    });
    expect(report.valid).toBe(true);
    expect(rules).not.toBeNull();

    rules!.free();
    rules!.free();
    expect(rules!.freed).toBe(true);

    const outcome = rules!.scan(new Uint8Array([1]));
    expect(outcome.valid).toBe(false);
    expect(outcome.errors[0]).toMatch(/released/u);
  });

  it('validates without leaking compiled rules', async () => {
    const report = await validateYaraRule('rule A { condition: true }', {
      moduleBytes: wasmBytes,
    });
    expect(report.valid).toBe(true);
  });
});
