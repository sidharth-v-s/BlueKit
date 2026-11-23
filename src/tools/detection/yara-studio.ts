import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import {
  YARA_ENGINE,
  YARA_JOB_TIMEOUT_MS,
  YARA_MAX_FILE_BYTES,
} from '@/core/rules/yara-meta';
import type { YaraCompileReport, YaraScanReport } from '@/core/rules/yara';

/**
 * YARA Studio tool manifest.
 *
 * The generic runner can validate a rule from the text field or scan one file
 * when a file is supplied. The dedicated YARA Studio view uses the same worker
 * tool id with a richer multi-file payload.
 */

const manifest: ToolManifest = {
  id: 'detection.yara-studio',
  name: 'YARA Studio',
  version: '0.1.0',
  category: 'detection',
  description: `Compile YARA rules with ${YARA_ENGINE.name} ${YARA_ENGINE.version} and scan local files in a worker.`,
  tags: ['yara', 'rules', 'scan', 'malware', 'detection', 'strings'],
  runtime: 'wasm-worker',
  input: [
    { type: DATA_TYPES.text, description: 'YARA rule source' },
    {
      type: DATA_TYPES.file,
      accept: ['.yar', '.yara', 'application/octet-stream'],
      description: 'Optional local file to scan',
    },
  ],
  output: [{ type: DATA_TYPES.json, description: 'Compile or scan report' }],
  capabilities: ['worker.execute', 'wasm.execute', 'file.read'],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 4,
  related: [
    'detection.sigma-validator',
    'malware.strings',
    'malware.file-type',
    'malware.entropy',
  ],
  limits: {
    ...DEFAULT_LIMITS,
    maxInputBytes: YARA_MAX_FILE_BYTES,
    timeoutMs: YARA_JOB_TIMEOUT_MS,
    maxMemoryNote: 'YARA-X WASM module is about 5.9 MB; each scanned file is capped at 32 MiB.',
  },
  ui: {
    inputLabel: 'YARA rule source',
    outputLabel: 'YARA report',
    primaryInput: DATA_TYPES.text,
    placeholder:
      'rule Example : demo {\n  strings:\n    $a = "suspicious"\n  condition:\n    $a\n}',
    fields: [],
  },
};

async function execute(): Promise<ToolResult<YaraCompileReport | YaraScanReport>> {
  throw new Error('YARA Studio runs in the tool worker.');
}

export const yaraStudioTool: BlueKitTool<
  RunnerInput,
  YaraCompileReport | YaraScanReport
> = {
  manifest,
  execute,
};
