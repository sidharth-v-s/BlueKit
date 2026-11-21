import type { ToolErrorCode } from './types';

/**
 * Structured runtime errors (spec §15.3).
 *
 * Tools must throw `ToolFailure` for expected problems. Unexpected exceptions
 * are converted by the executor into `unknown` with a safe message; internal
 * stack traces stay in the local log, never in exported artifacts by default.
 */
export class ToolFailure extends Error {
  readonly code: ToolErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ToolErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ToolFailure';
    this.code = code;
    if (details) this.details = details;
  }
}

export function isToolFailure(error: unknown): error is ToolFailure {
  return error instanceof ToolFailure;
}

export function toToolError(error: unknown): {
  code: ToolErrorCode;
  message: string;
  details?: Record<string, unknown>;
} {
  if (isToolFailure(error)) {
    return { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) };
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'cancelled', message: 'Operation cancelled.' };
  }
  if (error instanceof Error) {
    return { code: 'unknown', message: error.message };
  }
  return { code: 'unknown', message: 'An unexpected error occurred.' };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}
