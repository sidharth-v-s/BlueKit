import type { RunnerInput } from '@/core/runtime/types';

/**
 * Turn arbitrary bytes into something safe to display in a text output panel.
 *
 * A strict UTF-8 decode is preferred. If the bytes are not valid UTF-8, the
 * fallback is an escaped representation (`\xNN` for non-printables) rather
 * than a lossy Latin-1 decode that silently mangles binary data.
 */
export function bytesToDisplay(bytes: Uint8Array): {
  text: string;
  utf8: boolean;
  printableRatio: number;
} {
  let printable = 0;
  for (const byte of bytes) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 0x20 && byte <= 0x7e)) printable += 1;
  }
  const printableRatio = bytes.length === 0 ? 1 : printable / bytes.length;

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text, utf8: true, printableRatio };
  } catch {
    let text = '';
    for (const byte of bytes) {
      if (byte === 9) text += '\\t';
      else if (byte === 10) text += '\\n';
      else if (byte === 13) text += '\\r';
      else if (byte >= 0x20 && byte <= 0x7e) text += String.fromCharCode(byte);
      else text += `\\x${byte.toString(16).padStart(2, '0')}`;
    }
    return { text, utf8: false, printableRatio };
  }
}

/** Read a select-style parameter, falling back when the value is not allowed. */
export function readChoice(
  input: RunnerInput,
  key: string,
  allowed: readonly string[],
  fallback: string,
): string {
  const value = input.params?.[key];
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

/** Read the common `mode` parameter. */
export function readMode(
  input: RunnerInput,
  allowed: readonly string[],
  fallback: string,
): string {
  return readChoice(input, 'mode', allowed, fallback);
}

/** Read a string parameter. */
export function readString(input: RunnerInput, key: string, fallback = ''): string {
  const value = input.params?.[key];
  return typeof value === 'string' ? value : fallback;
}

/** Read a boolean parameter. */
export function readBoolean(input: RunnerInput, key: string, fallback = false): boolean {
  const value = input.params?.[key];
  return typeof value === 'boolean' ? value : fallback;
}
