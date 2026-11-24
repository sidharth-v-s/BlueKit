import { describe, expect, it } from 'vitest';
import {
  ATTACK_DATASET,
  ATTACK_MAX_RULE_TAGS,
  attackDatasetFingerprint,
  attackTagName,
  attackTacticTag,
  attackTechniqueTag,
  AttackDataError,
  describeAttackTag,
  isAttackTag,
  mergeAttackTags,
  normalizeAttackDataset,
  removeAttackTag,
  searchAttackTechniques,
  techniquesForTactic,
  type AttackDataset,
} from '@/core/rules/attack';

const MINI_DATASET: AttackDataset = {
  schemaVersion: 1,
  attackVersion: 'test',
  retrieved: '2026-01-01',
  source: 'https://example.test/attack',
  sourcePath: 'test.json',
  sourceSha256: 'a'.repeat(64),
  license: 'test',
  tactics: [
    { id: 'TA0002', name: 'Execution', shortName: 'execution' },
    { id: 'TA0005', name: 'Stealth', shortName: 'stealth' },
  ],
  techniques: [
    {
      id: 'T1059.001',
      name: 'PowerShell',
      tactics: ['execution'],
      subtechnique: true,
    },
    {
      id: 'T1055',
      name: 'Process Injection',
      tactics: ['stealth', 'execution'],
      subtechnique: false,
    },
    {
      id: 'T9999',
      name: 'Zeta Test',
      tactics: ['stealth'],
      subtechnique: false,
    },
  ],
};

