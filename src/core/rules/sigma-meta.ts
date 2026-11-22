/**
 * Lightweight Sigma metadata.
 *
 * Kept separate from the validator so views can enforce limits, show schema
 * attribution, and type their state without pulling Ajv and the vendored schema
 * into the initial bundle.
 */

export const SIGMA_SCHEMA_SOURCE = {
  title: 'Sigma rule specification V2.0.0 (2024-08-08)',
  upstream: 'https://github.com/SigmaHQ/sigma-specification',
  path: 'json-schema/sigma-detection-rule-schema.json',
  commit: 'ba9251aa834b11a70dbf80836b453dba99c5159e',
  retrievedAt: '2026-11-21',
  sha256: 'eb95ddb1bc2503145a6e84511e38990f74fe9a843067065a23d3763457fb2d95',
  license: 'Public domain (Sigma specification)',
} as const;

export const SIGMA_MAX_INPUT_BYTES = 1024 * 1024;
export const SIGMA_MAX_DEPTH = 50;
export const SIGMA_MAX_ISSUES = 40;
