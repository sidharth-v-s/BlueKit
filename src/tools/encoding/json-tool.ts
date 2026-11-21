import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';

/**
 * JSON formatter and validator.
 *
 * Deliberately uses the browser's JSON parser: it is the same parser the analyst
 * will hit elsewhere, and it is fast. The report includes both formatted and
 * minified output so the generic runner needs no mode switch.
 */

const manifest: ToolManifest = {
  id: 'encoding.json',
  name: 'JSON Formatter & Validator',
  version: '0.1.0',
  category: 'encoding',
  description:
    'Validate JSON with a line/column position, then format or minify it. Runs locally with no size surprises.',
  tags: ['json', 'format', 'validate', 'minify', 'pretty-print'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.json-report.v1' }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.json', 'encoding.yaml', 'encoding.regex'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 8 * 1024 * 1024 },
  ui: {
    inputLabel: 'JSON input',
    outputLabel: 'Validation report',
    placeholder: 'Paste JSON to validate and format…',
    primaryInput: DATA_TYPES.text,
  },
};

export interface JsonErrorReport {
  message: string;
  position?: number;
  line?: number;
  column?: number;
  snippet?: string;
}

export interface JsonReport {
  valid: boolean;
  inputBytes: number;
  topLevelType?: string;
  objectKeys?: number;
  arrayLength?: number;
  depth?: number;
  nodes?: number;
  formatted?: string;
  minified?: string;
  formattedBytes?: number;
  minifiedBytes?: number;
  savingsPercent?: number;
  error?: JsonErrorReport;
}

/**
 * Some engines (notably Node's V8 in 2026) omit the position from JSON.parse
 * errors. Walk the document with a small JSON grammar scanner so the UI can
 * still point at the offending line. It is only used after JSON.parse fails.
 */
export function findJsonErrorPosition(text: string): number | null {
  let index = 0;

  function fail(): never {
    throw new SyntaxError('JSON syntax error');
  }
  const skipWhitespace = (): void => {
    while (index < text.length && /[\t\n\r ]/u.test(text[index]!)) index += 1;
  };
  const parseString = (): void => {
    if (text[index] !== '"') fail();
    index += 1;
    while (index < text.length) {
      const char = text[index]!;
      if (char === '"') {
        index += 1;
        return;
      }
      if (char === '\\') {
        index += 1;
        const escape = text[index];
        if (escape === undefined) fail();
        if (escape === 'u') {
          if (!/^[0-9a-f]{4}$/iu.test(text.slice(index + 1, index + 5))) fail();
          index += 5;
        } else if ('"\\/bfnrt'.includes(escape)) {
          index += 1;
        } else {
          fail();
        }
        continue;
      }
      if (char.charCodeAt(0) < 0x20) fail();
      index += 1;
    }
    fail();
  };
  const parseNumber = (): void => {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(text.slice(index));
    if (!match || match[0].length === 0) fail();
    index += match![0].length;
  };
  const parseValue = (): void => {
    skipWhitespace();
    const char = text[index];
    if (char === '{') {
      index += 1;
      skipWhitespace();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      while (index < text.length) {
        skipWhitespace();
        parseString();
        skipWhitespace();
        if (text[index] !== ':') fail();
        index += 1;
        parseValue();
        skipWhitespace();
        if (text[index] === ',') {
          index += 1;
          continue;
        }
        if (text[index] === '}') {
          index += 1;
          return;
        }
        fail();
      }
      fail();
    } else if (char === '[') {
      index += 1;
      skipWhitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      while (index < text.length) {
        parseValue();
        skipWhitespace();
        if (text[index] === ',') {
          index += 1;
          continue;
        }
        if (text[index] === ']') {
          index += 1;
          return;
        }
        fail();
      }
      fail();
    } else if (char === '"') {
      parseString();
    } else if (char === '-' || (char !== undefined && /\d/u.test(char))) {
      parseNumber();
    } else if (text.startsWith('true', index)) {
      index += 4;
    } else if (text.startsWith('false', index)) {
      index += 5;
    } else if (text.startsWith('null', index)) {
      index += 4;
    } else {
      fail();
    }
  };

  try {
    parseValue();
    skipWhitespace();
    if (index < text.length) return index;
    return null;
  } catch {
    return Math.min(index, Math.max(0, text.length - 1));
  }
}

