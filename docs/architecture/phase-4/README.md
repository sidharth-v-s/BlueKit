# Phase 4 — Rule Studio: Sigma Validation and Local Testing

Phase 4 starts with a narrow, honest slice: validating Sigma rules and testing a
documented subset against sample events in the browser. Rule Studio is reachable
at `#/rules`, from the sidebar, and from the command palette.

The slice checks whether a rule is well-formed YAML, whether it matches the
official Sigma detection-rule schema, and how the subset evaluator behaves on
pasted JSON events. It does **not** score the rule, replay production telemetry,
or claim that a matching sample proves the detection works.

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
| Local test | Documented evaluator subset over one event or an array of events |
| Test results | Per-event match state, matched selections, unsupported-feature failures |

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
| Sample events | 500 | Larger samples are rejected before evaluation |
| Sample JSON | 2 MiB | Larger samples are rejected before parsing |
| Condition tokens | 2,000 | Longer conditions are rejected before evaluation |
| Selections | 200 | Larger rules are rejected before evaluation |

These caps protect the main thread. Validation is synchronous once the validator
is loaded; the input cap and Ajv/schema work are small enough that a worker would
add more complexity than isolation.

## Local test subset

The evaluator answers one narrow question: under this documented subset, does the
rule's condition match these sample events? A match proves that the evaluator ran
the supported constructs. It does not prove the detection is correct, complete,
or useful.

Supported constructs:

| Construct | Subset behaviour |
|---|---|
| Field equality | Case-insensitive by default; numeric and boolean values compare as strings |
| Field lists | OR within a field; `|all` requires every listed value to match |
| `contains`, `startswith`, `endswith` | Substring or prefix/suffix matching |
| `cased` | Disables case folding for that field |
| Wildcards | `*` and `?` in values; case-folded unless `cased` |
| Keyword-list selections | OR across the strings, searching every scalar leaf in the event |
| Boolean conditions | `and`, `or`, `not`, and parentheses |
| Quantifiers | `1 of`, `any of`, `all of` with selection names, `*` wildcards, or `them` |
| Dotted fields | Exact top-level key first, then nested object traversal |

Constructs outside the subset produce a visible failure with a feature name and
location. They are never skipped silently:

- regex or other unknown field modifiers;
- aggregation (`count`, `sum`, `min`, `max`, `avg`) and other condition pipelines;
- `near` and `timeframe`;
- correlation rules;
- nested maps inside field lists or keyword lists.

Additional semantics:

- Missing fields do not match ordinary values. A `null` keyword matches a null or
  missing value in this subset.
- `logsource` is displayed as metadata and never used to filter or route events.
- Sample events must be JSON objects. A single object is treated as one event.
- Results carry the evaluator version and warnings that restate the limits above.

The view labels every result as local, authoring feedback. It does not use the
words “detection verified” or “test passed”.

## Lazy loading and bundle

Ajv, `ajv-formats`, and the schema are loaded with a dynamic import the first
time Rule Studio validates a rule. The catalog tool
`detection.sigma-validator` uses the same dynamic import. The local evaluator is
loaded on the first test run. Neither the route's initial chunk nor the
application's initial bundle includes the schema or the evaluator.

`src/core/rules/sigma-meta.ts` contains only the limits and attribution metadata
needed for the initial UI, so the view can show the cap and schema fingerprint
without pulling in the validator.

## What this slice does not do

- It does not replay production telemetry, schedule tests, or route events by
  logsource. Only pasted sample events are evaluated.
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

`tests/unit/sigma-evaluator.test.ts` covers:

- case-insensitive field matching and selection combination;
- `all`/`any` field lists and keyword-list OR semantics;
- boolean conditions, wildcards, and `1 of`/`all of`/`them`;
- the `cased` modifier;
- visible failures for unknown modifiers, aggregation, time windows, and `near`;
- unknown selections and malformed conditions;
- event count and object-shape limits;
- `logsource` remaining metadata.

Run `npm test` and `npm run check` before changing the validator, evaluator, or
schema.
