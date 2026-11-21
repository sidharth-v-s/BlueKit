import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ToolContext } from '@/core/runtime/types';
import { DEFAULT_LIMITS } from '@/core/schemas/types';
import {
  analyzeAuthentication,
  parseAuthenticationResults,
  parseDkimSignature,
  parseReceivedSpf,
} from '@/tools/email/auth';
import { runAttachmentExtractor } from '@/tools/email/attachment-extractor';
import { analyzeHeaders, parseReceivedHop } from '@/tools/email/headers';
import { looksLikeEmail } from '@/tools/email/input';
import {
  analyzeEml,
  decodeEncodedWords,
  PARSER_LIMITS,
  parseEmlMessage,
} from '@/tools/email/rfc822';
import { extractUrls } from '@/tools/email/urls';

const signal = new AbortController().signal;
const report = () => {};

function context(): ToolContext {
  return {
    reportProgress: () => {},
    log: () => {},
    signal,
    limits: { ...DEFAULT_LIMITS },
  };
}

function b64(value: string | Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

function multipart(parts: string[]): string {
  return [
    'From: sender@example.com',
    'To: victim@example.com',
    'Subject: Test message',
    'Date: Fri, 20 Nov 2026 10:00:00 +0000',
    'Message-ID: <test@example.com>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="b"',
    '',
    ...parts.flatMap((part) => ['--b', part]),
    '--b--',
    '',
  ].join('\r\n');
}

describe('RFC 2231 and encoded filenames', () => {
  it('joins continuations and decodes the declared charset', () => {
    const message = multipart([
      [
        'Content-Type: application/octet-stream',
        "Content-Disposition: attachment; filename*0*=utf-8''caf%C3%A9%20; filename*1*=%E2%98%95.exe",
        'Content-Transfer-Encoding: base64',
        '',
        b64('data'),
      ].join('\r\n'),
    ]);

    const parsed = parseEmlMessage(message);
    const part = parsed.parts.find((candidate) => candidate.path === '1.1');
    expect(part?.filename).toBe('café ☕.exe');
  });

  it('decodes a single extended parameter and RFC 2047 filenames', () => {
    const extended = multipart([
      [
        'Content-Type: application/octet-stream',
        "Content-Disposition: attachment; filename*=UTF-8''%E2%82%AC%20rates.pdf",
        '',
        'data',
      ].join('\r\n'),
    ]);
    const encodedWord = multipart([
      [
        'Content-Type: application/octet-stream',
        'Content-Disposition: attachment; filename="=?UTF-8?B?cmVwb3J0LnBkZg==?="',
        '',
        'data',
      ].join('\r\n'),
    ]);

    expect(parseEmlMessage(extended).parts[1]?.filename).toBe('€ rates.pdf');
    expect(parseEmlMessage(encodedWord).parts[1]?.filename).toBe('report.pdf');
  });

  it('ignores whitespace between adjacent encoded-words', () => {
    expect(decodeEncodedWords('=?UTF-8?B?SGVsbG8=?= =?UTF-8?B?V29ybGQ=?=')).toBe('HelloWorld');
  });
});

describe('MIME parser hardening', () => {
  it('reports malformed Base64 instead of throwing', async () => {
    const message = multipart([
      [
        'Content-Type: application/octet-stream; name="broken.bin"',
        'Content-Disposition: attachment; filename="broken.bin"',
        'Content-Transfer-Encoding: base64',
        '',
        '!!!not-base64!!!',
      ].join('\r\n'),
    ]);

    const parsed = parseEmlMessage(message);
    const part = parsed.parts.find((candidate) => candidate.path === '1.1');
    expect(part?.decodeError).toMatch(/Base64/u);
    expect(parsed.warnings.join('\n')).toMatch(/could not be decoded/u);

    const analysis = await analyzeEml(message);
    expect(analysis.attachments[0]?.sizeBytes).toBe(0);
  });

  it('enforces the part cap during parsing', () => {
    const parts = Array.from({ length: PARSER_LIMITS.maxParts + 50 }, (_, index) =>
      ['Content-Type: text/plain', '', `part ${index}`].join('\r\n'),
    );
    const parsed = parseEmlMessage(multipart(parts));

    expect(parsed.parts.length).toBeLessThanOrEqual(PARSER_LIMITS.maxParts);
    expect(parsed.warnings.join('\n')).toMatch(/more than 200 MIME parts/u);
    expect(parsed.parts.some((part) => part.omitted)).toBe(false);
  });

  it('does not decode bodies for header-only parsing', () => {
    const message = multipart([
      ['Content-Type: application/octet-stream', 'Content-Transfer-Encoding: base64', '', b64('payload')].join('\r\n'),
    ]);
    const parsed = parseEmlMessage(message, { decodeBodies: false });
    expect(parsed.parts[1]?.bytes).toBeNull();
  });
});

describe('header analysis', () => {
  const message = [
    'Received: from forged.test (forged.test [203.0.113.9]) by mx.example.com with ESMTP id abc; Fri, 20 Nov 2026 10:00:00 +0000',
    'Received: from relay.example.com by mail.attacker.test with ESMTP id def; Fri, 20 Nov 2026 09:59:00 +0000',
    'From: "billing@bank.example" <attacker@evil.example>',
    'To: victim@example.com',
    'Reply-To: help@bank.example',
    'Return-Path: <bounce@relay.example>',
    'Subject: Invoice',
    'Subject: Second subject',
    'Date: not-a-date',
    'Message-ID: <id@evil.example>',
    '',
    'Body',
  ].join('\r\n');

  it('parses Received hops', () => {
    const hop = parseReceivedHop(message.split('\r\n')[0]!.slice('Received: '.length), 0);
    expect(hop.from).toContain('forged.test');
    expect(hop.by).toBe('mx.example.com');
    expect(hop.with).toBe('ESMTP');
    expect(hop.id).toBe('abc');
    expect(hop.ip).toBe('203.0.113.9');
    expect(hop.parsedDate).toBe('2026-11-20T10:00:00.000Z');
  });

  it('reports mismatches, duplicates, and display-name spoofing as findings', () => {
    const analysis = analyzeHeaders(message, message.length);
    const codes = analysis.findings.map((finding) => finding.code);

    expect(analysis.received).toHaveLength(2);
    expect(analysis.domains.from).toEqual(['evil.example']);
    expect(analysis.duplicates).toEqual(expect.arrayContaining([{ name: 'subject', count: 2 }]));
    expect(codes).toEqual(
      expect.arrayContaining([
        'display-name-address-mismatch',
        'duplicate-subject',
        'invalid-date',
        'reply-to-domain-mismatch',
        'return-path-domain-mismatch',
        'received-chain-mismatch',
      ]),
    );
    expect(analysis.limitations.length).toBeGreaterThan(0);
  });

  it('requires a plausible email shape', () => {
    expect(looksLikeEmail(message)).toBe(true);
    expect(looksLikeEmail('https://example.com/a:b\njust a note')).toBe(false);
    expect(looksLikeEmail('From: a@example.com\n\nbody')).toBe(true);
  });
});

describe('authentication evidence', () => {
  const message = [
    'Authentication-Results: mx.example.com;',
    ' spf=fail (sender not authorized) smtp.mailfrom=evil.example;',
    ' dkim=pass header.d=evil.example header.s=s1;',
    ' dmarc=fail header.from=evil.example',
    'Received-SPF: fail (domain of evil.example does not designate 203.0.113.9) client-ip=203.0.113.9; envelope-from=bounce@evil.example; helo=mail.evil.example',
    'DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=evil.example; s=s1; h=from:to:subject; bh=abc; b=def',
    'Received: from mail.evil.example by mx.example.com with ESMTP id x; Fri, 20 Nov 2026 10:00:00 +0000',
    'From: Attacker <user@evil.example>',
    'To: victim@example.com',
    'Subject: Auth test',
    '',
    'Body',
  ].join('\r\n');

  it('parses Authentication-Results methods and properties', () => {
    const header = parseAuthenticationResults(
      'mx.example.com 1; spf=pass smtp.mailfrom=example.com; dkim=pass (good signature) header.d=example.com header.s=sel; dmarc=pass header.from=example.com',
      'authentication-results',
    );
    expect(header.authservId).toBe('mx.example.com');
    expect(header.version).toBe(1);
    expect(header.methods.map((method) => `${method.method}=${method.result}`)).toEqual([
      'spf=pass',
      'dkim=pass',
      'dmarc=pass',
    ]);
    expect(header.methods[1]?.reason).toBe('good signature');
    expect(header.methods[1]?.properties['header.d']).toBe('example.com');
  });

  it('parses Received-SPF and DKIM signatures', () => {
    const spf = parseReceivedSpf(
      'softfail (transition) client-ip=203.0.113.9; envelope-from=bounce@example.com; helo=mail.example.com',
    );
    expect(spf.result).toBe('softfail');
    expect(spf.reason).toBe('transition');
    expect(spf.properties['client-ip']).toBe('203.0.113.9');

    const dkim = parseDkimSignature('v=1; a=rsa-sha256; d=example.com; s=sel; h=from:to:subject; bh=hash; b=sig');
    expect(dkim.domain).toBe('example.com');
    expect(dkim.selector).toBe('sel');
    expect(dkim.signedHeaders).toEqual(['from', 'to', 'subject']);
    expect(dkim.signaturePresent).toBe(true);
  });

  it('summarises results, attributes the authserv-id, and keeps caveats', () => {
    const analysis = analyzeAuthentication(message, message.length);
    expect(analysis.authservIds).toEqual(['mx.example.com']);
    expect(analysis.attribution[0]?.matchedReceivedBy).toEqual(['mx.example.com']);
    expect(analysis.summary.spf[0]?.result).toBe('fail');
    expect(analysis.summary.dkim[0]?.result).toBe('pass');
    expect(analysis.summary.dmarc[0]?.result).toBe('fail');
    expect(analysis.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(['spf-fail', 'dmarc-fail', 'received-spf-fail']),
    );
    expect(analysis.caveats.join(' ')).toMatch(/did not perform independent/u);
    expect(analysis.rawHeaders.some((header) => header.name === 'DKIM-Signature')).toBe(true);
  });
});

describe('URL extraction', () => {
  it('extracts HTML, decodes entities, refangs for parsing, and keeps defanged display', () => {
    const html = [
      '<a href="https://evil.example/login?next=1&amp;x=2">Click</a>',
      '<img src="hxxps://tracker[.]example/pixel.gif">',
      '<p>Also https://Example.COM:443/Path?b=2#frag.</p>',
      '<span>https://ex&#x61;mple.org&#x2F;path</span>',
      '<span>https://evil.example/login?next=1&x=2</span>',
    ].join('\n');

    const result = extractUrls([{ kind: 'html', text: html }]);
    const byHost = new Map(result.urls.map((record) => [record.host, record]));

    const evil = byHost.get('evil.example');
    expect(evil?.normalized).toBe('https://evil.example/login?next=1&x=2');
    expect(evil?.queryKeys).toEqual(['next', 'x']);
    expect(evil?.occurrences).toBeGreaterThanOrEqual(2);

    const tracker = byHost.get('tracker.example');
    expect(tracker?.original).toBe('hxxps://tracker[.]example/pixel.gif');
    expect(tracker?.defanged).toContain('hxxps://tracker[.]example');
    expect(tracker?.flags).toEqual(expect.arrayContaining(['defanged-scheme', 'refanged-brackets']));

    const example = byHost.get('example.com');
    expect(example?.port).toBeNull();
    expect(example?.path).toBe('/Path');
    expect(example?.fragment).toBe('frag');

    expect(byHost.get('example.org')?.path).toBe('/path');
  });

  it('strips invisible characters and trailing punctuation', () => {
    const result = extractUrls([
      { kind: 'text', text: 'Look: https://example.com/a\u200B.\nAnd https://example.org/b,' },
    ]);
    expect(result.urls.map((record) => record.normalized)).toEqual([
      'https://example.com/a',
      'https://example.org/b',
    ]);
    expect(result.urls[0]?.hadInvisibleCharacters).toBe(true);
  });
});

describe('attachment extraction', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(254)]);
  const notes = 'hello notes';

  const message = multipart([
    ['Content-Type: text/plain', '', 'See attached.'].join('\r\n'),
    [
      'Content-Type: application/pdf; name="invoice.pdf"',
      'Content-Disposition: attachment; filename="invoice.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      b64(pdf),
    ].join('\r\n'),
    [
      'Content-Type: application/pdf; name="invoice.pdf.exe"',
      'Content-Disposition: attachment; filename="invoice.pdf.exe"',
      'Content-Transfer-Encoding: base64',
      '',
      b64(exe),
    ].join('\r\n'),
    [
      'Content-Type: text/plain; name="notes.txt"',
      'Content-Disposition: attachment; filename="notes.txt"',
      'Content-Transfer-Encoding: 7bit',
      '',
      notes,
    ].join('\r\n'),
  ]);

  it('hashes decoded bytes, detects magic, and includes download data', async () => {
    const result = await runAttachmentExtractor({ text: message }, report, signal);
    expect(result.output.attachments).toHaveLength(3);

    const invoice = result.output.attachments[0]!;
    expect(invoice.filename).toBe('invoice.pdf');
    expect(invoice.detected?.mime).toBe('application/pdf');
    expect(invoice.sha1).toBe(createHash('sha1').update(pdf).digest('hex'));
    expect(invoice.sha256).toBe(createHash('sha256').update(pdf).digest('hex'));
    expect(Buffer.from(invoice.dataBase64 ?? '', 'base64').equals(pdf)).toBe(true);
    expect(invoice.dataIncluded).toBe(true);

    const risky = result.output.attachments[1]!;
    expect(risky.riskFlags).toEqual(
      expect.arrayContaining(['risky-extension', 'double-extension', 'executable-content']),
    );
    expect(risky.riskFlags).toContain('declared-and-detected-mime-differ');

    const text = result.output.attachments[2]!;
    expect(text.textPreview).toBe(notes);
    expect(text.detected?.category).toBe('text');

    expect(result.output.includedBytes).toBe(pdf.length + exe.length + notes.length);
  });

  it('can omit download data while keeping metadata and hashes', async () => {
    const result = await runAttachmentExtractor(
      { text: message, params: { 'include-data': false } },
      report,
      signal,
    );
    expect(result.output.includeData).toBe(false);
    expect(result.output.includedBytes).toBe(0);
    expect(result.output.attachments.every((attachment) => attachment.dataBase64 === null)).toBe(true);
    expect(result.output.attachments[0]?.sha256).toBe(createHash('sha256').update(pdf).digest('hex'));
  });
});

