#!/usr/bin/env node
/**
 * Build the vendored Sigma logsource, field, and modifier reference.
 *
 * Usage:
 *   node scripts/build-sigma-reference.mjs <taxonomy.md> <modifiers.md>
 *
 * Both inputs are from https://github.com/SigmaHQ/sigma-specification, whose
 * content is public domain. The output keeps the logsource table rows, the
 * field lists from the taxonomy appendices, and the modifier list. It is
 * reference data for authoring; it is not a converter or a validator.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [taxonomyPath, modifiersPath] = process.argv.slice(2);
if (!taxonomyPath || !modifiersPath) {
  console.error('Usage: node scripts/build-sigma-reference.mjs <taxonomy.md> <modifiers.md>');
  process.exit(1);
}

const taxonomySource = readFileSync(resolve(taxonomyPath));
const modifiersSource = readFileSync(resolve(modifiersPath));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const taxonomy = taxonomySource.toString('utf8');
const modifiersText = modifiersSource.toString('utf8');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sectionBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) fail(`Missing section: ${start}`);
  const bodyStart = startIndex + start.length;
  const endIndex = end ? text.indexOf(end, bodyStart) : -1;
  return endIndex < 0 ? text.slice(bodyStart) : text.slice(bodyStart, endIndex);
}

function splitRow(line) {
  // Protect escaped pipes before splitting the markdown row.
  const protectedLine = line.replaceAll('\\|', '\u0000');
  const cells = protectedLine.split('|').map((cell) => cell.replaceAll('\u0000', '|').trim());
  if (cells[0] === '') cells.shift();
  if (cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function cleanCell(value) {
  return value
    .replaceAll('<br>', '\n')
    .replaceAll(/\s*\n\s*/gu, '\n')
    .trim();
}

function parseLogSourceCell(value) {
  const entry = { product: '', category: '', service: '', definition: '' };
  for (const part of value.split(/<br\s*\/?>/u)) {
    const match = /^(category|product|service|definition):\s*(.+)$/u.exec(part.trim());
    if (match) entry[match[1]] = match[2].trim().toLowerCase().replaceAll(' ', '_');
  }
  return entry;
}

function tableRows(section) {
  const lines = section.split(/\r?\n/u);
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    if (!line.trimStart().startsWith('|')) {
      inTable = false;
      continue;
    }
    const cells = splitRow(line);
    if (cells.length < 3) continue;
    if (cells[0] === 'Product' && cells[1] === 'Logsource') {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (cells.every((cell) => /^-+$/u.test(cell.replaceAll(':', '').trim()))) continue;
    rows.push(cells);
  }
  return rows;
}

const versionMatch = /- Version ([0-9.]+)\s*\n- Release date (\d{4}-\d{2}-\d{2})/u.exec(taxonomy);
if (!versionMatch) fail('Could not read the taxonomy version and release date.');

const logSources = [];
const seenLogSources = new Set();
for (const sectionName of ['## Log Sources', '## Network Events']) {
  const section = sectionBetween(taxonomy, sectionName, sectionName === '## Log Sources' ? '## Fields' : '## Fields');
  for (const [product, logsource, description] of tableRows(section)) {
    const entry = parseLogSourceCell(logsource);
    if (!entry.product && !entry.category && !entry.service) continue;
    const key = `${entry.product}|${entry.category}|${entry.service}`;
    if (seenLogSources.has(key)) continue;
    seenLogSources.add(key);
    logSources.push({
      product: entry.product,
      category: entry.category,
      service: entry.service,
      description: cleanCell(description),
    });
  }
}
logSources.sort((left, right) =>
  `${left.category}|${left.product}|${left.service}`.localeCompare(
    `${right.category}|${right.product}|${right.service}`,
  ),
);

const fields = [];
const fieldKeys = new Set();
function addField(field) {
  const name = field.name.trim();
  if (!name) return;
  const normalized = {
    name,
    description: (field.description ?? '').trim(),
    example: (field.example ?? '').trim(),
    categories: field.categories ?? [],
    products: field.products ?? [],
    services: field.services ?? [],
  };
  const key = `${name}|${normalized.categories.join(',')}|${normalized.products.join(',')}|${normalized.services.join(',')}`;
  if (fieldKeys.has(key)) return;
  fieldKeys.add(key);
  fields.push(normalized);
}

