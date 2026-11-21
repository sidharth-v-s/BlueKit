import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { bytesToDisplay, readChoice, readString } from './params';
import { decodeHex } from './hex';

/**
 * Gzip / zlib compression and decompression.
 *
 * Decompression is the risky direction, so it runs in a worker and enforces a
 * hard output ceiling. This stops a small gzip bomb from exhausting memory even
 * though the browser has no "decompress at most N bytes" primitive.
 */

const manifest: ToolManifest = {
  id: 'encoding.compress',
  name: 'Gzip / Zlib',
  version: '0.1.0',
  category: 'encoding',
  description:
    'Compress or decompress gzip, zlib, and raw deflate data in a worker with an expansion limit.',
  tags: ['gzip', 'zlib', 'deflate', 'compress', 'decompress', 'bomb'],
  runtime: 'worker',
  input: [
    { type: DATA_TYPES.file, description: 'Compressed or plain file' },
    { type: DATA_TYPES.text, description: 'Text (compress) or Base64/hex (decompress)' },
  ],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.compression-report.v1' }],
  capabilities: ['worker.execute', 'file.read'],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.base64-encode', 'encoding.hex', 'malware.strings'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 16 * 1024 * 1024, timeoutMs: 45_000 },
  ui: {
    inputLabel: 'File, text, Base64, or hex',
    outputLabel: 'Compression report',
    placeholder: 'Compress text, or paste Base64 / hex to decompress…',
    primaryInput: DATA_TYPES.text,
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        defaultValue: 'decompress',
        options: [
          { value: 'decompress', label: 'Decompress' },
          { value: 'compress', label: 'Compress' },
        ],
      },
      {
        key: 'format',
        label: 'Format',
        type: 'select',
        defaultValue: 'gzip',
        options: [
          { value: 'gzip', label: 'gzip' },
          { value: 'deflate', label: 'zlib / deflate' },
          { value: 'deflate-raw', label: 'raw deflate' },
        ],
      },
      {
        key: 'text-encoding',
        label: 'Text input encoding',
        type: 'select',
        defaultValue: 'auto',
        options: [
          { value: 'auto', label: 'Auto (Base64/hex, then text)' },
          { value: 'text', label: 'Plain text' },
          { value: 'base64', label: 'Base64' },
          { value: 'hex', label: 'Hex' },
        ],
      },
    ],
  },
};

export const MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;
const PREVIEW_BYTES = 1024 * 1024;

type CompressionFormat = 'gzip' | 'deflate' | 'deflate-raw';
const FORMATS: readonly CompressionFormat[] = ['gzip', 'deflate', 'deflate-raw'];

