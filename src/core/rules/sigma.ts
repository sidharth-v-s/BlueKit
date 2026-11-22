import type { ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parseAllDocuments, type Document } from 'yaml';
import {
  SIGMA_MAX_DEPTH,
  SIGMA_MAX_INPUT_BYTES,
  SIGMA_MAX_ISSUES,
  SIGMA_SCHEMA_SOURCE,
} from './sigma-meta';
import schema from './sigma-detection-rule-schema.json';

export {
  SIGMA_MAX_DEPTH,
  SIGMA_MAX_INPUT_BYTES,
  SIGMA_MAX_ISSUES,
  SIGMA_SCHEMA_SOURCE,
} from './sigma-meta';

/**
 * Sigma rule validation.
 *
 * Two failure layers are kept separate: YAML syntax and the official Sigma
 * schema. A third class — valid Sigma that BlueKit cannot locally evaluate —
 * is reported as a warning, never as a pass.
 *
 * The schema is vendored in this directory. Validation must work offline and
 * must not drift with an upstream branch.
 */

export type SigmaIssueLayer = 'yaml' | 'schema';

export interface SigmaIssue {
  layer: SigmaIssueLayer;
  path: string;
  message: string;
  keyword?: string;
}

export interface SigmaLogsource {
  category?: string;
  product?: string;
  service?: string;
  definition?: string;
}

export interface SigmaRuleSummary {
  title: string | null;
  id: string | null;
  status: string | null;
  level: string | null;
  author: string | null;
  description: string | null;
  logsource: SigmaLogsource | null;
  condition: string | null;
  tags: string[];
  detectionKeys: string[];
}

export interface SigmaValidationReport {
  valid: boolean;
  schemaValid: boolean;
  issues: SigmaIssue[];
  warnings: string[];
  summary: SigmaRuleSummary | null;
  schemaTitle: string;
  schemaSha256: string;
  validator: string;
}

let validate: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
  if (validate) return validate;
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
    validateFormats: true,
  });
  addFormats(ajv);
  validate = ajv.compile(schema);
  return validate;
}

function formatYamlError(error: unknown): SigmaIssue {
  const record = error as {
    message?: string;
    linePos?: Array<{ line: number; col: number }>;
  };
  const position = record.linePos?.[0];
  return {
    layer: 'yaml',
    path: position ? `line ${position.line}, column ${position.col}` : 'document',
    message: record.message ?? 'The YAML document could not be parsed.',
  };
}

function formatSchemaError(error: {
  instancePath?: string;
  keyword?: string;
  message?: string;
}): SigmaIssue {
  const path = error.instancePath && error.instancePath.length > 0 ? error.instancePath : '/';
  return {
    layer: 'schema',
    path,
    message: error.message ?? 'The value does not match the Sigma schema.',
    ...(error.keyword ? { keyword: error.keyword } : {}),
  };
}

function measureDepth(value: unknown, maxDepth: number): boolean {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    if (current.depth > maxDepth) return false;
    const node = current.value;
    if (Array.isArray(node)) {
      for (const item of node) stack.push({ value: item, depth: current.depth + 1 });
    } else if (node !== null && typeof node === 'object') {
      for (const item of Object.values(node as Record<string, unknown>)) {
        stack.push({ value: item, depth: current.depth + 1 });
      }
    }
  }
  return true;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function summarize(data: unknown): SigmaRuleSummary | null {
  const rule = asRecord(data);
  if (!rule) return null;

  const logsourceRaw = asRecord(rule.logsource);
  const logsource: SigmaLogsource | null = logsourceRaw
    ? {
        ...(readString(logsourceRaw.category) ? { category: readString(logsourceRaw.category) as string } : {}),
        ...(readString(logsourceRaw.product) ? { product: readString(logsourceRaw.product) as string } : {}),
        ...(readString(logsourceRaw.service) ? { service: readString(logsourceRaw.service) as string } : {}),
        ...(readString(logsourceRaw.definition) ? { definition: readString(logsourceRaw.definition) as string } : {}),
      }
    : null;

  const detection = asRecord(rule.detection);
  const tags = Array.isArray(rule.tags)
    ? rule.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];

  return {
    title: readString(rule.title),
    id: readString(rule.id),
    status: readString(rule.status),
    level: readString(rule.level),
    author: readString(rule.author),
    description: readString(rule.description),
    logsource,
    condition: detection ? readString(detection.condition) : null,
    tags,
    detectionKeys: detection ? Object.keys(detection).filter((key) => key !== 'condition') : [],
  };
}

