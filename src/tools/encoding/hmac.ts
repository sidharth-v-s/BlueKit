import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';

/**
 * HMAC calculator.
 *
 * WebCrypto only. Key material stays in this tab; it is never logged, stored, or
 * included in the report. The key is entered as text and hashed as UTF-8 bytes.
 */

const manifest: ToolManifest = {
  id: 'encoding.hmac',
  name: 'HMAC Calculator',
  version: '0.1.0',
  category: 'encoding',
  description: 'Compute HMAC-SHA-1/256/384/512 over text with a local key in a worker.',
  tags: ['hmac', 'sha256', 'signature', 'webcrypto', 'integrity'],
  runtime: 'worker',
  input: [{ type: DATA_TYPES.text, description: 'Message' }],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.hmac-result.v1' }],
  capabilities: ['worker.execute'],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.hash', 'encoding.base64-encode'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 8 * 1024 * 1024 },
  ui: {
    inputLabel: 'Message',
    outputLabel: 'HMAC',
    placeholder: 'Message to authenticate…',
    primaryInput: DATA_TYPES.text,
    fields: [
      {
        key: 'algorithm',
        label: 'Hash',
        type: 'select',
        defaultValue: 'SHA-256',
        options: [
          { value: 'SHA-1', label: 'SHA-1' },
          { value: 'SHA-256', label: 'SHA-256' },
          { value: 'SHA-384', label: 'SHA-384' },
          { value: 'SHA-512', label: 'SHA-512' },
        ],
      },
      {
        key: 'key',
        label: 'Key (UTF-8)',
        type: 'text',
        placeholder: 'Shared secret',
        help: 'Stays in this tab and is not included in the result.',
      },
    ],
  },
};

export const HMAC_ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;
export type HmacAlgorithm = (typeof HMAC_ALGORITHMS)[number];

export interface HmacOutput {
  algorithm: HmacAlgorithm;
  messageBytes: number;
  keyBytes: number;
  hex: string;
  base64: string;
}

export async function runHmacTool(
  input: RunnerInput,
  report: (pct: number | undefined, message: string) => void,
  signal: AbortSignal,
): Promise<ToolResult<HmacOutput>> {
  const message = input.text ?? '';
  if (message.length === 0) throw new ToolFailure('invalid-input', 'Provide a message to authenticate.');

  const key = typeof input.params?.['key'] === 'string' ? input.params['key'] : '';
  if (key.length === 0) throw new ToolFailure('invalid-input', 'Provide an HMAC key.');

  const candidate = typeof input.params?.['algorithm'] === 'string' ? input.params['algorithm'] : 'SHA-256';
  if (!(HMAC_ALGORITHMS as readonly string[]).includes(candidate)) {
    throw new ToolFailure('invalid-input', `Unsupported HMAC hash "${candidate}".`);
  }
  const algorithm = candidate as HmacAlgorithm;

  const messageBytes = new TextEncoder().encode(message);
  const keyBytes = new TextEncoder().encode(key);

  report(15, 'Importing key');
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  );
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');

  report(60, `Computing HMAC-${algorithm}`);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageBytes);
  const bytes = new Uint8Array(signature);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const base64 = btoa(String.fromCharCode(...bytes));

  report(100, 'HMAC complete');
  return {
    output: {
      algorithm,
      messageBytes: messageBytes.byteLength,
      keyBytes: keyBytes.byteLength,
      hex,
      base64,
    },
    meta: { algorithm, webcrypto: true },
  };
}

async function execute(input: RunnerInput): Promise<ToolResult<HmacOutput>> {
  return runHmacTool(input, () => {}, new AbortController().signal);
}

export const hmacTool: BlueKitTool<RunnerInput, HmacOutput> = { manifest, execute };
