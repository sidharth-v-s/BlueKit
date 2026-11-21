import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { readBoolean, readMode } from './params';

/**
 * Base32 (RFC 4648) encoder / decoder.
 *
 * Standard alphabet only. Base32hex is a different encoding and is not silently
 * accepted here.
 */

const manifest: ToolManifest = {
  id: 'encoding.base32',
  name: 'Base32 Encode & Decode',
  version: '0.1.0',
  category: 'encoding',
  description: 'Encode UTF-8 text as RFC 4648 Base32 and decode it back.',
  tags: ['base32', 'rfc4648', 'encode', 'decode'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.text }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.base64-encode', 'encoding.hex'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 4 * 1024 * 1024 },
  ui: {
    inputLabel: 'Text or Base32',
    outputLabel: 'Output',
    placeholder: 'Paste text to encode, or Base32 (JBSWY3DP) to decode…',
    primaryInput: DATA_TYPES.text,
    fields: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        defaultValue: 'encode',
        options: [
          { value: 'encode', label: 'Text → Base32' },
          { value: 'decode', label: 'Base32 → text' },
        ],
      },
      { key: 'padding', label: 'Add padding (=)', type: 'toggle', defaultValue: 'true' },
    ],
  },
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const LOOKUP = new Map<string, number>([...ALPHABET].map((char, index) => [char, index]));

export function encodeBase32(bytes: Uint8Array, padding = true): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];

  if (padding) {
    while (output.length % 8 !== 0) output += '=';
  }
  return output;
}

export function decodeBase32(text: string): Uint8Array {
  const cleaned = text.replace(/\s+/gu, '').replace(/=+$/u, '').toUpperCase();
  if (cleaned.length === 0) {
    throw new ToolFailure('invalid-input', 'Provide Base32 input to decode.');
  }

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const index = LOOKUP.get(char);
    if (index === undefined) {
      throw new ToolFailure(
        'malformed-content',
        `"${char}" is not in the standard Base32 alphabet (A–Z, 2–7).`,
      );
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(bytes);
}

async function execute(input: RunnerInput): Promise<ToolResult<string>> {
  const text = input.text ?? '';
  if (text.length === 0) throw new ToolFailure('invalid-input', 'Provide input to convert.');

  const mode = readMode(input, ['encode', 'decode'], 'encode');
  if (mode === 'encode') {
    const bytes = new TextEncoder().encode(text);
    const output = encodeBase32(bytes, readBoolean(input, 'padding', true));
    return { output, meta: { mode, inputBytes: bytes.byteLength, outputChars: output.length } };
  }

  const bytes = decodeBase32(text);
  let output: string;
  try {
    output = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ToolFailure(
      'malformed-content',
      'Base32 decoded to bytes that are not valid UTF-8. Check that this is text and not binary data.',
    );
  }
  return { output, meta: { mode, outputBytes: bytes.byteLength } };
}

export const base32Tool: BlueKitTool<RunnerInput, string> = { manifest, execute };
