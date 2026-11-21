/// <reference lib="webworker" />

import { toToolError } from '@/core/runtime/errors';
import type { ToolLogEntry } from '@/core/runtime/types';
import type { WorkerRequest, WorkerResponse } from '@/core/workers/protocol';
import { getWorkerHandler } from './handlers';

const controllers = new Map<string, AbortController>();
const logs: ToolLogEntry[] = [];

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

function log(level: ToolLogEntry['level'], message: string): void {
  logs.push({ at: new Date().toISOString(), level, message });
  if (logs.length > 200) logs.shift();
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.kind === 'cancel') {
    controllers.get(request.id)?.abort();
    return;
  }
  if (request.kind !== 'run') return;

  const { id, toolId, payload } = request;
  const controller = new AbortController();
  controllers.set(id, controller);
  const startedAt = performance.now();

  const report = (pct: number | undefined, message: string) => {
    if (controller.signal.aborted) return;
    post({
      kind: 'progress',
      id,
      ...(pct !== undefined ? { pct } : {}),
      message,
    });
  };

  try {
    const handler = getWorkerHandler(toolId);
    const result = await handler(payload, { report, signal: controller.signal });
    if (controller.signal.aborted) {
      post({ kind: 'error', id, code: 'cancelled', message: 'Operation cancelled.' });
      return;
    }
    post({
      kind: 'result',
      id,
      output: result.output,
      ...(result.warnings ? { warnings: result.warnings } : {}),
      meta: {
        ...(result.meta ?? {}),
        workerDurationMs: Math.round(performance.now() - startedAt),
        logEntries: logs.length,
      },
    });
  } catch (error) {
    const normalized = toToolError(error);
    post({
      kind: 'error',
      id,
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
    });
  } finally {
    controllers.delete(id);
  }
};

self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  log('error', `Unhandled rejection in worker: ${reason}`);
});