function subsetWarnings(data: unknown): string[] {
  const rule = asRecord(data);
  if (!rule) return [];
  const warnings: string[] = [];

  if (rule.correlation !== undefined) {
    warnings.push('Correlation rules are valid Sigma but are outside the planned local test subset.');
  }

  const detection = asRecord(rule.detection);
  if (!detection) return warnings;

  if (detection.timeframe !== undefined) {
    warnings.push('detection.timeframe requires time-window evaluation and is outside the local test subset.');
  }

  const condition = readString(detection.condition) ?? '';
  if (/\|\s*(?:count|sum|min|max|avg)\b/iu.test(condition)) {
    warnings.push('Aggregation expressions in the condition are outside the local test subset.');
  }
  if (/\bnear\b/iu.test(condition)) {
    warnings.push('The near operator is outside the local test subset.');
  }

  const hasNestedSelection = Object.entries(detection).some(
    ([key, value]) => key !== 'condition' && Array.isArray(value) && value.some((item) => asRecord(item) !== null),
  );
  if (hasNestedSelection) {
    warnings.push('Field-modifier maps inside keyword lists are outside the local test subset.');
  }

  return warnings;
}

export function validateSigmaRule(text: string): SigmaValidationReport {
  const base: SigmaValidationReport = {
    valid: false,
    schemaValid: false,
    issues: [],
    warnings: [],
    summary: null,
    schemaTitle: schema.title,
    schemaSha256: SIGMA_SCHEMA_SOURCE.sha256,
    validator: 'ajv 8.20.0 + yaml 2.9.1',
  };

  if (text.trim().length === 0) {
    return { ...base, issues: [{ layer: 'yaml', path: 'document', message: 'The editor is empty.' }] };
  }

  if (new TextEncoder().encode(text).byteLength > SIGMA_MAX_INPUT_BYTES) {
    return {
      ...base,
      issues: [
        {
          layer: 'yaml',
          path: 'document',
          message: `The rule exceeds the ${SIGMA_MAX_INPUT_BYTES / 1024} KiB validation limit.`,
        },
      ],
    };
  }

  let documents: Document.Parsed[];
  try {
    documents = parseAllDocuments(text, { prettyErrors: true, strict: false });
  } catch (error) {
    return { ...base, issues: [formatYamlError(error)] };
  }

  const nonEmpty = documents.filter((document) => document.contents !== null);
  const yamlIssues = nonEmpty.flatMap((document) => document.errors.map(formatYamlError));
  if (yamlIssues.length > 0) {
    return { ...base, issues: yamlIssues.slice(0, SIGMA_MAX_ISSUES) };
  }
  if (nonEmpty.length === 0) {
    return { ...base, issues: [{ layer: 'yaml', path: 'document', message: 'The editor is empty.' }] };
  }
  if (nonEmpty.length > 1) {
    return {
      ...base,
      issues: [
        {
          layer: 'yaml',
          path: 'document',
          message: 'A Sigma rule must be a single YAML document.',
        },
      ],
    };
  }

  let data: unknown;
  try {
    data = nonEmpty[0]?.toJS({ maxAliasCount: 20 });
  } catch (error) {
    return { ...base, issues: [formatYamlError(error)] };
  }

  const summary = summarize(data);
  if (!measureDepth(data, SIGMA_MAX_DEPTH)) {
    return {
      ...base,
      issues: [
        {
          layer: 'yaml',
          path: 'document',
          message: `The rule exceeds the supported nesting depth of ${SIGMA_MAX_DEPTH}.`,
        },
      ],
      summary,
    };
  }

  const check = getValidator();
  const schemaValid = check(data);
  const issues = schemaValid
    ? []
    : (check.errors ?? []).slice(0, SIGMA_MAX_ISSUES).map((error) => formatSchemaError(error));

  return {
    ...base,
    valid: schemaValid,
    schemaValid,
    issues,
    warnings: subsetWarnings(data),
    summary,
  };
}
