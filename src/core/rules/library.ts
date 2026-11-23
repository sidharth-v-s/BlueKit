import type { StorageAdapter } from '@/core/storage/db';
import type { SigmaLogsource, SigmaValidationReport } from './sigma';
import { SIGMA_MAX_INPUT_BYTES } from './sigma-meta';

/**
 * Local Sigma rule library.
 *
 * Records live in the existing `rules` IndexedDB store and are included in the
 * versioned BlueKit archive. Import never overwrites an existing rule: every
 * imported record gets a fresh local id and keeps its attribution.
 */

export const RULES_BUNDLE_FORMAT = 'bluekit.rules';
export const RULES_BUNDLE_SCHEMA_VERSION = 1;
export const MAX_RULE_BUNDLE_BYTES = 8 * 1024 * 1024;
export const MAX_RULES_PER_BUNDLE = 500;
const MAX_RULE_METADATA_LENGTH = 20_000;
const MAX_TAGS = 100;
const MAX_WARNINGS = 40;
const MAX_ID_LENGTH = 200;

export class RuleLibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleLibraryError';
  }
}

export interface RuleAttribution {
  source: string;
  url?: string;
  license?: string;
  importedAt?: string;
  note?: string;
}

export interface RuleMetadata {
  title: string | null;
  sigmaId: string | null;
  status: string | null;
  level: string | null;
  author: string | null;
  description: string | null;
  logsource: SigmaLogsource | null;
  tags: string[];
  warnings: string[];
  schemaValid: boolean | null;
  schemaSha256: string | null;
}

export interface RuleRecord extends RuleMetadata {
  schemaVersion: 1;
  id: string;
  format: 'sigma';
  content: string;
  source: 'local' | 'imported';
  attribution: RuleAttribution | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface RulesBundle {
  format: typeof RULES_BUNDLE_FORMAT;
  schemaVersion: typeof RULES_BUNDLE_SCHEMA_VERSION;
  exportedAt: string;
  dataHandling: 'local-only';
  rules: RuleRecord[];
}

export interface BuildRuleRecordInput {
  content: string;
  metadata: RuleMetadata;
  previous?: RuleRecord | null;
  source?: 'local' | 'imported';
  attribution?: RuleAttribution | null;
  now?: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function newRuleId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }
  return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function textOrNull(value: unknown, maxLength = MAX_RULE_METADATA_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    result.push(trimmed.slice(0, MAX_RULE_METADATA_LENGTH));
    if (result.length >= limit) break;
  }
  return [...new Set(result)];
}

function sanitizeLogsource(value: unknown): SigmaLogsource | null {
  if (!isRecord(value)) return null;
  const logsource: SigmaLogsource = {};
  const category = textOrNull(value.category, 500);
  const product = textOrNull(value.product, 500);
  const service = textOrNull(value.service, 500);
  const definition = textOrNull(value.definition);
  if (category) logsource.category = category;
  if (product) logsource.product = product;
  if (service) logsource.service = service;
  if (definition) logsource.definition = definition;
  return Object.keys(logsource).length > 0 ? logsource : null;
}

export function sanitizeRuleAttribution(value: unknown): RuleAttribution | null {
  if (!isRecord(value)) return null;
  const source = textOrNull(value.source, 500);
  if (!source) return null;
  return {
    source,
    ...(textOrNull(value.url, 2_000) ? { url: textOrNull(value.url, 2_000) as string } : {}),
    ...(textOrNull(value.license, 500) ? { license: textOrNull(value.license, 500) as string } : {}),
    ...(textOrNull(value.importedAt, 100)
      ? { importedAt: textOrNull(value.importedAt, 100) as string }
      : {}),
    ...(textOrNull(value.note) ? { note: textOrNull(value.note) as string } : {}),
  };
}

