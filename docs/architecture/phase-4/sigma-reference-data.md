# Sigma logsource and field reference data

Rule Studio's Sigma reference panel uses a vendored snapshot of the public
Sigma specification appendices. It does not fetch the specification at runtime
and does not update itself.

## Snapshot

| Field | Value |
|---|---|
| Specification version | 2.1.0 |
| Released | 2025-08-02 |
| Retrieved | 2026-11-24 |
| Source | [SigmaHQ/sigma-specification](https://github.com/SigmaHQ/sigma-specification) |
| Taxonomy path | `specification/sigma-appendix-taxonomy.md` |
| Modifiers path | `specification/sigma-appendix-modifiers.md` |
| Taxonomy SHA-256 | `e072d8be52883261ec0b576f650fb9f197970f8ab6dc56eab7800791e67e7aaa` |
| Modifiers SHA-256 | `7ea44004dd65899d3d0d65658311bfc8736c1df68b42029d70a3a209a4a79c6a` |
| Bundled file | `src/core/rules/sigma-reference.json` |
| Logsource rows | 140 |
| Fields | 99 |
| Modifiers | 28 |

The bundled file keeps the logsource table rows (`product`, `category`,
`service`, `description`), the taxonomy field lists with their selector
dimensions, and the modifier names, groups, and descriptions. It contains no
rule text. The Sigma specification content is public domain; see
`THIRD_PARTY_NOTICES.md`.

## Regenerating

```sh
curl -o /tmp/sigma-appendix-taxonomy.md \
  https://raw.githubusercontent.com/SigmaHQ/sigma-specification/main/specification/sigma-appendix-taxonomy.md
curl -o /tmp/sigma-appendix-modifiers.md \
  https://raw.githubusercontent.com/SigmaHQ/sigma-specification/main/specification/sigma-appendix-modifiers.md
node scripts/build-sigma-reference.mjs \
  /tmp/sigma-appendix-taxonomy.md /tmp/sigma-appendix-modifiers.md
```

The script records the specification version, release date, retrieval date,
source paths, and both checksums. It rejects a missing version or empty parse
results. Review the diff and update the table above and
`THIRD_PARTY_NOTICES.md` when the snapshot changes.

## What the reference covers

### Log sources

The panel lists the taxonomy rows and lets the author filter by product,
category, and service, or search all four fields. **Use** writes the selected
`product`, `category`, and `service` values to `logsource` through the YAML
Document editor. Keys absent from the selected row are cleared, while an
existing `definition` is left alone. **Fields** opens the field list for that
logsource without changing the rule.

The reference is a snapshot, not a closed vocabulary. A logsource value that is
absent from the snapshot is not treated as invalid. Sigma rules can use values
that the taxonomy does not list, and BlueKit does not reject them.

### Fields

The taxonomy lists fields for process creation, proxy, firewall, webserver,
antivirus, and network connection/DNS log sources. The panel shows the field
name, its selector scope, and its description or example. It can filter by
category or by a selected logsource. A field matches a logsource only when every
selector dimension on the field matches; for example, network DNS fields do not
appear for network connection events.

Many log sources have no field list in the taxonomy. The panel says so instead
of inventing one. Windows Security, for example, follows Windows event-log
attribute names, but the vendored appendix does not enumerate them.

### Modifiers

The panel lists the standardized modifiers with their group and description. It
marks each one as **local test** or **author only**:

- local test: `all`, `any`, `cased`, `contains`, `endswith`, `startswith`;
- author only: every other modifier, including `re`, `base64`, `windash`,
  `cidr`, numeric comparisons, time extraction, `expand`, and `fieldref`.

`any` is accepted by the local subset evaluator but is not in the specification
appendix's modifier list. The other supported modifiers are in both places.
Author-only does not mean invalid: it means the local test evaluator rejects
the construct with a visible diagnostic instead of pretending it ran.

## Scope and limits

- The snapshot ages. There is no update check and no network request.
- The reference does not validate a rule. Validation uses the official schema;
  this panel is authoring help.
- The panel does not autocomplete inside the YAML editor. Names are copied to
  the clipboard or written through the logsource action.
- Field lists are only what the taxonomy appendix provides. They are not a
  per-product event schema.
- The panel does not convert rules, expand placeholders, or resolve backend
  pipelines.
- Applying a logsource is blocked when the rule text changed after the panel
  loaded.

## Testing

`tests/unit/sigma-reference.test.ts` covers:

- specification version, provenance, and both checksums;
- unique logsource keys and usable field and modifier counts;
- search ranking, exact filters, result limits, and known values;
- field matching by category, product, and service, including network
  connection versus DNS;
- field search, description, and limits;
- the local-test modifier subset and modifier search;
- defensive normalization of malformed rows.
