import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { refang } from '@/tools/encoding/defang';

/**
 * Bulk IOC normalizer.
 *
 * Line-oriented by design: analysts paste exports from tickets, spreadsheets,
 * and chat logs. The tool refangs, trims wrappers, normalises URL hosts, and
 * deduplicates. It does not fetch or enrich anything.
 */

const manifest: ToolManifest = {
  id: 'ioc.bulk-normalizer',
  name: 'Bulk IOC Normalizer',
  version: '0.1.0',
  category: 'ioc',
  description:
    'Clean a one-per-line indicator list: refang, trim wrappers, normalise URL hosts, classify, and deduplicate.',
  tags: ['ioc', 'normalize', 'dedupe', 'refang', 'bulk', 'csv'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.iocList, format: 'bluekit.ioc-list.v1' }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['ioc.extractor', 'encoding.defang'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 2 * 1024 * 1024 },
  ui: {
    inputLabel: 'Indicators, one per line',
    outputLabel: 'Normalized list',
    placeholder: 'hxxps://evil[.]example/path\n8.8.8.8\nanalyst@example.com',
    primaryInput: DATA_TYPES.text,
  },
};

export type NormalizedIocType =
  | 'url'
  | 'email'
  | 'ipv4'
  | 'ipv6'
  | 'md5'
  | 'sha1'
  | 'sha256'
  | 'sha512'
  | 'cve'
  | 'domain'
  | 'unknown';

export interface NormalizedIoc {
  value: string;
  type: NormalizedIocType;
  count: number;
  sourceLines: number[];
}

export interface BulkIocReport {
  inputLines: number;
  ignoredLines: number;
  unique: number;
  duplicatesRemoved: number;
  entries: NormalizedIoc[];
  warnings: string[];
}

function trimWrappers(value: string): string {
  return value
    .trim()
    .replace(/^[\s"'`<>()[\]{},;]+/u, '')
    .replace(/[\s"'`<>(){}[\],;]+$/u, '');
}

function normaliseUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hostname = url.hostname.toLowerCase();
    url.protocol = url.protocol.toLowerCase();
    return url.toString();
  } catch {
    return value;
  }
}

function classify(value: string): NormalizedIocType {
  if (/^https?:\/\//iu.test(value)) return 'url';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(value)) return 'email';
  if (/^CVE-\d{4}-\d{4,7}$/iu.test(value)) return 'cve';
  const hashMatch = /^[0-9a-f]{32}$/iu.test(value)
    ? 'md5'
    : /^[0-9a-f]{40}$/iu.test(value)
      ? 'sha1'
      : /^[0-9a-f]{64}$/iu.test(value)
        ? 'sha256'
        : /^[0-9a-f]{128}$/iu.test(value)
          ? 'sha512'
          : null;
  if (hashMatch) return hashMatch;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(value)) {
    const valid = value.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
    if (valid) return 'ipv4';
  }
  if (value.includes(':') && /^[0-9a-f:]+$/iu.test(value)) {
    try {
      new URL(`http://[${value}]/`);
      return 'ipv6';
    } catch {
      // Not an address; fall through.
    }
  }
  if (/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/iu.test(value)) {
    return 'domain';
  }
  return 'unknown';
}

export function normalizeIndicators(text: string): BulkIocReport {
  const lines = text.split(/\r?\n/u);
  const seen = new Map<string, NormalizedIoc>();
  let ignoredLines = 0;

  lines.forEach((rawLine, index) => {
    const withoutComment = rawLine
      .replace(/(?:^|\s)#.*$/u, '')
      .replace(/^\s*(?:[-*•]+|\d+[.)])\s+/u, '')
      .trim();
    if (withoutComment.length === 0) {
      ignoredLines += 1;
      return;
    }

    const restored = refang(withoutComment);
    const cleaned = trimWrappers(restored);
    if (cleaned.length === 0) {
      ignoredLines += 1;
      return;
    }

    const type = classify(cleaned);
    const value = type === 'url' ? normaliseUrl(cleaned) : cleaned;
    // URLs already have a lowercased host but a case-sensitive path; other
    // indicator types are case-insensitive for deduplication.
    const key = type === 'url' ? value : value.toLowerCase();
    const existing = seen.get(key);
    if (existing) {
      existing.count += 1;
      existing.sourceLines.push(index + 1);
      return;
    }
    seen.set(key, { value, type, count: 1, sourceLines: [index + 1] });
  });

  const entries = [...seen.values()].sort(
    (a, b) => a.type.localeCompare(b.type) || a.value.localeCompare(b.value),
  );
  const duplicatesRemoved = entries.reduce((total, entry) => total + entry.count - 1, 0);

  const warnings: string[] = [];
  if (entries.length === 0) {
    warnings.push('No indicators were found in the input.');
  } else if (entries.some((entry) => entry.type === 'unknown')) {
    warnings.push('Some lines could not be classified; they are kept as unknown rather than dropped.');
  }
  warnings.push('Normalisation is syntactic. Nothing is resolved, fetched, or verified.');

  return {
    inputLines: lines.length,
    ignoredLines,
    unique: entries.length,
    duplicatesRemoved,
    entries,
    warnings,
  };
}

async function execute(input: RunnerInput): Promise<ToolResult<BulkIocReport>> {
  const text = input.text ?? '';
  if (text.trim().length === 0) throw new ToolFailure('invalid-input', 'Paste indicators, one per line.');

  const report = normalizeIndicators(text);
  return {
    output: report,
    warnings: report.warnings.map((message, index) => ({ code: `ioc-normalize-${index}`, message })),
    meta: {
      unique: report.unique,
      duplicatesRemoved: report.duplicatesRemoved,
      unknown: report.entries.filter((entry) => entry.type === 'unknown').length,
    },
  };
}

export const bulkNormalizerTool: BlueKitTool<RunnerInput, BulkIocReport> = { manifest, execute };
