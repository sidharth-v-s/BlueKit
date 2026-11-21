import type { ToolLimits, ToolManifest } from '@/core/schemas/types';

/**
 * Tool execution contract (spec §6.3).
 *
 * Tools receive a narrow context and an abort signal. They never receive the
 * application store, the DOM, or arbitrary network access. A tool that needs a
 * capability must declare it in its manifest; Phase 1 only wires the declared
 * capabilities into the runtime surface, not into tool code directly.
 */

export type ToolErrorCode =
  | 'invalid-input'
  | 'unsupported-format'
  | 'malformed-content'
  | 'file-too-large'
  | 'resource-limit'
  | 'cancelled'
  | 'capability-unavailable'
  | 'provider-cors-blocked'
  | 'provider-rate-limited'
  | 'provider-unauthorized'
  | 'network-unavailable'
  | 'unsupported-rule-feature'
  | 'unknown';

export interface ProgressUpdate {
  /** Percent complete in the range 0–100, when known. */
  pct?: number;
  message: string;
}

export type ToolLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ToolLogEntry {
  at: string;
  level: ToolLogLevel;
  message: string;
}

export interface ToolContext {
  reportProgress(update: ProgressUpdate): void;
  log(level: ToolLogLevel, message: string): void;
  signal: AbortSignal;
  limits: ToolLimits;
  /** Read-only dataset access, only when `dataset.read` is declared. */
  datasets?: {
    version(datasetId: string): string | undefined;
    read(datasetId: string): Promise<unknown>;
  };
}

export interface ToolWarning {
  code: string;
  message: string;
}

export interface ToolResult<Output = unknown> {
  output: Output;
  warnings?: ToolWarning[];
  meta?: Record<string, unknown>;
}

export interface BlueKitTool<Input = unknown, Output = unknown> {
  manifest: ToolManifest;
  initialize?(context: ToolContext): Promise<void>;
  execute(input: Input, context: ToolContext, signal: AbortSignal): Promise<ToolResult<Output>>;
}

export interface ToolRunSuccess<Output = unknown> {
  ok: true;
  result: ToolResult<Output>;
  durationMs: number;
  warnings: ToolWarning[];
  logs: ToolLogEntry[];
}

export interface ToolRunFailure {
  ok: false;
  error: {
    code: ToolErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  durationMs: number;
  logs: ToolLogEntry[];
}

export type ToolRunOutcome<Output = unknown> = ToolRunSuccess<Output> | ToolRunFailure;

/** Common shape of a user-facing tool input in the Phase 1 generic runner. */
export interface RunnerInput {
  text?: string;
  file?: File | null;
  /** Values from `manifest.ui.fields`, keyed by `ToolField.key`. */
  params?: Record<string, string | boolean>;
}
