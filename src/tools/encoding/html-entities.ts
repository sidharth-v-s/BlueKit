import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { readBoolean, readMode } from './params';

/**
 * HTML entity encoder / decoder.
 *
 * Encoding escapes the five characters that matter in HTML text and attribute
 * contexts, plus optionally all non-ASCII code points. Decoding handles named
 * entities from a small, explicit table and numeric decimal/hex references.
 */

const manifest: ToolManifest = {
  id: 'encoding.html-entities',
  name: 'HTML Entity Encode & Decode',
  version: '0.1.0',
  category: 'encoding',
  description: 'Escape or unescape HTML entities, including numeric references, without a DOM parser.',
  tags: ['html', 'entities', 'escape', 'decode', 'numeric'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.text }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.url', 'encoding.xml'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 4 * 1024 * 1024 },
  ui: {
    inputLabel: 'Text or HTML entities',
    outputLabel: 'Output',
    placeholder: '<script>alert("x")</script> or &lt;b&gt;hello&lt;/b&gt;',
    primaryInput: DATA_TYPES.text,
    fields: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        defaultValue: 'encode',
        options: [
          { value: 'encode', label: 'Encode entities' },
          { value: 'decode', label: 'Decode entities' },
        ],
      },
      { key: 'non-ascii', label: 'Escape non-ASCII as numeric', type: 'toggle', defaultValue: 'true' },
    ],
  },
};

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  bull: '\u2022',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  sect: '\u00a7',
  deg: '\u00b0',
  plusmn: '\u00b1',
  times: '\u00d7',
  divide: '\u00f7',
  frac12: '\u00bd',
  frac14: '\u00bc',
  frac34: '\u00be',
};

const ENCODE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function encodeHtmlEntities(text: string, nonAscii = true): string {
  let output = '';
  for (const char of text) {
    const named = ENCODE_MAP[char];
    if (named) {
      output += named;
      continue;
    }
    const codePoint = char.codePointAt(0) ?? 0;
    if (nonAscii && codePoint > 0x7e) {
      output += `&#x${codePoint.toString(16).toUpperCase()};`;
      continue;
    }
    output += char;
  }
  return output;
}

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/giu, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const codePoint = Number.parseInt(body.slice(2), 16);
      return safeCodePoint(codePoint, match);
    }
    if (body.startsWith('#')) {
      const codePoint = Number.parseInt(body.slice(1), 10);
      return safeCodePoint(codePoint, match);
    }
    const named = NAMED[body.toLowerCase()];
    // Unknown named entities are left untouched: silently dropping them would
    // corrupt text that merely looks like an entity.
    return named ?? match;
  });
}

function safeCodePoint(codePoint: number, original: string): string {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return original;
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return original; // lone surrogate
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return original;
  }
}

async function execute(input: RunnerInput): Promise<ToolResult<string>> {
  const text = input.text ?? '';
  if (text.length === 0) throw new ToolFailure('invalid-input', 'Provide input to convert.');

  const mode = readMode(input, ['encode', 'decode'], 'encode');
  const output =
    mode === 'encode'
      ? encodeHtmlEntities(text, readBoolean(input, 'non-ascii', true))
      : decodeHtmlEntities(text);

  return {
    output,
    meta: {
      mode,
      inputChars: text.length,
      outputChars: output.length,
      ...(mode === 'decode' ? { unknownEntitiesPreserved: true } : {}),
    },
  };
}

export const htmlEntitiesTool: BlueKitTool<RunnerInput, string> = { manifest, execute };
