#!/usr/bin/env node
/**
 * Build the vendored ATT&CK Enterprise technique dataset.
 *
 * Usage:
 *   node scripts/build-attack-data.mjs /path/to/enterprise-attack.json
 *
 * The input is the MITRE ATT&CK STIX 2.1 bundle from
 * https://github.com/mitre-attack/attack-stix-data. The output is a compact,
 * versioned subset for the Sigma ATT&CK tag picker: tactics plus active
 * techniques with their tactic short names. Revoked and deprecated techniques
 * are omitted.
 *
 * The output is a derived copy of ATT&CK. Keep the MITRE copyright and licence
 * designation in THIRD_PARTY_NOTICES.md with the data.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/build-attack-data.mjs /path/to/enterprise-attack.json');
  process.exit(1);
}

const inputPath = resolve(input);
const source = readFileSync(inputPath);
const sourceSha256 = createHash('sha256').update(source).digest('hex');

let bundle;
try {
  bundle = JSON.parse(source.toString('utf8'));
} catch (error) {
  console.error(`Could not parse ${inputPath}: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(bundle.objects)) {
  console.error('The STIX bundle has no objects array.');
  process.exit(1);
}

const collection = bundle.objects.find((object) => object.type === 'x-mitre-collection');
if (!collection || typeof collection.x_mitre_version !== 'string') {
  console.error('The STIX bundle has no ATT&CK collection version.');
  process.exit(1);
}

const externalId = (object) =>
  object.external_references?.find((reference) => reference.source_name === 'mitre-attack')
    ?.external_id ?? null;

const tactics = bundle.objects
  .filter((object) => object.type === 'x-mitre-tactic')
  .map((object) => ({
    id: externalId(object),
    name: object.name,
    shortName: object.x_mitre_shortname,
  }))
  .filter((tactic) => tactic.id && tactic.name && tactic.shortName)
  .sort((left, right) => left.name.localeCompare(right.name));

const techniques = bundle.objects
  .filter(
    (object) =>
      object.type === 'attack-pattern' && !object.revoked && !object.x_mitre_deprecated,
  )
  .map((object) => ({
    id: externalId(object),
    name: object.name,
    tactics: (object.kill_chain_phases ?? []).map((phase) => phase.phase_name),
    subtechnique: Boolean(object.x_mitre_is_subtechnique),
  }))
  .filter(
    (technique) =>
      technique.id &&
      technique.name &&
      Array.isArray(technique.tactics) &&
      technique.tactics.length > 0,
  )
  .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

const ids = new Set();
for (const technique of techniques) {
  if (ids.has(technique.id)) {
    console.error(`Duplicate technique id: ${technique.id}`);
    process.exit(1);
  }
  ids.add(technique.id);
}

const knownTactics = new Set(tactics.map((tactic) => tactic.shortName));
for (const technique of techniques) {
  for (const tactic of technique.tactics) {
    if (!knownTactics.has(tactic)) {
      console.error(`Technique ${technique.id} references unknown tactic ${tactic}`);
      process.exit(1);
    }
  }
}

const dataset = {
  schemaVersion: 1,
  attackVersion: collection.x_mitre_version,
  retrieved: new Date().toISOString().slice(0, 10),
  source: 'https://github.com/mitre-attack/attack-stix-data',
  sourcePath: 'enterprise-attack/enterprise-attack.json',
  sourceSha256,
  license: 'MITRE ATT&CK terms; see THIRD_PARTY_NOTICES.md',
  tactics,
  techniques,
};

const outputPath = resolve('src/core/rules/attack-enterprise.json');
writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`);

console.log(
  `Wrote ${techniques.length} techniques and ${tactics.length} tactics for ATT&CK v${dataset.attackVersion} to ${outputPath}`,
);
console.log(`Source SHA-256: ${sourceSha256}`);
