import { describe, expect, it } from 'vitest';
import { inspectYaml } from '@/tools/encoding/yaml';

describe('YAML validator & formatter', () => {
  it('validates and normalizes a document', () => {
    const report = inspectYaml('name:    sample\nitems:\n  - one\n  - two\n');
    expect(report.valid).toBe(true);
    expect(report.documentCount).toBe(1);
    expect(report.topLevelTypes).toEqual(['object']);
    expect(report.formatted).toContain('name: sample');
    expect(report.formatted).toContain('  - one');
  });

  it('rejects duplicate keys', () => {
    const report = inspectYaml('name: one\nname: two\n');
    expect(report.valid).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0]?.message).toMatch(/unique|duplicate/iu);
  });

  it('reports invalid syntax with a line position', () => {
    const report = inspectYaml('a: [1, 2\n');
    expect(report.valid).toBe(false);
    expect(report.errors[0]?.line).toBeGreaterThanOrEqual(1);
  });

  it('handles multiple documents', () => {
    const report = inspectYaml('---\na: 1\n---\nb: 2\n');
    expect(report.valid).toBe(true);
    expect(report.documentCount).toBe(2);
    expect(report.formatted).toContain('---');
  });

  it('handles scalar documents', () => {
    expect(inspectYaml('just a string')).toMatchObject({
      valid: true,
      topLevelTypes: ['string'],
    });
    expect(inspectYaml('42')).toMatchObject({ valid: true, topLevelTypes: ['number'] });
  });
});
