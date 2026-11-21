import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolContext, ToolResult } from '@/core/runtime/types';
import { DEFAULT_LIMITS, DATA_TYPES, type ToolManifest } from '@/core/schemas/types';

const manifest: ToolManifest = {
  id: 'encoding.base64-encode',
  name: 'Base64 Encode',
  version: '0.1.0',
  category: 'encoding',
  description:
    'Encode UTF-8 text as Base64. Runs on the main thread and never leaves the browser.',
  tags: ['base64', 'encode', 'binary', 'rfc4648'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.text }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.base64-decode', 'encoding.hash'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 4 * 1024 * 1024 },
  ui: {
    inputLabel: 'UTF-8 text',
    outputLabel: 'Base64',
    placeholder: 'Paste text to encode…',
    primaryInput: DATA_TYPES.text,
  },
};

function toBase64(bytes: Uint8Array, urlSafe: boolean): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const encoded = btoa(binary);
  return urlSafe ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '') : encoded;
}

async function execute(
  input: RunnerInput,
  context: ToolContext,
  _signal: AbortSignal,
): Promise<ToolResult<string>> {
  const text = input.text ?? '';
  if (text.length === 0) {
    throw new ToolFailure('invalid-input', 'Provide text to encode.');
  }

  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > context.limits.maxInputBytes) {
    throw new ToolFailure('file-too-large', 'Input exceeds the 4 MiB limit for this tool.', {
      bytes: bytes.byteLength,
      limit: context.limits.maxInputBytes,
    });
  }

  context.reportProgress({ pct: 50, message: 'Encoding UTF-8 bytes' });
  const encoded = toBase64(bytes, false);
  context.reportProgress({ pct: 100, message: 'Encoded' });

  return {
    output: encoded,
    meta: {
      inputBytes: bytes.byteLength,
      outputChars: encoded.length,
      alphabet: 'standard',
    },
  };
}

export const base64EncodeTool: BlueKitTool<RunnerInput, string> = { manifest, execute };
