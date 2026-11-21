import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolContext, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { analyzeAuthentication, type AuthAnalysis } from './auth';
import { MAX_EMAIL_BYTES, readEmailInput, requireEmailInput } from './input';

const manifest: ToolManifest = {
  id: 'email.auth-results',
  name: 'Authentication Results',
  version: '0.1.0',
  category: 'email',
  description:
    'Summarise SPF, DKIM, DMARC, and ARC evidence from message headers. BlueKit does not independently verify signatures or DNS.',
  tags: ['spf', 'dkim', 'dmarc', 'arc', 'authentication', 'mailsleuth'],
  runtime: 'worker',
  input: [
    { type: DATA_TYPES.file, accept: ['.eml', '.txt', 'message/rfc822'], description: 'Raw message' },
    { type: DATA_TYPES.text, description: 'Pasted raw message or header block' },
  ],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.email-auth-analysis.v1' }],
  capabilities: ['worker.execute', 'file.read'],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 3,
  related: ['email.eml-inspector', 'email.header-analyzer'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: MAX_EMAIL_BYTES, timeoutMs: 30_000 },
  ui: {
    inputLabel: 'Raw email (.eml) or header block',
    outputLabel: 'Authentication evidence',
    placeholder: 'Paste the full raw message, including Authentication-Results and DKIM-Signature headers…',
    primaryInput: DATA_TYPES.file,
  },
};

export async function runAuthResults(
  input: RunnerInput,
  report: (pct: number | undefined, message: string) => void,
  signal: AbortSignal,
): Promise<ToolResult<AuthAnalysis>> {
  report(5, 'Reading message');
  const email = await readEmailInput(input, manifest.limits!.maxInputBytes);
  if (signal.aborted) throw new ToolFailure('cancelled', 'Operation cancelled.');
  requireEmailInput(email);

  report(40, 'Parsing authentication headers');
  const analysis = analyzeAuthentication(email.raw, email.byteLength);
  if (signal.aborted) throw new ToolFailure('cancelled', 'Operation cancelled.');
  report(100, 'Done');

  return {
    output: analysis,
    ...(analysis.warnings.length > 0
      ? { warnings: analysis.warnings.map((message, index) => ({ code: `auth-warning-${index}`, message })) }
      : {}),
    meta: {
      fileName: email.fileName ?? null,
      authenticationResults: analysis.authenticationResults.length,
      receivedSpf: analysis.receivedSpf.length,
      dkimSignatures: analysis.dkimSignatures.length,
      findings: analysis.findings.length,
    },
  };
}

async function execute(
  input: RunnerInput,
  context: ToolContext,
  signal: AbortSignal,
): Promise<ToolResult<AuthAnalysis>> {
  return runAuthResults(
    input,
    (pct, message) => context.reportProgress({ ...(pct !== undefined ? { pct } : {}), message }),
    signal,
  );
}

export const authResultsTool: BlueKitTool<RunnerInput, AuthAnalysis> = { manifest, execute };