// Process-creation field table.
const processSection = sectionBetween(taxonomy, '#### Process Creation Events', '#### Other Generic Rule Categories');
const processLines = processSection.split(/\r?\n/u);
let inProcessTable = false;
for (const line of processLines) {
  if (!line.trimStart().startsWith('|')) {
    inProcessTable = false;
    continue;
  }
  const cells = splitRow(line);
  if (cells[0] === 'Field Name' && cells[1] === 'Example Value') {
    inProcessTable = true;
    continue;
  }
  if (!inProcessTable || cells.length < 2) continue;
  if (cells.every((cell) => /^-+$/u.test(cell.trim()))) continue;
  addField({
    name: cells[0],
    example: cells[1],
    description: cells[2] ?? '',
    categories: ['process_creation'],
  });
}

// Bullet-list field sections.
function parseFieldBullets(section, { serviceMode = false } = {}) {
  let selector = null;
  for (const line of section.split(/\r?\n/u)) {
    const heading = /^- `(category|product|service): ([^`]+)`/u.exec(line);
    if (heading) {
      selector = { kind: heading[1], value: heading[2].trim().toLowerCase() };
      continue;
    }
    if (!selector) continue;
    if (/^\s+- `service: /u.test(line)) continue;
    if (serviceMode) {
      const match = /^\s+- ([A-Za-z0-9_.-]+)\s*:\s*(.*)$/u.exec(line);
      if (match && !match[1].startsWith('Field')) {
        addField({
          name: match[1],
          description: match[2],
          categories: ['network'],
          services: [selector.value],
        });
      }
      continue;
    }

    const backticked = line.match(/^\s+- ((?:`[^`]+`(?:,\s*)?)+)/u);
    if (!backticked) continue;
    const names = [...backticked[1].matchAll(/`([^`]+)`/gu)].map((match) => match[1]);
    const description = line.slice(backticked[0].length).replace(/^:\s*/u, '');
    for (const name of names) {
      if (name.includes(':')) continue;
      addField({
        name,
        description,
        categories: selector.kind === 'category' ? [selector.value] : [],
        products: selector.kind === 'product' ? [selector.value] : [],
      });
    }
  }
}

const specificSection = sectionBetween(taxonomy, '### Specific', '### Network category');
parseFieldBullets(specificSection);
const networkSection = sectionBetween(taxonomy, '### Network category', '## History');
parseFieldBullets(networkSection, { serviceMode: true });

fields.sort((left, right) => left.name.localeCompare(right.name));

const modifiers = [];
const seenModifiers = new Set();
let modifierGroup = '';
for (const line of modifiersText.split(/\r?\n/u)) {
  const heading = /^### (.+)$/u.exec(line);
  if (heading) {
    modifierGroup = heading[1].trim();
    continue;
  }
  const item = /^- `([^`]+)`:\s*(.*)$/u.exec(line);
  if (!item) continue;
  const name = item[1].trim();
  if (name.length === 0 || seenModifiers.has(name)) continue;
  seenModifiers.add(name);
  modifiers.push({
    name,
    group: modifierGroup,
    description: item[2].trim(),
  });
}

if (logSources.length === 0) fail('No logsource rows were parsed.');
if (fields.length === 0) fail('No field rows were parsed.');
if (modifiers.length === 0) fail('No modifiers were parsed.');

const dataset = {
  schemaVersion: 1,
  specVersion: versionMatch[1],
  released: versionMatch[2],
  retrieved: new Date().toISOString().slice(0, 10),
  source: 'https://github.com/SigmaHQ/sigma-specification',
  sourcePath: 'specification/sigma-appendix-taxonomy.md',
  sourceSha256: sha256(taxonomySource),
  modifiersPath: 'specification/sigma-appendix-modifiers.md',
  modifiersSha256: sha256(modifiersSource),
  license: 'Public domain; see THIRD_PARTY_NOTICES.md',
  logSources,
  fields,
  modifiers,
};

const outputPath = resolve('src/core/rules/sigma-reference.json');
writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`);

console.log(
  `Wrote ${logSources.length} logsources, ${fields.length} fields, and ${modifiers.length} modifiers for Sigma ${dataset.specVersion} to ${outputPath}`,
);
console.log(`Taxonomy SHA-256: ${dataset.sourceSha256}`);
console.log(`Modifiers SHA-256: ${dataset.modifiersSha256}`);