export interface CompressionReport {
  action: 'compress' | 'decompress';
  format: CompressionFormat;
  source: 'file' | 'text';
  inputBytes: number;
  outputBytes: number;
  ratioPercent: number;
  base64?: string;
  text?: string;
  textUtf8?: boolean;
  previewTruncated?: boolean;
  note: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const stripped = text.replace(/^data:[^,]*;base64,/u, '').replace(/\s+/gu, '');
  if (stripped.length === 0) throw new ToolFailure('invalid-input', 'Base64 input is empty.');
  let binary: string;
  try {
    binary = atob(stripped);
  } catch {
    throw new ToolFailure('malformed-content', 'Input is not valid Base64.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function looksLikeBase64(text: string): boolean {
  const compact = text.replace(/\s+/gu, '');
  return compact.length >= 8 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/u.test(compact);
}

function looksLikeHex(text: string): boolean {
  const compact = text.replace(/\s+/gu, '');
  return compact.length >= 4 && compact.length % 2 === 0 && /^[0-9a-f]+$/iu.test(compact);
}

async function readAll(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new ToolFailure(
          'resource-limit',
          `Output exceeded the ${Math.round(limit / (1024 * 1024))} MiB expansion limit.`,
          { limit },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function readTextBytes(text: string, encoding: string, action: string): Uint8Array {
  const requested = encoding === 'auto' ? (action === 'decompress' ? 'auto' : 'text') : encoding;

  if (requested === 'base64') return fromBase64(text);
  if (requested === 'hex') {
    try {
      return decodeHex(text);
    } catch (error) {
      throw new ToolFailure(
        'malformed-content',
        `Input is not valid hex: ${error instanceof Error ? error.message : 'parse failed'}`,
      );
    }
  }
  if (requested === 'auto') {
    if (/^data:[^,]*;base64,/iu.test(text)) return fromBase64(text);
    // Hex is checked first: a gzip header in hex (1f 8b …) is also a valid
    // Base64 alphabet string, but hex is the common pasted form for magic bytes.
    if (looksLikeHex(text)) {
      try {
        return decodeHex(text);
      } catch {
        // Fall through to Base64/text.
      }
    }
    if (looksLikeBase64(text)) {
      try {
        return fromBase64(text);
      } catch {
        // Fall through to text.
      }
    }
  }
  return new TextEncoder().encode(text);
}

export async function runCompressionTool(
  input: RunnerInput,
  report: (pct: number | undefined, message: string) => void,
  signal: AbortSignal,
): Promise<ToolResult<CompressionReport>> {
  const action = readChoice(input, 'action', ['compress', 'decompress'], 'decompress') as
    | 'compress'
    | 'decompress';
  const format = readChoice(input, 'format', FORMATS, 'gzip') as CompressionFormat;

  let bytes: Uint8Array;
  let source: 'file' | 'text';

  if (input.file) {
    report(10, 'Reading local file');
    bytes = new Uint8Array(await input.file.arrayBuffer());
    source = 'file';
  } else {
    const text = input.text ?? '';
    if (text.length === 0) {
      throw new ToolFailure('invalid-input', 'Choose a file or provide text to compress or decompress.');
    }
    bytes = readTextBytes(text, readString(input, 'text-encoding', 'auto'), action);
    source = 'text';
  }

  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (bytes.byteLength > manifest.limits!.maxInputBytes) {
    throw new ToolFailure('file-too-large', 'Input exceeds the 16 MiB compression limit.', {
      bytes: bytes.byteLength,
      limit: manifest.limits!.maxInputBytes,
    });
  }

  if (action === 'compress') {
    report(40, `Compressing with ${format}`);
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream(format));
    const output = await readAll(stream, MAX_DECOMPRESSED_BYTES, signal);
    report(100, 'Done');

    return {
      output: {
        action,
        format,
        source,
        inputBytes: bytes.byteLength,
        outputBytes: output.byteLength,
        ratioPercent:
          bytes.byteLength > 0 ? Math.round((output.byteLength / bytes.byteLength) * 1000) / 10 : 0,
        base64: toBase64(output),
        note: 'Compressed output is returned as Base64.',
      },
      meta: { action, format, inputBytes: bytes.byteLength, outputBytes: output.byteLength },
    };
  }

  report(40, `Decompressing ${format}`);
  let output: Uint8Array;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
    output = await readAll(stream, MAX_DECOMPRESSED_BYTES, signal);
  } catch (error) {
    if (error instanceof ToolFailure) throw error;
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    throw new ToolFailure(
      'malformed-content',
      `The input is not a valid ${format} stream, or it is truncated.`,
    );
  }

  const preview = output.subarray(0, PREVIEW_BYTES);
  const display = bytesToDisplay(preview);
  report(100, 'Done');

  return {
    output: {
      action,
      format,
      source,
      inputBytes: bytes.byteLength,
      outputBytes: output.byteLength,
      ratioPercent:
        bytes.byteLength > 0 ? Math.round((output.byteLength / bytes.byteLength) * 1000) / 10 : 100,
      text: display.text,
      textUtf8: display.utf8,
      previewTruncated: output.byteLength > PREVIEW_BYTES,
      note:
        output.byteLength > PREVIEW_BYTES
          ? `Showing the first ${Math.round(PREVIEW_BYTES / 1024)} KiB of the decompressed bytes.`
          : display.utf8
            ? 'Decompressed bytes are valid UTF-8.'
            : 'Decompressed bytes are not valid UTF-8; non-printable bytes are escaped.',
    },
    ...(output.byteLength > PREVIEW_BYTES
      ? {
          warnings: [
            {
              code: 'preview-truncated',
              message: 'Decompressed output is larger than the text preview; only the first 1 MiB is shown.',
            },
          ],
        }
      : {}),
    meta: {
      action,
      format,
      inputBytes: bytes.byteLength,
      outputBytes: output.byteLength,
      expansion: bytes.byteLength > 0 ? Math.round(output.byteLength / bytes.byteLength) : 0,
    },
  };
}

async function execute(input: RunnerInput): Promise<ToolResult<CompressionReport>> {
  return runCompressionTool(input, () => {}, new AbortController().signal);
}

export const compressTool: BlueKitTool<RunnerInput, CompressionReport> = { manifest, execute };
