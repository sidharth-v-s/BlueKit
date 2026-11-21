import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';

const manifest: ToolManifest = {
  id: 'encoding.hash',
  name: 'Hash Calculator',
  version: '0.1.0',
  category: 'encoding',
  description:
    'Calculate SHA-1, SHA-256, SHA-384, and SHA-512 digests for text or a local file in a dedicated worker.',
  tags: ['hash', 'sha256', 'sha1', 'digest', 'webcrypto'],
  runtime: 'worker',
  input: [
    { type: DATA_TYPES.text, description: 'UTF-8 text' },
    { type: DATA_TYPES.file, description: 'Local file (never uploaded)' },
  ],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.hash-result.v1' }],
  capabilities: ['worker.execute', 'file.read'],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['malware.file-type', 'malware.strings'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 64 * 1024 * 1024 },
  ui: {
    inputLabel: 'Text or file',
    outputLabel: 'Digests',
    placeholder: 'Paste text to hash, or choose a file…',
    primaryInput: DATA_TYPES.text,
  },
};

export const HASH_ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

export interface HashToolInput {
  text?: string;
  file?: File | null;
}

export interface HashToolOutput {
  source: 'text' | 'file';
  name?: string;
  sizeBytes: number;
  hashes: Record<HashAlgorithm, string>;
}

/**
 * Worker-side implementation. WebCrypto has no MD5; BlueKit will not ship a
 * hand-rolled MD5 just to fill a table. If MD5 is required for IOC matching it
 * gets a reviewed implementation and its own feasibility note.
 */
export async function runHashTool(
  input: HashToolInput,
  report: (pct: number | undefined, message: string) => void,
  signal: AbortSignal,
): Promise<ToolResult<HashToolOutput>> {
  let bytes: ArrayBuffer;
  let source: 'text' | 'file';
  let name: string | undefined;

  if (input.file) {
    report(5, 'Reading local file');
    bytes = await input.file.arrayBuffer();
    source = 'file';
    name = input.file.name;
  } else {
    const text = input.text ?? '';
    if (text.length === 0) {
      throw new ToolFailure('invalid-input', 'Provide text or choose a file to hash.');
    }
    bytes = new TextEncoder().encode(text).buffer as ArrayBuffer;
    source = 'text';
  }

  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (bytes.byteLength > manifest.limits!.maxInputBytes) {
    throw new ToolFailure('file-too-large', 'Input exceeds the 64 MiB hashing limit.', {
      bytes: bytes.byteLength,
      limit: manifest.limits!.maxInputBytes,
    });
  }

  const hashes = {} as Record<HashAlgorithm, string>;
  for (const [index, algorithm] of HASH_ALGORITHMS.entries()) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    report(10 + (index / HASH_ALGORITHMS.length) * 85, `Computing ${algorithm}`);
    const digest = await crypto.subtle.digest(algorithm, bytes);
    hashes[algorithm] = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  }

  report(100, 'Digests complete');
  return {
    output: {
      source,
      ...(name ? { name } : {}),
      sizeBytes: bytes.byteLength,
      hashes,
    },
    meta: { algorithms: HASH_ALGORITHMS.length, webcrypto: true },
  };
}

export const hashTool: BlueKitTool<HashToolInput, HashToolOutput> = {
  manifest,
  async execute(input, _context) {
    // Main-thread calls are not used for this tool; the executor routes worker
    // tools to the worker manager. This branch exists for tests and fallback.
    const result = await runHashTool(input, () => {}, new AbortController().signal);
    return result;
  },
};
