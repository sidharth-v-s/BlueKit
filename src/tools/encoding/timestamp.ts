import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';

/**
 * Timestamp converter.
 *
 * Auto-detects common numeric and textual forms and returns every useful
 * representation. Ambiguous numeric widths (17–18 digits) return candidates
 * instead of pretending there is one right answer.
 */

const manifest: ToolManifest = {
  id: 'encoding.timestamp',
  name: 'Timestamp Converter',
  version: '0.1.0',
  category: 'encoding',
  description:
    'Convert Unix seconds/milliseconds/microseconds/nanoseconds, ISO 8601, FILETIME, .NET ticks, and common date strings.',
  tags: ['timestamp', 'epoch', 'filetime', 'iso8601', 'dotnet', 'time'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.timestamp-report.v1' }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['windows.evtx-inspector', 'forensics.timeline'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 64 * 1024 },
  ui: {
    inputLabel: 'Timestamp',
    outputLabel: 'Converted values',
    placeholder: '1700000000, 2026-11-20T10:00:00Z, 133444416000000000…',
    primaryInput: DATA_TYPES.text,
  },
};

const FILETIME_EPOCH_OFFSET_MS = 11_644_473_600_000n;
const DOTNET_EPOCH_OFFSET_MS = 62_135_596_800_000n;

export interface TimestampCandidate {
  format: string;
  unixMs: number;
  isoUtc: string;
  note?: string;
}

export interface TimestampReport {
  input: string;
  candidates: TimestampCandidate[];
  chosen?: {
    format: string;
    unixSeconds: number;
    unixMilliseconds: number;
    unixMicroseconds: string;
    unixNanoseconds: string;
    isoUtc: string;
    isoLocal: string;
    dayOfWeek: string;
    filetime: string;
    dotnetTicks: string;
  };
  warning?: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function iso(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) throw new Error('out of range');
  return date.toISOString();
}

function candidate(format: string, unixMs: number, note?: string): TimestampCandidate {
  return { format, unixMs, isoUtc: iso(unixMs), ...(note ? { note } : {}) };
}

function fromFiletime(filetime: bigint): number {
  return Number(filetime / 10_000n - FILETIME_EPOCH_OFFSET_MS);
}

function fromDotnetTicks(ticks: bigint): number {
  return Number(ticks / 10_000n - DOTNET_EPOCH_OFFSET_MS);
}

function detectNumeric(digits: string): TimestampCandidate[] {
  const value = BigInt(digits);
  const results: TimestampCandidate[] = [];

  const push = (format: string, ms: number, note?: string) => {
    try {
      results.push(candidate(format, ms, note));
    } catch {
      // Out-of-range interpretations are simply not offered.
    }
  };

  switch (digits.length) {
    case 10:
      push('Unix seconds', Number(value) * 1000);
      break;
    case 13:
      push('Unix milliseconds', Number(value));
      break;
    case 16:
      push('Unix microseconds', Number(value / 1000n));
      break;
    case 19:
      push('Unix nanoseconds', Number(value / 1_000_000n));
      break;
    case 17:
    case 18: {
      push('Windows FILETIME (100 ns since 1601)', fromFiletime(value));
      push('.NET DateTime ticks (100 ns since 0001)', fromDotnetTicks(value));
      break;
    }
    default:
      // Very long values are most likely FILETIME/ticks; offer both.
      if (digits.length >= 15) {
        push('Windows FILETIME (100 ns since 1601)', fromFiletime(value));
        push('.NET DateTime ticks (100 ns since 0001)', fromDotnetTicks(value));
      }
  }

  return results;
}

function parseInput(raw: string): { candidates: TimestampCandidate[]; warning?: string } {
  const input = raw.trim();
  if (!input) throw new ToolFailure('invalid-input', 'Provide a timestamp to convert.');

  if (/^-?\d+$/u.test(input)) {
    const candidates = detectNumeric(input);
    if (candidates.length === 0) {
      throw new ToolFailure(
        'unsupported-format',
        `Numeric timestamp with ${input.length} digits is not a recognized Unix/FILETIME/.NET width.`,
      );
    }
    return {
      candidates,
      ...(candidates.length > 1
        ? { warning: 'Numeric width is ambiguous; both plausible interpretations are shown.' }
        : {}),
    };
  }

  if (/^-?\d+\.\d+$/u.test(input)) {
    const seconds = Number(input);
    if (!Number.isFinite(seconds)) throw new ToolFailure('malformed-content', 'Timestamp is not finite.');
    return { candidates: [candidate('Unix seconds (fractional)', Math.round(seconds * 1000))] };
  }

  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) {
    throw new ToolFailure(
      'unsupported-format',
      'Could not parse the timestamp. Use epoch digits or an ISO 8601 / RFC 2822 date.',
    );
  }

  return {
    candidates: [
      candidate(
        /^\d{4}-\d{2}-\d{2}T/u.test(input) ? 'ISO 8601' : 'Date string',
        parsed,
      ),
    ],
  };
}

export function convertTimestamp(raw: string): TimestampReport {
  const { candidates, warning } = parseInput(raw);
  const primary = candidates[0];

  if (!primary) {
    throw new ToolFailure('unsupported-format', 'No valid timestamp interpretation was found.');
  }

  const unixMs = primary.unixMs;
  const date = new Date(unixMs);
  const filetime = (BigInt(unixMs) + FILETIME_EPOCH_OFFSET_MS) * 10_000n;
  const dotnetTicks = (BigInt(unixMs) + DOTNET_EPOCH_OFFSET_MS) * 10_000n;

  return {
    input: raw.trim(),
    candidates,
    chosen: {
      format: primary.format,
      unixSeconds: Math.floor(unixMs / 1000),
      unixMilliseconds: unixMs,
      unixMicroseconds: (BigInt(unixMs) * 1000n).toString(),
      unixNanoseconds: (BigInt(unixMs) * 1_000_000n).toString(),
      isoUtc: date.toISOString(),
      isoLocal: date.toString(),
      dayOfWeek: DAY_NAMES[date.getUTCDay()] ?? 'Unknown',
      filetime: filetime.toString(),
      dotnetTicks: dotnetTicks.toString(),
    },
    ...(warning ? { warning } : {}),
  };
}

async function execute(input: RunnerInput): Promise<ToolResult<TimestampReport>> {
  const report = convertTimestamp(input.text ?? '');
  return {
    output: report,
    ...(report.warning
      ? { warnings: [{ code: 'ambiguous-timestamp', message: report.warning }] }
      : {}),
    meta: { candidates: report.candidates.length, chosen: report.chosen?.format },
  };
}

export const timestampTool: BlueKitTool<RunnerInput, TimestampReport> = { manifest, execute };
