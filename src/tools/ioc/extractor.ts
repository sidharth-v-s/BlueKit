import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';

/**
 * IOC extractor.
 *
 * Heuristic by nature: regex extraction finds candidates, not truth. Every
 * output carries that warning, and the UI should keep it visible.
 */

const manifest: ToolManifest = {
  id: 'ioc.extractor',
  name: 'IOC Extractor',
  version: '0.1.0',
  category: 'ioc',
  description:
    'Extract URLs, domains, IPs, hashes, emails, and CVEs from text. Refangs common defanged forms and deduplicates.',
  tags: ['ioc', 'extract', 'indicators', 'url', 'domain', 'hash', 'email', 'cve', 'defang'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.iocList, format: 'bluekit.ioc-list.v1' }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['ioc.bulk-normalizer', 'encoding.defang', 'email.url-extractor'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 2 * 1024 * 1024 },
  ui: {
    inputLabel: 'Text, log, or report',
    outputLabel: 'Extracted indicators',
    placeholder: 'Paste text containing indicators…',
    primaryInput: DATA_TYPES.text,
  },
};

export type IocType =
  | 'url'
  | 'domain'
  | 'ipv4'
  | 'ipv6'
  | 'email'
  | 'md5'
  | 'sha1'
  | 'sha256'
  | 'sha512'
  | 'cve';

export interface IocIndicator {
  type: IocType;
  value: string;
  count: number;
  /** IPv4/IPv6 only. */
  private?: boolean;
}

export interface IocReport {
  inputChars: number;
  refanged: boolean;
  counts: Record<IocType, number>;
  indicators: IocIndicator[];
  warnings: string[];
}

const URL_PATTERN = /\b(?:https?|ftp):\/\/[^\s<>"'`]+/giu;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/giu;
const IPV4_PATTERN = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/gu;
const IPV6_PATTERN = /(?<![:.\w])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![:.\w])/giu;
const HASH_PATTERN = /\b[0-9a-f]{32,128}\b/giu;
const CVE_PATTERN = /\bCVE-\d{4}-\d{4,7}\b/giu;
const DOMAIN_PATTERN =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})\b/giu;

const HASH_TYPES: Record<number, IocType | undefined> = {
  32: 'md5',
  40: 'sha1',
  64: 'sha256',
  128: 'sha512',
};

function refang(text: string): { text: string; changed: boolean } {
  const changedPatterns = [
    /hxxp/iu,
    /\[\.\]|\(\.\)|\{\.\}/u,
    /\[:\]/u,
    /\[@\]|\(@\)/u,
    /\\\./u,
  ];
  const changed = changedPatterns.some((pattern) => pattern.test(text));
  const output = text
    .replace(/hxxps?/giu, (match) => match.replace(/xx/iu, 'tt'))
    .replace(/\[\.\]|\(\.\)|\{\.\}/gu, '.')
    .replace(/\[:\]/gu, ':')
    .replace(/\[@\]|\(@\)/gu, '@')
    .replace(/\\\./gu, '.');
  return { text: output, changed };
}

function trimUrl(value: string): string {
  return value.replace(/[),.;\]}]+$/gu, '');
}

function isPrivateIpv4(value: string): boolean {
  const [a, b] = value.split('.').map(Number);
  if (a === undefined || b === undefined) return false;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 0
  );
}

function isPrivateIpv6(value: string): boolean {
  const lower = value.toLowerCase();
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

function validIpv4(value: string): boolean {
  return value.split('.').every((part) => {
    if (!/^\d{1,3}$/u.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255 && String(number) === part.replace(/^0+(?=\d)/u, '');
  });
}

function validIpv6(value: string): boolean {
  if (!value.includes(':') || value.includes(':::')) return false;
  try {
    // URL parsing is a strict IPv6 validator in both browsers and Node.
    new URL(`http://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}

function classifyHash(value: string): IocType | null {
  return HASH_TYPES[value.length] ?? null;
}

export function extractIocs(raw: string): IocReport {
  const { text, changed } = refang(raw);
  const counts: Record<IocType, number> = {
    url: 0,
    domain: 0,
    ipv4: 0,
    ipv6: 0,
    email: 0,
    md5: 0,
    sha1: 0,
    sha256: 0,
    sha512: 0,
    cve: 0,
  };
  const seen = new Map<string, IocIndicator>();
  const warnings: string[] = [];

  const add = (type: IocType, rawValue: string, privateValue?: boolean) => {
    const value =
      type === 'domain' || type === 'email' || type === 'md5' || type === 'sha1' || type === 'sha256' || type === 'sha512'
        ? rawValue.toLowerCase()
        : rawValue;
    const key = `${type}:${value}`;
    const existing = seen.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    seen.set(key, { type, value, count: 1, ...(privateValue !== undefined ? { private: privateValue } : {}) });
  };

  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0]);
    if (url.length > 8) add('url', url);
  }

  for (const match of text.matchAll(EMAIL_PATTERN)) {
    add('email', match[0]);
  }

  for (const match of text.matchAll(IPV4_PATTERN)) {
    if (validIpv4(match[0])) add('ipv4', match[0], isPrivateIpv4(match[0]));
  }

  for (const match of text.matchAll(IPV6_PATTERN)) {
    if (validIpv6(match[0])) add('ipv6', match[0].toLowerCase(), isPrivateIpv6(match[0]));
  }

  for (const match of text.matchAll(HASH_PATTERN)) {
    const type = classifyHash(match[0]);
    if (type) add(type, match[0]);
  }

  for (const match of text.matchAll(CVE_PATTERN)) {
    add('cve', match[0].toUpperCase());
  }

  for (const match of text.matchAll(DOMAIN_PATTERN)) {
    const value = match[0].toLowerCase();
    // A bare TLD-shaped token (e.g. "file.exe") is still reported; the type is
    // deliberately heuristic and the report warns about it.
    if (!value.includes('..')) add('domain', value);
  }

  const indicators = [...seen.values()]
    .map((indicator) => ({ ...indicator, count: indicator.count }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.value.localeCompare(b.value));
  for (const indicator of indicators) counts[indicator.type] += indicator.count;

  if (indicators.some((indicator) => indicator.type === 'domain')) {
    warnings.push(
      'Domain extraction is heuristic and may include filenames or product names that look like domains.',
    );
  }
  if (indicators.some((indicator) => indicator.type === 'url' || indicator.type === 'domain')) {
    warnings.push('URLs and domains are extracted as text; nothing is fetched or resolved.');
  }

  return {
    inputChars: raw.length,
    refanged: changed,
    counts,
    indicators,
    warnings,
  };
}

async function execute(input: RunnerInput): Promise<ToolResult<IocReport>> {
  const text = input.text ?? '';
  if (text.trim().length === 0) {
    throw new ToolFailure('invalid-input', 'Paste text containing indicators.');
  }

  const report = extractIocs(text);
  return {
    output: report,
    warnings: report.warnings.map((message, index) => ({ code: `ioc-warning-${index}`, message })),
    meta: {
      indicators: report.indicators.length,
      types: Object.entries(report.counts).filter(([, count]) => count > 0).length,
      refanged: report.refanged,
    },
  };
}

export const iocExtractorTool: BlueKitTool<RunnerInput, IocReport> = { manifest, execute };
