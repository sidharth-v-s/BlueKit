import { parseAllDocuments, stringify } from 'yaml';
import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';

/**
 * YAML validator and formatter.
 *
 * Uses the `yaml` package with strict core-schema parsing, duplicate-key
 * rejection, and pretty error positions. Formatting resolves anchors and
 * aliases because the output is a normalised document, not a source rewrite.
 */

const manifest: ToolManifest = {
  id: 'encoding.yaml',
  name: 'YAML Validator & Formatter',
  version: '0.1.0',
  category: 'encoding',
  description:
    'Validate YAML with duplicate-key diagnostics and line/column errors, then normalise the formatting.',
  tags: ['yaml', 'validate', 'format', 'duplicate-keys', 'config'],
  runtime: 'worker',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.yaml-report.v1' }],
  capabilities: ['worker.execute'],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.json', 'encoding.xml', 'detection.sigma-studio'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 2 * 1024 * 1024 },
  ui: {
    inputLabel: 'YAML document',
    outputLabel: 'Report and formatted YAML',
    placeholder: 'name: sample\nitems:\n  - one\n  - two\n',
    primaryInput: DATA_TYPES.text,
  },
};

export interface YamlIssue {
  message: string;
  line?: number;
  column?: number;
}

export interface YamlReport {
  valid: boolean;
  documentCount: number;
  formatted?: string;
  topLevelTypes: string[];
  errors: YamlIssue[];
  warnings: string[];
}

function toIssue(error: unknown): YamlIssue {
  if (error && typeof error === 'object') {
    const candidate = error as {
      message?: string;
      linePos?: { line: number; col: number }[];
    };
    const position = candidate.linePos?.[0];
    return {
      message: candidate.message ?? 'YAML error',
      ...(position ? { line: position.line, column: position.col } : {}),
    };
  }
  return { message: String(error) };
}

function describeType(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function inspectYaml(text: string): YamlReport {
  const documents = parseAllDocuments(text, {
    uniqueKeys: true,
    prettyErrors: true,
    strict: true,
    schema: 'core',
  });

  const errors: YamlIssue[] = [];
  const warnings: string[] = [];
  const values: unknown[] = [];

  for (const document of documents) {
    for (const error of document.errors) errors.push(toIssue(error));
    for (const warning of document.warnings) warnings.push(toIssue(warning).message);
    if (document.errors.length > 0) continue;
    try {
      values.push(document.toJS());
    } catch (error) {
      errors.push(toIssue(error));
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      documentCount: documents.length,
      topLevelTypes: [],
      errors,
      warnings,
    };
  }

  const formatted = values
    .map((value) => stringify(value, { indent: 2, lineWidth: 0 }))
    .join('---\n');

  return {
    valid: true,
    documentCount: values.length,
    formatted,
    topLevelTypes: values.map(describeType),
    errors: [],
    warnings,
  };
}

export async function runYamlTool(
  input: RunnerInput,
  report: (pct: number | undefined, message: string) => void,
  signal: AbortSignal,
): Promise<ToolResult<YamlReport>> {
  const text = input.text ?? '';
  if (text.trim().length === 0) throw new ToolFailure('invalid-input', 'Paste YAML to validate.');

  report(20, 'Parsing YAML');
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');

  const result = inspectYaml(text);
  report(80, 'Formatting');
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  report(100, 'Done');

  const toolWarnings: { code: string; message: string }[] = result.errors.map((error, index) => ({
    code: `yaml-error-${index}`,
    message: `${error.line !== undefined ? `line ${error.line}, column ${error.column}: ` : ''}${error.message}`,
  }));
  toolWarnings.push(
    ...result.warnings.map((message, index) => ({ code: `yaml-warning-${index}`, message })),
  );

  return {
    output: result,
    ...(toolWarnings.length > 0 ? { warnings: toolWarnings } : {}),
    meta: {
      valid: result.valid,
      documents: result.documentCount,
      errors: result.errors.length,
    },
  };
}

async function execute(input: RunnerInput): Promise<ToolResult<YamlReport>> {
  return runYamlTool(input, () => {}, new AbortController().signal);
}

export const yamlTool: BlueKitTool<RunnerInput, YamlReport> = { manifest, execute };
