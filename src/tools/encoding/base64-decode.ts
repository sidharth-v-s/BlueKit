import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolContext, ToolResult, ToolWarning } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';

const manifest: ToolManifest = {
  id: 'encoding.base64-decode',
  name: 'Base64 Decode',
  version: '0.1.0',
  category: 'encoding',
  description:
    'Decode standard or URL-safe Base64. Non-UTF-8 output is returned as a hex dump with a warning.',
  tags: ['base64', 'decode', 'binary', 'rfc4648'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.text }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.base64-encode', 'encoding.hex'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 8 * 1024 * 1024 },
  ui: {
    inputLabel: 'Base64 input',
    outputLabel: 'Decoded',
    placeholder: 'Paste Base64 to decode…',
    primaryInput: DATA_TYPES.text,
  },
};

/** Normalize Base64 variants without silently discarding invalid characters. */
export function normalizeBase64(input: string): string {
  const compact = input.replace(/\s+/gu, '');
  if (compact.length === 0) {
    throw new ToolFailure('invalid-input', 'Provide Base64 to decode.');
  }
  if (!/^[A-Za-z0-9+/\-_]*={0,2}$/u.test(compact)) {
    throw new ToolFailure(
      'malformed-content',
      'Input contains characters that are not valid Base64.',
      { hint: 'Standard and URL-safe alphabets are accepted; whitespace is ignored.' },
    );
  }
  const normalized = compact.replace(/-/g, '+').replace(/_/g, '/');
  if (normalized.length % 4 === 1) {
    throw new ToolFailure('malformed-content', 'Base64 length is invalid after normalization.');
  }
  return normalized;
}

export function decodeBase64(input: string): Uint8Array {
  const normalized = normalizeBase64(input);
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new ToolFailure('malformed-content', 'Input could not be decoded as Base64.');
  }
}

function hexDump(bytes: Uint8Array, maxBytes: number): string {
  const lines: string[] = [];
  const end = Math.min(bytes.length, maxBytes);
  for (let offset = 0; offset < end; offset += 16) {
    const row = bytes.subarray(offset, Math.min(offset + 16, end));
    const hex = Array.from(row, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(row, (byte) =>
      byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.',
    ).join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`);
  }
  if (bytes.length > maxBytes) lines.push(`… ${bytes.length - maxBytes} more bytes`);
  return lines.join('\n');
}

async function execute(
  input: RunnerInput,
  context: ToolContext,
  _signal: AbortSignal,
): Promise<ToolResult<string>> {
  const text = (input.text ?? '').trim();
  const bytes = decodeBase64(text);
  if (bytes.byteLength > context.limits.maxInputBytes) {
    throw new ToolFailure('file-too-large', 'Decoded output exceeds the configured limit.', {
      bytes: bytes.byteLength,
      limit: context.limits.maxInputBytes,
    });
  }

  const warnings: ToolWarning[] = [];
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    decoded = hexDump(bytes, 4096);
    warnings.push({
      code: 'non-utf8-output',
      message:
        'Decoded bytes are not valid UTF-8. Showing a hex dump of the first 4096 bytes instead.',
    });
  }

  context.reportProgress({ pct: 100, message: 'Decoded' });
  return {
    output: decoded,
    warnings,
    meta: { outputBytes: bytes.byteLength, encoding: 'utf-8' },
  };
}

export const base64DecodeTool: BlueKitTool<RunnerInput, string> = { manifest, execute };
