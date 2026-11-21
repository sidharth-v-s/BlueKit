import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';

/**
 * Regex tester.
 *
 * Runs in a worker because JavaScript regex execution cannot be interrupted
 * cooperatively: catastrophic backtracking is stopped by terminating the worker
 * on timeout. A static nested-quantifier check rejects the obvious traps before
 * they start, but it is a speed bump, not a proof of safety.
 */

const manifest: ToolManifest = {
  id: 'encoding.regex',
  name: 'Regex Tester & Extractor',
  version: '0.1.0',
  category: 'encoding',
  description:
    'Test JavaScript regular expressions, capture matches, or replace text. Runs in a worker with a timeout guard.',
  tags: ['regex', 'regexp', 'extract', 'capture', 'redos'],
  runtime: 'worker',
  input: [{ type: DATA_TYPES.text, description: 'Text to search' }],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.regex-result.v1' }],
  capabilities: ['worker.execute'],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['ioc.extractor', 'malware.strings'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 512 * 1024, timeoutMs: 10_000 },
  ui: {
    inputLabel: 'Text to search',
    outputLabel: 'Matches',
    placeholder: 'Paste the haystack here…',
    primaryInput: DATA_TYPES.text,
    fields: [
      {
        key: 'pattern',
        label: 'Pattern',
        type: 'text',
        placeholder: '(?<user>[a-z0-9._-]+)@([a-z0-9.-]+)',
        help: 'JavaScript regular expression source. No delimiters.',
      },
      { key: 'flags', label: 'Flags', type: 'text', defaultValue: 'gi', placeholder: 'gi' },
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        defaultValue: 'matches',
        options: [
          { value: 'matches', label: 'List matches' },
          { value: 'replace', label: 'Replace' },
        ],
      },
      {
        key: 'replacement',
        label: 'Replacement',
        type: 'text',
        placeholder: '[$1]',
        help: 'Used only in replace mode. Supports $1 and $<name>.',
      },
    ],
  },
};

export const MAX_MATCHES = 1000;
const MAX_PATTERN_LENGTH = 500;
const MAX_PREVIEW_CHARS = 64 * 1024;

export interface RegexMatch {
  index: number;
  value: string;
  groups: string[];
  named?: Record<string, string | undefined>;
}

export interface RegexReport {
  mode: 'matches' | 'replace';
  pattern: string;
  flags: string;
  inputChars: number;
  matchCount: number;
  matches: RegexMatch[];
  truncated: boolean;
  replaced?: string;
  replacedTruncated?: boolean;
  risks: string[];
}

/**
 * Strip escapes and character classes so quantifier checks do not fire on
 * literals such as `\+` or `[+*]`.
 */
function normalizeForRiskCheck(pattern: string): string {
  let output = '';
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index]!;
    if (char === '\\') {
      index += 2;
      output += '.';
      continue;
    }
    if (char === '[') {
      index += 1;
      while (index < pattern.length && pattern[index] !== ']') {
        if (pattern[index] === '\\') index += 1;
        index += 1;
      }
      index += 1;
      output += '.';
      continue;
    }
    output += char;
    index += 1;
  }
  return output;
}

/** Static heuristics for the classic catastrophic-backtracking shapes. */
export function detectRegexRisks(pattern: string): string[] {
  const risks: string[] = [];
  if (pattern.length > MAX_PATTERN_LENGTH) {
    risks.push(`Pattern is longer than ${MAX_PATTERN_LENGTH} characters.`);
  }
  const normalized = normalizeForRiskCheck(pattern);

  // A quantified group that itself ends in a quantifier: (a+)+, (a*)*, (\w+)+.
  if (/\([^()]*[*+][^()]*\)\s*(?:[*+]|\{\d+,?\d*\})/u.test(normalized)) {
    risks.push('Nested quantifiers can backtrack catastrophically on long input.');
  }
  // Adjacent greedy wildcards: .*.* or .+.+.
  if (/\.\*[^)]*\.\*/u.test(normalized) || /\.\+[^)]*\.\+/u.test(normalized)) {
    risks.push('Multiple unbounded wildcards in one expression can backtrack heavily.');
  }
  return risks;
}

