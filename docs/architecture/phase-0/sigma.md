# Sigma Validation and Local Test Subset

**Status:** validation verified · evaluator subset designed, not shipped · 2026-11-20

## Question

Can BlueKit validate Sigma rules against the official schema and test a useful subset locally, without pretending to be a full SIEM?

## Decision

- **Validate against the official SigmaHQ JSON Schema** using Ajv 2020.
- **Parse YAML with the `yaml` package.**
- Implement a **documented local test subset** with explicit unsupported-feature reporting.
- Keep Sigma Studio `planned` for Phase 4; Phase 0 only proves the validation path.

## Evidence

Spike inputs:

- engine: `ajv` 8.x (2020 dialect), `yaml` 2.x;
- schema: `https://raw.githubusercontent.com/SigmaHQ/sigma-specification/main/json-schema/sigma-detection-rule-schema.json`.

Observed:

- a well-formed rule validated successfully;
- a rule missing the required `detection` block was rejected with a schema path;
- YAML parse errors were distinguishable from schema errors;
- validation runs synchronously and fast enough for editor feedback.

The exact schema file must be **vendored and versioned** in Phase 4. Fetching it at runtime would add a network dependency and make validation non-reproducible.

## Validation model

Two separate failure classes, shown separately:

1. **YAML syntax** — the document is not parseable.
2. **Schema violation** — parseable, but not a valid Sigma rule.

A third class belongs to the evaluator, not the validator:

3. **Unsupported feature** — valid Sigma, but outside BlueKit's documented test subset.

Conflating these produces useless error messages. The UI must say which layer failed.

## Proposed local test subset

The evaluator is for **rule authoring feedback on sample events**, not for replaying production telemetry. It should support:

| Feature | Subset behavior |
|---|---|
| `logsource` | Displayed and used as metadata; not used to route events. |
| `detection.selection` maps | Field equality and simple modifiers. |
| String lists | OR within a field; AND across fields in one selection. |
| `contains`, `startswith`, `endswith` | Supported. |
| `all` / `any` on a selection | Supported with documented semantics. |
| `condition` | Boolean combinations of selection names, `and`/`or`/`not`, parentheses. |
| `1 of`, `all of` | Supported for named selections where unambiguous. |
| Wildcards | Explicitly limited; document `*`/`?` behavior or reject. |
| Regex modifiers | Rejected or opt-in with a warning; never silently ignored. |
| `near`, `timeframe`, aggregation | **Unsupported** in the first subset. |
| Correlations / multiple log sources | **Unsupported.** |
| Backend-specific pipelines | **Unsupported.** |

Every unsupported construct must produce a visible warning and a non-result. A green "test passed" on a rule that was only partially evaluated is a false assurance.

## Product rules

- **The official schema is the source of truth.** Do not maintain a hand-written approximation.
- **Vendor the schema and record its commit/version.** Validation must work offline.
- **Show the failing JSON path.** "Invalid rule" is not actionable.
- **Keep test events local.** No telemetry is uploaded.
- **Label results as "local test", not "detection verified".** A match on a sample event proves the subset evaluator ran; it does not prove the rule is good.
- **Report coverage.** State which parts of the rule were evaluated and which were skipped.

## Phase 4 deliverables

1. Vendor the schema with a checksum and attribution.
2. Pin `ajv` and `yaml`; add licence notices.
3. Build a rule editor with YAML diagnostics and schema diagnostics separated.
4. Implement the subset evaluator with a conformance test suite.
5. Add fixtures: good rules, schema-invalid rules, and unsupported-feature rules.
6. Add import/export with attribution and rule-collection metadata.

## Residual risk

- Sigma's schema evolves. A vendored schema needs a deliberate update process, not an automatic pull.
- YAML anchors and aliases can expand unexpectedly; enforce size and depth limits.
- Regex evaluation can be pathological; use a timeout and avoid unbounded backtracking.
- "Sigma-compatible" means different things to different backends. BlueKit must name the subset, not claim universal compatibility.

## Sources

- Sigma specification: <https://github.com/SigmaHQ/sigma-specification>
- JSON Schema: <https://raw.githubusercontent.com/SigmaHQ/sigma-specification/main/json-schema/sigma-detection-rule-schema.json>
- `ajv` (MIT), `yaml` (ISC).
