/**
 * YARA engine metadata, limits, and the supported-feature matrix.
 *
 * This module stays small and dependency-free so views can render the engine
 * contract without pulling the YARA-X WebAssembly module into the startup graph.
 */

export const YARA_ENGINE = {
  name: 'YARA-X',
  version: '1.23.0',
  packageName: '@virustotal/yara-x',
  licence: 'BSD-3-Clause',
  runtime: 'WebAssembly worker',
} as const;

export type YaraEngineInfo = {
  name: string;
  version: string;
  packageName: string;
  licence: string;
  runtime: string;
};

export const YARA_ENGINE_INFO: YaraEngineInfo = { ...YARA_ENGINE };

/** Maximum rule-source size accepted by the editor. */
export const YARA_MAX_SOURCE_BYTES = 1024 * 1024;

/** Maximum size of one scanned file. */
export const YARA_MAX_FILE_BYTES = 32 * 1024 * 1024;

/** Maximum combined size of all files in one scan job. */
export const YARA_MAX_TOTAL_BYTES = 64 * 1024 * 1024;

/** Maximum files in one scan job. */
export const YARA_MAX_FILES = 10;

/** Per-file engine timeout. YARA-X treats this as best effort. */
export const YARA_SCAN_TIMEOUT_MS = 10_000;

/** Hard worker-manager budget. The worker is terminated when it elapses. */
export const YARA_JOB_TIMEOUT_MS = 60_000;

/** Reported matches kept per string pattern. */
export const YARA_MAX_MATCHES_PER_PATTERN = 20;

/** Reported rules per file. */
export const YARA_MAX_MATCHED_RULES = 100;

/** Reported string patterns per rule. */
export const YARA_MAX_PATTERNS_PER_RULE = 50;

/** Bytes of a match previewed as hex. */
export const YARA_PREVIEW_BYTES = 16;

export type YaraSupportLevel = 'supported' | 'engine-dependent' | 'limited' | 'unsupported';

export interface YaraFeatureNote {
  area: string;
  support: YaraSupportLevel;
  detail: string;
}

/**
 * Honest feature matrix for the pinned engine.
 *
 * "Supported" means BlueKit exercises the feature through YARA-X 1.23.0. It
 * does not mean the rule is portable to every YARA 4.x deployment.
 */
export const YARA_FEATURES: readonly YaraFeatureNote[] = [
  {
    area: 'Rule syntax',
    support: 'supported',
    detail:
      'Rule blocks, metadata, tags, private/global rules, comments, string definitions, conditions, and imports are compiled by YARA-X.',
  },
  {
    area: 'Strings',
    support: 'supported',
    detail:
      'Text, hex, and regular-expression strings, including modifiers accepted by the engine (for example nocase, wide, ascii, fullword, xor, and base64).',
  },
  {
    area: 'Conditions',
    support: 'supported',
    detail:
      'The full YARA-X condition language, including string sets, counts, offsets, filesize, loops, and arithmetic.',
  },
  {
    area: 'Modules',
    support: 'engine-dependent',
    detail:
      'The WASM build includes pe, elf, dotnet, macho, lnk, hash, math, time, string, console, and cuckoo. The vt module is outside the supported matrix because BlueKit provides no external data.',
  },
  {
    area: 'Includes',
    support: 'unsupported',
    detail:
      'include statements require a filesystem that BlueKit does not expose. Keep each rule self-contained.',
  },
  {
    area: 'External variables',
    support: 'unsupported',
    detail:
      'The UI does not define external variables. A rule that references an undefined external fails compilation with the engine error.',
  },
  {
    area: 'Scan timeout',
    support: 'limited',
    detail:
      'The engine timeout is best effort. The worker-manager budget is the hard stop: the worker is terminated, which discards the WASM state.',
  },
  {
    area: 'Portability',
    support: 'engine-dependent',
    detail:
      'YARA-X is not byte-for-byte YARA 4.x. A rule that compiles here may behave differently on another engine or version. Results name the exact engine and version.',
  },
];

export const YARA_MODULES: readonly string[] = [
  'pe',
  'elf',
  'dotnet',
  'macho',
  'lnk',
  'hash',
  'math',
  'time',
  'string',
  'console',
  'cuckoo',
];
