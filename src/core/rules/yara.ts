import {
  YARA_ENGINE_INFO,
  YARA_JOB_TIMEOUT_MS,
  YARA_MAX_FILE_BYTES,
  YARA_MAX_FILES,
  YARA_MAX_MATCHES_PER_PATTERN,
  YARA_MAX_MATCHED_RULES,
  YARA_MAX_PATTERNS_PER_RULE,
  YARA_MAX_SOURCE_BYTES,
  YARA_MAX_TOTAL_BYTES,
  YARA_MODULES,
  YARA_PREVIEW_BYTES,
  YARA_SCAN_TIMEOUT_MS,
  type YaraEngineInfo,
} from './yara-meta';

/**
 * YARA-facing types and pure helpers.
 *
 * Rule compilation and scanning live in `yara-engine.ts`, which imports the
 * YARA-X WebAssembly module on demand. Everything here is safe to load in the
 * view and in unit tests without initialising WebAssembly.
 */

export interface YaraCompileReport {
  engine: YaraEngineInfo;
  valid: boolean;
  errors: string[];
  warnings: string[];
  sourceBytes: number;
}

export interface YaraMetadataEntry {
  identifier: string;
  value: string | number | boolean;
}

export interface YaraPatternMatch {
  offset: number;
  length: number;
  /** Hex preview of the matched bytes, when they were available. */
  preview: string | null;
  /** Printable ASCII preview of the matched bytes, when they were available. */
  ascii: string | null;
}

export interface YaraPatternHit {
  identifier: string;
  kind: string;
  isPrivate: boolean;
  matches: YaraPatternMatch[];
  /** Matches the engine reported before the display cap. */
  totalMatches: number;
  truncated: boolean;
}

export interface YaraRuleMatch {
  identifier: string;
  namespace: string;
  isGlobal: boolean;
  isPrivate: boolean;
  tags: string[];
  metadata: YaraMetadataEntry[];
  patterns: YaraPatternHit[];
  truncated: boolean;
}

export interface YaraScanOutcome {
  valid: boolean;
  matches: YaraRuleMatch[];
  errors: string[];
  warnings: string[];
  truncated: boolean;
}

export interface YaraFileScan extends YaraScanOutcome {
  name: string;
  size: number;
  durationMs: number;
}

export interface YaraScanLimits {
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
  scanTimeoutMs: number;
  jobTimeoutMs: number;
  maxMatchesPerPattern: number;
}

export interface YaraScanReport extends YaraCompileReport {
  files: YaraFileScan[];
  matchedFiles: number;
  limits: YaraScanLimits;
}

export interface YaraNormalizeOptions {
  maxRules?: number;
  maxPatterns?: number;
  maxMatches?: number;
  previewBytes?: number;
  /** Included data, used to build previews for offsets. */
  data?: Uint8Array;
}

const MAX_ENGINE_MESSAGE_LENGTH = 4_000;
const MAX_ENGINE_MESSAGES = 20;
const MAX_TAGS = 20;
const MAX_METADATA = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function boolValue(value: unknown): boolean {
  return value === true;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function engineMessages(value: unknown, limit = MAX_ENGINE_MESSAGES): string[] {
  if (!Array.isArray(value)) return [];
  const messages: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    messages.push(trimmed.slice(0, MAX_ENGINE_MESSAGE_LENGTH));
    if (messages.length >= limit) break;
  }
  return messages;
}

/** Return a short diagnostic for an unusable rule source, or null when usable. */
export function validateYaraSource(source: string): string | null {
  if (source.trim().length === 0) return 'The rule editor is empty.';
  const bytes = new TextEncoder().encode(source).byteLength;
  if (bytes > YARA_MAX_SOURCE_BYTES) {
    return `The rule is ${bytes.toLocaleString()} bytes; the editor cap is ${
      YARA_MAX_SOURCE_BYTES / 1024
    } KiB.`;
  }
  return null;
}

export function yaraSourceBytes(source: string): number {
  return new TextEncoder().encode(source).byteLength;
}

/** Top-level `import "..."` names, best effort. Comments are not stripped. */
export function detectYaraImports(source: string): string[] {
  const names = new Set<string>();
  const pattern = /^[ \t]*import[ \t]+"([^"]+)"[ \t]*$/gmu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1]?.trim();
    if (name) names.add(name);
  }
  return [...names];
}

