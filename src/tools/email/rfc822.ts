/**
 * Minimal RFC 822 / MIME parser.
 *
 * It parses and reports; it does not authenticate, repair, or execute anything.
 * The parser is deliberately dependency-free so the MailSleuth tools can run in
 * a worker with no server or third-party runtime.
 *
 * Known limitations (documented, not hidden):
 * - Header values containing raw non-ASCII bytes are decoded best-effort.
 * - Malformed MIME trees are tolerated rather than repaired.
 * - Nested message/rfc822 parts are summarized, not recursively analyzed.
 * - Charset support is whatever the browser's TextDecoder provides.
 */

import { decodeHtmlEntities } from './text';
import { extractUrls } from './urls';

export { decodeHtmlEntities } from './text';

export interface EmlHeader {
  name: string;
  /** Unfolded, display-safe value. */
  value: string;
  /** Original header text including folds, for the evidence view. */
  raw: string;
}

export interface EmlAttachment {
  path: string;
  filename: string | null;
  contentType: string;
  transferEncoding: string;
  sizeBytes: number;
  magicHex: string;
  sha256?: string;
  /** Content-Disposition type, when present. */
  disposition?: string;
  /** Content-ID without angle brackets, when present. */
  contentId?: string;
  /** True when the part was marked as an attachment or carried a filename. */
  declaredAttachment: boolean;
  textPreview?: string;
}

export interface EmlPartSummary {
  path: string;
  depth: number;
  contentType: string;
  charset?: string;
  transferEncoding: string;
  filename?: string;
  sizeBytes: number;
  isAttachment: boolean;
}

export interface EmailAddress {
  raw: string;
  name?: string;
  address: string;
}

export interface EmlAnalysis {
  byteLength: number;
  subject: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  replyTo: EmailAddress[];
  returnPath: string | null;
  date: string | null;
  messageId: string | null;
  mimeVersion: string | null;
  received: string[];
  authenticationHeaders: { name: string; value: string }[];
  bodies: { text?: string; html?: string };
  urls: string[];
  attachments: EmlAttachment[];
  parts: EmlPartSummary[];
  warnings: string[];
  observations: string[];
  headers: EmlHeader[];
}

export interface ParsedPart {
  path: string;
  depth: number;
  headers: EmlHeader[];
  contentType: string;
  params: Record<string, string>;
  charset?: string;
  transferEncoding: string;
  disposition?: string;
  filename?: string;
  contentId?: string;
  children: ParsedPart[];
  bytes: Uint8Array | null;
  /** Set when body decoding failed, so callers can distinguish empty from broken. */
  decodeError?: string;
  /** True when a parser cap prevented this part from being read. */
  omitted?: boolean;
}

export interface ParsedMessage {
  root: ParsedPart;
  /** Flattened tree, root first, excluding parts omitted by parser caps. */
  parts: ParsedPart[];
  warnings: string[];
}

export interface ParseOptions {
  /** Set false for header-only tools; multipart bodies are still split. */
  decodeBodies?: boolean;
}

export const PARSER_LIMITS = {
  maxParts: 200,
  maxDepth: 10,
  maxAttachmentHashes: 50,
} as const;

const MAX_PARTS = PARSER_LIMITS.maxParts;
const MAX_DEPTH = PARSER_LIMITS.maxDepth;
const MAX_ATTACHMENT_HASHES = PARSER_LIMITS.maxAttachmentHashes;

interface ParseContext {
  count: number;
  capped: boolean;
}

interface ParameterSegment {
  index: number;
  value: string;
  encoded: boolean;
}

