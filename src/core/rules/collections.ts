import type { StorageAdapter } from '@/core/storage/db';

/**
 * Local Sigma rule collections and favourites.
 *
 * Collections live in the existing `ruleCollections` store and reference local
 * rule ids. Favourites are a flat id list in the existing `favorites` store
 * under a rule-specific key, so they do not collide with tool favourites.
 * Both are included in the normal BlueKit archive.
 */

export const RULE_COLLECTION_SCHEMA_VERSION = 1;
export const RULE_FAVORITES_KEY = 'ruleIds';
export const MAX_RULE_COLLECTIONS = 100;
export const MAX_RULES_PER_COLLECTION = 500;
export const MAX_RULE_FAVORITES = 1_000;
export const MAX_COLLECTION_NAME = 120;
export const MAX_COLLECTION_DESCRIPTION = 2_000;

const MAX_ID_LENGTH = 200;

export class RuleCollectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleCollectionError';
  }
}

export interface RuleCollection {
  schemaVersion: typeof RULE_COLLECTION_SCHEMA_VERSION;
  id: string;
  name: string;
  description: string | null;
  ruleIds: string[];
  createdAt: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function newCollectionId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }
  return `collection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/gu, ' ').trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_COLLECTION_NAME);
}

function cleanDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_COLLECTION_DESCRIPTION);
}

function cleanRuleIds(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (id.length === 0 || id.length > MAX_ID_LENGTH || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

function normalizeCollection(value: unknown): RuleCollection | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== RULE_COLLECTION_SCHEMA_VERSION) return null;
  if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > MAX_ID_LENGTH) {
    return null;
  }
  const name = cleanName(value.name);
  if (!name) return null;
  const now = new Date().toISOString();
  return {
    schemaVersion: RULE_COLLECTION_SCHEMA_VERSION,
    id: value.id,
    name,
    description: cleanDescription(value.description),
    ruleIds: cleanRuleIds(value.ruleIds, MAX_RULES_PER_COLLECTION),
    createdAt: isTimestamp(value.createdAt) ? value.createdAt : now,
    updatedAt: isTimestamp(value.updatedAt) ? value.updatedAt : now,
  };
}

/** Reject a blank, duplicate, or over-long collection name. */
export function assertCollectionName(
  collections: readonly RuleCollection[],
  name: string,
  exceptId?: string,
): string {
  const cleaned = cleanName(name);
  if (!cleaned) throw new RuleCollectionError('A collection needs a name.');
  const duplicate = collections.some(
    (collection) =>
      collection.id !== exceptId && collection.name.toLowerCase() === cleaned.toLowerCase(),
  );
  if (duplicate) {
    throw new RuleCollectionError(`A collection named "${cleaned}" already exists.`);
  }
  return cleaned;
}

export function createRuleCollection(
  name: string,
  description: string | null = null,
  now = new Date(),
): RuleCollection {
  const cleaned = cleanName(name);
  if (!cleaned) throw new RuleCollectionError('A collection needs a name.');
  const timestamp = now.toISOString();
  return {
    schemaVersion: RULE_COLLECTION_SCHEMA_VERSION,
    id: newCollectionId(),
    name: cleaned,
    description: cleanDescription(description),
    ruleIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function readRuleCollections(adapter: StorageAdapter): Promise<RuleCollection[]> {
  const stored = await adapter.getAll<unknown>('ruleCollections');
  return stored
    .map((entry) => normalizeCollection(entry.value))
    .filter((collection): collection is RuleCollection => collection !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Persist a collection after enforcing the count and unique-name limits.
 *
 * The existing collection with the same id is replaced, so renaming a
 * collection to its current name is allowed.
 */
export async function saveRuleCollection(
  adapter: StorageAdapter,
  collection: RuleCollection,
): Promise<void> {
  const existing = await readRuleCollections(adapter);
  const isNew = !existing.some((entry) => entry.id === collection.id);
  if (isNew && existing.length >= MAX_RULE_COLLECTIONS) {
    throw new RuleCollectionError(
      `The library already has ${MAX_RULE_COLLECTIONS} collections; delete one before adding another.`,
    );
  }
  assertCollectionName(existing, collection.name, collection.id);
  await adapter.put('ruleCollections', collection.id, {
    ...collection,
    ruleIds: cleanRuleIds(collection.ruleIds, MAX_RULES_PER_COLLECTION),
  });
}

export async function deleteRuleCollection(adapter: StorageAdapter, id: string): Promise<void> {
  await adapter.delete('ruleCollections', id);
}

export function addRuleToCollection(
  collection: RuleCollection,
  ruleId: string,
  now = new Date(),
): RuleCollection {
  if (collection.ruleIds.includes(ruleId)) return collection;
  if (collection.ruleIds.length >= MAX_RULES_PER_COLLECTION) {
    throw new RuleCollectionError(
      `"${collection.name}" already holds ${MAX_RULES_PER_COLLECTION} rules; remove one first.`,
    );
  }
  return {
    ...collection,
    ruleIds: [...collection.ruleIds, ruleId],
    updatedAt: now.toISOString(),
  };
}

export function removeRuleFromCollection(
  collection: RuleCollection,
  ruleId: string,
  now = new Date(),
): RuleCollection {
  if (!collection.ruleIds.includes(ruleId)) return collection;
  return {
    ...collection,
    ruleIds: collection.ruleIds.filter((id) => id !== ruleId),
    updatedAt: now.toISOString(),
  };
}

export function renameRuleCollection(
  collection: RuleCollection,
  name: string,
  description: string | null = collection.description,
  now = new Date(),
): RuleCollection {
  const cleaned = cleanName(name);
  if (!cleaned) throw new RuleCollectionError('A collection needs a name.');
  return {
    ...collection,
    name: cleaned,
    description: cleanDescription(description),
    updatedAt: now.toISOString(),
  };
}

/** Remove a deleted rule from every collection. */
export async function removeRuleFromCollections(
  adapter: StorageAdapter,
  ruleId: string,
): Promise<void> {
  const collections = await readRuleCollections(adapter);
  for (const collection of collections) {
    if (!collection.ruleIds.includes(ruleId)) continue;
    await adapter.put('ruleCollections', collection.id, removeRuleFromCollection(collection, ruleId));
  }
}

export async function readRuleFavorites(adapter: StorageAdapter): Promise<string[]> {
  return cleanRuleIds(await adapter.get<unknown>('favorites', RULE_FAVORITES_KEY), MAX_RULE_FAVORITES);
}

export async function writeRuleFavorites(
  adapter: StorageAdapter,
  ruleIds: readonly string[],
): Promise<void> {
  await adapter.put(
    'favorites',
    RULE_FAVORITES_KEY,
    cleanRuleIds(ruleIds, MAX_RULE_FAVORITES),
  );
}

/** Add or remove a rule id, returning the next favourite list. */
export function toggleRuleFavorite(favorites: readonly string[], ruleId: string): string[] {
  if (favorites.includes(ruleId)) return favorites.filter((id) => id !== ruleId);
  if (favorites.length >= MAX_RULE_FAVORITES) {
    throw new RuleCollectionError(
      `At most ${MAX_RULE_FAVORITES} rules can be favourited; remove one first.`,
    );
  }
  return [ruleId, ...favorites];
}