/**
 * Warnings the editor adds before compilation. The engine remains the authority
 * on whether an import exists; these notes explain BlueKit's boundaries.
 */
export function yaraSourceWarnings(source: string): string[] {
  const warnings: string[] = [];
  const imports = detectYaraImports(source);
  for (const name of imports) {
    if (name === 'vt') {
      warnings.push(
        'The rule imports "vt". BlueKit does not provide VirusTotal data or network lookups, so this module is outside the supported matrix.',
      );
      continue;
    }
    if (!YARA_MODULES.includes(name)) {
      warnings.push(
        `The rule imports "${name}", which is not in the documented module list. Compilation will fail if the pinned YARA-X build does not provide it.`,
      );
    }
  }
  if (/^[ \t]*include[ \t]+"/mu.test(source)) {
    warnings.push(
      'The rule uses include. BlueKit does not expose a filesystem for includes; keep the rule in one file.',
    );
  }
  return warnings;
}

export function yaraFileProblem(name: string, size: number): string | null {
  if (size === 0) return `"${name}" is empty.`;
  if (size > YARA_MAX_FILE_BYTES) {
    return `"${name}" is ${size.toLocaleString()} bytes; each file is capped at ${
      YARA_MAX_FILE_BYTES / 1024 / 1024
    } MiB.`;
  }
  return null;
}

export function emptyYaraScanLimits(): YaraScanLimits {
  return {
    maxFileBytes: YARA_MAX_FILE_BYTES,
    maxTotalBytes: YARA_MAX_TOTAL_BYTES,
    maxFiles: YARA_MAX_FILES,
    scanTimeoutMs: YARA_SCAN_TIMEOUT_MS,
    jobTimeoutMs: YARA_JOB_TIMEOUT_MS,
    maxMatchesPerPattern: YARA_MAX_MATCHES_PER_PATTERN,
  };
}

function hexPreview(
  data: Uint8Array | undefined,
  offset: number,
  length: number,
  previewBytes: number,
): string | null {
  if (!data || data.length === 0) return null;
  const start = Math.max(0, Math.min(Math.trunc(offset), data.length));
  if (start >= data.length) return null;
  const wanted = Math.max(1, Math.min(Math.trunc(length), previewBytes));
  const end = Math.min(data.length, start + wanted);
  const parts: string[] = [];
  for (let index = start; index < end; index += 1) {
    parts.push((data[index] ?? 0).toString(16).padStart(2, '0'));
  }
  const remaining = Math.max(0, Math.trunc(length) - (end - start));
  return remaining > 0 ? `${parts.join(' ')} …` : parts.join(' ');
}

function asciiPreview(
  data: Uint8Array | undefined,
  offset: number,
  length: number,
  previewBytes: number,
): string | null {
  if (!data || data.length === 0) return null;
  const start = Math.max(0, Math.min(Math.trunc(offset), data.length));
  if (start >= data.length) return null;
  const wanted = Math.max(1, Math.min(Math.trunc(length), previewBytes));
  const end = Math.min(data.length, start + wanted);
  let result = '';
  for (let index = start; index < end; index += 1) {
    const byte = data[index] ?? 0;
    if (byte >= 0x20 && byte <= 0x7e) {
      result += String.fromCharCode(byte);
    } else {
      result += '·';
    }
  }
  const remaining = Math.max(0, Math.trunc(length) - (end - start));
  return remaining > 0 ? `${result}…` : result;
}

function normalizeMetadata(value: unknown): YaraMetadataEntry[] {
  const entries: YaraMetadataEntry[] = [];
  const push = (identifier: unknown, entryValue: unknown) => {
    const key = typeof identifier === 'string' ? identifier.trim() : '';
    if (!key) return;
    if (typeof entryValue === 'string' || typeof entryValue === 'number' || typeof entryValue === 'boolean') {
      entries.push({ identifier: key, value: entryValue });
    } else if (entryValue !== null && entryValue !== undefined) {
      entries.push({ identifier: key, value: String(entryValue) });
    }
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) continue;
      push(item.identifier, item.value);
      if (entries.length >= MAX_METADATA) break;
    }
  } else if (isRecord(value)) {
    for (const [key, entryValue] of Object.entries(value)) {
      push(key, entryValue);
      if (entries.length >= MAX_METADATA) break;
    }
  }
  return entries;
}