describe('vendored ATT&CK dataset', () => {
  it('carries version, provenance, and a source checksum', () => {
    expect(ATTACK_DATASET.schemaVersion).toBe(1);
    expect(ATTACK_DATASET.attackVersion).toMatch(/^\d+\.\d+$/u);
    expect(ATTACK_DATASET.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(ATTACK_DATASET.source).toContain('github.com/mitre-attack/attack-stix-data');
    expect(ATTACK_DATASET.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(attackDatasetFingerprint()).toBe(ATTACK_DATASET.sourceSha256.slice(0, 16));
  });

  it('has unique technique ids and only known tactic references', () => {
    const tactics = new Set(ATTACK_DATASET.tactics.map((tactic) => tactic.shortName));
    const ids = new Set<string>();

    expect(ATTACK_DATASET.techniques.length).toBeGreaterThan(500);
    expect(ATTACK_DATASET.tactics.length).toBeGreaterThan(10);

    for (const technique of ATTACK_DATASET.techniques) {
      expect(technique.id).toMatch(/^T\d{4}(?:\.\d{3})?$/u);
      expect(ids.has(technique.id)).toBe(false);
      ids.add(technique.id);
      expect(technique.name.length).toBeGreaterThan(0);
      expect(technique.tactics.length).toBeGreaterThan(0);
      for (const tactic of technique.tactics) {
        expect(tactics.has(tactic)).toBe(true);
      }
    }
  });

  it('contains a known technique and tactic', () => {
    expect(ATTACK_DATASET.techniques.find((entry) => entry.id === 'T1059.001')).toMatchObject({
      name: 'PowerShell',
      subtechnique: true,
    });
    expect(ATTACK_DATASET.tactics.find((entry) => entry.shortName === 'execution')).toMatchObject({
      id: 'TA0002',
      name: 'Execution',
    });
  });
});

describe('searchAttackTechniques', () => {
  it('ranks exact ids before prefixes and name matches', () => {
    const results = searchAttackTechniques('t1055', {}, MINI_DATASET);
    expect(results.map((entry) => entry.id)).toEqual(['T1055']);
  });

  it('searches names case-insensitively', () => {
    const results = searchAttackTechniques('powershell', {}, MINI_DATASET);
    expect(results.map((entry) => entry.id)).toEqual(['T1059.001']);
  });

  it('searches tactic short names', () => {
    const results = searchAttackTechniques('stealth', {}, MINI_DATASET);
    expect(results.map((entry) => entry.id)).toEqual(['T1055', 'T9999']);
  });

  it('filters by tactic', () => {
    const results = searchAttackTechniques('', { tactic: 'execution' }, MINI_DATASET);
    expect(results.map((entry) => entry.id)).toEqual(['T1059.001', 'T1055']);
  });

  it('applies a bounded result limit', () => {
    expect(searchAttackTechniques('', { limit: 2 }, MINI_DATASET)).toHaveLength(2);
    expect(searchAttackTechniques('', { limit: 0 }, MINI_DATASET)).toHaveLength(1);
    expect(searchAttackTechniques('', { limit: 100_000 }, MINI_DATASET)).toHaveLength(3);
  });

  it('returns nothing for a missing query', () => {
    expect(searchAttackTechniques('no-such-technique', {}, MINI_DATASET)).toEqual([]);
  });

  it('finds real techniques by id and by name', () => {
    expect(searchAttackTechniques('T1059.001')[0]?.name).toBe('PowerShell');
    expect(searchAttackTechniques('T1053.005')[0]?.name).toBe('Scheduled Task');
    expect(searchAttackTechniques('scheduled task').map((entry) => entry.id)).toContain('T1053.005');
  });
});

describe('techniquesForTactic', () => {
  it('returns techniques for a tactic', () => {
    expect(techniquesForTactic('stealth', MINI_DATASET).map((entry) => entry.id)).toEqual([
      'T1055',
      'T9999',
    ]);
  });

  it('returns nothing for an empty or unknown tactic', () => {
    expect(techniquesForTactic('', MINI_DATASET)).toEqual([]);
    expect(techniquesForTactic('unknown', MINI_DATASET)).toEqual([]);
  });
});

describe('ATT&CK tags', () => {
  it('builds lower-case Sigma tags', () => {
    expect(attackTechniqueTag(' T1059.001 ')).toBe('attack.t1059.001');
    expect(attackTacticTag(' Execution ')).toBe('attack.execution');
    expect(attackTechniqueTag('')).toBe('');
    expect(attackTacticTag('   ')).toBe('');
  });

  it('describes technique, tactic, and unknown tags', () => {
    expect(describeAttackTag('attack.t1059.001', MINI_DATASET)).toMatchObject({
      kind: 'technique',
      technique: { id: 'T1059.001', name: 'PowerShell' },
    });
    expect(describeAttackTag('ATTACK.EXECUTION', MINI_DATASET)).toMatchObject({
      kind: 'tactic',
      tactic: { id: 'TA0002', shortName: 'execution' },
    });
    expect(describeAttackTag('attack.ta0005', MINI_DATASET)).toMatchObject({
      kind: 'tactic',
      tactic: { id: 'TA0005' },
    });
    expect(describeAttackTag('attack.t0000', MINI_DATASET).kind).toBe('unknown');
    expect(describeAttackTag('cve.2026.0001', MINI_DATASET).kind).toBe('unknown');
  });

  it('recognises only known ATT&CK tags', () => {
    expect(isAttackTag('attack.t1055')).toBe(true);
    expect(isAttackTag('attack.execution')).toBe(true);
    expect(isAttackTag('attack.t0000')).toBe(false);
    expect(isAttackTag('attack.')).toBe(false);
    expect(isAttackTag('custom.tag')).toBe(false);
  });

  it('names tags for display', () => {
    expect(attackTagName(describeAttackTag('attack.t1055', MINI_DATASET))).toBe(
      'T1055 · Process Injection',
    );
    expect(attackTagName(describeAttackTag('attack.execution', MINI_DATASET))).toBe(
      'TA0002 · Execution',
    );
    expect(attackTagName(describeAttackTag('custom.tag', MINI_DATASET))).toBe('custom.tag');
  });

  it('merges tags without duplicates and trims entries', () => {
    expect(mergeAttackTags([' attack.execution ', 'custom.tag'], ['attack.t1055', 'custom.tag'])).toEqual([
      'attack.execution',
      'custom.tag',
      'attack.t1055',
    ]);
  });

  it('enforces the rule tag cap', () => {
    const existing = Array.from({ length: ATTACK_MAX_RULE_TAGS }, (_, index) => `tag.${index}`);
    expect(() => mergeAttackTags(existing, ['one.more'])).toThrow(AttackDataError);
    expect(() => mergeAttackTags(existing, ['one.more'])).toThrow(/at most 100 tags/u);
  });

  it('removes a tag without touching the others', () => {
    expect(removeAttackTag(['attack.execution', 'custom.tag'], 'attack.execution')).toEqual([
      'custom.tag',
    ]);
  });
});

describe('normalizeAttackDataset', () => {
  const base = {
    schemaVersion: 1,
    attackVersion: '1.0',
    retrieved: '2026-01-01',
    source: 'https://example.test',
    sourcePath: 'test.json',
    sourceSha256: 'a'.repeat(64),
    license: 'test',
    tactics: [
      { id: 'TA0001', name: 'One', shortName: 'one' },
      { id: 'TA0001', name: 'Duplicate id', shortName: 'other' },
      { id: 'TA0002', name: 'Two', shortName: 'one' },
      { id: 'TA0003', name: 'Three', shortName: 'three' },
      { id: '', name: 'No id', shortName: 'nope' },
    ],
    techniques: [
      { id: 'T1001', name: 'Valid', tactics: ['one', 'unknown', 'one'], subtechnique: false },
      { id: 'T1002', name: 'No known tactic', tactics: ['unknown'] },
      { id: 'T1001', name: 'Duplicate', tactics: ['three'] },
      { id: 'T1003', name: 'Second', tactics: ['three'], subtechnique: true },
    ],
  };

  it('keeps valid tactics and techniques and drops malformed entries', () => {
    const dataset = normalizeAttackDataset(base);
    expect(dataset.tactics.map((tactic) => tactic.id)).toEqual(['TA0001', 'TA0003']);
    expect(dataset.techniques).toEqual([
      { id: 'T1001', name: 'Valid', tactics: ['one'], subtechnique: false },
      { id: 'T1003', name: 'Second', tactics: ['three'], subtechnique: true },
    ]);
  });

  it('rejects an unsupported schema version and a missing version', () => {
    expect(() => normalizeAttackDataset({ ...base, schemaVersion: 2 })).toThrow(/schema version/u);
    expect(() => normalizeAttackDataset({ ...base, attackVersion: ' ' })).toThrow(/no version/u);
  });

  it('rejects a non-object dataset', () => {
    expect(() => normalizeAttackDataset(null)).toThrow(AttackDataError);
    expect(() => normalizeAttackDataset([])).toThrow(AttackDataError);
  });
});
