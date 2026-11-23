import { describe, expect, it } from 'vitest';
import { parseYaraJob, YaraJobError } from '@/core/rules/yara-job';
import { YARA_MAX_FILES } from '@/core/rules/yara-meta';

const RULE = 'rule A { condition: true }';

function file(name: string, size = 4): File {
  return new File([new Uint8Array(size)], name);
}

describe('YARA job parsing', () => {
  it('derives validation from a generic text-only payload', () => {
    expect(parseYaraJob({ text: RULE, file: null })).toEqual({
      action: 'validate',
      source: RULE,
      files: [],
    });
  });

  it('derives a single-file scan from the generic runner payload', () => {
    const target = file('sample.bin');
    const job = parseYaraJob({ text: RULE, file: target });
    expect(job.action).toBe('scan');
    expect(job.files).toEqual([{ name: 'sample.bin', size: 4, file: target }]);
  });

  it('accepts an explicit multi-file job', () => {
    const job = parseYaraJob({
      action: 'scan',
      source: RULE,
      files: [file('one.bin'), file('two.bin', 8)],
    });
    expect(job.action).toBe('scan');
    expect(job.files.map((target) => target.name)).toEqual(['one.bin', 'two.bin']);
  });

  it('ignores files for an explicit validation request', () => {
    const job = parseYaraJob({ action: 'validate', source: RULE, files: [file('one.bin')] });
    expect(job.action).toBe('validate');
    expect(job.files).toEqual([]);
  });

  it('rejects empty rules and scans without files', () => {
    expect(() => parseYaraJob({ text: '  ' })).toThrow(YaraJobError);
    expect(() => parseYaraJob({ action: 'scan', source: RULE, files: [] })).toThrow(/at least one/u);
  });

  it('rejects non-File entries and empty files', () => {
    expect(() => parseYaraJob({ action: 'scan', source: RULE, files: ['one.bin'] })).toThrow(
      /not a readable File/u,
    );
    expect(() => parseYaraJob({ action: 'scan', source: RULE, files: [file('empty.bin', 0)] })).toThrow(
      /empty/u,
    );
  });

  it('enforces the file-count cap', () => {
    const files = Array.from({ length: YARA_MAX_FILES + 1 }, (_, index) => file(`${index}.bin`));
    expect(() => parseYaraJob({ action: 'scan', source: RULE, files })).toThrow(
      new YaraJobError('resource-limit', `A scan job accepts at most ${YARA_MAX_FILES} files; ${files.length} were selected.`),
    );
  });

  it('falls back to a readable name for a nameless file', () => {
    const job = parseYaraJob({ action: 'scan', source: RULE, files: [file('')] });
    expect(job.files[0]?.name).toBe('unnamed file');
  });
});
