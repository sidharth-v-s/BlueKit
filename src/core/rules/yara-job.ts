import {
  YARA_MAX_FILE_BYTES,
  YARA_MAX_FILES,
  YARA_MAX_TOTAL_BYTES,
} from './yara-meta';
import { validateYaraSource, yaraFileProblem } from './yara';

/**
 * Normalise the two YARA entry points into one job shape.
 *
 * - YARA Studio sends `{ action, source, files }`.
 * - The generic tool runner sends `{ text, file }` and derives the action.
 *
 * Files are structured-cloned to the worker; bytes are read there so the main
 * thread never copies a whole file just to hand it to the scanner.
 */

export type YaraJobAction = 'validate' | 'scan';

export interface YaraJobFile {
  name: string;
  size: number;
  file: File;
}

export interface YaraJob {
  action: YaraJobAction;
  source: string;
  files: YaraJobFile[];
}

export type YaraJobErrorCode = 'invalid-input' | 'file-too-large' | 'resource-limit';

export class YaraJobError extends Error {
  readonly code: YaraJobErrorCode;

  constructor(code: YaraJobErrorCode, message: string) {
    super(message);
    this.name = 'YaraJobError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFile(value: unknown): value is File {
  return typeof File !== 'undefined' && value instanceof File;
}

export function parseYaraJob(payload: unknown): YaraJob {
  const record = isRecord(payload) ? payload : {};
  const source =
    typeof record.source === 'string'
      ? record.source
      : typeof record.text === 'string'
        ? record.text
        : '';

  const rawFiles: unknown[] = [];
  if (Array.isArray(record.files)) rawFiles.push(...record.files);
  if (record.file !== null && record.file !== undefined) rawFiles.push(record.file);

  const files: YaraJobFile[] = [];
  for (const entry of rawFiles) {
    if (!isFile(entry)) {
      throw new YaraJobError('invalid-input', 'A scan target was not a readable File.');
    }
    files.push({
      name: entry.name || 'unnamed file',
      size: entry.size,
      file: entry,
    });
  }

  const requestedAction = record.action === 'scan' || record.action === 'validate' ? record.action : null;
  const action: YaraJobAction = requestedAction ?? (files.length > 0 ? 'scan' : 'validate');

  const sourceProblem = validateYaraSource(source);
  if (sourceProblem) throw new YaraJobError('invalid-input', sourceProblem);

  if (action === 'validate') {
    return { action, source, files: [] };
  }

  if (files.length === 0) {
    throw new YaraJobError('invalid-input', 'Select at least one local file to scan.');
  }
  if (files.length > YARA_MAX_FILES) {
    throw new YaraJobError(
      'resource-limit',
      `A scan job accepts at most ${YARA_MAX_FILES} files; ${files.length} were selected.`,
    );
  }

  let total = 0;
  for (const target of files) {
    const problem = yaraFileProblem(target.name, target.size);
    if (problem) {
      throw new YaraJobError(target.size > YARA_MAX_FILE_BYTES ? 'file-too-large' : 'invalid-input', problem);
    }
    total += target.size;
  }
  if (total > YARA_MAX_TOTAL_BYTES) {
    throw new YaraJobError(
      'resource-limit',
      `The selected files total ${total.toLocaleString()} bytes; a job is capped at ${
        YARA_MAX_TOTAL_BYTES / 1024 / 1024
      } MiB.`,
    );
  }

  return { action, source, files };
}
