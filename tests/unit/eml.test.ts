import { describe, expect, it } from 'vitest';
import {
  analyzeEml,
  decodeEncodedWords,
  decodeQuotedPrintable,
  parseAddressList,
  unfoldHeaders,
} from '@/tools/email/rfc822';

const SIMPLE = [
  'From: Alice Example <alice@example.com>',
  'To: Bob <bob@example.com>, "Carol, Ops" <carol@example.org>',
  'Subject: =?UTF-8?B?SGVsbG8g8J+Mjw==?=',
  'Date: Fri, 20 Nov 2026 10:00:00 +0000',
  'Message-ID: <abc123@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset="utf-8"',
  '',
  'Visit https://example.com/login?next=/home for details.',
].join('\r\n');

const MULTIPART = [
  'From: "Alice" <alice@example.com>',
  'To: bob@example.com',
  'Subject: Invoice attached',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="outer"',
  '',
  '--outer',
  'Content-Type: text/plain; charset="utf-8"',
  'Content-Transfer-Encoding: 7bit',
  '',
  'Hello Bob, see the attached invoice.',
  '--outer',
  'Content-Type: application/octet-stream; name="invoice.exe"',
  'Content-Disposition: attachment; filename="invoice.exe"',
  'Content-Transfer-Encoding: base64',
  '',
  'AAECAwQ=',
  '--outer--',
  '',
].join('\r\n');

describe('RFC 822 helpers', () => {
  it('unfolds folded headers and keeps raw values', () => {
    const headers = unfoldHeaders('Subject: hello\r\n world\r\nX-Test: one');
    expect(headers).toHaveLength(2);
    expect(headers[0]).toMatchObject({ name: 'Subject', value: 'hello world' });
    expect(headers[0]?.raw).toContain('\r\n');
  });

  it('decodes RFC 2047 encoded-words', () => {
    expect(decodeEncodedWords('=?UTF-8?B?SGVsbG8g8J+Mjw==?=')).toBe('Hello 🌏');
    expect(decodeEncodedWords('=?UTF-8?Q?caf=C3=A9?=')).toBe('café');
  });

  it('decodes quoted-printable including soft line breaks', () => {
    const bytes = decodeQuotedPrintable('caf=C3=A9=\r\n next');
    expect(new TextDecoder().decode(bytes)).toBe('café next');
  });

  it('parses comma-separated address lists with quoted names', () => {
    const addresses = parseAddressList('Bob <bob@example.com>, "Carol, Ops" <carol@example.org>');
    expect(addresses).toEqual([
      { raw: 'Bob <bob@example.com>', name: 'Bob', address: 'bob@example.com' },
      { raw: '"Carol, Ops" <carol@example.org>', name: 'Carol, Ops', address: 'carol@example.org' },
    ]);
  });
});

describe('analyzeEml', () => {
  it('extracts headers, decoded subject, addresses, body, and URLs', async () => {
    const result = await analyzeEml(SIMPLE);
    expect(result.subject).toBe('Hello 🌏');
    expect(result.from[0]?.address).toBe('alice@example.com');
    expect(result.to.map((address) => address.address)).toEqual([
      'bob@example.com',
      'carol@example.org',
    ]);
    expect(result.messageId).toBe('<abc123@example.com>');
    expect(result.bodies.text).toContain('Visit');
    expect(result.urls).toContain('https://example.com/login?next=/home');
    expect(result.warnings).toEqual([]);
  });

  it('identifies and hashes attachments without executing them', async () => {
    const result = await analyzeEml(MULTIPART);
    expect(result.bodies.text).toContain('see the attached invoice');
    expect(result.attachments).toHaveLength(1);
    const attachment = result.attachments[0]!;
    expect(attachment.filename).toBe('invoice.exe');
    expect(attachment.contentType).toBe('application/octet-stream');
    expect(attachment.sizeBytes).toBe(5);
    expect(attachment.magicHex).toBe('00 01 02 03 04');
    expect(attachment.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('reports HTML observations without rendering markup', async () => {
    const html = [
      'Content-Type: text/html; charset="utf-8"',
      '',
      '<html><body><script>alert(1)</script><img src="https://tracker.example/p.gif"></body></html>',
    ].join('\r\n');
    const result = await analyzeEml(html);
    expect(result.bodies.html).toContain('<script>');
    expect(result.observations.join(' ')).toMatch(/never renders it with scripts/u);
    expect(result.observations.join(' ')).toMatch(/remote resources/u);
  });

  it('warns rather than silently dropping an unmatched multipart boundary', async () => {
    const message = [
      'Content-Type: multipart/mixed; boundary="missing"',
      '',
      'no boundaries here',
    ].join('\r\n');
    const result = await analyzeEml(message);
    expect(result.warnings.join(' ')).toMatch(/boundary.*not found/u);
  });
});