/** Parse a `;`-separated parameter list, honoring quoted strings. */
function parseParameters(input: string): Record<string, string> {
  const params: Record<string, string> = {};
  let current = '';
  let inQuotes = false;
  const segments: string[] = [];

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (char === '"' && input[index - 1] !== '\\') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ';' && !inQuotes) {
      segments.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  segments.push(current);

  for (const segment of segments) {
    const equals = segment.indexOf('=');
    if (equals === -1) continue;
    const key = segment.slice(0, equals).trim().toLowerCase();
    let value = segment.slice(equals + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (key) params[key] = value;
  }
  return params;
}

function decodePercentEncoded(input: string, charset: string): string {
  if (!input.includes('%')) return input;
  const bytes: number[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (char === '%' && /^[0-9A-Fa-f]{2}$/u.test(input.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(input.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(char.charCodeAt(0) & 0xff);
    }
  }
  return decodeText(Uint8Array.from(bytes), charset);
}

function decodeExtendedParameter(value: string, inheritedCharset: string): string {
  const first = value.indexOf("'");
  if (first !== -1) {
    const second = value.indexOf("'", first + 1);
    if (second !== -1) {
      const charset = value.slice(0, first) || inheritedCharset;
      return decodePercentEncoded(value.slice(second + 1), charset);
    }
  }
  return decodePercentEncoded(value, inheritedCharset);
}

/**
 * Resolve RFC 2231 parameter continuations and extended values, then decode any
 * RFC 2047 encoded-words. Extended values win over a plain parameter of the same
 * base name because they carry their charset explicitly.
 */
function decodeParameters(raw: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};
  const segments = new Map<string, ParameterSegment[]>();
  const extended = new Map<string, string>();

  for (const [key, value] of Object.entries(raw)) {
    const continuation = /^([^*]+)\*(\d+)(\*)?$/u.exec(key);
    if (continuation) {
      const base = continuation[1]!;
      const list = segments.get(base) ?? [];
      list.push({
        index: Number.parseInt(continuation[2]!, 10),
        value,
        encoded: Boolean(continuation[3]),
      });
      segments.set(base, list);
      continue;
    }
    if (key.endsWith('*')) {
      extended.set(key.slice(0, -1), value);
      continue;
    }
    output[key] = decodeEncodedWords(value);
  }

  for (const [base, list] of segments) {
    list.sort((a, b) => a.index - b.index);
    let charset = 'utf-8';
    let assembled = '';
    for (const segment of list) {
      if (segment.encoded) {
        if (segment.index === 0) {
          const first = segment.value.indexOf("'");
          const second = first === -1 ? -1 : segment.value.indexOf("'", first + 1);
          if (first !== -1 && second !== -1) {
            charset = segment.value.slice(0, first) || charset;
            assembled += decodePercentEncoded(segment.value.slice(second + 1), charset);
            continue;
          }
        }
        assembled += decodePercentEncoded(segment.value, charset);
      } else {
        assembled += segment.value;
      }
    }
    output[base] = decodeEncodedWords(assembled);
  }

  for (const [base, value] of extended) {
    output[base] = decodeEncodedWords(decodeExtendedParameter(value, 'utf-8'));
  }

  return output;
}

function splitContentType(value: string): { type: string; params: Record<string, string> } {
  const semicolon = value.indexOf(';');
  const type = (semicolon === -1 ? value : value.slice(0, semicolon)).trim().toLowerCase();
  return {
    type: type || 'text/plain',
    params: semicolon === -1 ? {} : decodeParameters(parseParameters(value.slice(semicolon + 1))),
  };
}

export function unfoldHeaders(block: string): EmlHeader[] {
  const headers: EmlHeader[] = [];
  const lines = block.split('\n');
  let raw: string[] = [];

  const flush = () => {
    if (raw.length === 0) return;
    const rawText = raw.join('\n');
    const colon = rawText.indexOf(':');
    if (colon <= 0) {
      raw = [];
      return;
    }
    const name = rawText.slice(0, colon).trim();
    const value = rawText
      .slice(colon + 1)
      .replace(/\r?\n[ \t]*/gu, ' ')
      .trim();
    headers.push({ name, value, raw: rawText });
    raw = [];
  };

  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (raw.length > 0) raw.push(line);
      continue;
    }
    flush();
    if (line.trim().length > 0) raw = [line];
  }
  flush();
  return headers;
}

function splitRawMessage(raw: string): { headerBlock: string; body: string } {
  const normalized = raw.replace(/\r\n/gu, '\n');
  const separator = normalized.indexOf('\n\n');
  if (separator === -1) {
    // No body separator: treat as headers only when every line looks like one.
    const looksLikeHeaders = normalized
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .every((line) => line.startsWith(' ') || line.startsWith('\t') || /^[^:\s]+:/u.test(line));
    return looksLikeHeaders ? { headerBlock: normalized, body: '' } : { headerBlock: '', body: normalized };
  }
  return { headerBlock: normalized.slice(0, separator), body: normalized.slice(separator + 2) };
}

