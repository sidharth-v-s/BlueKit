import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { readString } from './params';

/**
 * Unicode inspector.
 *
 * Code-point level inspection aimed at phishing and log analysis: hidden
 * characters, bidi controls, combining marks, tag characters, private-use
 * ranges, and a small confusable map. The confusable map is a hint, not a
 * definitive homoglyph detector.
 */

const manifest: ToolManifest = {
  id: 'encoding.unicode-inspector',
  name: 'Unicode Inspector',
  version: '0.1.0',
  category: 'encoding',
  description:
    'Inspect code points, UTF-8/UTF-16 bytes, normalization forms, hidden characters, and common confusables.',
  tags: ['unicode', 'homoglyph', 'zero-width', 'bidi', 'normalization', 'confusables'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.unicode-report.v1' }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.html-entities', 'ioc.domain-parser', 'email.header-analyzer'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 512 * 1024 },
  ui: {
    inputLabel: 'Text to inspect',
    outputLabel: 'Code points and findings',
    placeholder: 'Paste a domain, subject line, or suspicious text…',
    primaryInput: DATA_TYPES.text,
    fields: [
      {
        key: 'normalize',
        label: 'Normalization form',
        type: 'select',
        defaultValue: 'none',
        options: [
          { value: 'none', label: 'None' },
          { value: 'NFC', label: 'NFC' },
          { value: 'NFD', label: 'NFD' },
          { value: 'NFKC', label: 'NFKC' },
          { value: 'NFKD', label: 'NFKD' },
        ],
      },
      {
        key: 'view',
        label: 'Characters to list',
        type: 'select',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All (capped)' },
          { value: 'suspicious', label: 'Suspicious only' },
        ],
      },
    ],
  },
};

export const MAX_REPORTED_CHARACTERS = 4000;

export type UnicodeFinding =
  | 'control'
  | 'format'
  | 'zero-width'
  | 'bidi'
  | 'combining'
  | 'variation-selector'
  | 'tag'
  | 'private-use'
  | 'noncharacter'
  | 'surrogate'
  | 'non-ascii'
  | 'confusable';

export interface UnicodeCharacter {
  index: number;
  character: string;
  codePoint: number;
  codePointHex: string;
  utf8Hex: string;
  utf16Hex: string;
  width: 1 | 2;
  findings: UnicodeFinding[];
  /** Latin lookalike when the character is in the small confusable map. */
  confusableWith?: string;
}

export interface UnicodeReport {
  characters: number;
  codePoints: number;
  utf8Bytes: number;
  utf16Bytes: number;
  normalization: string;
  normalized?: string;
  normalizationChanged?: boolean;
  counts: Partial<Record<UnicodeFinding, number>>;
  reported: number;
  truncated: boolean;
  items: UnicodeCharacter[];
}

