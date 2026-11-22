import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { SIGMA_MAX_INPUT_BYTES, SIGMA_SCHEMA_SOURCE } from '@/core/rules/sigma-meta';
import type { SigmaValidationReport } from '@/core/rules/sigma';

/**
 * Sigma rule validator.
 *
 * This is the validation core used by Rule Studio. It checks YAML syntax and
 * the vendored official Sigma schema. It does not evaluate the rule, convert
 * it, or claim that a valid rule is a good detection.
 */

const manifest: ToolManifest = {
  id: 'detection.sigma-validator',
  name: 'Sigma Rule Validator',
  version: '0.1.0',
  category: 'detection',
  description:
    'Validate a Sigma rule against the vendored official schema, with YAML and schema diagnostics kept separate.',
  tags: ['sigma', 'yaml', 'detection', 'rules', 'validate', 'schema'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.json }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 4,
  related: ['detection.sigma-studio', 'detection.yara-studio'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: SIGMA_MAX_INPUT_BYTES },
  ui: {
    inputLabel: 'Sigma rule (YAML)',
    outputLabel: 'Validation report',
    placeholder: 'title: Example rule\nlogsource:\n  product: windows\ndetection:\n  selection:\n    EventID: 4688\n  condition: selection',
    primaryInput: DATA_TYPES.text,
  },
};

async function execute(input: RunnerInput): Promise<ToolResult<SigmaValidationReport>> {
  const text = input.text ?? '';
  // Ajv and the vendored schema stay out of the initial bundle.
  const { validateSigmaRule } = await import('@/core/rules/sigma');
  const report = validateSigmaRule(text);

  return {
    output: report,
    warnings: report.issues.map((issue, index) => ({
      code: `sigma-${issue.layer}-${index}`,
      message: `${issue.path}: ${issue.message}`,
    })),
    meta: {
      valid: report.valid,
      schemaTitle: SIGMA_SCHEMA_SOURCE.title,
      schemaSha256: SIGMA_SCHEMA_SOURCE.sha256,
      validator: report.validator,
      issues: report.issues.length,
      warnings: report.warnings.length,
    },
  };
}

export const sigmaValidatorTool: BlueKitTool<RunnerInput, SigmaValidationReport> = {
  manifest,
  execute,
};
