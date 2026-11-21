import { defang, refang } from '../encoding/defang';
import { decodeHtmlEntities, extractHtmlLinkTargets, htmlToText } from './text';

/**
 * URL extraction for MailSleuth.
 *
 * Nothing here fetches, resolves, or preloads a URL. The output preserves the
 * original text, a normalized comparison form, and a defanged display form so
 * the analyst can triage without accidentally making the indicator live.
 */

export type UrlSource = 'text' | 'html';

export interface EmailUrlRecord {
  original: string;
  normalized: string;
  defanged: string;
  scheme: string;
  host: string;
  port: string | null;
  path: string;
  query: string | null;
  fragment: string | null;
  queryKeys: string[];
  sources: UrlSource[];
  occurrences: number;
  hadInvisibleCharacters: boolean;
  flags: string[];
}

export interface UrlExtractionResult {
  urls: EmailUrlRecord[];
  hosts: { host: string; count: number }[];
  warnings: string[];
}

const URL_PATTERN = /\b(?:https?|hxxps?|ftps?):\/\/[^\s<>"'`\u0000-\u001f]+/giu;
const INVISIBLE_PATTERN = /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/u;

function stripInvisible(input: string): { text: string; removed: boolean } {
  const text = input.replace(INVISIBLE_PATTERN, '');
  return { text, removed: text.length !== input.length };
}

function cleanCandidate(input: string): string {
  let value = input.trim();
  let previous = '';
  while (value !== previous) {
    previous = value;
    value = value.replace(TRAILING_PUNCTUATION, '');
    // Drop a closing bracket only when it has no matching opener in the URL.
    const last = value[value.length - 1];
    if (last === ')' && (value.match(/\(/gu)?.length ?? 0) < (value.match(/\)/gu)?.length ?? 0)) {
      value = value.slice(0, -1);
    }
    if (last === ']' && (value.match(/\[/gu)?.length ?? 0) < (value.match(/\]/gu)?.length ?? 0)) {
      value = value.slice(0, -1);
    }
    if (last === '}' && (value.match(/\{/gu)?.length ?? 0) < (value.match(/\}/gu)?.length ?? 0)) {
      value = value.slice(0, -1);
    }
  }
  return value;
}

function isIpHost(host: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) return true;
  return host.includes(':');
}

function flagsFor(url: URL, defangedScheme: boolean): string[] {
  const flags: string[] = [];
  if (defangedScheme) flags.push('defanged-scheme');
  if (url.username || url.password) flags.push('embedded-credentials');
  if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) {
    flags.push('non-standard-port');
  }
  if (isIpHost(url.hostname)) flags.push('ip-literal-host');
  if (url.hostname.startsWith('xn--') || url.hostname.includes('.xn--')) flags.push('punycode-host');
  if (url.protocol !== 'http:' && url.protocol !== 'https:') flags.push('non-http-scheme');
  if (url.href.length > 2000) flags.push('very-long-url');
  if (url.username || url.password) flags.push('review-before-sharing');
  return flags;
}

function toRecord(original: string, source: UrlSource): EmailUrlRecord | null {
  const cleaned = cleanCandidate(original);
  if (cleaned.length < 8) return null;

  const invisible = stripInvisible(cleaned);
  const refanged = refang(invisible.text);
  const defangedScheme = /^hxxps?:/iu.test(invisible.text);
  const hadDefangBrackets = /\[\.\]|\[:\]|\[@\]/iu.test(invisible.text);

  let url: URL;
  try {
    url = new URL(refanged);
  } catch {
    return null;
  }
  if (!url.hostname) return null;

  const query = url.search.length > 1 ? url.search.slice(1) : null;
  const flags = flagsFor(url, defangedScheme);
  if (invisible.removed) flags.push('invisible-characters-removed');
  if (hadDefangBrackets) flags.push('refanged-brackets');

  return {
    original: cleaned,
    normalized: url.href,
    defanged: defang(url.href),
    scheme: url.protocol.replace(/:$/u, '').toLowerCase(),
    host: url.hostname.toLowerCase().replace(/\.$/u, ''),
    port: url.port || null,
    path: url.pathname || '/',
    query,
    fragment: url.hash.length > 1 ? url.hash.slice(1) : null,
    queryKeys: query ? [...new Set([...url.searchParams.keys()])] : [],
    sources: [source],
    occurrences: 1,
    hadInvisibleCharacters: invisible.removed,
    flags,
  };
}

function scan(value: string, source: UrlSource, into: Map<string, EmailUrlRecord>): number {
  let malformed = 0;
  for (const match of value.matchAll(URL_PATTERN)) {
    const record = toRecord(match[0], source);
    if (!record) {
      malformed += 1;
      continue;
    }
    const existing = into.get(record.normalized);
    if (existing) {
      existing.occurrences += 1;
      if (!existing.sources.includes(source)) existing.sources.push(source);
      for (const flag of record.flags) {
        if (!existing.flags.includes(flag)) existing.flags.push(flag);
      }
    } else {
      into.set(record.normalized, record);
    }
  }
  return malformed;
}

/**
 * Extract URLs from one or more text/HTML sources. The same normalized URL is
 * reported once with an occurrence count and the set of sources it appeared in.
 */
export function extractUrls(sources: { kind: UrlSource; text: string }[]): UrlExtractionResult {
  const found = new Map<string, EmailUrlRecord>();
  const warnings: string[] = [];
  let malformed = 0;

  for (const source of sources) {
    if (!source.text) continue;
    if (source.kind === 'html') {
      const decoded = decodeHtmlEntities(source.text);
      malformed += scan(decoded, 'html', found);
      malformed += scan(htmlToText(decoded), 'html', found);
      for (const target of extractHtmlLinkTargets(decoded)) {
        // Attribute targets are often scheme-relative or relative; only full
        // absolute URLs are in scope for this extractor.
        if (!/^(?:https?|hxxps?|ftps?):\/\//iu.test(target)) continue;
        const record = toRecord(target, 'html');
        if (!record) {
          malformed += 1;
          continue;
        }
        const existing = found.get(record.normalized);
        if (existing) {
          existing.occurrences += 1;
          if (!existing.sources.includes('html')) existing.sources.push('html');
        } else {
          found.set(record.normalized, record);
        }
      }
    } else {
      malformed += scan(decodeHtmlEntities(source.text), 'text', found);
    }
  }

  if (malformed > 0) {
    warnings.push(
      `${malformed} candidate URL${malformed === 1 ? '' : 's'} could not be parsed and were omitted. They remain in the original body.`,
    );
  }

  const urls = [...found.values()];
  const hostCounts = new Map<string, number>();
  for (const record of urls) hostCounts.set(record.host, (hostCounts.get(record.host) ?? 0) + 1);

  return {
    urls,
    hosts: [...hostCounts.entries()]
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host)),
    warnings,
  };
}
