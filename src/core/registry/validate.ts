import {
  CAPABILITIES,
  CATEGORY_IDS,
  DATA_TYPES,
  isCategoryId,
  type ToolManifest,
} from '@/core/schemas/types';

const ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const KNOWN_DATA_TYPES = new Set<string>(Object.values(DATA_TYPES));
const KNOWN_CAPABILITIES = new Set<string>(CAPABILITIES);
const KNOWN_CATEGORIES = new Set<string>(CATEGORY_IDS);

/**
 * Manifest validation (spec §16.1: registry and manifest validation).
 * Returns human-readable problems; an empty array means the manifest is valid.
 */
export function validateManifest(manifest: ToolManifest): string[] {
  const problems: string[] = [];
  const at = `manifest "${manifest.id || '(missing id)'}"`;

  if (!ID_PATTERN.test(manifest.id)) {
    problems.push(`${at}: id must be dotted lowercase, e.g. "encoding.base64-encode".`);
  }
  if (!manifest.name?.trim()) problems.push(`${at}: name is required.`);
  if (!SEMVER_PATTERN.test(manifest.version)) {
    problems.push(`${at}: version "${manifest.version}" is not semver-like.`);
  }
  if (!KNOWN_CATEGORIES.has(manifest.category)) {
    problems.push(`${at}: unknown category "${manifest.category}".`);
  }
  if (!manifest.description?.trim()) problems.push(`${at}: description is required.`);
  if (!Array.isArray(manifest.tags)) problems.push(`${at}: tags must be an array.`);

  if (!['main', 'worker', 'wasm-worker'].includes(manifest.runtime)) {
    problems.push(`${at}: unknown runtime "${manifest.runtime}".`);
  }
  if (!['none', 'optional', 'required'].includes(manifest.network)) {
    problems.push(`${at}: network must be none | optional | required.`);
  }
  if (!['local-only', 'local-then-user-initiated-external'].includes(manifest.dataHandling)) {
    problems.push(`${at}: invalid dataHandling value.`);
  }
  if (!['available', 'prototype', 'planned'].includes(manifest.status)) {
    problems.push(`${at}: invalid status.`);
  }
  if (!Number.isInteger(manifest.phase) || manifest.phase < 0) {
    problems.push(`${at}: phase must be a non-negative integer.`);
  }

  for (const port of [...manifest.input, ...manifest.output]) {
    if (!KNOWN_DATA_TYPES.has(port.type)) {
      problems.push(`${at}: unknown port data type "${port.type}".`);
    }
  }

  for (const capability of manifest.capabilities) {
    if (!KNOWN_CAPABILITIES.has(capability)) {
      problems.push(`${at}: unknown capability "${capability}".`);
    }
  }

  if (manifest.runtime !== 'main' && !manifest.capabilities.includes('worker.execute')) {
    problems.push(`${at}: runtime "${manifest.runtime}" requires the "worker.execute" capability.`);
  }
  if (manifest.runtime === 'wasm-worker' && !manifest.capabilities.includes('wasm.execute')) {
    problems.push(`${at}: runtime "wasm-worker" requires the "wasm.execute" capability.`);
  }
  if (manifest.network !== 'none' && !manifest.capabilities.includes('network.direct')) {
    problems.push(`${at}: network "${manifest.network}" requires the "network.direct" capability.`);
  }

  if (manifest.limits) {
    if (!(manifest.limits.maxInputBytes > 0)) problems.push(`${at}: limits.maxInputBytes must be positive.`);
    if (!(manifest.limits.timeoutMs > 0)) problems.push(`${at}: limits.timeoutMs must be positive.`);
  }

  if (manifest.status === 'planned' && manifest.runtime !== 'main' && manifest.capabilities.length === 0) {
    problems.push(`${at}: planned non-main tools must declare their intended capabilities.`);
  }

  const fieldKeys = new Set<string>();
  for (const field of manifest.ui?.fields ?? []) {
    if (!/^[a-z][a-z0-9-]*$/u.test(field.key)) {
      problems.push(`${at}: runner field key "${field.key}" must be lowercase kebab-case.`);
    }
    if (fieldKeys.has(field.key)) {
      problems.push(`${at}: duplicate runner field key "${field.key}".`);
    }
    fieldKeys.add(field.key);
    if (!field.label?.trim()) {
      problems.push(`${at}: runner field "${field.key}" needs a label.`);
    }
    if (field.type === 'select') {
      if (!field.options || field.options.length === 0) {
        problems.push(`${at}: select field "${field.key}" needs at least one option.`);
      } else if (
        field.defaultValue !== undefined &&
        !field.options.some((option) => option.value === field.defaultValue)
      ) {
        problems.push(`${at}: select field "${field.key}" default is not one of its options.`);
      }
    }
  }

  return problems;
}

export function validateCategory(value: string): boolean {
  return isCategoryId(value);
}
