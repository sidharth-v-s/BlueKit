import { ToolFailure } from '@/core/runtime/errors';
import type { RunnerInput } from '@/core/runtime/types';

/**
 * Shared input handling for the MailSleuth tools.
 *
 * File bytes are decoded as a binary string (one character per byte) so the
 * RFC 822 parser can preserve header and body octets exactly. UTF-8 decoding
 * happens later, per MIME part, using the declared charset.
 */

export const MAX_EMAIL_BYTES = 10 * 1024 * 1024;

export interface EmailInput {
  raw: string;
  byteLength: number;
  fileName?: string;
  source: 'file' | 'text';
}

export function bytesToBinaryString(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let output = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return output;
}

const CORE_HEADERS = new Set([
  'from',
  'to',
  'cc',
  'bcc',
  'subject',
  'date',
  'message-id',
  'received',
  'return-path',
  'reply-to',
  'sender',
  'content-type',
  'content-transfer-encoding',
  'mime-version',
  'authentication-results',
  'arc-authentication-results',
  'arc-seal',
  'arc-message-signature',
  'received-spf',
  'dkim-signature',
  'domainkey-signature',
  'x-envelope-from',
  'envelope-from',
]);

/**
 * A stricter check than "some line contains a colon". Requiring at least one
 * recognised message header keeps pasted bodies, URLs, and logs out of the
 * email parser while still accepting partial header dumps for analysis.
 */
export function looksLikeEmail(raw: string): boolean {
  const head = raw.slice(0, 32 * 1024);
  const lines = head.split(/\r?\n/u).slice(0, 128);
  let generic = 0;
  for (const line of lines) {
    if (line.length === 0) {
      if (generic > 0) break;
      continue;
    }
    if (line.startsWith(' ') || line.startsWith('\t')) continue;
    const colon = line.indexOf(':');
    if (colon <= 0 || colon > 80) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    if (CORE_HEADERS.has(name)) return true;
    if (/^[a-z0-9][a-z0-9-]*$/u.test(name)) generic += 1;
    if (generic >= 2) return true;
  }
  return false;
}

export async function readEmailInput(
  input: RunnerInput,
  maxBytes = MAX_EMAIL_BYTES,
): Promise<EmailInput> {
  if (input.file) {
    if (input.file.size > maxBytes) {
      throw new ToolFailure('file-too-large', `Email input exceeds the ${Math.round(maxBytes / (1024 * 1024))} MiB analysis limit.`, {
        bytes: input.file.size,
        limit: maxBytes,
      });
    }
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    return {
      raw: bytesToBinaryString(bytes),
      byteLength: bytes.byteLength,
      fileName: input.file.name,
      source: 'file',
    };
  }

  const text = input.text ?? '';
  if (text.trim().length === 0) {
    throw new ToolFailure('invalid-input', 'Choose an .eml file or paste a raw message.');
  }

  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > maxBytes) {
    throw new ToolFailure('file-too-large', `Pasted input exceeds the ${Math.round(maxBytes / (1024 * 1024))} MiB analysis limit.`, {
      bytes: byteLength,
      limit: maxBytes,
    });
  }

  return { raw: text, byteLength, source: 'text' };
}

export function requireEmailInput(input: EmailInput): void {
  if (!looksLikeEmail(input.raw)) {
    throw new ToolFailure('unsupported-format', 'Input does not look like an RFC 822 message with headers.', {
      hint: 'Paste the full raw message or header block, including From and Subject.',
    });
  }
}