export async function runRegexTool(
  input: RunnerInput,
  report: (pct: number | undefined, message: string) => void,
  signal: AbortSignal,
): Promise<ToolResult<RegexReport>> {
  const text = input.text ?? '';
  if (text.length === 0) throw new ToolFailure('invalid-input', 'Provide text to search.');

  const pattern = typeof input.params?.['pattern'] === 'string' ? input.params['pattern'] : '';
  if (pattern.length === 0) throw new ToolFailure('invalid-input', 'Provide a regular expression pattern.');

  const flags = typeof input.params?.['flags'] === 'string' ? input.params['flags'] : 'gi';
  if (!/^[dgimsuvy]*$/u.test(flags)) {
    throw new ToolFailure('invalid-input', `Unsupported regex flags "${flags}".`);
  }

  const risks = detectRegexRisks(pattern);
  if (risks.some((risk) => risk.startsWith('Nested quantifiers'))) {
    throw new ToolFailure(
      'unsupported-format',
      `Pattern rejected by the ReDoS guard: ${risks[0]} Rewrite it with a bounded quantifier.`,
    );
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch (error) {
    throw new ToolFailure(
      'malformed-content',
      `Invalid regular expression: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }

  const mode = input.params?.['mode'] === 'replace' ? 'replace' : 'matches';
  report(15, 'Expression compiled');

  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');

  if (mode === 'replace') {
    const replacement = typeof input.params?.['replacement'] === 'string' ? input.params['replacement'] : '';
    report(50, 'Applying replacement');
    let replaced: string;
    try {
      replaced = text.replace(regex, replacement);
    } catch (error) {
      throw new ToolFailure(
        'malformed-content',
        `Replacement failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
    report(100, 'Done');
    const replacedTruncated = replaced.length > MAX_PREVIEW_CHARS;
    return {
      output: {
        mode,
        pattern,
        flags,
        inputChars: text.length,
        matchCount: countMatches(regex, text),
        matches: [],
        truncated: false,
        replaced: replacedTruncated ? replaced.slice(0, MAX_PREVIEW_CHARS) : replaced,
        replacedTruncated,
        risks,
      },
      warnings: risks.map((risk, index) => ({ code: `regex-risk-${index}`, message: risk })),
      meta: { mode, risks: risks.length },
    };
  }

  const globalRegex = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
  const matches: RegexMatch[] = [];
  let truncated = false;

  report(45, 'Scanning matches');
  for (const match of text.matchAll(globalRegex)) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (matches.length >= MAX_MATCHES) {
      truncated = true;
      break;
    }
    matches.push({
      index: match.index ?? 0,
      value: match[0],
      groups: match.slice(1).map((group) => group ?? ''),
      ...(match.groups ? { named: { ...match.groups } } : {}),
    });
  }

  report(100, 'Done');
  return {
    output: {
      mode,
      pattern,
      flags: globalRegex.flags,
      inputChars: text.length,
      matchCount: matches.length,
      matches,
      truncated,
      risks,
    },
    ...(truncated
      ? {
          warnings: [
            {
              code: 'regex-truncated',
              message: `Stopped after ${MAX_MATCHES} matches; narrow the pattern to see the rest.`,
            },
          ],
        }
      : {}),
    meta: { mode, matches: matches.length, truncated },
  };
}

function countMatches(regex: RegExp, text: string): number {
  const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let count = 0;
  for (const _match of text.matchAll(globalRegex)) {
    count += 1;
    if (count > MAX_MATCHES) break;
  }
  return count;
}

async function execute(input: RunnerInput): Promise<ToolResult<RegexReport>> {
  return runRegexTool(input, () => {}, new AbortController().signal);
}

export const regexTool: BlueKitTool<RunnerInput, RegexReport> = { manifest, execute };
