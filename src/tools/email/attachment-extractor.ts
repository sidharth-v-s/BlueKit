import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolContext, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { detectFileType, type FileTypeCandidate } from '@/tools/malware/file-type';
import { MAX_EMAIL_BYTES, readEmailInput, requireEmailInput } from './input';
import { decodePartText, isAttachment, parseEmlMessage, type ParsedPart } from './rfc822';

const MAX_HASHED_ATTACHMENTS = 50;
const MAX_SINGLE_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_DOWNLOAD_BYTES = 16 * 1024 * 1024;
const MAGIC_BYTES = 4096;

const manifest: ToolManifest = {
  id: 'email.attachment-extractor',
  name: 'Attachment Extractor',
  version: '0.1.0',
  category: 'email',
  description:
    'Extract MIME attachments locally, detect types from magic bytes, calculate SHA-1/SHA-256, and offer explicit per-file download. Nothing is uploaded.',
  tags: ['email', 'attachment', 'hash', 'mime', 'mailsleuth'],
  runtime: 'worker',
  input: [
    { type: DATA_TYPES.file, accept: ['.eml', '.txt', 'message/rfc822'], description: 'Raw message' },
    { type: DATA_TYPES.text, description: 'Pasted raw message' },
  ],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.email-attachments.v1' }],
  capabilities: ['worker.execute', 'file.read'],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 3,
  related: ['email.eml-inspector', 'malware.file-type', 'malware.strings', 'malware.entropy'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: MAX_EMAIL_BYTES, timeoutMs: 45_000 },
  ui: {
    inputLabel: 'Raw email (.eml)',
    outputLabel: 'Attachments',
    placeholder: 'Paste the full raw message including MIME boundaries…',
    primaryInput: DATA_TYPES.file,
    fields: [
      {
        key: 'include-data',
        label: 'Include attachment data for download',
        type: 'toggle',
        defaultValue: 'true',
        help: 'Base64 data is capped at 10 MiB per attachment and 16 MiB total. Metadata and hashes are still reported when the cap is reached.',
      },
    ],
  },
};

export interface EmailAttachmentRecord {
  path: string;
  filename: string | null;
  /** Filename safe to use for a local download; never a server path. */
  downloadName: string;
  contentType: string;
  transferEncoding: string;
  disposition: string | null;
  contentId: string | null;
  sizeBytes: number;
  declaredAttachment: boolean;
  magicHex: string;
  detected: FileTypeCandidate | null;
  typeCandidates: FileTypeCandidate[];
  sha1: string | null;
  sha256: string | null;
  hashError?: string;
  dataBase64: string | null;
  dataIncluded: boolean;
  dataOmittedReason?: string;
  textPreview?: string;
  decodeError?: string;
  riskFlags: string[];
}

export interface AttachmentReport {
  byteLength: number;
  fileName?: string;
  attachments: EmailAttachmentRecord[];
  totalBytes: number;
  includedBytes: number;
  includeData: boolean;
  warnings: string[];
  notes: string[];
}

const RISKY_EXTENSIONS = new Set([
  '.exe', '.scr', '.com', '.pif', '.bat', '.cmd', '.js', '.jse', '.vbs', '.vbe', '.hta',
  '.ps1', '.lnk', '.iso', '.img', '.docm', '.xlsm', '.pptm', '.jar', '.msi', '.wsf', '.reg',
  '.cpl', '.dll', '.ocx', '.xll', '.url', '.chm',
]);

const MACRO_EXTENSIONS = new Set(['.docm', '.xlsm', '.pptm', '.dotm', '.xltm', '.potm']);

