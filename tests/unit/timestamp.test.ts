import { describe, expect, it } from 'vitest';
import { convertTimestamp } from '@/tools/encoding/timestamp';

describe('timestamp converter', () => {
  it('converts Unix seconds deterministically', () => {
    const report = convertTimestamp('1700000000');
    expect(report.chosen?.format).toBe('Unix seconds');
    expect(report.chosen?.isoUtc).toBe('2023-11-14T22:13:20.000Z');
    expect(report.chosen?.unixMilliseconds).toBe(1700000000000);
  });

  it('converts Unix milliseconds', () => {
    const report = convertTimestamp('1700000000123');
    expect(report.chosen?.unixMilliseconds).toBe(1700000000123);
    expect(report.chosen?.isoUtc).toBe('2023-11-14T22:13:20.123Z');
  });

  it('converts ISO 8601', () => {
    const report = convertTimestamp('2026-11-20T10:00:00Z');
    expect(report.chosen?.unixSeconds).toBe(1795168800);
    expect(report.chosen?.dayOfWeek).toBe('Friday');
  });

  it('offers both FILETIME and .NET interpretations for 18-digit values', () => {
    const report = convertTimestamp('133444736000000000');
    expect(report.candidates).toHaveLength(2);
    expect(report.warning).toMatch(/ambiguous/u);
    expect(report.chosen?.filetime).toBe('133444736000000000');
  });

  it('round-trips a known FILETIME value', () => {
    // 2023-11-14T22:13:20Z as FILETIME.
    const report = convertTimestamp('133444736000000000');
    expect(report.candidates[0]?.isoUtc).toBe('2023-11-14T22:13:20.000Z');
  });

  it('rejects unrecognized text', () => {
    expect(() => convertTimestamp('not-a-date')).toThrowError(/Could not parse/u);
  });

  it('rejects empty input', () => {
    expect(() => convertTimestamp('   ')).toThrowError(/Provide a timestamp/u);
  });
});
