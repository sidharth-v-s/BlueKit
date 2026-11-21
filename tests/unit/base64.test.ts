import { describe, expect, it } from 'vitest';
import { ToolFailure } from '@/core/runtime/errors';
import type { ToolContext } from '@/core/runtime/types';
import { DEFAULT_LIMITS } from '@/core/schemas/types';
import { base64DecodeTool, decodeBase64, normalizeBase64 } from '@/tools/encoding/base64-decode';
import { base64EncodeTool } from '@/tools/encoding/base64-encode';

function context(maxInputBytes = DEFAULT_LIMITS.maxInputBytes): ToolContext {
  return {
    reportProgress: () => {},
    log: () => {},
    signal: new AbortController().signal,
    limits: { ...DEFAULT_LIMITS, maxInputBytes },
  };
}

const signal = new AbortController().signal;

describe('Base64 tools', () => {
  it('round-trips UTF-8 text', async () => {
    const text = 'BlueKit — browser-native triage ✓';
    const encoded = await base64EncodeTool.execute({ text }, context(), signal);
    expect(encoded.output).toBe(Buffer.from(text, 'utf8').toString('base64'));

    const decoded = await base64DecodeTool.execute({ text: encoded.output }, context(), signal);
    expect(decoded.output).toBe(text);
    expect(decoded.warnings).toHaveLength(0);
  });

  it('rejects empty encode input with a structured failure', async () => {
    await expect(base64EncodeTool.execute({ text: '' }, context(), signal)).rejects.toMatchObject({
      name: 'ToolFailure',
      code: 'invalid-input',
    });
  });

  it('rejects input over the tool limit', async () => {
    await expect(
      base64EncodeTool.execute({ text: 'abcdef' }, context(4), signal),
    ).rejects.toMatchObject({ code: 'file-too-large' });
  });

  it('accepts URL-safe alphabets and missing padding', () => {
    const bytes = decodeBase64('SGVsbG8tXw');
    expect(new TextDecoder().decode(bytes)).toBe('Hello-_');
    expect(normalizeBase64('SGVsbG8tXw')).toBe('SGVsbG8tXw');
  });

  it('ignores whitespace but rejects invalid characters', () => {
    expect(normalizeBase64('SGVs\nbG8=')).toBe('SGVsbG8=');
    expect(() => normalizeBase64('SGVs*bG8=')).toThrow(ToolFailure);
  });

  it('returns a hex dump and warning for non-UTF-8 bytes', async () => {
    const encoded = Buffer.from([0xff, 0x00, 0xfe]).toString('base64');
    const result = await base64DecodeTool.execute({ text: encoded }, context(), signal);
    expect(result.warnings?.[0]?.code).toBe('non-utf8-output');
    expect(result.output).toContain('ff 00 fe');
  });
});
