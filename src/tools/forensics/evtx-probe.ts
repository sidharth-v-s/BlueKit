import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';

/**
 * EVTX header probe — Phase 0 feasibility spike.
 *
 * This proves file identification and container-level parsing in the browser and
 * documents where the hard work actually is. It intentionally does NOT claim to
 * parse event records: the interesting part of EVTX is BinXML record decoding,
 * for which a reviewed parser (libevtx via WASM, or a purpose-built TS decoder)
 * is required. See docs/architecture/phase-0/evtx-feasibility.md.
 */

const EVTX_MAGIC = 'ElfFile\0';
const EVTX_CHUNK_MAGIC = 'ElfChnk\0';
const FILE_HEADER_SIZE = 4096;
const CHUNK_SIZE = 65536;

export interface EvtxChunkSummary {
  index: number;
  offset: number;
  magicValid: boolean;
  firstEventRecordNumber: number | null;
  lastEventRecordNumber: number | null;
  firstEventRecordId: number | null;
  lastEventRecordId: number | null;
  headerSize: number | null;
  lastEventRecordDataOffset: number | null;
  freeSpaceOffset: number | null;
  declaredRecordsChecksum: number | null;
}

export interface EvtxProbeResult {
  fileName?: string;
  fileSizeBytes: number;
  magicValid: boolean;
  headerSizeBytes: number;
  majorVersion: number;
  minorVersion: number;
  headerBlockSize: number;
  declaredChunkCount: number;
  chunksPresentOnDisk: number;
  firstChunkNumber: number;
  lastChunkNumber: number;
  nextRecordId: number;
  flags: number;
  declaredHeaderChecksum: number;
  chunks: EvtxChunkSummary[];
  warnings: string[];
  feasibility: {
    containerParsing: 'supported';
    recordParsing: 'not-implemented';
    recommendedPath: string;
  };
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readU64(view: DataView, offset: number): number {
  const value = view.getBigUint64(offset, true);
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
}

export function probeEvtx(buffer: ArrayBuffer, fileName?: string): EvtxProbeResult {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < FILE_HEADER_SIZE) {
    throw new ToolFailure('malformed-content', 'File is smaller than a single EVTX file header.', {
      bytes: bytes.byteLength,
    });
  }

  const view = new DataView(buffer);
  const magic = ascii(bytes, 0, 8);
  const magicValid = magic === EVTX_MAGIC;
  if (!magicValid) {
    throw new ToolFailure('unsupported-format', 'File does not start with the EVTX signature "ElfFile\\0".', {
      observed: magic.replace(/\0/gu, '\\0'),
    });
  }

  const warnings: string[] = [];
  const headerBlockSize = view.getUint16(0x28, true);
  if (headerBlockSize !== FILE_HEADER_SIZE) {
    warnings.push(`Unexpected header block size ${headerBlockSize}; expected 4096.`);
  }

  const declaredChunkCount = view.getUint16(0x2a, true);
  const chunksPresentOnDisk = Math.max(0, Math.floor((bytes.byteLength - FILE_HEADER_SIZE) / CHUNK_SIZE));
  if (declaredChunkCount !== chunksPresentOnDisk) {
    warnings.push(
      `Header declares ${declaredChunkCount} chunk(s) but the file contains ${chunksPresentOnDisk} full chunk(s) on disk.`,
    );
  }

  const flags = view.getUint32(0x2c, true);
  if (flags !== 0) {
    warnings.push(`File header flags are 0x${flags.toString(16)}, not 0x0 (clean/dirty state and recovery flags need review).`);
  }

