import type { ToolErrorCode, ToolWarning } from '@/core/runtime/types';

/** Message shapes exchanged with the tool worker. Keep this file dependency-free. */

export interface WorkerRunMessage {
  kind: 'run';
  id: string;
  toolId: string;
  payload: unknown;
}

export interface WorkerCancelMessage {
  kind: 'cancel';
  id: string;
}

export type WorkerRequest = WorkerRunMessage | WorkerCancelMessage;

export interface WorkerProgressMessage {
  kind: 'progress';
  id: string;
  pct?: number;
  message: string;
}

export interface WorkerResultMessage {
  kind: 'result';
  id: string;
  output: unknown;
  warnings?: ToolWarning[];
  meta?: Record<string, unknown>;
}

export interface WorkerErrorMessage {
  kind: 'error';
  id: string;
  code: ToolErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type WorkerResponse = WorkerProgressMessage | WorkerResultMessage | WorkerErrorMessage;
