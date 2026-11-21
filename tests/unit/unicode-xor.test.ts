import { describe, expect, it } from 'vitest';
import type { ToolContext } from '@/core/runtime/types';
import { DEFAULT_LIMITS } from '@/core/schemas/types';
import { inspectUnicode, unicodeInspectorTool } from '@/tools/encoding/unicode-inspector';
import { xorBytes, xorTool } from '@/tools/encoding/xor';

function context(): ToolContext {
  return {
    reportProgress: () => {},
    log: () => {},
    signal: new AbortController().signal,
    limits: { ...DEFAULT_LIMITS },
  };
}

const signal = new AbortController().signal;

describe('Unicode inspector', () => {
  it('separates UTF-16 units from code points', () => {
    const report = inspectUnicode('a😀');
    expect(report.characters).toBe(3);
    expect(report.codePoints).toBe(2);
    expect(report.utf8Bytes).toBe(5);
    expect(report.utf16Bytes).toBe(6);
  });

  it('flags zero-width and bidi control characters', () => {
    const report = inspectUnicode('safe\u200Btext\u202E');
    expect(report.counts['zero-width']).toBe(1);
    expect(report.counts.bidi).toBe(1);
    expect(report.counts.format).toBe(2);
    expect(report.items.some((item) => item.codePoint === 0x200b)).toBe(true);
    expect(report.items.some((item) => item.codePoint === 0x202e)).toBe(true);
  });

  it('marks Cyrillic and Greek lookalikes as confusables', () => {
    const report = inspectUnicode('а');
    expect(report.items[0]?.confusableWith).toBe('a');
    expect(report.items[0]?.findings).toContain('confusable');
  });

  it('reports normalization changes', () => {
    const report = inspectUnicode('e\u0301', { normalize: 'NFKC' });
    expect(report.normalization).toBe('NFKC');
    expect(report.normalized).toBe('é');
    expect(report.normalizationChanged).toBe(true);
    expect(report.counts.combining).toBe(1);
  });

  it('can hide ordinary ASCII from the character list', () => {
    const report = inspectUnicode('ordinary text', { view: 'suspicious' });
    expect(report.items).toHaveLength(0);
    expect(report.reported).toBe(0);
  });

  it('marks truncation only when a character is actually omitted', () => {
    expect(inspectUnicode('a'.repeat(4000)).truncated).toBe(false);
    expect(inspectUnicode('a'.repeat(4001)).truncated).toBe(true);
  });

  it('warns through the execution contract without treating non-ASCII as hostile', async () => {
    const result = await unicodeInspectorTool.execute(
      { text: 'pay\u200Bpal' },
      context(),
      signal,
    );
    expect(result.warnings?.some((warning) => warning.code === 'unicode-zero-width')).toBe(true);
    expect(result.warnings?.some((warning) => warning.code === 'unicode-non-ascii')).toBe(false);
  });
});

describe('XOR', () => {
  it('applies a repeating key and is symmetric', () => {
    const bytes = new TextEncoder().encode('Hello');
    const key = new TextEncoder().encode('key');
    const first = xorBytes(bytes, key);
    expect(Buffer.from(first).toString('hex')).toBe('230015070a');
    expect(Buffer.from(xorBytes(first, key)).toString('utf8')).toBe('Hello');
  });

  it('accepts hex input and a text key', async () => {
    const result = await xorTool.execute(
      { text: '48656c6c6f', params: { key: 'key', 'input-format': 'hex', output: 'hex' } },
      context(),
      signal,
    );
    expect(result.output).toBe('230015070a');
  });

  it('accepts a hex key and writes Base64', async () => {
    const result = await xorTool.execute(
      { text: 'Hello', params: { key: '6b6579', 'key-format': 'hex', output: 'base64' } },
      context(),
      signal,
    );
    expect(result.output).toBe(Buffer.from('230015070a', 'hex').toString('base64'));
  });

  it('requires a non-empty key', async () => {
    await expect(
      xorTool.execute({ text: 'data' }, context(), signal),
    ).rejects.toThrowError(/XOR key/u);
    expect(() => xorBytes(new Uint8Array([1]), new Uint8Array())).toThrowError(/XOR key/u);
  });
});