function bytesFromBinaryString(input: string): Uint8Array {
  const bytes = new Uint8Array(input.length);
  for (let index = 0; index < input.length; index += 1) bytes[index] = input.charCodeAt(index) & 0xff;
  return bytes;
}

export function decodeQuotedPrintable(input: string): Uint8Array {
  const output: number[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (char === '=') {
      const next = input[index + 1];
      if (next === '\n') {
        index += 1;
        continue;
      }
      if (next === '\r' && input[index + 2] === '\n') {
        index += 2;
        continue;
      }
      const pair = input.slice(index + 1, index + 3);
      if (/^[0-9A-Fa-f]{2}$/u.test(pair)) {
        output.push(Number.parseInt(pair, 16));
        index += 2;
        continue;
      }
      output.push(0x3d);
      continue;
    }
    output.push(char.charCodeAt(0) & 0xff);
  }
  return Uint8Array.from(output);
}

function decodeBase64Body(input: string): Uint8Array {
  const compact = input.replace(/\s+/gu, '').replace(/-/gu, '+').replace(/_/gu, '/');
  if (compact.length === 0) return new Uint8Array();

  const withoutPadding = compact.replace(/=+$/u, '');
  if (!/^[A-Za-z0-9+/]*$/u.test(withoutPadding)) {
    throw new Error('invalid Base64 characters');
  }
  if (withoutPadding.length % 4 === 1) {
    throw new Error('truncated Base64 quartet');
  }
  const padded = withoutPadding.padEnd(Math.ceil(withoutPadding.length / 4) * 4, '=');
  return bytesFromBinaryString(atob(padded));
}

function decodeBodyBytes(body: string, transferEncoding: string): Uint8Array {
  const encoding = transferEncoding.toLowerCase();
  if (encoding === 'base64') return decodeBase64Body(body);
  if (encoding === 'quoted-printable') return decodeQuotedPrintable(body);
  return bytesFromBinaryString(body);
}

function decodeText(bytes: Uint8Array, charset: string | undefined): string {
  const label = (charset ?? 'utf-8').toLowerCase();
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    }
  }
}

/** Decode a parsed part's bytes using its declared charset. */
export function decodePartText(part: ParsedPart): string {
  return decodeText(part.bytes ?? new Uint8Array(), part.charset);
}

/** Decode RFC 2047 encoded-words in header values. */
export function decodeEncodedWords(value: string): string {
  // Whitespace between adjacent encoded-words is not part of the text.
  const joined = value.replace(/\?=\s+(?==\?)/gu, '?=');
  return joined.replace(
    /=\?([^?*]+)(?:\*[^?]*)?\?([BbQq])\?([^?]*)\?=/gu,
    (match, charset: string, encoding: string, payload: string) => {
      try {
        const bytes =
          encoding.toUpperCase() === 'B'
            ? decodeBase64Body(payload)
            : decodeQuotedPrintable(payload.replace(/_/gu, ' '));
        return decodeText(bytes, charset);
      } catch {
        return match;
      }
    },
  );
}

function splitMultipart(body: string, boundary: string): string[] {
  const marker = `--${boundary}`;
  const segments: string[] = [];
  let index = body.indexOf(marker);
  if (index === -1) return [];

  while (index !== -1) {
    const lineEnd = body.indexOf('\n', index);
    const line = body.slice(index, lineEnd === -1 ? body.length : lineEnd).trimEnd();
    if (line === `${marker}--`) break;
    if (line !== marker) {
      index = body.indexOf(marker, index + marker.length);
      if (index === -1) break;
      continue;
    }
    const after = lineEnd === -1 ? body.length : lineEnd + 1;
    const next = body.indexOf(marker, after);
    let segment = body.slice(after, next === -1 ? body.length : next);
    if (segment.endsWith('\n')) segment = segment.slice(0, -1);
    segments.push(segment);
    index = next;
  }
  return segments;
}

function omittedPart(path: string, depth: number): ParsedPart {
  return {
    path,
    depth,
    headers: [],
    contentType: 'application/octet-stream',
    params: {},
    transferEncoding: 'binary',
    children: [],
    bytes: null,
    omitted: true,
  };
}

