# Phase 4 — Rule Studio: Sigma Validation, Local Testing, and Library

Phase 4 starts with two honest slices. Sigma Rule Studio at `#/rules` validates
rules and tests a documented subset against sample events in the browser. YARA
Studio at `#/yara` compiles YARA rules with the pinned YARA-X WebAssembly build
and scans local files in the tool worker. Both are reachable from the sidebar and
the command palette.

The Sigma slice checks whether a rule is well-formed YAML, whether it matches the
official Sigma detection-rule schema, and how the subset evaluator behaves on
pasted JSON events. Rules can be saved locally, imported, exported, and kept with
source/licence attribution. The YARA slice reports the engine's compile results
and matches, with explicit limits and no network access. Neither slice scores a
rule, replays production telemetry, or claims that one matching sample proves the
detection works.

## Implemented

| Piece | Behaviour |
|---|---|
| Rule editor | YAML text editor with open-file, example, and clear actions |
| YAML formatting | Document-based reformat with a two-space indent; detection, key order, and comments are kept |
| Metadata editor | Title, ID, status, description, references, author, date, modified, logsource, false positives, level, and tags |
| Validate action | Button or `Ctrl`/`Cmd` + `Enter` |
| YAML diagnostics | Parse failures reported with line and column |
| Schema diagnostics | Ajv 2020 errors reported with JSON paths and keywords |
| Rule summary | Title, id, status, level, author, logsource, condition, selections, tags |
| Subset warnings | Correlation, time windows, aggregation, and nested selection maps |
| Schema attribution | Schema title, SHA-256 prefix, and validator versions in the view |
| Local test | Documented evaluator subset over one event or an array of events |
| Test results | Per-event match state, matched selections, unsupported-feature failures |
| Rule library | Local save/update/delete, search, stored revision snapshots with diffs and restore, and load back into the editor |
| Collections and favourites | Named rule collections and a star list, both stored locally and included in archives |
| Import/export | Single YAML rules and versioned `bluekit.rules` bundles with attribution |
| YARA Studio | See [YARA Studio](yara.md): YARA-X compile validation, local multi-file scan, snippets, progress/cancel, export |

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

## Formatting and metadata editing

**Format** parses the rule into a `yaml` Document and writes the same document
back with a two-space indent, no line folding, and one trailing newline.
Detection blocks, key order, scalar quoting, unknown fields, and comments stay
in the document. Formatting is idempotent. It refuses empty input, invalid YAML,
multi-document input, a non-mapping top level, and input over 1 MiB.

**Metadata** opens a form for the fields in §8.4 of the specification: title,
ID, status, description, references, author, date, modified, logsource, false
positives, level, and tags. Apply re-parses the current editor text and writes
only those keys. Detection, custom keys, and all other fields are untouched.
Empty fields remove their key; list entries are trimmed, de-duplicated, and
written one per line.

- Applying is blocked when the editor changed after the form was loaded. Reload
  the form so stale values cannot overwrite newer edits.
- Detection is not edited structurally. Field maps, modifiers, and conditions
  stay in the YAML editor.
- A comment attached to a field survives when the field is rewritten. Removing
  a field drops comments attached to its value; a leading comment moves to the
  next key where possible. Rewriting a list keeps the field comment but not
  per-item comments.
- Both actions clear the validation report because the rule text changed. Run
  Validate again to check the result.

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

## Rule library, import, and export

Saved rules live in the existing `rules` IndexedDB store. They are included in
the normal BlueKit archive export/import path, so a workspace backup already
carries the library. When IndexedDB is unavailable, the adapter falls back to
memory and the view shows a `session only` badge: rules work until the tab
closes and should be exported first.

Saving:

- **Save rule** creates a local record with a local id.
- **Save changes** updates the loaded record, keeps its id and creation time,
  increments `revision`, and refreshes `updatedAt`.
- Each save also stores a snapshot in the `ruleRevisions` store. Snapshots are
  keyed by rule id and revision, capped at 50 per rule, and pruned oldest first.
- Saving a draft with schema issues is allowed. The record keeps `schemaValid`
  so the library can label it `schema issues` rather than pretending it passed.
- Deleting is confirmed and removes the local record and its snapshots.

Revision history:

- **History** in the library lists stored snapshots newest first, with the
  revision number, recording time, content size, and title.
- **Diff** shows a unified line diff from the selected snapshot to the current
  working content. It is the same line-diff implementation as the Phase 2
  comparison tool.
- **Restore** saves the snapshot's content and metadata as a new revision; it
  does not rewrite or delete existing snapshots. The confirmation states that
  unsaved editor content is replaced.
- Snapshots are recorded from this build onward. A record saved before revision
  history existed has no earlier snapshot and cannot be rolled back to one.
- Revision snapshots are included in the archive. Archive schema version 2 adds
  the `ruleRevisions` store; version 1 archives remain readable.

Collections and favourites:

- A **collection** is a named list of local rule ids stored in
  `ruleCollections`. Names are trimmed, limited to 120 characters, and unique
  case-insensitively. The library allows 100 collections and 500 rules per
  collection.
- Select a collection chip to filter the library. **Add** and **Remove** on a
  rule change membership of the selected collection.
- **Favourites** is a flat rule-id list stored in the existing `favorites`
  store under `ruleIds`, separate from tool favourites. The star on a rule
  toggles it; the Favourites chip filters to starred rules.
- Deleting a rule removes it from every collection and the favourite list.
  Deleting a collection removes only the collection; its rules stay in the
  library.
- Collections and favourites are included in the archive. Imported collections
  can reference rules that are not present locally; the view counts only rules
  that exist, and missing ids are ignored rather than treated as errors.

Importing:

- A single `.yml` or `.yaml` file is validated for metadata and stored as an
  imported draft with the filename as its source and `Unknown` as its licence.
  The UI asks the analyst to review source and licence before trusting it.
- A `.json` file is read as a `bluekit.rules` bundle (format
  `bluekit.rules`, schema version 1, `dataHandling: local-only`).
- Import never overwrites an existing record. Every imported rule receives a
  fresh local id; the Sigma `id` inside the YAML is preserved as metadata.
- Bundle limits are 500 rules and 8 MiB. Content is still capped at the 1 MiB
  rule limit.

Exporting:

- **Export** downloads one `.yml` file with attribution and validation comments
  prepended. YAML documents that start with a `%YAML` directive are exported
  unchanged so the directive remains first.
- **Export all** downloads a `bluekit.rules` JSON bundle. Export fails rather
  than silently truncating when the library exceeds the bundle limits.
- Archives and bundles are local files. Nothing is uploaded.

Attribution records `source`, optional `url`, `license`, `importedAt`, and a
note. It is metadata, not a verification or redistribution guarantee.

Known limits:

- Revision history stores content snapshots, not a full audit trail of every
  keystroke. Snapshots exist only for explicit saves made by this build.
- Collections have a name but no description editor, ordering, nesting, or bulk
  add. Membership is changed one rule at a time.
- Favourites are a flat list, not a separate entity with notes or ordering.
- Imported bundle records are not validated against the schema at import time;
  validation happens when a rule is saved from the editor or checked manually.

## Lazy loading and bundle

Ajv, `ajv-formats`, and the schema are loaded with a dynamic import the first
time Rule Studio validates a rule. The catalog tool
`detection.sigma-validator` uses the same dynamic import. The local evaluator is
loaded on the first test run, and the `yaml` Document editor is loaded on the
first format or metadata action. Neither the route's initial chunk nor the
application's initial bundle includes the schema, evaluator, or editor.

`src/core/rules/sigma-meta.ts` contains only the limits and attribution metadata
needed for the initial UI, so the view can show the cap and schema fingerprint
without pulling in the validator.

## YARA Studio

YARA Studio mirrors the same honesty rules for a different engine. See the
dedicated [YARA Studio notes](yara.md) for the engine contract, feature matrix,
limits, and test coverage. In short:

- compilation and scanning run in the tool worker;
- the YARA-X WASM module is a dynamic worker import and is never part of startup;
- rules and bytes never leave the browser;
- the engine timeout is best effort and the worker budget is the hard stop;
- matches name the engine and version and keep the original engine messages.

YARA rules are exported as source files from the editor. A persistent YARA rule
library, collections, revisions, and diffs are not implemented yet.

## What this slice does not do

- It does not replay production telemetry, schedule tests, or route events by
  logsource. Only pasted sample events are evaluated.
- It does not edit detection blocks or conditions through the metadata form.
  Those stay in the YAML editor, and formatting never changes their meaning.
- It does not yet provide logsource/field reference helpers, a detection
  condition helper, an ATT&CK tag picker, or a visual rule builder.
- It does not import repository-wide rule packs in one operation or resolve
  Sigma includes.
- It does not convert rules to backend query languages.
- It does not validate correlation rules against a correlation schema.
- It does not judge detection quality, false-positive rate, or coverage.
- It does not fetch anything. `logsource` is metadata only.
- It does not provide a YARA rule library, YARA syntax highlighting, or YARA
  collections and revision diffs yet.
- It does not scan archives, directories, process memory, or anything other than
  user-selected files.

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

`tests/unit/sigma-edit.test.ts` covers:

- formatting indentation, idempotence, CRLF input, and comment preservation;
- rejection of empty, invalid, multi-document, non-mapping, and over-limit input;
- metadata reads for scalars, lists, dates, and logsource;
- metadata writes that preserve detection, unknown keys, and comments;
- field removal, nested logsource updates, list trimming, and no-op detection;
- leading, trailing, and list-field comment preservation.

`tests/unit/sigma-evaluator.test.ts` covers:

- case-insensitive field matching and selection combination;
- `all`/`any` field lists and keyword-list OR semantics;
- boolean conditions, wildcards, and `1 of`/`all of`/`them`;
- the `cased` modifier;
- visible failures for unknown modifiers, aggregation, time windows, and `near`;
- unknown selections and malformed conditions;
- event count and object-shape limits;
- `logsource` remaining metadata.

`tests/unit/rule-library.test.ts` covers:

- record creation, metadata normalization, revisions, and attribution;
- storage listing, deletion, and ignoring malformed persisted records;
- bundle round-trips with fresh ids and preserved attribution;
- malformed and over-limit bundle rejection;
- single-rule attribution headers and safe filenames.

`tests/unit/rule-revisions.test.ts` covers:

- snapshot creation, overwrite, ordering, scoping, and the 50-revision cap;
- deletion of one rule's snapshots without touching another rule;
- ignoring malformed or foreign snapshots;
- restore creating a new working revision with old content and metadata;
- unified diffs between a snapshot and the current content;
- no-difference diffs and cross-rule rejection.

`tests/unit/rule-collections.test.ts` covers:

- collection creation, name normalization, duplicate rejection, and sorting;
- malformed persisted collections being ignored;
- idempotent add/remove and the per-collection rule cap;
- rename, delete, and removing a deleted rule from every collection;
- favourite round-trips, toggling, malformed entries, and separation from the
  tool favourites key.

`tests/unit/yara.test.ts`, `tests/unit/yara-job.test.ts`, and
`tests/unit/yara-engine.test.ts` cover the YARA source/file caps, import notes,
job normalization, result truncation and previews, and the real pinned WASM
build. See [YARA Studio](yara.md) for the fixture list.

Run `npm test` and `npm run check` before changing the validator, evaluator,
library, YARA engine, or schema.
