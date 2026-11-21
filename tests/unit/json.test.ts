import { describe, expect, it } from 'vitest';
import { analyzeJson } from '@/tools/encoding/json-tool';

describe('JSON formatter & validator', () => {
  it('formats and minifies valid JSON', () => {
    const report = analyzeJson('{"b":2,"a":[1,true,null]}');
    expect(report.valid).toBe(true);
    expect(report.topLevelType).toBe('object');
    expect(report.objectKeys).toBe(2);
    expect(report.formatted).toBe(
      '{\n  "b": 2,\n  "a": [\n    1,\n    true,\n    null\n  ]\n}',
    );
    expect(report.minified).toBe('{"b":2,"a":[1,true,null]}');
    expect(report.savingsPercent).toBeGreaterThan(0);
  });

  it('reports a position, line, and column for invalid JSON', () => {
    const report = analyzeJson('{\n  "a": 1,\n  "b":\n}');
    expect(report.valid).toBe(false);
    expect(report.error?.message).toMatch(/JSON|property|unexpected/iu);
    expect(report.error?.line).toBeGreaterThanOrEqual(1);
    expect(report.error?.column).toBeGreaterThanOrEqual(1);
    expect(report.error?.snippet).toBeDefined();
  });

  it('handles scalar roots', () => {
    expect(analyzeJson('42')).toMatchObject({ valid: true, topLevelType: 'number' });
    expect(analyzeJson('null')).toMatchObject({ valid: true, topLevelType: 'null' });
    expect(analyzeJson('"text"')).toMatchObject({ valid: true, topLevelType: 'string' });
  });

  it('counts array roots', () => {
    const report = analyzeJson('[1,2,3,4]');
    expect(report.valid).toBe(true);
    expect(report.arrayLength).toBe(4);
    expect(report.depth).toBe(2);
  });
});
