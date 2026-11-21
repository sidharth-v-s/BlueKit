import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolContext, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { MAX_EMAIL_BYTES, readEmailInput, requireEmailInput } from './input';
import { analyzeEml, type EmlAnalysis } from './rfc822';

const manifest: ToolManifest = {
  id: 'email.eml-inspector',
  name: 'EML Inspector',
  version: '0.2.0',
  category: 'email',
  description:
    'Parse a raw RFC 822 message: normalised headers, MIME tree, bodies, URLs, and attachment metadata — all local in a worker.',
  tags: ['eml', 'mime', 'headers', 'bodies', 'mailsleuth'],
  runtime: 'worker',
  input: [
    { type: DATA_TYPES.file, accept: ['.eml', '.txt', 'message/rfc822'], description: 'Raw message' },
    { type: DATA_TYPES.text, description: 'Pasted raw message' },
  ],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.email-message.v1' }],
  capabilities: ['worker.execute', 'file.read'],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 3,
  related: ['email.header-analyzer', 'email.auth-results', 'email.url-extractor', 'email.attachment-extractor'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: MAX_EMAIL_BYTES, timeoutMs: 45_000 },
  ui: {
    inputLabel: 'Raw email (.eml) or pasted message',
    outputLabel: 'Parsed message',
    placeholder: 'Paste the full raw message, including MIME boundaries…',
    primaryInput: DATA_TYPES.file,
  },
};

export async function runEmlInspector(
  input: RunnerInput,
  report: (pct: number | undefined, message: string) => void,
  signal: AbortSignal,
): Promise<ToolResult<EmlAnalysis>> {
  report(5, 'Reading message');
  const email = await readEmailInput(input, manifest.limits!.maxInputBytes);
  if (signal.aborted) throw new ToolFailure('cancelled', 'Operation cancelled.');
  requireEmailInput(email);

  report(30, 'Parsing MIME structure');
  const analysis = await analyzeEml(email.raw, email.byteLength);
  if (signal.aborted) throw new ToolFailure('cancelled', 'Operation cancelled.');
  report(100, 'Done');

  return {
    output: analysis,
    ...(analysis.warnings.length > 0
      ? {
          warnings: analysis.warnings.map((message, index) => ({
            code: `eml-warning-${index}`,
            message,
          })),
        }
      : {}),
    meta: {
      parser: 'bluekit.rfc822.v1',
      fileName: email.fileName ?? null,
      source: email.source,
      parts: analysis.parts.length,
      attachments: analysis.attachments.length,
      urls: analysis.urls.length,
    },
  };
}

async function execute(
  input: RunnerInput,
  context: ToolContext,
  signal: AbortSignal,
): Promise<ToolResult<EmlAnalysis>> {
  return runEmlInspector(
    input,
    (pct, message) => context.reportProgress({ ...(pct !== undefined ? { pct } : {}), message }),
    signal,
  );
}

export const emlInspectorTool: BlueKitTool<RunnerInput, EmlAnalysis> = { manifest, execute };
