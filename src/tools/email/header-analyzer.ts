import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolContext, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { analyzeHeaders, type HeaderAnalysis } from './headers';
import { MAX_EMAIL_BYTES, readEmailInput, requireEmailInput } from './input';

const manifest: ToolManifest = {
  id: 'email.header-analyzer',
  name: 'Header Analyzer',
  version: '0.1.0',
  category: 'email',
  description:
    'Compare From, Reply-To, Sender, and Return-Path; parse the Received chain; find duplicate or missing headers. Observations, not verdicts.',
  tags: ['email', 'headers', 'received', 'spoofing', 'mailsleuth'],
  runtime: 'worker',
  input: [
    { type: DATA_TYPES.file, accept: ['.eml', '.txt', 'message/rfc822'], description: 'Raw message' },
    { type: DATA_TYPES.text, description: 'Pasted raw message or header block' },
  ],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.email-header-analysis.v1' }],
  capabilities: ['worker.execute', 'file.read'],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 3,
  related: ['email.eml-inspector', 'email.auth-results', 'email.url-extractor', 'email.attachment-extractor'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: MAX_EMAIL_BYTES, timeoutMs: 30_000 },
  ui: {
    inputLabel: 'Raw email (.eml) or header block',
    outputLabel: 'Header analysis',
    placeholder: 'Paste the full raw message, including Received headers…',
    primaryInput: DATA_TYPES.file,
  },
};

export async function runHeaderAnalyzer(
  input: RunnerInput,
  report: (pct: number | undefined, message: string) => void,
  signal: AbortSignal,
): Promise<ToolResult<HeaderAnalysis>> {
  report(5, 'Reading message');
  const email = await readEmailInput(input, manifest.limits!.maxInputBytes);
  if (signal.aborted) throw new ToolFailure('cancelled', 'Operation cancelled.');
  requireEmailInput(email);

  report(40, 'Parsing headers');
  const analysis = analyzeHeaders(email.raw, email.byteLength);
  if (signal.aborted) throw new ToolFailure('cancelled', 'Operation cancelled.');
  report(100, 'Done');

  return {
    output: analysis,
    ...(analysis.warnings.length > 0
      ? { warnings: analysis.warnings.map((message, index) => ({ code: `header-warning-${index}`, message })) }
      : {}),
    meta: {
      fileName: email.fileName ?? null,
      source: email.source,
      headers: analysis.headers.length,
      receivedHops: analysis.received.length,
      findings: analysis.findings.length,
    },
  };
}

async function execute(
  input: RunnerInput,
  context: ToolContext,
  signal: AbortSignal,
): Promise<ToolResult<HeaderAnalysis>> {
  return runHeaderAnalyzer(
    input,
    (pct, message) => context.reportProgress({ ...(pct !== undefined ? { pct } : {}), message }),
    signal,
  );
}

export const headerAnalyzerTool: BlueKitTool<RunnerInput, HeaderAnalysis> = { manifest, execute };
