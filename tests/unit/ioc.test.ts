import { describe, expect, it } from 'vitest';
import { extractIocs } from '@/tools/ioc/extractor';

describe('IOC extractor', () => {
  it('refangs defanged indicators and extracts common types', () => {
    const report = extractIocs(
      [
        'C2: hxxp://evil[.]example/path?x=1',
        'IPs: 8.8.8.8 and 10.0.0.1 and 2001:db8::1',
        'Contact: analyst@example.com',
        'Hash: d41d8cd98f00b204e9800998ecf8427e',
        'Vuln: CVE-2024-1234',
      ].join('\n'),
    );

    expect(report.refanged).toBe(true);
    const find = (type: string, value: string) =>
      report.indicators.find((indicator) => indicator.type === type && indicator.value === value);

    expect(find('url', 'http://evil.example/path?x=1')).toBeDefined();
    expect(find('ipv4', '8.8.8.8')).toMatchObject({ private: false });
    expect(find('ipv4', '10.0.0.1')).toMatchObject({ private: true });
    expect(find('ipv6', '2001:db8::1')).toBeDefined();
    expect(find('email', 'analyst@example.com')).toBeDefined();
    expect(find('md5', 'd41d8cd98f00b204e9800998ecf8427e')).toBeDefined();
    expect(find('cve', 'CVE-2024-1234')).toBeDefined();
  });

  it('deduplicates and counts repeated indicators', () => {
    const hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const report = extractIocs(`${hash}\n${hash.toUpperCase()}\n${hash}`);
    const indicator = report.indicators.find((entry) => entry.type === 'sha256');
    expect(indicator?.count).toBe(3);
    expect(report.counts.sha256).toBe(3);
  });

  it('rejects invalid IPv4 candidates', () => {
    const report = extractIocs('999.1.1.1 and 1.2.3.4.5 and 192.168.1.1');
    expect(report.indicators.filter((indicator) => indicator.type === 'ipv4')).toHaveLength(1);
    expect(report.indicators.find((indicator) => indicator.type === 'ipv4')?.value).toBe('192.168.1.1');
  });

  it('classifies hashes by length', () => {
    const report = extractIocs(
      [
        'd41d8cd98f00b204e9800998ecf8427e',
        'da39a3ee5e6b4b0d3255bfef95601890afd80709',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
      ].join('\n'),
    );
    expect(report.counts.md5).toBe(1);
    expect(report.counts.sha1).toBe(1);
    expect(report.counts.sha256).toBe(1);
    expect(report.counts.sha512).toBe(1);
  });

  it('extracts domains without fetching anything', () => {
    const report = extractIocs('Beacon to update.example.com and cdn.example.net.');
    const domains = report.indicators.filter((indicator) => indicator.type === 'domain').map((i) => i.value);
    expect(domains).toEqual(expect.arrayContaining(['update.example.com', 'cdn.example.net']));
    expect(report.warnings.join(' ')).toMatch(/nothing is fetched/u);
  });
});