function locate(message: string, text: string): Pick<JsonErrorReport, 'position' | 'line' | 'column' | 'snippet'> {
  const match = /position\s+(\d+)/iu.exec(message);
  const position = match ? Number(match[1]) : findJsonErrorPosition(text);
  if (position === null || !Number.isFinite(position) || position < 0) return {};
  const before = text.slice(0, position);
  const line = before.split('\n').length;
  const column = position - before.lastIndexOf('\n');
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineEnd = text.indexOf('\n', position);
  const rawLine = text.slice(lineStart, lineEnd === -1 ? Math.min(text.length, lineStart + 200) : lineEnd);
  return {
    position,
    line,
    column,
    snippet: rawLine.length > 200 ? `${rawLine.slice(0, 197)}…` : rawLine,
  };
}

function describeShape(value: unknown): Pick<JsonReport, 'topLevelType' | 'objectKeys' | 'arrayLength' | 'depth' | 'nodes'> {
  const topLevelType = Array.isArray(value)
    ? 'array'
    : value === null
      ? 'null'
      : typeof value;

  let nodes = 0;
  let depth = 0;
  const stack: { value: unknown; level: number }[] = [{ value, level: 1 }];

  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    depth = Math.max(depth, current.level);
    if (Array.isArray(current.value)) {
      for (const item of current.value) stack.push({ value: item, level: current.level + 1 });
    } else if (current.value !== null && typeof current.value === 'object') {
      for (const item of Object.values(current.value)) {
        stack.push({ value: item, level: current.level + 1 });
      }
    }
    // Guard against pathological nesting without pretending to be a full parser.
    if (nodes > 2_000_000) break;
  }

  return {
    topLevelType,
    ...(Array.isArray(value)
      ? { arrayLength: value.length }
      : value !== null && typeof value === 'object'
        ? { objectKeys: Object.keys(value).length }
        : {}),
    depth,
    nodes,
  };
}

export function analyzeJson(text: string): JsonReport {
  const inputBytes = new TextEncoder().encode(text).byteLength;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON could not be parsed.';
    return {
      valid: false,
      inputBytes,
      error: { message, ...locate(message, text) },
    };
  }

  const formatted = JSON.stringify(parsed, null, 2);
  const minified = JSON.stringify(parsed);
  const formattedBytes = new TextEncoder().encode(formatted).byteLength;
  const minifiedBytes = new TextEncoder().encode(minified).byteLength;
  const savingsPercent =
    formattedBytes > 0 ? Math.round(((formattedBytes - minifiedBytes) / formattedBytes) * 1000) / 10 : 0;

  return {
    valid: true,
    inputBytes,
    ...describeShape(parsed),
    formatted,
    minified,
    formattedBytes,
    minifiedBytes,
    savingsPercent,
  };
}

async function execute(input: RunnerInput): Promise<ToolResult<JsonReport>> {
  const text = input.text ?? '';
  if (text.trim().length === 0) {
    throw new ToolFailure('invalid-input', 'Paste JSON to validate.');
  }

  const report = analyzeJson(text);
  return {
    output: report,
    ...(report.valid
      ? {}
      : {
          warnings: [
            {
              code: 'json-invalid',
              message: report.error?.message ?? 'JSON is not valid.',
            },
          ],
        }),
    meta: {
      valid: report.valid,
      inputBytes: report.inputBytes,
      ...(report.valid ? { nodes: report.nodes, depth: report.depth } : {}),
    },
  };
}

export const jsonTool: BlueKitTool<RunnerInput, JsonReport> = { manifest, execute };
