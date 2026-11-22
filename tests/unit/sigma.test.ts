import { describe, expect, it } from 'vitest';
import { SIGMA_MAX_INPUT_BYTES, SIGMA_SCHEMA_SOURCE } from '@/core/rules/sigma-meta';
import { validateSigmaRule } from '@/core/rules/sigma';
import { sigmaValidatorTool } from '@/tools/detection/sigma-validator';

const VALID_RULE = `title: Suspicious PowerShell Encoded Command
id: 3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d
status: experimental
description: Detects PowerShell launched with an encoded command argument.
author: BlueKit test
date: 2026-11-21
logsource:
  product: windows
  category: process_creation
detection:
  selection_image:
    Image|endswith: '\\powershell.exe'
  selection_command:
    CommandLine|contains:
      - ' -enc '
      - ' -encodedcommand '
  condition: selection_image and selection_command
fields:
  - CommandLine
falsepositives:
  - Legitimate administrative scripts
level: medium
tags:
  - attack.execution
  - attack.t1059.001
`;

describe('Sigma validation', () => {
  it('accepts a valid rule and summarizes it', () => {
    const report = validateSigmaRule(VALID_RULE);

    expect(report.valid).toBe(true);
    expect(report.schemaValid).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.summary).toMatchObject({
      title: 'Suspicious PowerShell Encoded Command',
      id: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      status: 'experimental',
      level: 'medium',
      condition: 'selection_image and selection_command',
      logsource: { product: 'windows', category: 'process_creation' },
    });
    expect(report.summary?.detectionKeys).toEqual(['selection_image', 'selection_command']);
    expect(report.schemaTitle).toBe(SIGMA_SCHEMA_SOURCE.title);
    expect(report.schemaSha256).toBe(SIGMA_SCHEMA_SOURCE.sha256);
  });

  it('reports YAML syntax errors in the YAML layer', () => {
    const report = validateSigmaRule('title: [unclosed\n');

    expect(report.valid).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.every((issue) => issue.layer === 'yaml')).toBe(true);
    expect(report.summary).toBeNull();
  });

  it('reports schema violations with a JSON path and keeps them separate', () => {
    const report = validateSigmaRule('title: Missing detection\nlogsource:\n  product: windows\n');

    expect(report.valid).toBe(false);
    expect(report.schemaValid).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.every((issue) => issue.layer === 'schema')).toBe(true);
    expect(report.issues.some((issue) => issue.keyword === 'required')).toBe(true);
    expect(report.summary?.title).toBe('Missing detection');
  });

  it('rejects multiple YAML documents', () => {
    const report = validateSigmaRule('---\ntitle: one\n---\ntitle: two\n');

    expect(report.valid).toBe(false);
    expect(report.issues[0]?.layer).toBe('yaml');
    expect(report.issues[0]?.message).toMatch(/single YAML document/iu);
  });

  it('enforces the schema date format', () => {
    const report = validateSigmaRule(VALID_RULE.replace('date: 2026-11-21', 'date: 2026/11/21'));

    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.layer === 'schema' && issue.path === '/date')).toBe(true);
  });

  it('warns about evaluation constructs outside the local subset', () => {
    const report = validateSigmaRule(
      VALID_RULE.replace('condition: selection_image and selection_command', 'condition: selection_image | count() > 5'),
    );

    expect(report.valid).toBe(true);
    expect(report.warnings.join(' ')).toMatch(/aggregation/iu);
  });

  it('rejects rules above the input cap', () => {
    const report = validateSigmaRule('a'.repeat(SIGMA_MAX_INPUT_BYTES + 1));

    expect(report.valid).toBe(false);
    expect(report.issues[0]?.layer).toBe('yaml');
    expect(report.issues[0]?.message).toMatch(/validation limit/u);
  });

  it('exposes a catalog tool with stable metadata', async () => {
    const signal = new AbortController().signal;
    const outcome = await sigmaValidatorTool.execute(
      { text: 'title: Missing detection\n' },
      {
        reportProgress: () => {},
        log: () => {},
        signal,
        limits: { maxInputBytes: SIGMA_MAX_INPUT_BYTES, timeoutMs: 30_000 },
      },
      signal,
    );

    expect(outcome.output.valid).toBe(false);
    expect(outcome.warnings?.length).toBeGreaterThan(0);
    expect(outcome.meta).toMatchObject({
      valid: false,
      schemaTitle: SIGMA_SCHEMA_SOURCE.title,
      schemaSha256: SIGMA_SCHEMA_SOURCE.sha256,
    });
    expect(sigmaValidatorTool.manifest).toMatchObject({
      id: 'detection.sigma-validator',
      category: 'detection',
      status: 'available',
      phase: 4,
      network: 'none',
      runtime: 'main',
    });
  });
});
