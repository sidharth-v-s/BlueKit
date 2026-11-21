import { describe, expect, it } from 'vitest';
import { diffText, splitComparison } from '@/tools/encoding/diff';
import { runCompressionTool } from '@/tools/encoding/compress';

const signal = new AbortController().signal;
const report = () => {};

describe('gzip / zlib compression', () => {
  for (const format of ['gzip', 'deflate', 'deflate-raw'] as const) {
    it(`round-trips text through ${format}`, async () => {
      const original = 'BlueKit compression round-trip — '.repeat(64);
      const compressed = await runCompressionTool(
        {
          text: original,
          params: { action: 'compress', format, 'text-encoding': 'text' },
        },
        report,
        signal,
      );

      expect(compressed.output.outputBytes).toBeGreaterThan(0);
      expect(compressed.output.base64).toBeTypeOf('string');

      const decompressed = await runCompressionTool(
        {
          text: compressed.output.base64,
          params: { action: 'decompress', format, 'text-encoding': 'base64' },
        },
        report,
        signal,
      );

      expect(decompressed.output.text).toBe(original);
      expect(decompressed.output.textUtf8).toBe(true);
      expect(decompressed.output.previewTruncated).toBe(false);
    });
  }

  it('auto-detects Base64 and hex input for decompression', async () => {
    const original = 'auto-detect payload';
    const compressed = await runCompressionTool(
      { text: original, params: { action: 'compress', format: 'gzip', 'text-encoding': 'text' } },
      report,
      signal,
    );

    const base64 = compressed.output.base64!;
    const hex = Buffer.from(base64, 'base64').toString('hex');

    const fromBase64 = await runCompressionTool(
      { text: base64, params: { action: 'decompress', format: 'gzip' } },
      report,
      signal,
    );
    const fromHex = await runCompressionTool(
      { text: hex, params: { action: 'decompress', format: 'gzip' } },
      report,
      signal,
    );

    expect(fromBase64.output.text).toBe(original);
    expect(fromHex.output.text).toBe(original);
  });

  it('reports malformed streams instead of returning garbage', async () => {
    await expect(
      runCompressionTool(
        { text: 'not compressed', params: { action: 'decompress', format: 'gzip', 'text-encoding': 'text' } },
        report,
        signal,
      ),
    ).rejects.toMatchObject({ code: 'malformed-content' });
  });

  it('caps the text preview and warns when decompressed output is larger', async () => {
    const original = 'A'.repeat(2 * 1024 * 1024);
    const compressed = await runCompressionTool(
      { text: original, params: { action: 'compress', format: 'gzip', 'text-encoding': 'text' } },
      report,
      signal,
    );

    const decompressed = await runCompressionTool(
      {
        text: compressed.output.base64,
        params: { action: 'decompress', format: 'gzip', 'text-encoding': 'base64' },
      },
      report,
      signal,
    );

    expect(decompressed.output.outputBytes).toBe(original.length);
    expect(decompressed.output.previewTruncated).toBe(true);
    expect(decompressed.output.text).toHaveLength(1024 * 1024);
    expect(decompressed.warnings?.[0]?.code).toBe('preview-truncated');
  });
});

describe('data comparison', () => {
  it('produces a unified diff with counts', () => {
    const result = diffText('alpha\nbeta\n---\nalpha\ngamma\n');
    expect(result.diff).toContain('--- left');
    expect(result.diff).toContain('+++ right');
    expect(result.diff).toContain('-beta');
    expect(result.diff).toContain('+gamma');
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.hunks).toBe(1);
    expect(result.coarse).toBe(false);
  });

  it('returns an explicit no-difference message', () => {
    expect(diffText('same\ntext\n---\nsame\ntext\n').diff).toBe('No differences.\n');
  });

  it('supports a custom separator and ignores whitespace changes', () => {
    expect(splitComparison('left\n=== separator\nright', '=== separator')).toEqual({
      left: 'left',
      right: 'right',
    });

    const result = diffText('a  b\n---\na b\n', { ignoreWhitespace: true });
    expect(result.diff).toBe('No differences.\n');
  });

  it('rejects input without a separator line', () => {
    expect(() => splitComparison('one\ntwo', '---')).toThrowError(/No separator/u);
  });

  it('treats an empty side as zero lines and numbers insertions from 0', () => {
    const removal = diffText('only\n---\n');
    expect(removal.removed).toBe(1);
    expect(removal.added).toBe(0);
    expect(removal.diff).toContain('-only');

    const insertion = diffText('---\nnew\n');
    expect(insertion.diff).toContain('@@ -0,0 +1,1 @@');
    expect(insertion.diff).toContain('+new');
  });

  it('falls back to a coarse replacement beyond the DP cap', () => {
    const left = Array.from({ length: 1500 }, (_, index) => `left-${index}`).join('\n');
    const right = Array.from({ length: 1500 }, (_, index) => `right-${index}`).join('\n');
    const result = diffText(`${left}\n---\n${right}\n`, { context: 0 });

    expect(result.coarse).toBe(true);
    expect(result.added).toBe(1500);
    expect(result.removed).toBe(1500);
    expect(result.hunks).toBe(1);
  });
});