function normalizePatterns(
  value: unknown,
  options: {
    maxPatterns: number;
    maxMatches: number;
    previewBytes: number;
    data?: Uint8Array;
  },
): { patterns: YaraPatternHit[]; truncated: boolean } {
  const raw = Array.isArray(value) ? value : [];
  const patterns: YaraPatternHit[] = [];
  let truncated = raw.length > options.maxPatterns;

  for (const entry of raw.slice(0, options.maxPatterns)) {
    if (!isRecord(entry)) continue;
    const rawMatches = Array.isArray(entry.matches) ? entry.matches : [];
    if (rawMatches.length > options.maxMatches) truncated = true;
    const matches: YaraPatternMatch[] = [];
    for (const match of rawMatches.slice(0, options.maxMatches)) {
      if (!isRecord(match)) continue;
      const offset = Math.max(0, numberValue(match.offset));
      const length = Math.max(0, numberValue(match.length));
      matches.push({
        offset,
        length,
        preview: hexPreview(options.data, offset, length, options.previewBytes),
        ascii: asciiPreview(options.data, offset, length, options.previewBytes),
      });
    }
    patterns.push({
      identifier: stringValue(entry.identifier, '?'),
      kind: stringValue(entry.kind, 'unknown'),
      isPrivate: boolValue(entry.isPrivate),
      matches,
      totalMatches: rawMatches.length,
      truncated: rawMatches.length > options.maxMatches,
    });
  }

  return { patterns, truncated };
}

/**
 * Map the engine's scan payload into stable, bounded BlueKit records.
 *
 * The engine returns plain structured-clone objects. Every field is defensive:
 * a future engine change should degrade the display, not crash the worker.
 */
export function normalizeYaraScanResult(
  raw: unknown,
  options: YaraNormalizeOptions = {},
): YaraScanOutcome {
  if (!isRecord(raw)) {
    return {
      valid: false,
      matches: [],
      errors: ['The YARA engine returned an unexpected scan result.'],
      warnings: [],
      truncated: false,
    };
  }
  const record = raw;
  const normalizedOptions = {
    maxRules: options.maxRules ?? YARA_MAX_MATCHED_RULES,
    maxPatterns: options.maxPatterns ?? YARA_MAX_PATTERNS_PER_RULE,
    maxMatches: options.maxMatches ?? YARA_MAX_MATCHES_PER_PATTERN,
    previewBytes: options.previewBytes ?? YARA_PREVIEW_BYTES,
    data: options.data,
  };

  const rawMatches = Array.isArray(record.matches) ? record.matches : [];
  let truncated = rawMatches.length > normalizedOptions.maxRules;
  const matches: YaraRuleMatch[] = [];

  for (const entry of rawMatches.slice(0, normalizedOptions.maxRules)) {
    if (!isRecord(entry)) continue;
    const patterns = normalizePatterns(entry.patterns, normalizedOptions);
    if (patterns.truncated) truncated = true;
    const tags: string[] = [];
    if (Array.isArray(entry.tags)) {
      for (const tag of entry.tags) {
        if (typeof tag !== 'string') continue;
        const trimmed = tag.trim();
        if (!trimmed) continue;
        tags.push(trimmed);
        if (tags.length >= MAX_TAGS) break;
      }
    }
    matches.push({
      identifier: stringValue(entry.identifier, '?'),
      namespace: stringValue(entry.namespace, 'default'),
      isGlobal: boolValue(entry.isGlobal),
      isPrivate: boolValue(entry.isPrivate),
      tags,
      metadata: normalizeMetadata(entry.metadata),
      patterns: patterns.patterns,
      truncated: patterns.truncated,
    });
  }

  return {
    valid: record.valid !== false,
    matches,
    errors: engineMessages(record.errors),
    warnings: engineMessages(record.warnings),
    truncated,
  };
}

export function yaraEngineLabel(engine: YaraEngineInfo = YARA_ENGINE_INFO): string {
  return `${engine.name} ${engine.version}`;
}
