import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { readBoolean, readString } from './params';

/**
 * Line diff.
 *
 * Two documents arrive in one text box, separated by a line containing the
 * configured separator (default `---`). The output is a unified diff, which is
 * both readable and pasteable into a ticket.
 */

const manifest: ToolManifest = {
  id: 'encoding.diff',
  name: 'Data Comparison',
  version: '0.1.0',
  category: 'encoding',
  description:
    'Compare two text blocks line by line and produce a unified diff. Separate them with a line containing ---.',
  tags: ['diff', 'compare', 'changes', 'patch', 'unified'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text, description: 'Left block, separator, right block' }],
  output: [{ type: DATA_TYPES.text }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.json', 'encoding.yaml', 'encoding.xml'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 2 * 1024 * 1024 },
  ui: {
    inputLabel: 'Two blocks separated by a line containing ---',
    outputLabel: 'Unified diff',
    placeholder: 'first line\nsecond line\n---\nfirst line\nsecond line changed',
    primaryInput: DATA_TYPES.text,
    fields: [
      {
        key: 'separator',
        label: 'Separator line',
        type: 'text',
        defaultValue: '---',
        help: 'Must match a whole line between the left and right blocks.',
      },
      { key: 'context', label: 'Context lines', type: 'text', defaultValue: '3', placeholder: '3' },
      {
        key: 'ignore-whitespace',
        label: 'Ignore whitespace changes',
        type: 'toggle',
        defaultValue: 'false',
      },
    ],
  },
};

const MAX_DP_CELLS = 2_000_000;

type OpType = 'equal' | 'delete' | 'insert';

interface DiffOp {
  type: OpType;
  text: string;
}

export interface DiffResult {
  diff: string;
  added: number;
  removed: number;
  hunks: number;
  coarse: boolean;
}

function toLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split(/\r?\n/u);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function comparable(line: string, ignoreWhitespace: boolean): string {
  if (!ignoreWhitespace) return line;
  return line.replace(/\s+/gu, ' ').trim();
}

function pushCommon(ops: DiffOp[], lines: string[], from: number, to: number): void {
  for (let index = from; index < to; index += 1) {
    ops.push({ type: 'equal', text: lines[index]! });
  }
}

function coarseDiff(left: string[], right: string[]): DiffOp[] {
  return [
    ...left.map((text): DiffOp => ({ type: 'delete', text })),
    ...right.map((text): DiffOp => ({ type: 'insert', text })),
  ];
}

function lcsDiff(left: string[], right: string[], ignoreWhitespace: boolean): { ops: DiffOp[]; coarse: boolean } {
  const ops: DiffOp[] = [];

  let prefix = 0;
  while (
    prefix < left.length &&
    prefix < right.length &&
    comparable(left[prefix]!, ignoreWhitespace) === comparable(right[prefix]!, ignoreWhitespace)
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    comparable(left[left.length - 1 - suffix]!, ignoreWhitespace) ===
      comparable(right[right.length - 1 - suffix]!, ignoreWhitespace)
  ) {
    suffix += 1;
  }

  pushCommon(ops, left, 0, prefix);

  const leftMiddle = left.slice(prefix, left.length - suffix);
  const rightMiddle = right.slice(prefix, right.length - suffix);

  if (leftMiddle.length > 0 || rightMiddle.length > 0) {
    if (leftMiddle.length * rightMiddle.length > MAX_DP_CELLS) {
      ops.push(...coarseDiff(leftMiddle, rightMiddle));
    } else {
      const n = leftMiddle.length;
      const m = rightMiddle.length;
      const width = m + 1;
      const table = new Int32Array((n + 1) * width);

      for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
          const cell = i * width + j;
          table[cell] =
            comparable(leftMiddle[i]!, ignoreWhitespace) === comparable(rightMiddle[j]!, ignoreWhitespace)
              ? table[(i + 1) * width + j + 1]! + 1
              : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
        }
      }

      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (comparable(leftMiddle[i]!, ignoreWhitespace) === comparable(rightMiddle[j]!, ignoreWhitespace)) {
          ops.push({ type: 'equal', text: leftMiddle[i]! });
          i += 1;
          j += 1;
        } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
          ops.push({ type: 'delete', text: leftMiddle[i]! });
          i += 1;
        } else {
          ops.push({ type: 'insert', text: rightMiddle[j]! });
          j += 1;
        }
      }
      while (i < n) {
        ops.push({ type: 'delete', text: leftMiddle[i]! });
        i += 1;
      }
      while (j < m) {
        ops.push({ type: 'insert', text: rightMiddle[j]! });
        j += 1;
      }
    }
  }

  pushCommon(ops, left, left.length - suffix, left.length);

  return { ops, coarse: leftMiddle.length * rightMiddle.length > MAX_DP_CELLS };
}

