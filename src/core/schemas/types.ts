/**
 * Core manifest and data-type definitions.
 *
 * These types are the contract between the catalog, the runtime, the worker
 * manager, and the UI. Tool manifests are data: they are serializable, versioned,
 * and validated at startup (see registry/validate.ts).
 */

/** Stable identifiers for every tool category in the BlueKit catalog. */
export const CATEGORY_IDS = [
  'encoding',
  'ioc',
  'email',
  'windows',
  'active-directory',
  'network',
  'malware',
  'forensics',
  'detection',
  'linux',
  'cloud',
  'utilities',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

/**
 * Stable typed-port identifiers for pipeline compatibility (spec §9.2).
 * Phase 1 only needs the vocabulary; the pipeline engine lands in Phase 7.
 */
export const DATA_TYPES = {
  text: 'text/plain',
  json: 'application/json',
  yaml: 'application/yaml',
  binary: 'application/octet-stream',
  file: 'bluekit.file.v1',
  iocList: 'bluekit.ioc-list.v1',
  emailMessage: 'bluekit.email-message.v1',
  eventRecords: 'bluekit.event-records.v1',
  sigmaRule: 'bluekit.sigma-rule.v1',
  yaraRule: 'bluekit.yara-rule.v1',
  fileMetadata: 'bluekit.file-metadata.v1',
  enrichmentResults: 'bluekit.enrichment-results.v1',
} as const;

export type DataType = (typeof DATA_TYPES)[keyof typeof DATA_TYPES];

/** Where a tool executes. CPU-heavy work must never be `main`. */
export type ToolRuntime = 'main' | 'worker' | 'wasm-worker';

/** Capabilities a tool may request from the runtime. Nothing else is exposed. */
export const CAPABILITIES = [
  'file.read',
  'worker.execute',
  'wasm.execute',
  'storage.read',
  'storage.write',
  'dataset.read',
  'network.direct',
  'clipboard.write',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Network posture, shown prominently in the tool header and runner. */
export type NetworkRequirement = 'none' | 'optional' | 'required';

/** Data-handling classification required by spec §6.2 and §16.4. */
export type DataHandling =
  | 'local-only'
  | 'local-then-user-initiated-external';

/** Honest implementation state. Planned entries are catalog entries only. */
export type ToolStatus = 'available' | 'prototype' | 'planned';

export interface ToolPort {
  /** Typed port identifier, e.g. `text/plain`. */
  type: DataType;
  /** File extensions or MIME types accepted for file ports. */
  accept?: string[];
  /** Optional versioned payload format, e.g. `bluekit.events.v1`. */
  format?: string;
  /** Short human-readable clarification shown in the runner. */
  description?: string;
}

export interface ToolLimits {
  /** Maximum input size in bytes. */
  maxInputBytes: number;
  /** Wall-clock execution budget in milliseconds. */
  timeoutMs: number;
  /** Declared memory expectation, for the future limits panel. */
  maxMemoryNote?: string;
}

/** One option of a `select` runner field. */
export interface ToolOption {
  value: string;
  label: string;
}

/**
 * Optional runner parameter. These are deliberately small: a tool may expose a
 * few switches, but the main work always flows through the typed input ports.
 */
export interface ToolField {
  /** Key in `RunnerInput.params`. */
  key: string;
  label: string;
  type?: 'text' | 'select' | 'toggle';
  placeholder?: string;
  defaultValue?: string;
  options?: ToolOption[];
  /** Short helper text shown under the control. */
  help?: string;
}

export interface ToolManifest {
  /** Stable dotted identifier. Never reused for a different tool. */
  id: string;
  name: string;
  version: string;
  category: CategoryId;
  description: string;
  tags: string[];
  runtime: ToolRuntime;
  input: ToolPort[];
  output: ToolPort[];
  capabilities: Capability[];
  network: NetworkRequirement;
  dataHandling: DataHandling;
  /** Relative path to bundled documentation (markdown in the future). */
  docs?: string;
  /** Suggested next tools, by stable id. */
  related?: string[];
  status: ToolStatus;
  /** Roadmap phase that introduces the tool (spec §17). */
  phase: number;
  limits?: ToolLimits;
  /** Optional UI hint for the generic runner. */
  ui?: {
    inputLabel?: string;
    outputLabel?: string;
    placeholder?: string;
    /** Default input data type when a tool accepts several. */
    primaryInput?: DataType;
    /** Optional execution parameters rendered by the generic runner. */
    fields?: ToolField[];
  };
}

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  shortLabel: string;
  description: string;
  /** Lucide icon component name, resolved in components/CategoryIcon.svelte. */
  icon: string;
}

export const CATEGORIES: readonly CategoryMeta[] = [
  {
    id: 'encoding',
    label: 'Encoding & Transformation',
    shortLabel: 'Encoding',
    description: 'Encode, decode, transform, hash, diff, and validate structured data.',
    icon: 'Binary',
  },
  {
    id: 'ioc',
    label: 'IOC & Threat Intelligence',
    shortLabel: 'IOC',
    description: 'Extract, normalize, deduplicate, and enrich indicators.',
    icon: 'Radar',
  },
  {
    id: 'email',
    label: 'Email & Phishing',
    shortLabel: 'Email',
    description: 'MailSleuth: parse messages, headers, URLs, and attachments locally.',
    icon: 'Mail',
  },
  {
    id: 'windows',
    label: 'Windows Analysis',
    shortLabel: 'Windows',
    description: 'Event logs, Sysmon, registry artifacts, and Windows references.',
    icon: 'AppWindow',
  },
  {
    id: 'active-directory',
    label: 'Active Directory',
    shortLabel: 'AD',
    description: 'Directory attributes, tickets, ACLs, and domain metadata.',
    icon: 'Network',
  },
  {
    id: 'network',
    label: 'Network Analysis',
    shortLabel: 'Network',
    description: 'Offline capture inspection, protocols, certificates, and fingerprints.',
    icon: 'Waypoints',
  },
  {
    id: 'malware',
    label: 'Malware & File Triage',
    shortLabel: 'Malware',
    description: 'Never executes samples: identify, hash, extract, and inspect files.',
    icon: 'Skull',
  },
  {
    id: 'forensics',
    label: 'Digital Forensics',
    shortLabel: 'Forensics',
    description: 'Execution artifacts, shell items, file-system metadata, and timelines.',
    icon: 'Fingerprint',
  },
  {
    id: 'detection',
    label: 'Detection Engineering',
    shortLabel: 'Detection',
    description: 'Author, validate, test, and convert detection rules.',
    icon: 'ShieldCheck',
  },
  {
    id: 'linux',
    label: 'Linux Analysis',
    shortLabel: 'Linux',
    description: 'Authentication, audit, journal, and unit-file analysis.',
    icon: 'Terminal',
  },
  {
    id: 'cloud',
    label: 'Cloud Security',
    shortLabel: 'Cloud',
    description: 'Cloud audit logs, sign-ins, and policy inspection.',
    icon: 'Cloud',
  },
  {
    id: 'utilities',
    label: 'References & Utilities',
    shortLabel: 'Utilities',
    description: 'Everyday lookups: ports, CIDR, cron, UUID, JWT, certificates.',
    icon: 'Wrench',
  },
];

export const CATEGORY_MAP: Readonly<Record<CategoryId, CategoryMeta>> = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category]),
) as Record<CategoryId, CategoryMeta>;

export const DEFAULT_LIMITS: Readonly<ToolLimits> = {
  maxInputBytes: 16 * 1024 * 1024,
  timeoutMs: 30_000,
};

export function isCategoryId(value: string): value is CategoryId {
  return (CATEGORY_IDS as readonly string[]).includes(value);
}