function hex(bytes: Uint8Array, length = MAGIC_BYTES): string {
  return Array.from(bytes.subarray(0, length), (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function digestHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

function safeDownloadName(name: string | null, path: string, fallbackExtension: string): string {
  const raw = (name ?? '').replace(/[\u0000-\u001f\u007f]/gu, '').trim();
  const base = raw.replace(/^.*[\\/]/u, '').replace(/^\.+/u, '').slice(0, 180);
  if (base.length > 0) return base;
  const fallback = `attachment-${path.replace(/[^0-9]/gu, '-') || '1'}${fallbackExtension}`;
  return fallback;
}

/**
 * Map a declared MIME type onto the same coarse categories used by magic-byte
 * detection so a declared type can be compared with the detected content
 * without flagging harmless container/type-family differences (for example a
 * DOCX, which is a ZIP container, or a PDF declared as application/pdf).
 *
 * Returns null when the declared type is too generic to compare.
 */
function declaredCategory(contentType: string): string | null {
  const type = contentType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (!type || type === 'application/octet-stream') return null;
  if (type.startsWith('text/')) return 'text';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('message/')) return 'mail';
  if (type === 'application/pdf' || type === 'application/rtf' || type === 'application/postscript') {
    return 'document';
  }
  if (type === 'application/json' || type === 'application/xml' || type === 'application/xhtml+xml') {
    return 'text';
  }
  if (
    type === 'application/zip' ||
    type === 'application/gzip' ||
    type === 'application/x-7z-compressed' ||
    type === 'application/vnd.rar' ||
    type === 'application/x-bzip2' ||
    type === 'application/x-xz' ||
    type === 'application/zstd' ||
    type === 'application/vnd.ms-cab-compressed' ||
    type === 'application/java-archive' ||
    type.startsWith('application/vnd.openxmlformats-officedocument.') ||
    type.startsWith('application/vnd.oasis.opendocument.')
  ) {
    return 'archive';
  }
  if (
    type === 'application/vnd.microsoft.portable-executable' ||
    type === 'application/x-dosexec' ||
    type === 'application/x-msdownload' ||
    type === 'application/x-executable' ||
    type === 'application/x-elf' ||
    type === 'application/x-mach-binary' ||
    type === 'application/wasm' ||
    type === 'application/x-dex'
  ) {
    return 'executable';
  }
  if (type === 'application/x-ole-storage') return 'container';
  return null;
}

function risksFor(
  record: Pick<EmailAttachmentRecord, 'filename' | 'contentType' | 'disposition' | 'sizeBytes' | 'decodeError'>,
  detected: FileTypeCandidate | null,
): string[] {
  const flags: string[] = [];
  const name = (record.filename ?? '').toLowerCase();
  const extension = extensionOf(name);

  if (RISKY_EXTENSIONS.has(extension)) flags.push('risky-extension');
  if (MACRO_EXTENSIONS.has(extension)) flags.push('macro-enabled-document');
  if (/\.[a-z0-9]{1,5}\.[a-z0-9]{1,5}$/u.test(name) && RISKY_EXTENSIONS.has(extension)) {
    flags.push('double-extension');
  }
  if (record.disposition === 'inline' && record.filename) flags.push('inline-with-filename');
  if (record.decodeError) flags.push('body-decode-error');
  if (record.sizeBytes === 0) flags.push('empty-part');

  if (detected) {
    if (detected.category === 'executable') flags.push('executable-content');
    if (detected.category === 'archive') flags.push('archive-container');
    if (detected.mime === 'text/html' || detected.mime === 'application/xhtml+xml') flags.push('active-html-content');
    const declared = declaredCategory(record.contentType);
    if (
      declared !== null &&
      detected.category !== 'unknown' &&
      declared !== detected.category &&
      detected.confidence !== 'low'
    ) {
      flags.push('declared-and-detected-mime-differ');
    }
  }

  return flags;
}

function textPreview(part: ParsedPart): string | undefined {
  if (!part.contentType.startsWith('text/') && part.contentType !== 'application/json') return undefined;
  return decodePartText(part).slice(0, 500);
}

export async function runAttachmentExtractor(
  input: RunnerInput,
  report: (pct: number | undefined, message: string) => void,
  signal: AbortSignal,
): Promise<ToolResult<AttachmentReport>> {
  report(5, 'Reading message');
  const email = await readEmailInput(input, manifest.limits!.maxInputBytes);
  if (signal.aborted) throw new ToolFailure('cancelled', 'Operation cancelled.');
  requireEmailInput(email);

  const includeData = input.params?.['include-data'] !== false;
  report(25, 'Parsing MIME parts');
  const parsed = parseEmlMessage(email.raw);
  const candidates = parsed.parts.filter((part) => part.depth > 0 && isAttachment(part));

  const warnings = [...parsed.warnings];
  const attachments: EmailAttachmentRecord[] = [];
  let totalBytes = 0;
  let includedBytes = 0;
  let hashesSkipped = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    if (signal.aborted) throw new ToolFailure('cancelled', 'Operation cancelled.');
    const part = candidates[index]!;
    const bytes = part.bytes ?? new Uint8Array();
    totalBytes += bytes.byteLength;
    report(25 + Math.round((index / Math.max(1, candidates.length)) * 60), `Inspecting attachment ${index + 1}`);

    const detectedInfo = detectFileType(bytes.subarray(0, MAGIC_BYTES), part.filename ?? '');
    const record: EmailAttachmentRecord = {
      path: part.path,
      filename: part.filename ?? null,
      downloadName: safeDownloadName(part.filename ?? null, part.path, extensionOf(part.filename ?? '') || '.bin'),
      contentType: part.contentType,
      transferEncoding: part.transferEncoding,
      disposition: part.disposition ?? null,
      contentId: part.contentId ?? null,
      sizeBytes: bytes.byteLength,
      declaredAttachment: part.disposition === 'attachment' || Boolean(part.filename),
      magicHex: hex(bytes, 64),
      detected: detectedInfo.detected,
      typeCandidates: detectedInfo.candidates,
      sha1: null,
      sha256: null,
      dataBase64: null,
      dataIncluded: false,
      riskFlags: [],
    };

    if (index < MAX_HASHED_ATTACHMENTS) {
      try {
        const [sha1, sha256] = await Promise.all([
          crypto.subtle.digest('SHA-1', bytes as unknown as BufferSource),
          crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource),
        ]);
        record.sha1 = digestHex(sha1);
        record.sha256 = digestHex(sha256);
      } catch (error) {
        record.hashError = error instanceof Error ? error.message : String(error);
      }
    } else {
      hashesSkipped += 1;
    }

    if (includeData) {
      if (bytes.byteLength > MAX_SINGLE_DOWNLOAD_BYTES) {
        record.dataOmittedReason = `Attachment is larger than the ${Math.round(MAX_SINGLE_DOWNLOAD_BYTES / (1024 * 1024))} MiB per-attachment download cap.`;
      } else if (includedBytes + bytes.byteLength > MAX_TOTAL_DOWNLOAD_BYTES) {
        record.dataOmittedReason = `Including this attachment would exceed the ${Math.round(MAX_TOTAL_DOWNLOAD_BYTES / (1024 * 1024))} MiB total output cap.`;
      } else {
        record.dataBase64 = toBase64(bytes);
        record.dataIncluded = true;
        includedBytes += bytes.byteLength;
      }
    } else {
      record.dataOmittedReason = 'Attachment data was disabled for this run.';
    }

    if (part.decodeError) record.decodeError = part.decodeError;
    const preview = textPreview(part);
    if (preview !== undefined) record.textPreview = preview;
    record.riskFlags = risksFor(record, record.detected);
    attachments.push(record);
  }

  if (hashesSkipped > 0) {
    warnings.push(`More than ${MAX_HASHED_ATTACHMENTS} attachments; hashes were skipped for ${hashesSkipped} later parts.`);
  }
  if (includeData && includedBytes >= MAX_TOTAL_DOWNLOAD_BYTES) {
    warnings.push('Attachment data output reached its total cap; later attachments are metadata-only.');
  }

  report(100, 'Done');

  const output: AttachmentReport = {
    byteLength: email.byteLength,
    ...(email.fileName ? { fileName: email.fileName } : {}),
    attachments,
    totalBytes,
    includedBytes,
    includeData,
    warnings,
    notes: [
      'Attachments are decoded locally and never uploaded.',
      'Hashes are calculated over the decoded attachment bytes, not the Base64 or quoted-printable MIME text.',
      'Detected type comes from magic bytes in the first 4 KiB and is shown separately from the declared MIME type.',
      'The download button is the only action that writes attachment bytes to disk. Review before opening.',
      'Risk flags are observations, not malware verdicts.',
    ],
  };

  return {
    output,
    ...(warnings.length > 0
      ? { warnings: warnings.map((message, index) => ({ code: `attachment-warning-${index}`, message })) }
      : {}),
    meta: {
      fileName: email.fileName ?? null,
      attachments: attachments.length,
      totalBytes,
      includedBytes,
      includeData,
    },
  };
}

async function execute(
  input: RunnerInput,
  context: ToolContext,
  signal: AbortSignal,
): Promise<ToolResult<AttachmentReport>> {
  return runAttachmentExtractor(
    input,
    (pct, message) => context.reportProgress({ ...(pct !== undefined ? { pct } : {}), message }),
    signal,
  );
}

export const attachmentExtractorTool: BlueKitTool<RunnerInput, AttachmentReport> = { manifest, execute };
