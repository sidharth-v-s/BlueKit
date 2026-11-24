import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '@/core/storage/db';
import {
  addRuleToCollection,
  assertCollectionName,
  createRuleCollection,
  deleteRuleCollection,
  MAX_RULES_PER_COLLECTION,
  readRuleCollections,
  readRuleFavorites,
  removeRuleFromCollection,
  removeRuleFromCollections,
  renameRuleCollection,
  RuleCollectionError,
  saveRuleCollection,
  toggleRuleFavorite,
  writeRuleFavorites,
  type RuleCollection,
} from '@/core/rules/collections';

function collection(name = 'Triage', now = new Date('2026-01-01T00:00:00Z')): RuleCollection {
  return createRuleCollection(name, 'Rules used for first-pass triage.', now);
}

describe('rule collections', () => {
  it('creates a normalized collection', () => {
    const created = createRuleCollection('  First   pass  ', '  notes  ', new Date('2026-01-02T00:00:00Z'));
    expect(created).toMatchObject({
      schemaVersion: 1,
      name: 'First pass',
      description: 'notes',
      ruleIds: [],
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(created.id.length).toBeGreaterThan(0);
  });

  it('rejects blank names', () => {
    expect(() => createRuleCollection('   ')).toThrow(RuleCollectionError);
    expect(() => createRuleCollection('   ')).toThrow(/needs a name/u);
  });

  it('rejects duplicate names case-insensitively, but allows the same id', () => {
    const first = collection('Triage');
    const second = collection('Hunting');
    const all = [first, second];

    expect(() => assertCollectionName(all, ' triage ')).toThrow(/already exists/u);
    expect(assertCollectionName(all, 'TRIAGE', first.id)).toBe('TRIAGE');
    expect(assertCollectionName(all, 'Escalation')).toBe('Escalation');
  });

  it('saves, sorts, and reloads collections', async () => {
    const adapter = new MemoryAdapter();
    await saveRuleCollection(adapter, collection('Zeta'));
    await saveRuleCollection(adapter, collection('Alpha'));

    const loaded = await readRuleCollections(adapter);
    expect(loaded.map((entry) => entry.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('refuses a duplicate name on save', async () => {
    const adapter = new MemoryAdapter();
    await saveRuleCollection(adapter, collection('Triage'));
    await expect(saveRuleCollection(adapter, collection('triage'))).rejects.toThrow(/already exists/u);
  });

  it('ignores malformed persisted collections', async () => {
    const adapter = new MemoryAdapter();
    await adapter.put('ruleCollections', 'bad-1', { name: 'No schema' });
    await adapter.put('ruleCollections', 'bad-2', { ...collection('Bad'), schemaVersion: 99 });
    await adapter.put('ruleCollections', 'bad-3', { ...collection('Bad'), name: '  ' });
    await adapter.put('ruleCollections', 'good', {
      ...collection('Good'),
      ruleIds: ['a', 'a', 42, 'b'],
    });

    const loaded = await readRuleCollections(adapter);
    expect(loaded.map((entry) => entry.name)).toEqual(['Good']);
    expect(loaded[0]?.ruleIds).toEqual(['a', 'b']);
  });

  it('adds and removes rules idempotently', () => {
    const base = collection();
    const added = addRuleToCollection(base, 'rule-1', new Date('2026-01-03T00:00:00Z'));
    expect(added.ruleIds).toEqual(['rule-1']);
    expect(added.updatedAt).toBe('2026-01-03T00:00:00.000Z');
    expect(addRuleToCollection(added, 'rule-1')).toBe(added);

    const removed = removeRuleFromCollection(added, 'rule-1', new Date('2026-01-04T00:00:00Z'));
    expect(removed.ruleIds).toEqual([]);
    expect(removed.updatedAt).toBe('2026-01-04T00:00:00.000Z');
    expect(removeRuleFromCollection(removed, 'rule-1')).toBe(removed);
  });

  it('enforces the per-collection rule cap', () => {
    const full: RuleCollection = {
      ...collection(),
      ruleIds: Array.from({ length: MAX_RULES_PER_COLLECTION }, (_, index) => `rule-${index}`),
    };
    expect(() => addRuleToCollection(full, 'one-more')).toThrow(/remove one first/u);
  });

  it('renames without losing members', () => {
    const base = addRuleToCollection(collection('Old'), 'rule-1');
    const renamed = renameRuleCollection(base, 'New', null, new Date('2026-02-01T00:00:00Z'));
    expect(renamed).toMatchObject({
      id: base.id,
      name: 'New',
      description: null,
      ruleIds: ['rule-1'],
      createdAt: base.createdAt,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('removes a deleted rule from every collection', async () => {
    const adapter = new MemoryAdapter();
    const first = addRuleToCollection(collection('First'), 'rule-1');
    const second = addRuleToCollection(collection('Second'), 'rule-1');
    const untouched = addRuleToCollection(collection('Third'), 'rule-2');
    await saveRuleCollection(adapter, first);
    await saveRuleCollection(adapter, second);
    await saveRuleCollection(adapter, untouched);

    await removeRuleFromCollections(adapter, 'rule-1');

    const loaded = await readRuleCollections(adapter);
    expect(loaded.find((entry) => entry.name === 'First')?.ruleIds).toEqual([]);
    expect(loaded.find((entry) => entry.name === 'Second')?.ruleIds).toEqual([]);
    expect(loaded.find((entry) => entry.name === 'Third')?.ruleIds).toEqual(['rule-2']);
  });

  it('deletes a collection', async () => {
    const adapter = new MemoryAdapter();
    const base = collection();
    await saveRuleCollection(adapter, base);
    await deleteRuleCollection(adapter, base.id);
    expect(await readRuleCollections(adapter)).toEqual([]);
  });
});

describe('rule favourites', () => {
  it('round-trips a de-duplicated favourite list', async () => {
    const adapter = new MemoryAdapter();
    await writeRuleFavorites(adapter, ['rule-1', 'rule-2', 'rule-1']);
    expect(await readRuleFavorites(adapter)).toEqual(['rule-1', 'rule-2']);
  });

  it('toggles a rule id and keeps newest first', () => {
    expect(toggleRuleFavorite(['rule-1'], 'rule-2')).toEqual(['rule-2', 'rule-1']);
    expect(toggleRuleFavorite(['rule-2', 'rule-1'], 'rule-1')).toEqual(['rule-2']);
  });

  it('ignores malformed persisted favourites', async () => {
    const adapter = new MemoryAdapter();
    await adapter.put('favorites', 'ruleIds', ['rule-1', 42, '', 'rule-1', 'x'.repeat(201)]);
    expect(await readRuleFavorites(adapter)).toEqual(['rule-1']);
  });

  it('does not disturb the tool favourites key', async () => {
    const adapter = new MemoryAdapter();
    await adapter.put('favorites', 'toolIds', ['encoding.hash']);
    await writeRuleFavorites(adapter, ['rule-1']);
    expect(await adapter.get('favorites', 'toolIds')).toEqual(['encoding.hash']);
  });
});
