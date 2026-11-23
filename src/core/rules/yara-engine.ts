import {
  YARA_ENGINE_INFO,
  YARA_MAX_MATCHES_PER_PATTERN,
  YARA_MAX_MATCHED_RULES,
  YARA_MAX_PATTERNS_PER_RULE,
  YARA_PREVIEW_BYTES,
  YARA_SCAN_TIMEOUT_MS,
} from './yara-meta';
import {
  normalizeYaraScanResult,
  type YaraCompileReport,
  type YaraScanOutcome,
} from './yara';

/**
 * YARA-X WebAssembly wrapper.
 *
 * This module is worker-only in the app. Importing it does not load the WASM
 * binary; `loadYaraEngine()` imports the package and initialises it on first
 * use. The compiled `Rules` object is freed explicitly by the caller.
 */

type YaraModule = typeof import('@virustotal/yara-x');

let enginePromise: Promise<YaraModule> | null = null;

export interface YaraScanOptions {
  timeoutMs?: number;
  maxMatchesPerPattern?: number;
}

export interface YaraCompiledRules {
  readonly freed: boolean;
  scan(data: Uint8Array, options?: YaraScanOptions): YaraScanOutcome;
  free(): void;
}

export interface YaraCompileOutcome {
  report: YaraCompileReport;
  rules: YaraCompiledRules | null;
}

/**
 * Load and initialise YARA-X once per worker.
 *
 * `moduleBytes` exists for Node-based engine tests; the browser path uses the
 * package's own same-origin WASM URL, so the CSP never needs a remote host.
 */
export async function loadYaraEngine(moduleBytes?: BufferSource): Promise<YaraModule> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const module = await import('@virustotal/yara-x');
      if (moduleBytes) await module.default({ module_or_path: moduleBytes });
      else await module.default();
      return module;
    })().catch((error: unknown) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error:\s*/u, '').trim() || 'The YARA engine failed without a message.';
}

function readCompilerMessages(read: () => string[]): string[] {
  try {
    return read().map((message) => message.trim()).filter(Boolean);
  } catch {
    // Compiler fields are unavailable after build() consumes the compiler.
    return [];
  }
}

export async function compileYaraRule(
  source: string,
  options: { moduleBytes?: BufferSource } = {},
): Promise<YaraCompileOutcome> {
  const sourceBytes = new TextEncoder().encode(source).byteLength;
  const baseReport: YaraCompileReport = {
    engine: YARA_ENGINE_INFO,
    valid: false,
    errors: [],
    warnings: [],
    sourceBytes,
  };

  let module: YaraModule;
  try {
    module = await loadYaraEngine(options.moduleBytes);
  } catch (error) {
    return {
      report: {
        ...baseReport,
        errors: [
          `Could not load ${YARA_ENGINE_INFO.name} ${YARA_ENGINE_INFO.version}: ${errorMessage(error)}`,
        ],
      },
      rules: null,
    };
  }

  const compiler = new module.Compiler();
  let warnings: string[] = [];
  let errors: string[] = [];
  let built: import('@virustotal/yara-x').Rules | null = null;

  try {
    compiler.addSource(source);
    warnings = readCompilerMessages(() => [...compiler.warnings]);
    built = compiler.build();
  } catch (error) {
    errors = readCompilerMessages(() => [...compiler.errors]);
    if (errors.length === 0) errors = [errorMessage(error)];
  } finally {
    try {
      compiler.free();
    } catch {
      // build() may have consumed the compiler; free is best effort.
    }
  }

  if (!built) {
    return { report: { ...baseReport, warnings, errors }, rules: null };
  }

  const compiled = built;
  let freed = false;

  const rules: YaraCompiledRules = {
    get freed() {
      return freed;
    },
    scan(data, scanOptions = {}) {
      if (freed) {
        return {
          valid: false,
          matches: [],
          errors: ['The compiled rules were already released.'],
          warnings: [],
          truncated: false,
        };
      }

      let scanner: import('@virustotal/yara-x').Scanner | null = null;
      try {
        scanner = compiled.scanner();
        scanner.setTimeoutMs(scanOptions.timeoutMs ?? YARA_SCAN_TIMEOUT_MS);
        scanner.setMaxMatchesPerPattern(
          scanOptions.maxMatchesPerPattern ?? YARA_MAX_MATCHES_PER_PATTERN,
        );
        const raw = scanner.scan(data);
        return normalizeYaraScanResult(raw, {
          data,
          maxRules: YARA_MAX_MATCHED_RULES,
          maxPatterns: YARA_MAX_PATTERNS_PER_RULE,
          maxMatches: scanOptions.maxMatchesPerPattern ?? YARA_MAX_MATCHES_PER_PATTERN,
          previewBytes: YARA_PREVIEW_BYTES,
        });
      } catch (error) {
        return {
          valid: false,
          matches: [],
          errors: [errorMessage(error)],
          warnings: [],
          truncated: false,
        };
      } finally {
        if (scanner) {
          try {
            scanner.free();
          } catch {
            // Nothing useful to do if the engine refuses to release the scanner.
          }
        }
      }
    },
    free() {
      if (freed) return;
      freed = true;
      try {
        compiled.free();
      } catch {
        // Double-free protection above is the important part.
      }
    },
  };

  return { report: { ...baseReport, valid: true, warnings }, rules };
}

export async function validateYaraRule(
  source: string,
  options: { moduleBytes?: BufferSource } = {},
): Promise<YaraCompileReport> {
  const { report, rules } = await compileYaraRule(source, options);
  rules?.free();
  return report;
}
