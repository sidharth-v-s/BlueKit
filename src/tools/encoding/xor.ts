import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { bytesToDisplay, readString } from './params';
import { decodeHex } from './hex';

/**
 * Repeating-key XOR.
 *
 * XOR is symmetric, so one tool covers both directions. The output defaults to
 * an escaped text form because XOR almost always produces bytes that are not
 * valid UTF-8.
 */

const manifest: ToolManifest = {
  id: 'encoding.xor',
  name: 'XOR',
  version: '0.1.0',
  category: 'encoding',
  description: 'Apply repeating-key XOR to text or hex bytes and choose an escaped, hex, or Base64 result.',
  tags: ['xor', 'repeating-key', 'obfuscation', 'malware', 'decode'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.text }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.hex', 'encoding.base64-encode', 'encoding.rot13'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 8 * 1024 * 1024 },
  ui: {
    inputLabel: 'Text or hex input',
    outputLabel: 'XOR output',
    placeholder: 'Paste text, or hex bytes to decode…',
    primaryInput: DATA_TYPES.text,
    fields: [
      { key: 'key', label: 'Key', type: 'text', placeholder: 'secret', help: 'Required. Applied cyclically over the bytes.' },
      {
        key: 'input-format',
        label: 'Input format',
        type: 'select',
        defaultValue: 'text',
        options: [
          { value: 'text', label: 'Text (UTF-8)' },
          { value: 'hex', label: 'Hex bytes' },
        ],
      },
      {
        key: 'key-format',
        label: 'Key format',
        type: 'select',
        defaultValue: 'text',
        options: [
          { value: 'text', label: 'Text (UTF-8)' },
          { value: 'hex', label: 'Hex bytes' },
        ],
      },
      {
        key: 'output',
        label: 'Output format',
        type: 'select',
        defaultValue: 'escaped',
        options: [
          { value: 'escaped', label: 'Escaped text' },
          { value: 'hex', label: 'Hex' },
          { value: 'base64', label: 'Base64' },
        ],
      },
    ],
  },
};

export function xorBytes(bytes: Uint8Array, key: Uint8Array): Uint8Array {
  if (key.length === 0) throw new ToolFailure('invalid-input', 'Provide a non-empty XOR key.');
  const output = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    output[index] = bytes[index]! ^ key[index % key.length]!;
  }
  return output;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

/**
 * Escaped output stays line-safe even when the XOR result happens to be valid
 * UTF-8. Control bytes are escaped; printable Unicode is preserved.
 */
function toEscaped(bytes: Uint8Array): string {
  const display = bytesToDisplay(bytes);
  if (!display.utf8) return display.text;

  let output = '';
  for (const character of display.text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (character === '\t') output += '\\t';
    else if (character === '\n') output += '\\n';
    else if (character === '\r') output += '\\r';
    else if (codePoint < 0x20 || codePoint === 0x7f) {
      output += `\\x${codePoint.toString(16).padStart(2, '0')}`;
    } else output += character;
  }
  return output;
}

function readBytes(value: string, format: string, label: string): Uint8Array {
  if (format === 'hex') {
    try {
      return decodeHex(value);
    } catch (error) {
      throw new ToolFailure(
        'malformed-content',
        `${label} is not valid hex: ${error instanceof Error ? error.message : 'parse failed'}`,
      );
    }
  }
  return new TextEncoder().encode(value);
}

async function execute(input: RunnerInput): Promise<ToolResult<string>> {
  const text = input.text ?? '';
  if (text.length === 0) throw new ToolFailure('invalid-input', 'Provide input to XOR.');

  const rawKey = readString(input, 'key', '');
  if (rawKey.length === 0) throw new ToolFailure('invalid-input', 'Provide an XOR key.');

  const inputFormat = readString(input, 'input-format', 'text');
  const keyFormat = readString(input, 'key-format', 'text');
  const outputFormat = readString(input, 'output', 'escaped');

  const bytes = readBytes(text, inputFormat, 'Input');
  const key = readBytes(rawKey, keyFormat, 'Key');
  const result = xorBytes(bytes, key);

  const output =
    outputFormat === 'hex'
      ? toHex(result)
      : outputFormat === 'base64'
        ? toBase64(result)
        : toEscaped(result);

  return {
    output,
    meta: {
      inputBytes: bytes.byteLength,
      keyBytes: key.byteLength,
      outputFormat,
      symmetric: true,
    },
  };
}

export const xorTool: BlueKitTool<RunnerInput, string> = { manifest, execute };
