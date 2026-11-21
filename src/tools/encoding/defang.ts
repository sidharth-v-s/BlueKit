import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { readMode } from './params';

/**
 * Defang / refang.
 *
 * Defanging is a presentation convention, not a security control. The report
 * says so; it must never be mistaken for sanitisation of a live URL.
 */

const manifest: ToolManifest = {
  id: 'encoding.defang',
  name: 'Defang & Refang',
  version: '0.1.0',
  category: 'encoding',
  description: 'Make indicators safe to share (hxxp, [.]) or restore defanged text for analysis.',
  tags: ['defang', 'refang', 'ioc', 'sharing', 'url'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.text }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['ioc.extractor', 'ioc.bulk-normalizer'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 2 * 1024 * 1024 },
  ui: {
    inputLabel: 'Text',
    outputLabel: 'Output',
    placeholder: 'hxxps://evil[.]example/path or https://evil.example/path',
    primaryInput: DATA_TYPES.text,
    fields: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        defaultValue: 'defang',
        options: [
          { value: 'defang', label: 'Defang' },
          { value: 'refang', label: 'Refang' },
        ],
      },
    ],
  },
};

export function defang(text: string): string {
  return text
    .replace(/https?/giu, (match) => match.replace(/tt/iu, 'xx'))
    .replace(/\./gu, '[.]')
    .replace(/@/gu, '[@]')
    .replace(/:(?!\/\/)/gu, '[:]');
}

export function refang(text: string): string {
  return text
    .replace(/hxxps?/giu, (match) => match.replace(/xx/iu, 'tt'))
    .replace(/\[\.\]|\(\.\)|\{\.\}/gu, '.')
    .replace(/\[:\]/gu, ':')
    .replace(/\[@\]|\(@\)/gu, '@')
    .replace(/\\\./gu, '.');
}

async function execute(input: RunnerInput): Promise<ToolResult<string>> {
  const text = input.text ?? '';
  if (text.length === 0) throw new ToolFailure('invalid-input', 'Provide text to defang or refang.');

  const mode = readMode(input, ['defang', 'refang'], 'defang');
  const output = mode === 'defang' ? defang(text) : refang(text);

  return {
    output,
    ...(mode === 'refang'
      ? {
          warnings: [
            {
              code: 'refanged-is-live',
              message:
                'Refanged text contains live indicators. Do not click links or resolve addresses from untrusted reports.',
            },
          ],
        }
      : {}),
    meta: { mode, inputChars: text.length, outputChars: output.length },
  };
}

export const defangTool: BlueKitTool<RunnerInput, string> = { manifest, execute };
