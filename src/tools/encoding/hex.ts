import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { bytesToDisplay, readMode, readString } from './params';

/**
 * Hex encoder / decoder.
 *
 * Decoding is strict: odd-length input or a non-hex character is reported
 * instead of guessed.
 */

const manifest: ToolManifest = {
  id: 'encoding.hex',
  name: 'Hex Encoder & Decoder',
  version: '0.1.0',
  category: 'encoding',
  description: 'Convert text to hexadecimal bytes and back, with separator and case controls.',
  tags: ['hex', 'hexadecimal', 'encode', 'decode', 'bytes'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.text }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.base64-encode', 'malware.hex-viewer'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 8 * 1024 * 1024 },
  ui: {
    inputLabel: 'Text or hex',
    outputLabel: 'Output',
    placeholder: 'Paste text to encode, or hex (48 65 6c 6c 6f) to decode…',
    primaryInput: DATA_TYPES.text,
    fields: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        defaultValue: 'encode',
        options: [
          { value: 'encode', label: 'Text → hex' },
          { value: 'decode', label: 'Hex → text' },
        ],
      },
      {
        key: 'format',
        label: 'Byte format',
        type: 'select',
        defaultValue: 'spaced',
        options: [
          { value: 'plain', label: 'Plain (48656c6c6f)' },
          { value: 'spaced', label: 'Spaced (48 65 6c 6c 6f)' },
          { value: 'colon', label: 'Colons (48:65:6c:6c:6f)' },
          { value: 'prefix', label: '0x prefixes (0x48 0x65…)' },
        ],
      },
      { key: 'uppercase', label: 'Uppercase', type: 'toggle', defaultValue: 'false' },
    ],
  },
};

export function encodeHex(
  text: string,
  options: { format?: string; uppercase?: boolean } = {},
): string {
  const format = options.format ?? 'spaced';
  const upper = options.uppercase ?? false;
  const bytes = new TextEncoder().encode(text);
  const parts = Array.from(bytes, (byte) => {
    const value = byte.toString(16).padStart(2, '0');
    return upper ? value.toUpperCase() : value;
  });
  switch (format) {
    case 'plain':
      return parts.join('');
    case 'colon':
      return parts.join(':');
    case 'prefix':
      return parts.map((part) => `${upper ? '0X' : '0x'}${part}`).join(' ');
    default:
      return parts.join(' ');
  }
}

export function decodeHex(text: string): Uint8Array {
  const cleaned = text.replace(/0x/giu, '').replace(/[\s,;:_-]+/gu, '');
  if (cleaned.length === 0) {
    throw new ToolFailure('invalid-input', 'Provide hexadecimal input to decode.');
  }
  if (!/^[0-9a-f]+$/iu.test(cleaned)) {
    const bad = /[^0-9a-f]/iu.exec(cleaned);
    throw new ToolFailure(
      'malformed-content',
      `Hex input contains a non-hex character${bad ? ` ("${bad[0]}")` : ''}.`,
    );
  }
  if (cleaned.length % 2 !== 0) {
    throw new ToolFailure(
      'malformed-content',
      'Hex input has an odd number of digits; each byte needs two hex digits.',
    );
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(cleaned.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function execute(input: RunnerInput): Promise<ToolResult<string>> {
  const text = input.text ?? '';
  if (text.length === 0) throw new ToolFailure('invalid-input', 'Provide input to convert.');

  const mode = readMode(input, ['encode', 'decode'], 'encode');
  if (mode === 'encode') {
    const output = encodeHex(text, {
      format: readString(input, 'format', 'spaced'),
      uppercase: input.params?.['uppercase'] === true,
    });
    return { output, meta: { mode, inputBytes: new TextEncoder().encode(text).byteLength } };
  }

  const bytes = decodeHex(text);
  const display = bytesToDisplay(bytes);
  return {
    output: display.text,
    ...(display.utf8
      ? {}
      : {
          warnings: [
            {
              code: 'non-utf8',
              message: 'Decoded bytes are not valid UTF-8; non-printable bytes use \\xNN escapes.',
            },
          ],
        }),
    meta: { mode, outputBytes: bytes.byteLength, utf8: display.utf8 },
  };
}

export const hexTool: BlueKitTool<RunnerInput, string> = { manifest, execute };