  const chunks: EvtxChunkSummary[] = [];
  const scanLimit = Math.min(chunksPresentOnDisk, 16);
  for (let index = 0; index < scanLimit; index += 1) {
    const offset = FILE_HEADER_SIZE + index * CHUNK_SIZE;
    const chunkMagic = ascii(bytes, offset, 8);
    const valid = chunkMagic === EVTX_CHUNK_MAGIC;
    if (!valid) warnings.push(`Chunk ${index} at offset ${offset} has invalid magic.`);
    chunks.push({
      index,
      offset,
      magicValid: valid,
      firstEventRecordNumber: valid ? readU64(view, offset + 0x08) : null,
      lastEventRecordNumber: valid ? readU64(view, offset + 0x10) : null,
      firstEventRecordId: valid ? readU64(view, offset + 0x18) : null,
      lastEventRecordId: valid ? readU64(view, offset + 0x20) : null,
      headerSize: valid ? view.getUint32(offset + 0x28, true) : null,
      lastEventRecordDataOffset: valid ? view.getUint32(offset + 0x2c, true) : null,
      freeSpaceOffset: valid ? view.getUint32(offset + 0x30, true) : null,
      declaredRecordsChecksum: valid ? view.getUint32(offset + 0x34, true) : null,
    });
  }

  if (chunksPresentOnDisk > scanLimit) {
    warnings.push(`Only the first ${scanLimit} chunk headers were inspected.`);
  }

  const firstChunkNumber = readU64(view, 0x08);
  const lastChunkNumber = readU64(view, 0x10);
  if (firstChunkNumber !== 0 && declaredChunkCount > 0) {
    warnings.push(`First chunk number is ${firstChunkNumber}; wrapped/rotated logs require careful ordering.`);
  }

  return {
    ...(fileName ? { fileName } : {}),
    fileSizeBytes: bytes.byteLength,
    magicValid,
    headerSizeBytes: view.getUint32(0x20, true),
    majorVersion: view.getUint16(0x26, true),
    minorVersion: view.getUint16(0x24, true),
    headerBlockSize,
    declaredChunkCount,
    chunksPresentOnDisk,
    firstChunkNumber,
    lastChunkNumber,
    nextRecordId: readU64(view, 0x18),
    flags,
    declaredHeaderChecksum: view.getUint32(0x30, true),
    chunks,
    warnings,
    feasibility: {
      containerParsing: 'supported',
      recordParsing: 'not-implemented',
      recommendedPath:
        'Bind a reviewed libevtx-compatible parser to WASM in a worker, or implement BinXML decoding with a documented feature matrix. Do not ship a permissive regex-based record reader.',
    },
  };
}

const manifest: ToolManifest = {
  id: 'windows.evtx-probe',
  name: 'EVTX Header Probe',
  version: '0.1.0',
  category: 'windows',
  description:
    'Phase 0 spike: validate EVTX container headers in the browser and report what record parsing still requires.',
  tags: ['evtx', 'probe', 'forensics', 'feasibility', 'prototype'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.file, accept: ['.evtx'], description: 'Windows event log' }],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.evtx-probe.v1' }],
  capabilities: ['file.read'],
  network: 'none',
  dataHandling: 'local-only',
  status: 'prototype',
  phase: 0,
  related: ['windows.evtx-inspector'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 512 * 1024 * 1024 },
  ui: {
    inputLabel: 'EVTX file',
    outputLabel: 'Container header report',
    primaryInput: DATA_TYPES.file,
  },
};

async function execute(input: RunnerInput): Promise<ToolResult<EvtxProbeResult>> {
  if (!input.file) {
    throw new ToolFailure('invalid-input', 'Choose an .evtx file to probe.');
  }
  if (input.file.size > manifest.limits!.maxInputBytes) {
    throw new ToolFailure('file-too-large', 'EVTX file exceeds the 512 MiB probe limit.', {
      bytes: input.file.size,
      limit: manifest.limits!.maxInputBytes,
    });
  }
  const buffer = await input.file.arrayBuffer();
  const result = probeEvtx(buffer, input.file.name);
  return {
    output: result,
    warnings: result.warnings.map((message, index) => ({
      code: `evtx-warning-${index}`,
      message,
    })),
    meta: {
      recordParsing: 'not-implemented',
      parser: 'bluekit.evtx-container-probe',
    },
  };
}

export const evtxProbeTool: BlueKitTool<RunnerInput, EvtxProbeResult> = { manifest, execute };
