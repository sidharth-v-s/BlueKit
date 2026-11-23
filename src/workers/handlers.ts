import { ToolFailure } from '@/core/runtime/errors';
import type { ProgressUpdate, RunnerInput, ToolResult, ToolWarning } from '@/core/runtime/types';
import {
  YARA_MAX_FILE_BYTES,
  YARA_MAX_MATCHES_PER_PATTERN,
  YARA_SCAN_TIMEOUT_MS,
} from '@/core/rules/yara-meta';
import { emptyYaraScanLimits, type YaraFileScan, type YaraScanReport } from '@/core/rules/yara';
import { parseYaraJob, YaraJobError } from '@/core/rules/yara-job';
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
 * YARA Studio / YARA tool worker entry.
 *
 * Compilation and scanning happen here so a pathological rule cannot freeze the
 * UI. The engine module, and therefore the WASM binary, is imported only when a
 * YARA job actually runs. The worker manager's total budget is the hard limit
 * because YARA-X timeouts are best effort.
 */
async function runYaraStudio(payload: unknown, context: WorkerHandlerContext): Promise<ToolResult> {
  let job;
  try {
    job = parseYaraJob(payload);
  } catch (error) {
    if (error instanceof YaraJobError) throw new ToolFailure(error.code, error.message);
    throw error;
  }

  context.report(3, 'Loading YARA-X…');
  const { compileYaraRule } = await import('@/core/rules/yara-engine');
  context.report(8, 'Compiling rules…');
  const { report, rules } = await compileYaraRule(job.source);

  if (!rules) {
    return {
      output: report,
      warnings: report.errors.map((message, index) => ({
        code: `yara-compile-${index}`,
        message,
      })),
      meta: {
        engine: report.engine,
        valid: false,
        errors: report.errors.length,
      },
    };
  }

  if (job.action === 'validate') {
    rules.free();
    return {
      output: report,
      warnings: report.warnings.map((message, index) => ({
        code: `yara-warning-${index}`,
        message,
      })),
      meta: {
        engine: report.engine,
        valid: report.valid,
        warnings: report.warnings.length,
      },
    };
  }

  const files: YaraFileScan[] = [];

  try {
    for (const [index, target] of job.files.entries()) {
      if (context.signal.aborted) throw new ToolFailure('cancelled', 'Operation cancelled.');
      context.report(
        10 + Math.round((index / job.files.length) * 85),
        `Scanning ${target.name} (${index + 1}/${job.files.length})…`,
      );

      const buffer = await target.file.arrayBuffer();
      if (context.signal.aborted) throw new ToolFailure('cancelled', 'Operation cancelled.');
      const data = new Uint8Array(buffer);
      if (data.byteLength > YARA_MAX_FILE_BYTES) {
        throw new ToolFailure(
          'file-too-large',
          `"${target.name}" grew past the ${YARA_MAX_FILE_BYTES / 1024 / 1024} MiB per-file limit.`,
        );
      }

      const startedAt = performance.now();
      const outcome = rules.scan(data, {
        timeoutMs: YARA_SCAN_TIMEOUT_MS,
        maxMatchesPerPattern: YARA_MAX_MATCHES_PER_PATTERN,
      });
      files.push({
        name: target.name,
        size: data.byteLength,
        durationMs: Math.round(performance.now() - startedAt),
        ...outcome,
      });
    }
  } finally {
    rules.free();
  }

  context.report(100, 'YARA scan complete.');

  const matchedFiles = files.filter((file) => file.matches.length > 0).length;
  const scanReport: YaraScanReport = {
    ...report,
    files,
    matchedFiles,
    limits: emptyYaraScanLimits(),
  };

  const warnings: ToolWarning[] = [];
  for (const file of files) {
    for (const [index, message] of file.errors.slice(0, 2).entries()) {
      warnings.push({ code: `yara-scan-${index}`, message: `${file.name}: ${message}` });
    }
  }

  return {
    output: scanReport,
    warnings,
    meta: {
      engine: report.engine,
      valid: report.valid,
      files: files.length,
      matchedFiles,
      matches: files.reduce((total, file) => total + file.matches.length, 0),
    },
  };
}

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
  'detection.yara-studio': runYaraStudio,
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
