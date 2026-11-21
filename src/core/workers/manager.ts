import { ToolFailure, toToolError } from '@/core/runtime/errors';
import type { ProgressUpdate, ToolLogEntry, ToolResult } from '@/core/runtime/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

export type WorkerState = 'idle' | 'busy' | 'error' | 'unavailable';

export interface WorkerRunOptions {
  onProgress?: (update: ProgressUpdate) => void;
  onLog?: (entry: ToolLogEntry) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface InFlight {
  id: string;
  toolId: string;
  onProgress?: (update: ProgressUpdate) => void;
  onLog?: (entry: ToolLogEntry) => void;
  timer: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  succeed: (result: ToolResult) => void;
  fail: (error: unknown) => void;
}

let sequence = 0;

/**
 * Single-worker pool for Phase 1.
 *
 * CPU-heavy work is off the main thread and cancellable. Cancellation terminates
 * the worker rather than trusting every parser to reach a cooperative checkpoint;
 * the worker is recreated lazily on the next run. A real pool with per-category
 * workers is a later optimisation, not a Phase 1 requirement.
 */
export class WorkerManager {
  private worker: Worker | null = null;
  private inflight: InFlight | null = null;
  private listeners = new Set<(state: WorkerState) => void>();
  private _state: WorkerState = 'idle';

  readonly supported = typeof Worker !== 'undefined';

  get state(): WorkerState {
    return this.supported ? this._state : 'unavailable';
  }

  subscribe(listener: (state: WorkerState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(state: WorkerState): void {
    if (this._state === state) return;
    this._state = state;
    for (const listener of this.listeners) listener(state);
  }

  private spawn(): Worker {
    const worker = new Worker(new URL('../../workers/tool.worker.ts', import.meta.url), {
      type: 'module',
      name: 'bluekit-tool-worker',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      const message = event.message || 'Worker crashed while executing the tool.';
      this.abortInflight(new ToolFailure('resource-limit', message));
      this.setState('error');
    };
    worker.onmessageerror = () => {
      this.abortInflight(new ToolFailure('unknown', 'Worker response could not be deserialized.'));
      this.setState('error');
    };
    return worker;
  }

  private handleMessage(message: WorkerResponse): void {
    const current = this.inflight;
    if (!current || message.id !== current.id) return;

    if (message.kind === 'progress') {
      current.onProgress?.({
        ...(message.pct !== undefined ? { pct: message.pct } : {}),
        message: message.message,
      });
      return;
    }

    if (message.kind === 'result') {
      const result: ToolResult = {
        output: message.output,
        ...(message.warnings ? { warnings: message.warnings } : {}),
        ...(message.meta ? { meta: message.meta } : {}),
      };
      this.clearInflight();
      this.setState('idle');
      current.succeed(result);
      return;
    }

    const error = new ToolFailure(message.code, message.message, message.details);
    this.clearInflight();
    this.setState('idle');
    current.fail(error);
  }

  private clearInflight(): void {
    if (this.inflight?.timer) clearTimeout(this.inflight.timer);
    this.inflight = null;
  }

  /** Terminate the worker and fail the current call. Used for cancel/timeout/crash. */
  private abortInflight(error: unknown): void {
    const current = this.inflight;
    this.clearInflight();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    current?.fail(error);
  }

  run(toolId: string, payload: unknown, options: WorkerRunOptions = {}): Promise<ToolResult> {
    if (!this.supported) {
      return Promise.reject(
        new ToolFailure('capability-unavailable', 'Web Workers are not available in this browser.'),
      );
    }
    if (this.inflight) {
      return Promise.reject(
        new ToolFailure('resource-limit', 'The tool worker is busy. Wait for the current operation to finish.'),
      );
    }
    if (options.signal?.aborted) {
      return Promise.reject(new ToolFailure('cancelled', 'Operation cancelled.'));
    }

    let worker: Worker;
    try {
      worker = this.worker ?? (this.worker = this.spawn());
    } catch (error) {
      const normalized = toToolError(error);
      return Promise.reject(new ToolFailure(normalized.code, normalized.message));
    }

    const id = `run-${Date.now().toString(36)}-${(sequence += 1)}`;

    return new Promise<ToolResult>((resolve, reject) => {
      const finish = (result: ToolResult) => {
        options.signal?.removeEventListener('abort', onAbort);
        resolve(result);
      };
      const fail = (error: unknown) => {
        options.signal?.removeEventListener('abort', onAbort);
        reject(error);
      };

      const onAbort = () => {
        this.abortInflight(new ToolFailure('cancelled', 'Operation cancelled.'));
        this.setState('idle');
      };

      const timer =
        options.timeoutMs && options.timeoutMs > 0
          ? setTimeout(() => {
              this.abortInflight(
                new ToolFailure('resource-limit', 'Operation exceeded its time budget and was cancelled.'),
              );
              this.setState('idle');
            }, options.timeoutMs)
          : null;

      this.inflight = {
        id,
        toolId,
        timer,
        startedAt: performance.now(),
        succeed: finish,
        fail,
        ...(options.onProgress ? { onProgress: options.onProgress } : {}),
        ...(options.onLog ? { onLog: options.onLog } : {}),
      };

      options.signal?.addEventListener('abort', onAbort, { once: true });

      const request: WorkerRequest = { kind: 'run', id, toolId, payload };
      this.setState('busy');
      try {
        worker.postMessage(request);
      } catch (error) {
        const normalized = toToolError(error);
        this.abortInflight(
          new ToolFailure(normalized.code, `Could not send work to the worker: ${normalized.message}`),
        );
        this.setState('error');
      }
    });
  }

  /** Cancel the in-flight operation. Termination is the reliable primitive. */
  cancel(reason = 'Operation cancelled.'): void {
    if (!this.inflight) return;
    this.abortInflight(new ToolFailure('cancelled', reason));
    this.setState('idle');
  }

  /** Called on app teardown. */
  dispose(): void {
    this.abortInflight(new ToolFailure('cancelled', 'Worker disposed.'));
    this.setState('idle');
    this.listeners.clear();
  }
}

export const workerManager = new WorkerManager();
