import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { readMode, readString } from './params';

/**
 * ROT-N / ROT13.
 *
 * Operates on ASCII letters only. ROT13 is its own inverse; for other shifts
 * decoding uses 26 - shift. This is obfuscation, never encryption, and the
 * output says so.
 */

const manifest: ToolManifest = {
  id: 'encoding.rot13',
  name: 'ROT-N / ROT13',
  version: '0.1.0',
  category: 'encoding',
  description: 'Apply ROT13 or any ROT-N letter rotation. Obfuscation only, not encryption.',
  tags: ['rot13', 'rot-n', 'caesar', 'obfuscation'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.text }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.base64-encode', 'encoding.hex'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 4 * 1024 * 1024 },
  ui: {
    inputLabel: 'Text',
    outputLabel: 'Rotated text',
    placeholder: 'Paste text to rotate…',
    primaryInput: DATA_TYPES.text,
    fields: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        defaultValue: 'encode',
        options: [
          { value: 'encode', label: 'Rotate forward' },
          { value: 'decode', label: 'Rotate backward' },
        ],
      },
      { key: 'shift', label: 'Shift (1–25)', type: 'text', defaultValue: '13', placeholder: '13' },
    ],
  },
};

export function rotN(text: string, shift: number): string {
  const normalized = ((shift % 26) + 26) % 26;
  if (normalized === 0) return text;
  return text.replace(/[a-z]/giu, (char) => {
    const base = char <= 'Z' ? 65 : 97;
    const offset = char.charCodeAt(0) - base;
    return String.fromCharCode(base + ((offset + normalized) % 26));
  });
}

async function execute(input: RunnerInput): Promise<ToolResult<string>> {
  const text = input.text ?? '';
  if (text.length === 0) throw new ToolFailure('invalid-input', 'Provide text to rotate.');

  const rawShift = Number.parseInt(readString(input, 'shift', '13'), 10);
  if (!Number.isInteger(rawShift) || rawShift < 1 || rawShift > 25) {
    throw new ToolFailure('invalid-input', 'Shift must be an integer from 1 to 25.');
  }

  const mode = readMode(input, ['encode', 'decode'], 'encode');
  const applied = mode === 'decode' ? 26 - rawShift : rawShift;
  const output = rotN(text, applied);

  return {
    output,
    meta: { mode, requestedShift: rawShift, appliedShift: applied, alphabet: 'ASCII letters' },
  };
}

export const rot13Tool: BlueKitTool<RunnerInput, string> = { manifest, execute };