export function sanitizeRuleMetadata(input: unknown): RuleMetadata {
  const value = isRecord(input) ? input : {};
  return {
    title: textOrNull(value.title, 256),
    sigmaId: textOrNull(value.sigmaId, 256),
    status: textOrNull(value.status, 100),
    level: textOrNull(value.level, 100),
    author: textOrNull(value.author, 1_000),
    description: textOrNull(value.description),
    logsource: sanitizeLogsource(value.logsource),
    tags: stringList(value.tags, MAX_TAGS),
    warnings: stringList(value.warnings, MAX_WARNINGS),
    schemaValid: typeof value.schemaValid === 'boolean' ? value.schemaValid : null,
    schemaSha256: textOrNull(value.schemaSha256, 128),
  };
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function metadataFromReport(report: SigmaValidationReport): RuleMetadata {
  const summary = report.summary;
  return {
    title: summary?.title ?? null,
    sigmaId: summary?.id ?? null,
    status: summary?.status ?? null,
    level: summary?.level ?? null,
    author: summary?.author ?? null,
    description: summary?.description ?? null,
    logsource: summary?.logsource ?? null,
    tags: summary?.tags ?? [],
    warnings: report.warnings,
    schemaValid: report.valid,
    schemaSha256: report.schemaSha256,
  };
}

export function buildRuleRecord(input: BuildRuleRecordInput): RuleRecord {
  if (input.content.trim().length === 0) {
    throw new RuleLibraryError('A saved rule must contain YAML.');
  }
  if (new TextEncoder().encode(input.content).byteLength > SIGMA_MAX_INPUT_BYTES) {
    throw new RuleLibraryError(
      `The rule exceeds the ${SIGMA_MAX_INPUT_BYTES / 1024} KiB local library limit.`,
    );
  }

  const previous = input.previous ?? null;
  const now = (input.now ?? new Date()).toISOString();
  const metadata = sanitizeRuleMetadata(input.metadata);

  return {
    schemaVersion: 1,
    id: previous?.id ?? newRuleId(),
    format: 'sigma',
    content: input.content,
    ...metadata,
    source: previous?.source ?? input.source ?? 'local',
    attribution: previous ? previous.attribution : (input.attribution ?? null),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    revision: (previous?.revision ?? 0) + 1,
  };
}

function normalizeRuleRecord(value: unknown, freshId = false): RuleRecord | null {
  if (!isRecord(value)) return null;
  // The rules store is shared with future formats; only claim Sigma records.
  if (value.format !== undefined && value.format !== 'sigma') return null;
  if (typeof value.content !== 'string' || value.content.trim().length === 0) return null;
  if (new TextEncoder().encode(value.content).byteLength > SIGMA_MAX_INPUT_BYTES) return null;

  const now = new Date().toISOString();
  const id =
    !freshId && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= MAX_ID_LENGTH
      ? value.id
      : newRuleId();
  const revision =
    typeof value.revision === 'number' && Number.isInteger(value.revision) && value.revision > 0
      ? value.revision
      : 1;

  return {
    schemaVersion: 1,
    id,
    format: 'sigma',
    content: value.content,
    title: textOrNull(value.title, 256),
    sigmaId: textOrNull(value.sigmaId, 256),
    status: textOrNull(value.status, 100),
    level: textOrNull(value.level, 100),
    author: textOrNull(value.author, 1_000),
    description: textOrNull(value.description),
    logsource: sanitizeLogsource(value.logsource),
    tags: stringList(value.tags, MAX_TAGS),
    warnings: stringList(value.warnings, MAX_WARNINGS),
    schemaValid: typeof value.schemaValid === 'boolean' ? value.schemaValid : null,
    schemaSha256: textOrNull(value.schemaSha256, 128),
    source: value.source === 'imported' ? 'imported' : 'local',
    attribution: sanitizeRuleAttribution(value.attribution),
    createdAt: isTimestamp(value.createdAt) ? value.createdAt : now,
    updatedAt: isTimestamp(value.updatedAt) ? value.updatedAt : now,
    revision,
  };
}

export async function readRuleRecords(adapter: StorageAdapter): Promise<RuleRecord[]> {
  const stored = await adapter.getAll<unknown>('rules');
  return stored
    .map((entry) => normalizeRuleRecord(entry.value))
    .filter((record): record is RuleRecord => record !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveRuleRecord(adapter: StorageAdapter, record: RuleRecord): Promise<void> {
  await adapter.put('rules', record.id, record);
}

export async function deleteRuleRecord(adapter: StorageAdapter, id: string): Promise<void> {
  await adapter.delete('rules', id);
}

export function createRulesBundle(rules: RuleRecord[], now = new Date()): RulesBundle {
  if (rules.length > MAX_RULES_PER_BUNDLE) {
    throw new RuleLibraryError(
      `The library has ${rules.length} rules; export at most ${MAX_RULES_PER_BUNDLE} per bundle.`,
    );
  }
  return {
    format: RULES_BUNDLE_FORMAT,
    schemaVersion: RULES_BUNDLE_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    dataHandling: 'local-only',
    rules,
  };
}

export function serializeRulesBundle(rules: RuleRecord[], now = new Date()): string {
  const text = JSON.stringify(createRulesBundle(rules, now), null, 2);
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_RULE_BUNDLE_BYTES) {
    throw new RuleLibraryError(
      `The exported bundle is ${Math.round(bytes / 1024 / 1024)} MB; the import limit is ${
        MAX_RULE_BUNDLE_BYTES / 1024 / 1024
      } MB. Export fewer rules.`,
    );
  }
  return text;
}

export function parseRulesBundle(text: string): RuleRecord[] {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_RULE_BUNDLE_BYTES) {
    throw new RuleLibraryError(
      `Rule bundle is ${Math.round(bytes / 1024 / 1024)} MB; the import limit is ${
        MAX_RULE_BUNDLE_BYTES / 1024 / 1024
      } MB.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RuleLibraryError('Rule bundle is not valid JSON.');
  }
  if (!isRecord(parsed)) {
    throw new RuleLibraryError('Rule bundle root must be a JSON object.');
  }
  if (parsed.format !== RULES_BUNDLE_FORMAT) {
    throw new RuleLibraryError(`Not a BlueKit rule bundle (expected format "${RULES_BUNDLE_FORMAT}").`);
  }
  if (parsed.schemaVersion !== RULES_BUNDLE_SCHEMA_VERSION) {
    throw new RuleLibraryError(
      `Unsupported rule bundle schema version ${String(parsed.schemaVersion)}; this build reads version ${RULES_BUNDLE_SCHEMA_VERSION}.`,
    );
  }
  if (parsed.dataHandling !== 'local-only') {
    throw new RuleLibraryError('Rule bundle declares unexpected data handling.');
  }
  if (!Array.isArray(parsed.rules)) {
    throw new RuleLibraryError('Rule bundle must contain a "rules" array.');
  }
  if (parsed.rules.length === 0) {
    throw new RuleLibraryError('Rule bundle contains no rules.');
  }
  if (parsed.rules.length > MAX_RULES_PER_BUNDLE) {
    throw new RuleLibraryError(
      `Rule bundle contains ${parsed.rules.length} rules; the limit is ${MAX_RULES_PER_BUNDLE}.`,
    );
  }

  const now = new Date().toISOString();
  return parsed.rules.map((entry, index) => {
    const record = normalizeRuleRecord(entry, true);
    if (!record) {
      throw new RuleLibraryError(
        `Rule ${index + 1} is missing a valid "content" string, is not Sigma, or is oversized.`,
      );
    }
    return {
      ...record,
      source: 'imported',
      attribution: record.attribution ?? {
        source: 'Imported BlueKit rule bundle',
        importedAt: now,
      },
    };
  });
}

function oneLine(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

export function exportRuleText(record: RuleRecord): string {
  if (/^%YAML\b/u.test(record.content)) return record.content;

  const header = [
    '# BlueKit rule export',
    `# Title: ${oneLine(record.title ?? 'Untitled Sigma rule')}`,
    `# Source: ${oneLine(record.attribution?.source ?? 'Local BlueKit rule library')}`,
    ...(record.attribution?.url ? [`# Source URL: ${oneLine(record.attribution.url)}`] : []),
    ...(record.attribution?.license ? [`# License: ${oneLine(record.attribution.license)}`] : []),
    `# Validation: ${
      record.schemaValid === true ? 'schema valid' : record.schemaValid === false ? 'schema invalid' : 'unvalidated'
    }`,
    '# This comment is authoring metadata, not a vendor or detection guarantee.',
  ];

  return `${header.join('\n')}\n\n${record.content}`;
}

export function ruleFilename(record: RuleRecord): string {
  const base =
    (record.sigmaId ?? record.title ?? 'sigma-rule')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 80) || 'sigma-rule';
  return `${base}.yml`;
}