describe('EML inspector integration', () => {
  it('returns bodies, URLs, attachments, and parser warnings through the tool contract', async () => {
    const { runEmlInspector } = await import('@/tools/email/eml-inspector');
    const message = multipart([
      ['Content-Type: text/plain', '', 'Visit https://example.com/path for details.'].join('\r\n'),
      [
        'Content-Type: application/octet-stream; name="sample.bin"',
        'Content-Disposition: attachment; filename="sample.bin"',
        'Content-Transfer-Encoding: base64',
        '',
        b64('sample'),
      ].join('\r\n'),
    ]);

    const result = await runEmlInspector({ text: message }, report, signal);
    expect(result.output.subject).toBe('Test message');
    expect(result.output.bodies.text).toContain('Visit https://example.com/path');
    expect(result.output.urls).toContain('https://example.com/path');
    expect(result.output.attachments[0]?.filename).toBe('sample.bin');
    expect(result.output.attachments[0]?.sha256).toBe(
      createHash('sha256').update('sample').digest('hex'),
    );
    expect(result.meta?.parts).toBeGreaterThan(1);
  });

  it('rejects non-message input', async () => {
    const { runEmlInspector } = await import('@/tools/email/eml-inspector');
    await expect(runEmlInspector({ text: 'just a note' }, report, signal)).rejects.toMatchObject({
      code: 'unsupported-format',
    });
  });
});

describe('email tool manifests', () => {
  it('route every Phase 3 email tool through the worker', async () => {
    const modules = await Promise.all([
      import('@/tools/email/eml-inspector'),
      import('@/tools/email/header-analyzer'),
      import('@/tools/email/auth-results'),
      import('@/tools/email/url-extractor'),
      import('@/tools/email/attachment-extractor'),
    ]);
    for (const module of modules) {
      const tool = Object.values(module).find(
        (value): value is { manifest: { runtime: string; status: string; phase: number } } =>
          typeof value === 'object' && value !== null && 'manifest' in value,
      );
      expect(tool?.manifest.runtime).toBe('worker');
      expect(tool?.manifest.status).toBe('available');
      expect(tool?.manifest.phase).toBe(3);
    }
    expect(context().limits.maxInputBytes).toBeGreaterThan(0);
  });
});