function parsePart(
  raw: string,
  path: string,
  depth: number,
  warnings: string[],
  context: ParseContext,
  options: ParseOptions,
): ParsedPart {
  context.count += 1;
  if (context.count > MAX_PARTS) {
    context.capped = true;
    return omittedPart(path, depth);
  }
  if (depth > MAX_DEPTH) {
    warnings.push(`MIME nesting exceeded ${MAX_DEPTH} levels at part ${path}; deeper parts were not parsed.`);
    return omittedPart(path, depth);
  }

  const { headerBlock, body } = splitRawMessage(raw);
  const headers = unfoldHeaders(headerBlock);
  const find = (name: string) =>
    headers.find((header) => header.name.toLowerCase() === name)?.value ?? null;

  const contentTypeHeader = find('content-type') ?? 'text/plain';
  const { type, params } = splitContentType(contentTypeHeader);
  const transferEncoding = find('content-transfer-encoding') ?? '7bit';
  const dispositionHeader = find('content-disposition');
  const disposition = dispositionHeader ? splitContentType(dispositionHeader) : null;
  const rawFilename = disposition?.params['filename'] ?? params['name'] ?? disposition?.params['name'];
  const filename = rawFilename ? decodeEncodedWords(rawFilename).replace(/[\r\n]/gu, ' ').trim() : undefined;
  const charset = params['charset'];
  const contentId = find('content-id')?.replace(/^<|>$/gu, '').trim();

  const part: ParsedPart = {
    path,
    depth,
    headers,
    contentType: type,
    params,
    ...(charset ? { charset } : {}),
    transferEncoding,
    ...(disposition ? { disposition: disposition.type } : {}),
    ...(filename ? { filename } : {}),
    ...(contentId ? { contentId } : {}),
    children: [],
    bytes: null,
  };

  if (type.startsWith('multipart/') && params['boundary']) {
    const segments = splitMultipart(body, params['boundary']);
    if (segments.length === 0) {
      warnings.push(`Multipart boundary for part ${path} was not found in the body.`);
    }
    part.children = segments.map((segment, index) =>
      parsePart(segment, `${path}.${index + 1}`, depth + 1, warnings, context, options),
    );
    return part;
  }

  if (options.decodeBodies === false) return part;

  try {
    part.bytes = decodeBodyBytes(body, transferEncoding);
  } catch (error) {
    part.decodeError = error instanceof Error ? error.message : String(error);
    part.bytes = new Uint8Array();
    warnings.push(
      `Part ${path} (${type}) has a ${transferEncoding} body that could not be decoded: ${part.decodeError}.`,
    );
  }
  return part;
}

function flattenParts(part: ParsedPart, output: ParsedPart[]): void {
  if (part.omitted) return;
  output.push(part);
  for (const child of part.children) flattenParts(child, output);
}

/**
 * Parse a raw message into a tree, a flattened list, and warnings.
 *
 * This is the entry point for every MailSleuth tool. The part cap is enforced
 * during parsing, so a hostile message cannot force the parser to build an
 * unbounded tree before the cap is checked.
 */
export function parseEmlMessage(raw: string, options: ParseOptions = {}): ParsedMessage {
  const warnings: string[] = [];
  const context: ParseContext = { count: 0, capped: false };
  const root = parsePart(raw, '1', 0, warnings, context, options);
  const parts: ParsedPart[] = [];
  flattenParts(root, parts);

  if (context.capped) {
    warnings.push(
      `Message contains more than ${MAX_PARTS} MIME parts; later parts were not parsed.`,
    );
  }

  return { root, parts, warnings };
}

export function isAttachment(part: ParsedPart): boolean {
  if (part.disposition === 'attachment') return true;
  if (part.filename) return true;
  return !part.contentType.startsWith('text/') && !part.contentType.startsWith('multipart/');
}