function buildUnifiedDiff(ops: DiffOp[], contextLines: number): { diff: string; hunks: number } {
  const changed = ops
    .map((op, index) => (op.type === 'equal' ? -1 : index))
    .filter((index) => index >= 0);

  if (changed.length === 0) return { diff: '', hunks: 0 };

  const aBefore = new Int32Array(ops.length + 1);
  const bBefore = new Int32Array(ops.length + 1);
  for (let index = 0; index < ops.length; index += 1) {
    aBefore[index + 1] = aBefore[index]! + (ops[index]!.type === 'insert' ? 0 : 1);
    bBefore[index + 1] = bBefore[index]! + (ops[index]!.type === 'delete' ? 0 : 1);
  }

  const ranges: { start: number; end: number }[] = [];
  let first = changed[0]!;
  let last = first;
  for (const index of changed.slice(1)) {
    if (index - last > contextLines * 2 + 1) {
      ranges.push({ start: Math.max(0, first - contextLines), end: Math.min(ops.length, last + contextLines + 1) });
      first = index;
    }
    last = index;
  }
  ranges.push({ start: Math.max(0, first - contextLines), end: Math.min(ops.length, last + contextLines + 1) });

  const lines: string[] = ['--- left', '+++ right'];
  for (const range of ranges) {
    const aStart = aBefore[range.start]!;
    const bStart = bBefore[range.start]!;
    const aCount = aBefore[range.end]! - aStart;
    const bCount = bBefore[range.end]! - bStart;
    lines.push(
      `@@ -${aCount === 0 ? aStart : aStart + 1},${aCount} +${bCount === 0 ? bStart : bStart + 1},${bCount} @@`,
    );

    for (let index = range.start; index < range.end; index += 1) {
      const op = ops[index]!;
      const prefix = op.type === 'equal' ? ' ' : op.type === 'delete' ? '-' : '+';
      lines.push(`${prefix}${op.text}`);
    }
  }

  return { diff: `${lines.join('\n')}\n`, hunks: ranges.length };
}

export function splitComparison(text: string, separator: string): { left: string; right: string } {
  const lines = text.split(/\r?\n/u);
  const index = lines.findIndex((line) => line.trim() === separator);
  if (index === -1) {
    throw new ToolFailure(
      'invalid-input',
      `No separator line "${separator}" was found. Put one line containing only the separator between the two blocks.`,
    );
  }
  return {
    left: lines.slice(0, index).join('\n'),
    right: lines.slice(index + 1).join('\n'),
  };
}

export function diffText(
  text: string,
  options: { separator?: string; context?: number; ignoreWhitespace?: boolean } = {},
): DiffResult {
  const separator = (options.separator ?? '---').trim();
  if (separator.length === 0) throw new ToolFailure('invalid-input', 'Separator cannot be empty.');

  const contextLines = Math.max(0, Math.min(20, options.context ?? 3));
  const { left, right } = splitComparison(text, separator);
  const leftLines = toLines(left);
  const rightLines = toLines(right);

  const { ops, coarse } = lcsDiff(leftLines, rightLines, options.ignoreWhitespace ?? false);
  const { diff, hunks } = buildUnifiedDiff(ops, contextLines);

  return {
    diff: diff.length > 0 ? diff : 'No differences.\n',
    added: ops.filter((op) => op.type === 'insert').length,
    removed: ops.filter((op) => op.type === 'delete').length,
    hunks,
    coarse,
  };
}

async function execute(input: RunnerInput): Promise<ToolResult<string>> {
  const text = input.text ?? '';
  if (text.length === 0) throw new ToolFailure('invalid-input', 'Provide two blocks separated by a line containing ---.');

  const rawContext = Number.parseInt(readString(input, 'context', '3'), 10);
  const result = diffText(text, {
    separator: readString(input, 'separator', '---'),
    context: Number.isFinite(rawContext) ? rawContext : 3,
    ignoreWhitespace: readBoolean(input, 'ignore-whitespace', false),
  });

  return {
    output: result.diff,
    ...(result.coarse
      ? {
          warnings: [
            {
              code: 'diff-coarse',
              message:
                'The changed region was too large for an exact line diff; it is shown as a full replacement.',
            },
          ],
        }
      : {}),
    meta: {
      added: result.added,
      removed: result.removed,
      hunks: result.hunks,
      coarse: result.coarse,
    },
  };
}

export const diffTool: BlueKitTool<RunnerInput, string> = { manifest, execute };
