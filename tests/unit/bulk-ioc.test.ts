import { describe, expect, it } from 'vitest';
import { normalizeIndicators } from '@/tools/ioc/bulk-normalizer';

describe('bulk IOC normalizer', () => {
  it('refangs, trims wrappers, and classifies indicators', () => {
    const report = normalizeIndicators(
      [
        '- hxxps://Evil[.]Example/Path',
        '  "8.8.8.8",  ',
        'Analyst@Example.com',
        'CVE-2024-1234',
        'd41d8cd98f00b204e9800998ecf8427e',
      ].join('\n'),
    );

    const byType = (type: string) => report.entries.filter((entry) => entry.type === type);
    expect(byType('url')[0]?.value).toBe('https://evil.example/Path');
    expect(byType('ipv4')[0]?.value).toBe('8.8.8.8');
    expect(byType('email')[0]?.value).toBe('Analyst@Example.com');
    expect(byType('cve')[0]?.value).toBe('CVE-2024-1234');
    expect(byType('md5')[0]?.value).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('deduplicates case-insensitively and counts occurrences', () => {
    const report = normalizeIndicators(
      ['EVIL.example', 'evil.example', 'EVIL.EXAMPLE'].join('\n'),
    );
    expect(report.unique).toBe(1);
    expect(report.duplicatesRemoved).toBe(2);
    expect(report.entries[0]?.count).toBe(3);
    expect(report.entries[0]?.sourceLines).toEqual([1, 2, 3]);
  });

  it('keeps URL paths case-sensitive while normalizing the host', () => {
    const report = normalizeIndicators(
      ['https://Evil.Example/Path', 'https://evil.example/Path', 'https://EVIL.example/path'].join('\n'),
    );
    expect(report.unique).toBe(2);
    expect(report.entries.map((entry) => entry.value)).toEqual(
      expect.arrayContaining(['https://evil.example/Path', 'https://evil.example/path']),
    );
  });

  it('ignores blank lines and comments', () => {
    const report = normalizeIndicators('# comment\n\n8.8.8.8\n   # another');
    expect(report.inputLines).toBe(4);
    expect(report.ignoredLines).toBe(3);
    expect(report.unique).toBe(1);
  });

  it('keeps unclassifiable lines as unknown instead of dropping them', () => {
    const report = normalizeIndicators('not an indicator at all\n');
    expect(report.unique).toBe(1);
    expect(report.entries[0]?.type).toBe('unknown');
    expect(report.warnings.join(' ')).toMatch(/kept as unknown/u);
  });

  it('sorts by type and value', () => {
    const report = normalizeIndicators(['evil.example', '8.8.8.8', 'CVE-2024-1000'].join('\n'));
    expect(report.entries.map((entry) => entry.type)).toEqual(['cve', 'domain', 'ipv4']);
  });
});
