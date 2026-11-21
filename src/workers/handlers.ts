import { ToolFailure } from '@/core/runtime/errors';
import type { ProgressUpdate, RunnerInput, ToolResult, ToolWarning } from '@/core/runtime/types';
import { runCompressionTool } from '@/tools/encoding/compress';
import { runHashTool, type HashToolInput } from '@/tools/encoding/hash';
import { runHmacTool } from '@/tools/encoding/hmac';
import { runRegexTool } from '@/tools/encoding/regex';
import { runYamlTool } from '@/tools/encoding/yaml';
import { runAttachmentExtractor } from '@/tools/email/attachment-extractor';
import { runAuthResults } from '@/tools/email/auth-results';
import { runEmlInspector } from '@/tools/email/eml-inspector';
import { runHeaderAnalyzer } from '@/tools/email/header-analyzer';
import { runUrlExtractor } from '@/tools/email/url-extractor';
import { runEntropyTool } from '@/tools/malware/entropy';
import { runStringsTool } from '@/tools/malware/strings';
import { runPingHandler } from './ping';

export interface WorkerHandlerContext {
  report(pct: number | undefined, message: string): void;
  signal: AbortSignal;
}

export type WorkerHandler = (
  payload: unknown,
  context: WorkerHandlerContext,
) => Promise<ToolResult>;

/**
 * Worker-side tool dispatch table.
 *
 * Only tools whose manifest declares `runtime: "worker"` may appear here. The
 * worker never receives a tool id from untrusted input; the ids come from the
 * registry and the message is checked before dispatch.
 */
export const workerHandlers: Record<string, WorkerHandler> = {
  'encoding.compress': async (payload, context) => {
    const input = (payload ?? {}) as RunnerInput;
    return runCompressionTool(input, (pct, message) => context.report(pct, message), context.signal);
  },
  'encoding.hash': async (payload, context) => {
    const input = (payload ?? {}) as HashToolInput;
    return runHashTool(input, (pct, message) => context.report(pct, message), context.signal);
  },
  'encoding.hmac': async (payload, context) => {
    const input = (payload ?? {}) as RunnerInput;
    return runHmacTool(input, (pct, message) => context.report(pct, message), context.signal);
  },
  'encoding.regex': async (payload, context) => {
    const input = (payload ?? {}) as RunnerInput;
    return runRegexTool(input, (pct, message) => context.report(pct, message), context.signal);
  },
  'encoding.yaml': async (payload, context) => {
    const input = (payload ?? {}) as RunnerInput;
    return runYamlTool(input, (pct, message) => context.report(pct, message), context.signal);
  },
  'email.attachment-extractor': async (payload, context) => {
    const input = (payload ?? {}) as RunnerInput;
    return runAttachmentExtractor(input, (pct, message) => context.report(pct, message), context.signal);
  },
  'email.auth-results': async (payload, context) => {
    const input = (payload ?? {}) as RunnerInput;
    return runAuthResults(input, (pct, message) => context.report(pct, message), context.signal);
  },
  'email.eml-inspector': async (payload, context) => {
    const input = (payload ?? {}) as RunnerInput;
    return runEmlInspector(input, (pct, message) => context.report(pct, message), context.signal);
  },
  'email.header-analyzer': async (payload, context) => {
    const input = (payload ?? {}) as RunnerInput;
    return runHeaderAnalyzer(input, (pct, message) => context.report(pct, message), context.signal);
  },
  'email.url-extractor': async (payload, context) => {
    const input = (payload ?? {}) as RunnerInput;
    return runUrlExtractor(input, (pct, message) => context.report(pct, message), context.signal);
  },
  'malware.strings': async (payload, context) => {
    const input = (payload ?? {}) as Record<string, unknown>;
    return runStringsTool(
      input as { file?: File | null; text?: string },
      (pct, message) => context.report(pct, message),
      context.signal,
    );
  },
  'malware.entropy': async (payload, context) => {
    const input = (payload ?? {}) as Record<string, unknown>;
    return runEntropyTool(
      input as { file?: File | null; text?: string },
      (pct, message) => context.report(pct, message),
      context.signal,
    );
  },
  'diagnostics.ping': runPingHandler,
};

export function getWorkerHandler(toolId: string): WorkerHandler {
  const handler = workerHandlers[toolId];
  if (!handler) {
    throw new ToolFailure('capability-unavailable', `No worker implementation is registered for "${toolId}".`);
  }
  return handler;
}

export type { ProgressUpdate, ToolWarning };
