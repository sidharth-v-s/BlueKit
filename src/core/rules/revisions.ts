import type { StorageAdapter } from '@/core/storage/db';
import { lineDiff, type DiffResult } from '@/tools/encoding/diff';
import {
  sanitizeRuleAttribution,
  sanitizeRuleMetadata,
  type RuleAttribution,
  type RuleMetadata,
  type RuleRecord,
} from './library';
import { SIGMA_MAX_INPUT_BYTES } from './sigma-meta';

/**
 * Local Sigma rule revision history.
 *
 * Every save stores a snapshot of the saved state in `ruleRevisions`. The
 * current `rules` record remains the working copy, so a revision can be
 * inspected, diffed, or restored without rewriting history. Snapshots are
 * recorded from this build onward; saves made before revision history existed
 * have no snapshot and are not recoverable.
 */

export const RULE_REVISION_SCHEMA_VERSION = 1;
export const MAX_RULE_REVISIONS = 50;

const MAX_ID_LENGTH = 200;

export class RuleRevisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleRevisionError';
  }
}

export interface RuleRevision {
  schemaVersion: typeof RULE_REVISION_SCHEMA_VERSION;
  ruleId: string;
  revision: number;
  content: string;
  metadata: RuleMetadata;
  source: 'local' | 'imported';
  attribution: RuleAttribution | null;
  recordedAt: string;
}

export interface RuleRevisionDiff extends DiffResult {
  fromRevision: number;
  toRevision: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function revisionKey(ruleId: string, revision: number): string {
  return `${ruleId}:${revision}`;
}

function metadataFromRecord(record: RuleRecord): RuleMetadata {
  return {
    title: record.title,
    sigmaId: record.sigmaId,
    status: record.status,
    level: record.level,
    author: record.author,
    description: record.description,
    logsource: record.logsource,
    tags: [...record.tags],
    warnings: [...record.warnings],
    schemaValid: record.schemaValid,
    schemaSha256: record.schemaSha256,
  };
}

/** Snapshot the saved state of a rule record. */
export function revisionFromRecord(record: RuleRecord, now = new Date()): RuleRevision {
  if (record.content.trim().length === 0) {
    throw new RuleRevisionError('A revision must contain YAML.');
  }
  if (new TextEncoder().encode(record.content).byteLength > SIGMA_MAX_INPUT_BYTES) {
    throw new RuleRevisionError(
      `The revision exceeds the ${SIGMA_MAX_INPUT_BYTES / 1024} KiB revision limit.`,
    );
  }
  return {
    schemaVersion: RULE_REVISION_SCHEMA_VERSION,
    ruleId: record.id,
    revision: record.revision,
    content: record.content,
    metadata: metadataFromRecord(record),
    source: record.source,
    attribution: record.attribution,
    recordedAt: now.toISOString(),
  };
}

function normalizeRevision(value: unknown): RuleRevision | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== RULE_REVISION_SCHEMA_VERSION) return null;
  if (typeof value.ruleId !== 'string' || value.ruleId.length === 0 || value.ruleId.length > MAX_ID_LENGTH) {
    return null;
  }
  if (
    typeof value.revision !== 'number' ||
    !Number.isInteger(value.revision) ||
    value.revision < 1 ||
    value.revision > 1_000_000
  ) {
    return null;
  }
  if (typeof value.content !== 'string' || value.content.trim().length === 0) return null;
  if (new TextEncoder().encode(value.content).byteLength > SIGMA_MAX_INPUT_BYTES) return null;
  if (!isRecord(value.metadata)) return null;
  if (!isTimestamp(value.recordedAt)) return null;

  return {
    schemaVersion: RULE_REVISION_SCHEMA_VERSION,
    ruleId: value.ruleId,
    revision: value.revision,
    content: value.content,
    metadata: sanitizeRuleMetadata(value.metadata),
    source: value.source === 'imported' ? 'imported' : 'local',
    attribution: sanitizeRuleAttribution(value.attribution),
    recordedAt: value.recordedAt,
  };
}

/**
 * Store a snapshot for a record's current revision.
 *
 * Re-saving the same revision overwrites that snapshot instead of creating a
 * duplicate. Older snapshots beyond `MAX_RULE_REVISIONS` are removed.
 */
export async function recordRuleRevision(
  adapter: StorageAdapter,
  record: RuleRecord,
  now = new Date(),
): Promise<RuleRevision> {
  const revision = revisionFromRecord(record, now);
  await adapter.put('ruleRevisions', revisionKey(revision.ruleId, revision.revision), revision);

  const all = await readRuleRevisions(adapter, revision.ruleId);
  for (const stale of all.slice(MAX_RULE_REVISIONS)) {
    await adapter.delete('ruleRevisions', revisionKey(stale.ruleId, stale.revision));
  }
  return revision;
}

/** Read one rule's snapshots, newest revision first. */
export async function readRuleRevisions(
  adapter: StorageAdapter,
  ruleId: string,
): Promise<RuleRevision[]> {
  const stored = await adapter.getAll<unknown>('ruleRevisions');
  return stored
    .map((entry) => normalizeRevision(entry.value))
    .filter((revision): revision is RuleRevision => revision !== null && revision.ruleId === ruleId)
    .sort((left, right) => right.revision - left.revision);
}

export async function deleteRuleRevisions(adapter: StorageAdapter, ruleId: string): Promise<void> {
  const revisions = await readRuleRevisions(adapter, ruleId);
  for (const revision of revisions) {
    await adapter.delete('ruleRevisions', revisionKey(revision.ruleId, revision.revision));
  }
}

/**
 * Build the next working record from a stored snapshot.
 *
 * Restoring does not rewrite or delete history: it creates a new revision that
 * carries the old content and metadata, so the restored state is itself
 * reversible.
 */
export function restoreRuleRevision(
  record: RuleRecord,
  revision: RuleRevision,
  now = new Date(),
): RuleRecord {
  if (revision.ruleId !== record.id) {
    throw new RuleRevisionError('The revision belongs to a different rule.');
  }
  if (revision.revision > record.revision) {
    throw new RuleRevisionError('The revision is newer than the working record.');
  }

  return {
    ...record,
    content: revision.content,
    ...revision.metadata,
    source: revision.source,
    attribution: revision.attribution,
    updatedAt: now.toISOString(),
    revision: record.revision + 1,
  };
}

/** Unified diff from a stored revision to the current working content. */
export function diffRevision(record: RuleRecord, revision: RuleRevision): RuleRevisionDiff {
  if (revision.ruleId !== record.id) {
    throw new RuleRevisionError('The revision belongs to a different rule.');
  }
  return {
    ...lineDiff(revision.content, record.content, { context: 3 }),
    fromRevision: revision.revision,
    toRevision: record.revision,
  };
}
