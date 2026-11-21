import { describe, expect, it } from 'vitest';
import type { ToolContext } from '@/core/runtime/types';
import { DEFAULT_LIMITS } from '@/core/schemas/types';
import { decodeBase32, encodeBase32 } from '@/tools/encoding/base32';
import { defang, refang } from '@/tools/encoding/defang';
import { decodeHex, encodeHex } from '@/tools/encoding/hex';
import { decodeHtmlEntities, encodeHtmlEntities } from '@/tools/encoding/html-entities';
import { rotN } from '@/tools/encoding/rot13';
import { decodeUrl, encodeUrl, safeEncodeUrl, urlTool } from '@/tools/encoding/url';

function context(): ToolContext {
  return {
    reportProgress: () => {},
    log: () => {},
    signal: new AbortController().signal,
    limits: { ...DEFAULT_LIMITS },
  };
}

describe('hex', () => {
  it('encodes UTF-8 bytes in multiple formats', () => {
    expect(encodeHex('Hello', { format: 'plain' })).toBe('48656c6c6f');
    expect(encodeHex('Hello', { format: 'spaced' })).toBe('48 65 6c 6c 6f');
    expect(encodeHex('Hello', { format: 'colon', uppercase: true })).toBe('48:65:6C:6C:6F');
    expect(encodeHex('A', { format: 'prefix' })).toBe('0x41');
  });

  it('decodes separators and 0x prefixes', () => {
    expect(new TextDecoder().decode(decodeHex('0x48 0x65 0x6c 0x6c 0x6f'))).toBe('Hello');
    expect(new TextDecoder().decode(decodeHex('48:65:6c:6c:6f'))).toBe('Hello');
  });

  it('rejects odd length and non-hex input', () => {
    expect(() => decodeHex('abc')).toThrowError(/odd number/u);
    expect(() => decodeHex('zz')).toThrowError(/non-hex/u);
  });
});

describe('base32', () => {
  it('matches RFC 4648 vectors', () => {
    expect(encodeBase32(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI======');
    expect(encodeBase32(new TextEncoder().encode('Hello'), false)).toBe('JBSWY3DP');
  });

  it('decodes with and without padding', () => {
    expect(new TextDecoder().decode(decodeBase32('MZXW6YTBOI======'))).toBe('foobar');
    expect(new TextDecoder().decode(decodeBase32('JBSWY3DP'))).toBe('Hello');
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => decodeBase32('JBSWY3D0')).toThrowError(/not in the standard Base32/u);
  });
});

describe('url encoding', () => {
  it('distinguishes component and full-URI scope', () => {
    expect(encodeUrl('a b&c', 'component')).toBe('a%20b%26c');
    expect(encodeUrl('a b&c', 'uri')).toBe('a%20b&c');
  });

  it('decodes UTF-8 percent escapes', () => {
    expect(decodeUrl('%E2%9C%93')).toBe('✓');
    expect(decodeUrl('a+b', true)).toBe('a b');
    expect(decodeUrl('a+b', false)).toBe('a+b');
  });

  it('reports malformed escapes instead of guessing', () => {
    expect(() => decodeUrl('%E0%A4%A')).toThrowError(/Malformed|invalid UTF-8/u);
  });

  it('reports unpaired surrogates instead of throwing a raw URIError', () => {
    expect(() => safeEncodeUrl('\ud800', 'component')).toThrowError(/unpaired surrogate/u);
  });

  it('reads the selected scope from runner parameters', async () => {
    const result = await urlTool.execute(
      { text: 'a b&c', params: { mode: 'encode', scope: 'uri' } },
      context(),
      new AbortController().signal,
    );
    expect(result.output).toBe('a%20b&c');
  });
});

describe('HTML entities', () => {
  it('escapes markup characters', () => {
    expect(encodeHtmlEntities('<a href="x">&</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;',
    );
    expect(encodeHtmlEntities("it's", false)).toBe('it&#39;s');
  });

  it('decodes named and numeric references', () => {
    expect(decodeHtmlEntities('&lt;b&gt; &amp; &quot;x&quot; &#39;')).toBe('<b> & "x" \'');
    expect(decodeHtmlEntities('&#x1F600;')).toBe('😀');
    expect(decodeHtmlEntities('&#65;')).toBe('A');
  });

  it('leaves unknown entities untouched', () => {
    expect(decodeHtmlEntities('&notareal; &amp;')).toBe('&notareal; &');
  });

  it('escapes non-ASCII code points when asked', () => {
    expect(encodeHtmlEntities('é')).toBe('&#xE9;');
    expect(encodeHtmlEntities('é', false)).toBe('é');
  });
});

describe('ROT-N', () => {
  it('applies standard ROT13', () => {
    expect(rotN('Hello, World!', 13)).toBe('Uryyb, Jbeyq!');
  });

  it('handles arbitrary shifts and rejects zero-width misuse', () => {
    expect(rotN('abc', 1)).toBe('bcd');
    expect(rotN('abc', 26)).toBe('abc');
  });

  it('preserves non-letters', () => {
    expect(rotN('a1-b_2', 13)).toBe('n1-o_2');
  });
});

describe('defang / refang', () => {
  it('defangs schemes, dots, and at-signs', () => {
    expect(defang('https://evil.example/a@b')).toBe('hxxps://evil[.]example/a[@]b');
    expect(defang('http://x.test:8080')).toBe('hxxp://x[.]test[:]8080');
  });

  it('restores the original text', () => {
    const original = 'https://evil.example/path?q=a@b.test';
    expect(refang(defang(original))).toBe(original);
    expect(refang('hxxp://evil[.]example')).toBe('http://evil.example');
  });
});