const ZERO_WIDTH = new Set([0x180e, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
const BIDI = new Set([
  0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
]);
const VARIATION_SELECTOR = /[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/u;
const COMBINING = /\p{M}/u;
const FORMAT = /\p{Cf}/u;

/** Small, deliberately conservative Latin confusable map. */
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't',
  у: 'y', х: 'x', ѕ: 's', і: 'i', ј: 'j', һ: 'h', ԁ: 'd', ԛ: 'q', ԝ: 'w', ɡ: 'g',
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T',
  У: 'Y', Х: 'X', Ѕ: 'S', І: 'I', Ј: 'J',
  // Greek
  α: 'a', ο: 'o', ρ: 'p', ν: 'v', ι: 'i', κ: 'k', χ: 'x', υ: 'u', γ: 'y', ε: 'e',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O',
  Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
};

function isPrivateUse(codePoint: number): boolean {
  return (
    (codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
    (codePoint >= 0xf0000 && codePoint <= 0xffffd) ||
    (codePoint >= 0x100000 && codePoint <= 0x10fffd)
  );
}

function isNoncharacter(codePoint: number): boolean {
  return (
    (codePoint >= 0xfdd0 && codePoint <= 0xfdef) ||
    (codePoint & 0xffff) === 0xfffe ||
    (codePoint & 0xffff) === 0xffff
  );
}

function bytesHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function utf16Hex(character: string): string {
  const units: string[] = [];
  for (let index = 0; index < character.length; index += 1) {
    units.push(character.charCodeAt(index).toString(16).padStart(4, '0'));
  }
  return units.join(' ');
}

function findingsFor(character: string, codePoint: number): UnicodeFinding[] {
  const findings: UnicodeFinding[] = [];
  if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) findings.push('control');
  if (FORMAT.test(character)) findings.push('format');
  if (ZERO_WIDTH.has(codePoint)) findings.push('zero-width');
  if (BIDI.has(codePoint)) findings.push('bidi');
  if (COMBINING.test(character)) findings.push('combining');
  if (VARIATION_SELECTOR.test(character)) findings.push('variation-selector');
  if (codePoint >= 0xe0000 && codePoint <= 0xe007f) findings.push('tag');
  if (isPrivateUse(codePoint)) findings.push('private-use');
  if (isNoncharacter(codePoint)) findings.push('noncharacter');
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) findings.push('surrogate');
  if (codePoint > 0x7e) findings.push('non-ascii');
  if (CONFUSABLES[character]) findings.push('confusable');
  return findings;
}

export function inspectUnicode(text: string, options: { view?: string; normalize?: string } = {}): UnicodeReport {
  const utf8 = new TextEncoder().encode(text);
  const items: UnicodeCharacter[] = [];
  const counts: Partial<Record<UnicodeFinding, number>> = {};
  const view = options.view === 'suspicious' ? 'suspicious' : 'all';
  let listed = 0;
  let codePoints = 0;
  let truncated = false;

  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    const findings = findingsFor(character, codePoint);
    codePoints += 1;

    for (const finding of findings) counts[finding] = (counts[finding] ?? 0) + 1;

    const suspicious = findings.length > 0;
    if (view === 'all' || suspicious) {
      if (listed < MAX_REPORTED_CHARACTERS) {
        items.push({
          index: codePoints - 1,
          character,
          codePoint,
          codePointHex: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
          utf8Hex: bytesHex(new TextEncoder().encode(character)),
          utf16Hex: utf16Hex(character),
          width: character.length === 2 ? 2 : 1,
          findings,
          ...(CONFUSABLES[character] ? { confusableWith: CONFUSABLES[character] } : {}),
        });
        listed += 1;
      } else {
        truncated = true;
      }
    }
  }

  const requested = options.normalize ?? 'none';
  const form = ['NFC', 'NFD', 'NFKC', 'NFKD'].includes(requested) ? requested : 'none';
  const normalized = form === 'none' ? undefined : text.normalize(form as 'NFC' | 'NFD' | 'NFKC' | 'NFKD');

  return {
    characters: text.length,
    codePoints,
    utf8Bytes: utf8.byteLength,
    utf16Bytes: text.length * 2,
    normalization: form,
    ...(normalized !== undefined ? { normalized } : {}),
    ...(normalized !== undefined ? { normalizationChanged: normalized !== text } : {}),
    counts,
    reported: items.length,
    truncated,
    items,
  };
}

async function execute(input: RunnerInput): Promise<ToolResult<UnicodeReport>> {
  const text = input.text ?? '';
  if (text.length === 0) throw new ToolFailure('invalid-input', 'Provide text to inspect.');

  const report = inspectUnicode(text, {
    view: readString(input, 'view', 'all'),
    normalize: readString(input, 'normalize', 'none'),
  });

  const suspicious = Object.entries(report.counts).filter(([finding]) => finding !== 'non-ascii');
  const warnings = suspicious.map(([finding, count]) => ({
    code: `unicode-${finding}`,
    message: `${count} ${finding} character${count === 1 ? '' : 's'} found.`,
  }));

  return {
    output: report,
    ...(warnings.length > 0 ? { warnings } : {}),
    meta: {
      codePoints: report.codePoints,
      utf8Bytes: report.utf8Bytes,
      findings: suspicious.length,
      truncated: report.truncated,
    },
  };
}

export const unicodeInspectorTool: BlueKitTool<RunnerInput, UnicodeReport> = { manifest, execute };
