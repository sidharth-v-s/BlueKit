# Phase 4 — Rule Studio: Sigma Validation

Phase 4 starts with a narrow, honest slice: validating Sigma rules in the
browser. Rule Studio is reachable at `#/rules`, from the sidebar, and from the
command palette.

The first slice checks whether a rule is well-formed YAML and whether it matches
the official Sigma detection-rule schema. It does **not** execute the rule,
score it, or claim that a valid rule will detect anything.

## Implemented

| Piece | Behaviour |
|---|---|
| Rule editor | YAML text editor with open-file, example, and clear actions |
| Validate action | Button or `Ctrl`/`Cmd` + `Enter` |
| YAML diagnostics | Parse failures reported with line and column |
| Schema diagnostics | Ajv 2020 errors reported with JSON paths and keywords |
| Rule summary | Title, id, status, level, author, logsource, condition, selections, tags |
| Subset warnings | Correlation, time windows, aggregation, and nested selection maps |
| Schema attribution | Schema title, SHA-256 prefix, and validator versions in the view |

A rule must be a single non-empty YAML document. The editor cap is 1 MiB. The
view reports YAML and schema failures separately and never merges them into a
single “invalid rule” message.

### Validation layers

1. **YAML syntax** — the document cannot be parsed. Schema validation is not
   attempted because there is no reliable object to check.
2. **Schema violation** — the YAML parsed, but the rule does not match the
   vendored Sigma detection-rule schema. Errors keep their instance path and
   keyword.
3. **Subset warning** — the rule is valid but uses a construct that local event
   testing will not cover. Warnings do not change the schema verdict.

The third class belongs to the evaluator, not the validator. Presenting it as a
pass would be false assurance.

## Vendored schema

- Source: [SigmaHQ/sigma-specification](https://github.com/SigmaHQ/sigma-specification)
- File: `json-schema/sigma-detection-rule-schema.json`
- Commit: `ba9251aa834b11a70dbf80836b453dba99c5159e`
- Retrieved: 2026-11-21
- SHA-256: `eb95ddb1bc2503145a6e84511e38990f74fe9a843067065a23d3763457fb2d95`
- Licence: public domain (specification content)

The schema is stored at `src/core/rules/sigma-detection-rule-schema.json`.
Validation runs offline and does not follow an upstream branch at runtime. The
upstream repository also publishes correlation schemas; this slice intentionally
vendors only the detection-rule schema.

## Limits

| Limit | Value | Behaviour |
|---|---|---|
| Rule input | 1 MiB | Larger input is rejected before parsing |
| YAML aliases | 20 | `toJS({ maxAliasCount: 20 })` rejects alias expansion over the cap |
| Nesting depth | 50 | Checked after parsing; deeper documents are rejected |
| Reported issues | 40 | Additional schema or YAML issues are truncated |
| Documents | 1 | Multi-document input is rejected |

These caps protect the main thread. Validation is synchronous once the validator
is loaded; the input cap and Ajv/schema work are small enough that a worker would
add more complexity than isolation.

## Lazy loading and bundle

Ajv, `ajv-formats`, and the schema are loaded with a dynamic import the first
time Rule Studio validates a rule. The catalog tool
`detection.sigma-validator` uses the same dynamic import. Neither the route's
initial chunk nor the application's initial bundle includes the schema.

`src/core/rules/sigma-meta.ts` contains only the limits and attribution metadata
needed for the initial UI, so the view can show the cap and schema fingerprint
without pulling in the validator.

## What this slice does not do

- It does not run Sigma rules against events. A local sample-event subset with
  explicit unsupported-feature reporting is the next slice.
- It does not persist rules. Rule library storage, import/export, and
  attribution remain planned.
- It does not convert rules to backend query languages.
- It does not validate correlation rules against a correlation schema.
- It does not judge detection quality, false-positive rate, or coverage.
- It does not fetch anything. `logsource` is metadata only.

## Testing

`tests/unit/sigma.test.ts` covers:

- a valid rule and its summary;
- YAML errors staying in the YAML layer;
- schema errors keeping paths and keywords;
- multi-document rejection;
- the schema date pattern;
- subset warnings for aggregation;
- the 1 MiB input cap;
- the catalog tool's output and metadata.

Run `npm test` and `npm run check` before changing the validator or schema.
