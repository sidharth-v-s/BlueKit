# ATT&CK tag data

Rule Studio's ATT&CK tag picker uses a vendored, versioned snapshot of MITRE
ATT&CK Enterprise. It does not fetch technique data at runtime and does not
update itself.

## Snapshot

| Field | Value |
|---|---|
| Domain | Enterprise |
| ATT&CK version | 20.1 |
| Retrieved | 2026-11-24 |
| Source | [mitre-attack/attack-stix-data](https://github.com/mitre-attack/attack-stix-data) |
| Source path | `enterprise-attack/enterprise-attack.json` |
| Source SHA-256 | `539a843a7b53ed9749740b2123dddae3726b1a4831841c32aca740b011b910b5` |
| Bundled file | `src/core/rules/attack-enterprise.json` |
| Tactics | 15 |
| Active techniques | 706 (479 sub-techniques) |

The bundled file keeps only what the picker needs: tactic id, name, and short
name; technique id, name, tactic short names, and a sub-technique marker.
Revoked and deprecated techniques are omitted. Descriptions, mitigations,
detections, groups, software, and references are not included.

## Regenerating

```sh
curl -o /tmp/enterprise-attack.json \
  https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json
node scripts/build-attack-data.mjs /tmp/enterprise-attack.json
```

The script records the collection version, retrieval date, source path, and
source SHA-256. It rejects a missing collection version, duplicate technique
ids, and techniques that reference unknown tactics. Review the diff and update
the table above and `THIRD_PARTY_NOTICES.md` when the snapshot changes.

## Tags

Sigma ATT&CK tags use the lower-case `attack.` prefix:

- technique `T1059.001` becomes `attack.t1059.001`;
- tactic `execution` becomes `attack.execution`.

The picker shows the current tags, all 15 tactics, and a searchable technique
list. Search matches technique ids, names, and tactic short names; the tactic
filter narrows the list. Adding a tag appends it; adding a tag that is already
present is disabled. Removing a tag deletes it from the working list. Nothing
is written to the rule until **Apply to rule**.

Apply rewrites the `tags` list through the YAML Document editor. Other fields,
detection blocks, and comments are preserved. Empty tags remove the `tags` key.
The picker enforces 100 tags per rule and refuses to add beyond that. As with
the other editors, Apply is blocked when the rule text changed after the picker
loaded.

The tag picker is not a coverage or detection-quality judgement. A tag says
that a rule is associated with a technique; it does not prove the rule detects
that technique.

## Scope and limits

- Enterprise only. Mobile ATT&CK and ICS ATT&CK are not bundled.
- The snapshot ages. There is no update check and no network request.
- Techniques are identified by the ATT&CK external id. A renumbered or merged
  technique is not migrated automatically.
- The picker writes tags; it does not validate that an existing custom tag is
  meaningful, and it does not resolve ATT&CK relationships.
- There is no ATT&CK Navigator layer export.
- The dataset is a derived copy, not the full STIX bundle. See
  `THIRD_PARTY_NOTICES.md` for the MITRE copyright designation and licence.

## Testing

`tests/unit/attack.test.ts` covers:

- dataset version, provenance, checksum shape, unique ids, and tactic
  references;
- search ranking, name/id/tactic matching, tactic filters, and result limits;
- tag construction, description, tactic-id aliases, and unknown tags;
- tag merging, trimming, the 100-tag cap, and removal;
- defensive normalization of malformed tactics and techniques.