function toHexPrefix(bytes: Uint8Array, length = 16): string {
  return Array.from(bytes.subarray(0, length), (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

export function parseAddressList(value: string): EmailAddress[] {
  if (!value.trim()) return [];
  const entries: string[] = [];
  let current = '';
  let inQuotes = false;
  let angleDepth = 0;
  for (const char of value) {
    if (char === '"') inQuotes = !inQuotes;
    if (!inQuotes) {
      if (char === '<') angleDepth += 1;
      if (char === '>') angleDepth = Math.max(0, angleDepth - 1);
      if (char === ',' && angleDepth === 0) {
        entries.push(current);
        current = '';
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) entries.push(current);

  return entries
    .map((entry) => {
      const trimmed = decodeEncodedWords(entry.trim());
      const angle = trimmed.match(/^(.*)<([^>]+)>$/u);
      if (angle) {
        const name = angle[1]!.trim().replace(/^"|"$/gu, '').trim();
        return { raw: entry.trim(), ...(name ? { name } : {}), address: angle[2]!.trim() };
      }
      const address = trimmed.replace(/\s*\([^)]*\)\s*$/u, '').replace(/^mailto:/iu, '').trim();
      return { raw: entry.trim(), address };
    })
    .filter((address) => address.address.length > 0);
}

function addressDomain(address: string): string | null {
  const at = address.lastIndexOf('@');
  return at === -1 ? null : address.slice(at + 1).toLowerCase().replace(/\.$/u, '');
}

const RISKY_EXTENSIONS = [
  '.exe', '.scr', '.com', '.pif', '.bat', '.cmd', '.js', '.jse', '.vbs', '.vbe', '.hta',
  '.ps1', '.lnk', '.iso', '.img', '.docm', '.xlsm', '.pptm', '.jar', '.msi', '.wsf',
];

function hashBytes(bytes: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
}

export async function analyzeEml(
  raw: string,
  byteLength = new TextEncoder().encode(raw).byteLength,
): Promise<EmlAnalysis> {
  const parsed = parseEmlMessage(raw);
  const warnings = [...parsed.warnings];
  const observations: string[] = [];
  const { root, parts: allParts } = parsed;

  const headers = root.headers;
  const get = (name: string) => headers.find((header) => header.name.toLowerCase() === name)?.value ?? null;
  const getDecoded = (name: string) => {
    const value = get(name);
    return value === null ? null : decodeEncodedWords(value);
  };

  const parts: EmlPartSummary[] = [];
  const attachments: EmlAttachment[] = [];
  const bodies: { text?: string; html?: string } = {};

  let attachmentIndex = 0;
  for (const part of allParts) {
    if (part.depth === 0 && part.contentType.startsWith('multipart/')) continue;
    const bytes = part.bytes ?? new Uint8Array();
    const attachment = isAttachment(part);

    parts.push({
      path: part.path,
      depth: part.depth,
      contentType: part.contentType,
      transferEncoding: part.transferEncoding,
      sizeBytes: bytes.byteLength,
      isAttachment: attachment,
      ...(part.charset ? { charset: part.charset } : {}),
      ...(part.filename ? { filename: part.filename } : {}),
    });

    if (attachment) {
      if (attachmentIndex >= MAX_PARTS) continue;
      attachmentIndex += 1;
      const attachmentRecord: EmlAttachment = {
        path: part.path,
        filename: part.filename ?? null,
        contentType: part.contentType,
        transferEncoding: part.transferEncoding,
        sizeBytes: bytes.byteLength,
        magicHex: toHexPrefix(bytes),
        declaredAttachment: part.disposition === 'attachment' || Boolean(part.filename),
        ...(part.disposition ? { disposition: part.disposition } : {}),
        ...(part.contentId ? { contentId: part.contentId } : {}),
      };
      if (attachmentIndex <= MAX_ATTACHMENT_HASHES) {
        const digest = await hashBytes(bytes);
        attachmentRecord.sha256 = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
      } else {
        warnings.push(`More than ${MAX_ATTACHMENT_HASHES} attachments; hashes were skipped for later parts.`);
      }
      if (part.contentType.startsWith('text/') || part.contentType === 'application/json') {
        attachmentRecord.textPreview = decodeText(bytes, part.charset).slice(0, 400);
      }
      attachments.push(attachmentRecord);
      continue;
    }

    if (part.contentType === 'text/plain' && bodies.text === undefined) {
      bodies.text = decodeText(bytes, part.charset);
    } else if (part.contentType === 'text/html' && bodies.html === undefined) {
      const html = decodeText(bytes, part.charset);
      bodies.html = html;
      if (/<script\b/iu.test(html)) {
        observations.push('HTML body contains <script>. BlueKit never renders it with scripts enabled.');
      }
      if (/<(?:img|iframe|link|video|audio|source|object|embed)\b[^>]*(?:src|href)\s*=\s*["']?https?:/iu.test(html)) {
        observations.push('HTML body references remote resources; preview must block them by default.');
      }
    }
  }

  if (bodies.text === undefined && bodies.html === undefined) {
    warnings.push('No text/plain or text/html body was found. The message may use an unsupported structure.');
  }

  const urls = extractUrls([
    ...(bodies.text ? [{ kind: 'text' as const, text: bodies.text }] : []),
    ...(bodies.html ? [{ kind: 'html' as const, text: bodies.html }] : []),
  ]);

  const from = parseAddressList(getDecoded('from') ?? '');
  const replyTo = parseAddressList(getDecoded('reply-to') ?? '');
  const returnPath = get('return-path');
  const returnPathAddress = returnPath
    ? parseAddressList(returnPath)[0]?.address ?? returnPath.replace(/[<>]/gu, '').trim()
    : null;

  if (from.length > 0 && replyTo.length > 0) {
    const fromDomains = new Set(from.map((address) => addressDomain(address.address)).filter(Boolean));
    const replyDomains = new Set(replyTo.map((address) => addressDomain(address.address)).filter(Boolean));
    const mismatch = [...replyDomains].some((domain) => domain && !fromDomains.has(domain));
    if (mismatch) {
      observations.push('Reply-To domain differs from the From domain. This is an observation, not a verdict.');
    }
  }
  if (from.length > 0 && returnPathAddress) {
    const fromDomain = addressDomain(from[0]!.address);
    const returnDomain = addressDomain(returnPathAddress);
    if (fromDomain && returnDomain && fromDomain !== returnDomain) {
      observations.push(
        `Return-Path domain (${returnDomain}) differs from the From domain (${fromDomain}). Common for bulk senders; verify against provider policy.`,
      );
    }
  }

  const authenticationHeaders = headers
    .filter((header) =>
      ['authentication-results', 'arc-authentication-results', 'received-spf', 'dkim-signature'].includes(
        header.name.toLowerCase(),
      ),
    )
    .map((header) => ({ name: header.name, value: header.value }));
  if (authenticationHeaders.length === 0) {
    observations.push(
      'No Authentication-Results header is present. Absence is not evidence of spoofing; the header may be added downstream.',
    );
  }

  const received = headers
    .filter((header) => header.name.toLowerCase() === 'received')
    .map((header) => header.value);

  for (const attachment of attachments) {
    const name = (attachment.filename ?? '').toLowerCase();
    if (RISKY_EXTENSIONS.some((extension) => name.endsWith(extension))) {
      observations.push(
        `Attachment ${attachment.filename ?? '(unnamed)'} uses a high-risk file extension. Extension alone does not prove content type.`,
      );
    }
    if (name.includes('.') && name.split('.').length > 2) {
      const last = name.slice(name.lastIndexOf('.'));
      if (RISKY_EXTENSIONS.includes(last) && /\.(pdf|docx?|xlsx?|jpe?g|png|txt)$/u.test(name)) {
        observations.push(
          `Attachment ${attachment.filename} has a double extension ending in ${last}. Verify with magic-byte detection.`,
        );
      }
    }
  }

  if (parts.length === 0) {
    warnings.push('Message structure produced no analyzable parts.');
  }

  return {
    byteLength,
    subject: getDecoded('subject') ?? '',
    from,
    to: parseAddressList(getDecoded('to') ?? ''),
    cc: parseAddressList(getDecoded('cc') ?? ''),
    replyTo,
    returnPath,
    date: getDecoded('date'),
    messageId: getDecoded('message-id'),
    mimeVersion: get('mime-version'),
    received,
    authenticationHeaders,
    bodies,
    urls: urls.urls.map((record) => record.original),
    attachments,
    parts: parts.slice(0, MAX_PARTS),
    warnings: [...warnings, ...urls.warnings],
    observations,
    headers,
  };
}
