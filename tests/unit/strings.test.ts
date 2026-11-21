import { describe, expect, it } from 'vitest';
import { extractStrings, formatStrings } from '@/tools/malware/strings';

describe('strings extractor', () => {
  it('extracts ASCII runs with offsets', () => {
    const bytes = new TextEncoder().encode('\x00\x00hello world\x00\x01short');
    const result = extractStrings(bytes, { minLength: 4 });
    expect(result.strings.map((entry) => entry.value)).toEqual(
      expect.arrayContaining(['hello world', 'short']),
    );
    expect(result.strings.find((entry) => entry.value === 'hello world')?.offset).toBe(2);
  });

  it('extracts UTF-16LE runs', () => {
    const bytes = Uint8Array.from([0x41, 0x00, 0x42, 0x00, 0x43, 0x00, 0x44, 0x00]);
    const result = extractStrings(bytes, { minLength: 4 });
    const utf16 = result.strings.find((entry) => entry.encoding === 'utf16le');
    expect(utf16?.value).toBe('ABCD');
  });

  it('honors the minimum length', () => {
    const bytes = new TextEncoder().encode('abc\x00defg');
    expect(extractStrings(bytes, { minLength: 4 }).strings.map((entry) => entry.value)).toEqual(['defg']);
  });

  it('truncates at the match limit and says so', () => {
    const bytes = new TextEncoder().encode('aaaa\x00bbbb\x00cccc\x00dddd');
    const result = extractStrings(bytes, { minLength: 4, maxMatches: 2 });
    expect(result.strings).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('formats offset, encoding, and value', () => {
    const text = formatStrings([{ offset: 16, encoding: 'ascii', value: 'MZ' }]);
    expect(text).toBe('0x00000010  ascii    MZ');
  });
});
