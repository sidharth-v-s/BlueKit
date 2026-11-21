import { formatBytes, toToolError, ToolFailure } from '@/core/runtime/errors';
import type {
  BlueKitTool,
  ProgressUpdate,
  RunnerInput,
  ToolContext,
  ToolLogEntry,
  ToolLogLevel,
  ToolRunOutcome,
  ToolRunSuccess,
  ToolWarning,
} from '@/core/runtime/types';
import type { ToolManifest } from '@/core/schemas/types';
import { DEFAULT_LIMITS } from '@/core/schemas/types';
import { workerManager } from '@/core/workers/manager';

export interface ExecuteOptions {
  onProgress?: (update: ProgressUpdate) => void;
  onLog?: (entry: ToolLogEntry) => void;
  signal?: AbortSignal;
  /** Overrides the manifest's timeout, used by tests. */
  timeoutMs?: number;
}

function estimateInputBytes(input: RunnerInput): number {
  let bytes = 0;
  if (input.file) bytes += input.file.size;
  if (input.text) bytes += new TextEncoder().encode(input.text).byteLength;
  return bytes;
}

function makeLogCollector(onLog?: (entry: ToolLogEntry) => void): {
  logs: ToolLogEntry[];
  log: (level: ToolLogLevel, message: string) => void;
} {
  const logs: ToolLogEntry[] = [];
  return {
    logs,
    log(level, message) {
      const entry: ToolLogEntry = { at: new Date().toISOString(), level, message };
      logs.push(entry);
      if (logs.length > 300) logs.shift();
      onLog?.(entry);
      if (level === 'error') console.warn(`[bluekit] ${message}`);
    },
  };
}

/**
 * Execute a tool on the main thread.
 *
 * The context exposes progress, logging, cancellation, limits, and (later)
 * dataset access. It deliberately does not expose storage, the DOM, or fetch.
 */
export async function executeOnMainThread(
  tool: BlueKitTool,
  input: RunnerInput,
  options: ExecuteOptions = {},
): Promise<ToolRunOutcome> {
  const startedAt = performance.now();
  const limits = tool.manifest.limits ?? DEFAULT_LIMITS;
  const { logs, log } = makeLogCollector(options.onLog);
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (options.signal?.aborted) {
    return {
      ok: false,
      error: { code: 'cancelled', message: 'Operation cancelled.' },
      durationMs: 0,
      logs,
    };
  }
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const timeoutMs = options.timeoutMs ?? limits.timeoutMs;
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  const context: ToolContext = {
    signal: controller.signal,
    limits,
    reportProgress(update) {
      if (controller.signal.aborted) return;
      options.onProgress?.(update);
    },
    log(level, message) {
      log(level, message);
    },
  };

  try {
    const inputBytes = estimateInputBytes(input);
    if (inputBytes > limits.maxInputBytes) {
      throw new ToolFailure('file-too-large', `Input exceeds the ${formatBytes(limits.maxInputBytes)} limit.`, {
        bytes: inputBytes,
        limit: limits.maxInputBytes,
      });
    }

    if (tool.initialize) await tool.initialize(context);
    const result = await tool.execute(input, context, controller.signal);
    const durationMs = Math.round(performance.now() - startedAt);

    if (controller.signal.aborted && timedOut) {
      throw new ToolFailure('resource-limit', 'Operation exceeded its time budget and was cancelled.');
    }

    const warnings: ToolWarning[] = result.warnings ?? [];
    log('info', `Completed in ${durationMs} ms`);
    return {
      ok: true,
      result,
      durationMs,
      warnings,
      logs,
    } satisfies ToolRunSuccess;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    if (timedOut) {
      log('error', 'Execution timed out.');
      return {
        ok: false,
        error: {
          code: 'resource-limit',
          message: 'Operation exceeded its time budget and was cancelled.',
        },
        durationMs,
        logs,
      };
    }
    if (controller.signal.aborted && !(error instanceof ToolFailure)) {
      return {
        ok: false,
        error: { code: 'cancelled', message: 'Operation cancelled.' },
        durationMs,
        logs,
      };
    }
    const normalized = toToolError(error);
    log('error', `${normalized.code}: ${normalized.message}`);
    return { ok: false, error: normalized, durationMs, logs };
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}

/** Execute a worker-routed tool through the worker manager. */
export async function executeInWorker(
  manifest: ToolManifest,
  input: RunnerInput,
  options: ExecuteOptions = {},
): Promise<ToolRunOutcome> {
  const startedAt = performance.now();
  const { logs, log } = makeLogCollector(options.onLog);
  log('info', `Dispatching to worker: ${manifest.id}`);
  try {
    const result = await workerManager.run(manifest.id, input, {
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.onLog ? { onLog: options.onLog } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      timeoutMs: options.timeoutMs ?? manifest.limits?.timeoutMs ?? DEFAULT_LIMITS.timeoutMs,
    });
    const durationMs = Math.round(performance.now() - startedAt);
    log('info', `Worker completed in ${durationMs} ms`);
    return {
      ok: true,
      result,
      durationMs,
      warnings: result.warnings ?? [],
      logs,
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    const normalized = toToolError(error);
    log('error', `${normalized.code}: ${normalized.message}`);
    return { ok: false, error: normalized, durationMs, logs };
  }
}

/**
 * Single entry point used by the UI. Chooses the execution environment from the
 * manifest and refuses planned tools.
 */
export async function executeTool(
  tool: BlueKitTool | undefined,
  manifest: ToolManifest,
  input: RunnerInput,
  options: ExecuteOptions = {},
): Promise<ToolRunOutcome> {
  if (manifest.status === 'planned' || !tool) {
    return {
      ok: false,
      error: {
        code: 'capability-unavailable',
        message: `${manifest.name} is a planned catalog entry and has no implementation yet.`,
      },
      durationMs: 0,
      logs: [],
    };
  }

  if (manifest.runtime === 'worker' || manifest.runtime === 'wasm-worker') {
    return executeInWorker(manifest, input, options);
  }
  return executeOnMainThread(tool, input, options);
}
