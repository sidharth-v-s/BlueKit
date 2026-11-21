import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { readBoolean, readChoice, readMode } from './params';

/**
 * URL encoder / decoder.
 *
 * `component` is `encodeURIComponent` semantics (safe for query values).
 * `uri` is `encodeURI` semantics (keeps reserved delimiters). Decoding never
 * rewrites malformed escapes: it reports them.
 */

const manifest: ToolManifest = {
  id: 'encoding.url',
  name: 'URL Encode & Decode',
  version: '0.1.0',
  category: 'encoding',
  description: 'Percent-encode or decode URL components and full URIs, with optional + handling.',
  tags: ['url', 'percent', 'uri', 'encode', 'decode'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.text }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.html-entities', 'ioc.extractor'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 2 * 1024 * 1024 },
  ui: {
    inputLabel: 'Text or encoded URL',
    outputLabel: 'Output',
    placeholder: 'hello world & more / or %3Fq%3Dhello%20world',
    primaryInput: DATA_TYPES.text,
    fields: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        defaultValue: 'encode',
        options: [
          { value: 'encode', label: 'Encode' },
          { value: 'decode', label: 'Decode' },
        ],
      },
      {
        key: 'scope',
        label: 'Scope',
        type: 'select',
        defaultValue: 'component',
        options: [
          { value: 'component', label: 'Component (encodeURIComponent)' },
          { value: 'uri', label: 'Full URI (encodeURI)' },
        ],
      },
      { key: 'plus', label: 'Treat + as space when decoding', type: 'toggle', defaultValue: 'false' },
    ],
  },
};

export function encodeUrl(text: string, scope: 'component' | 'uri'): string {
  return scope === 'uri' ? encodeURI(text) : encodeURIComponent(text);
}

export function safeEncodeUrl(text: string, scope: 'component' | 'uri'): string {
  try {
    return encodeUrl(text, scope);
  } catch {
    throw new ToolFailure('malformed-content', 'Input contains an unpaired surrogate and cannot be percent-encoded.');
  }
}

export function decodeUrl(text: string, plusAsSpace = false): string {
  const prepared = plusAsSpace ? text.replace(/\+/gu, ' ') : text;
  try {
    return decodeURIComponent(prepared);
  } catch {
    const bad = /%(?![0-9a-f]{2})/iu.exec(prepared);
    throw new ToolFailure(
      'malformed-content',
      bad
        ? `Malformed percent escape at character ${bad.index + 1}.`
        : 'Input contains an invalid UTF-8 percent-encoded sequence.',
    );
  }
}

async function execute(input: RunnerInput): Promise<ToolResult<string>> {
  const text = input.text ?? '';
  if (text.length === 0) throw new ToolFailure('invalid-input', 'Provide input to convert.');

  const mode = readMode(input, ['encode', 'decode'], 'encode');
  if (mode === 'encode') {
    const scope = readChoice(input, 'scope', ['component', 'uri'], 'component') as
      | 'component'
      | 'uri';
    const output = safeEncodeUrl(text, scope);
    return { output, meta: { mode, scope } };
  }

  const output = decodeUrl(text, readBoolean(input, 'plus', false));
  return { output, meta: { mode, plusAsSpace: readBoolean(input, 'plus', false) } };
}

export const urlTool: BlueKitTool<RunnerInput, string> = { manifest, execute };
