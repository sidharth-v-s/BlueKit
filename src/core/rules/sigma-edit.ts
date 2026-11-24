import { isMap, isNode, isScalar, parseDocument, YAMLMap, type Document } from 'yaml';
import { SIGMA_MAX_INPUT_BYTES } from './sigma-meta';

/**
 * Sigma YAML formatting and metadata editing.
 *
 * Both operations parse the rule into a YAML Document and stringify that same
 * document. Detection blocks, unknown fields, key order, and comments stay in
 * the document; only the requested metadata keys are written. Nothing here
 * validates the rule against the Sigma schema.
 */

export const SIGMA_METADATA_FIELDS = [
  'title',
  'id',
  'status',
  'description',
  'references',
  'author',
  'date',
  'modified',
  'logsource',
  'falsepositives',
  'level',
  'tags',
] as const;

export const SIGMA_STATUS_VALUES = [
  'stable',
  'test',
  'experimental',
  'deprecated',
  'unsupported',
] as const;

export const SIGMA_LEVEL_VALUES = ['informational', 'low', 'medium', 'high', 'critical'] as const;

export type SigmaStatus = (typeof SIGMA_STATUS_VALUES)[number];
export type SigmaLevel = (typeof SIGMA_LEVEL_VALUES)[number];

export interface SigmaLogsourceDraft {
  product: string;
  category: string;
  service: string;
  definition: string;
}

export interface SigmaMetadataDraft {
  title: string;
  id: string;
  status: string;
  description: string;
  author: string;
  date: string;
  modified: string;
  level: string;
  references: string[];
  falsepositives: string[];
  tags: string[];
  logsource: SigmaLogsourceDraft;
}

export interface SigmaMetadataPatch {
  title?: string;
  id?: string;
  status?: string;
  description?: string;
  author?: string;
  date?: string;
  modified?: string;
  level?: string;
  references?: readonly string[];
  falsepositives?: readonly string[];
  tags?: readonly string[];
  logsource?: Partial<SigmaLogsourceDraft>;
}

export interface SigmaEditResult {
  text: string;
  changed: boolean;
}

export class SigmaEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SigmaEditError';
  }
}

const LOGSOURCE_KEYS = ['product', 'category', 'service', 'definition'] as const;
const LIST_KEYS = ['references', 'falsepositives', 'tags'] as const;

function emptyLogsource(): SigmaLogsourceDraft {
  return { product: '', category: '', service: '', definition: '' };
}

export function emptySigmaMetadata(): SigmaMetadataDraft {
  return {
    title: '',
    id: '',
    status: '',
    description: '',
    author: '',
    date: '',
    modified: '',
    level: '',
    references: [],
    falsepositives: [],
    tags: [],
    logsource: emptyLogsource(),
  };
}

function formatYamlFailure(error: unknown): string {
  const record = error as {
    message?: string;
    linePos?: Array<{ line: number; col: number }>;
  };
  const position = record.linePos?.[0];
  const where = position ? ` at line ${position.line}, column ${position.col}` : '';
  const message = record.message?.split('\n')[0] ?? 'The YAML document could not be parsed.';
  return `${message}${where}`;
}

function parseRuleDocument(text: string): Document.Parsed {
  if (text.trim().length === 0) {
    throw new SigmaEditError('The editor is empty.');
  }
  if (new TextEncoder().encode(text).byteLength > SIGMA_MAX_INPUT_BYTES) {
    throw new SigmaEditError(
      `The rule exceeds the ${SIGMA_MAX_INPUT_BYTES / 1024} KiB editing limit.`,
    );
  }

  let document: Document.Parsed;
  try {
    document = parseDocument(text.replace(/\r\n?/gu, '\n'), {
      prettyErrors: true,
      strict: false,
    });
  } catch (error) {
    throw new SigmaEditError(formatYamlFailure(error));
  }

  if (document.errors.length > 0) {
    throw new SigmaEditError(formatYamlFailure(document.errors[0]));
  }
  if (document.contents === null || document.contents === undefined) {
    throw new SigmaEditError('The editor is empty.');
  }
  if (!isMap(document.contents)) {
    throw new SigmaEditError('A Sigma rule must be a YAML mapping at the top level.');
  }
  return document;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function scalarText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function readList(value: unknown): string[] {
  if (typeof value === 'string') {
    const single = value.trim();
    return single.length > 0 ? [single] : [];
  }
  if (!Array.isArray(value)) return [];
  return value.map(scalarText).filter((item) => item.length > 0);
}

function readLogsource(value: unknown): SigmaLogsourceDraft {
  const logsource = emptyLogsource();
  if (!isRecord(value)) return logsource;
  for (const key of LOGSOURCE_KEYS) {
    logsource[key] = scalarText(value[key]);
  }
  return logsource;
}

function readPlain(document: Document.Parsed): Record<string, unknown> {
  try {
    const data = document.toJS({ maxAliasCount: 20 });
    return isRecord(data) ? data : {};
  } catch (error) {
    throw new SigmaEditError(formatYamlFailure(error));
  }
}

/** Read the editable metadata from a rule without changing the text. */
export function readSigmaMetadata(text: string): SigmaMetadataDraft {
  const data = readPlain(parseRuleDocument(text));
  return {
    title: scalarText(data.title),
    id: scalarText(data.id),
    status: scalarText(data.status),
    description: scalarText(data.description),
    author: scalarText(data.author),
    date: scalarText(data.date),
    modified: scalarText(data.modified),
    level: scalarText(data.level),
    references: readList(data.references),
    falsepositives: readList(data.falsepositives),
    tags: readList(data.tags),
    logsource: readLogsource(data.logsource),
  };
}

function cleanList(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const item = value.trim();
    if (item.length === 0 || seen.has(item)) continue;
    seen.add(item);
    cleaned.push(item);
  }
  return cleaned;
}

function findPair(map: YAMLMap, key: string) {
  return map.items.find((pair) => isScalar(pair.key) && pair.key.value === key) ?? null;
}

/**
 * Delete a mapping key without discarding its leading comment. The comment
 * moves to the next key, or to the end of the map when the deleted key was
 * last. Comments attached to the removed value itself go with the value.
 */
function deleteMapKey(map: YAMLMap, key: string): void {
  const index = map.items.findIndex((pair) => isScalar(pair.key) && pair.key.value === key);
  if (index < 0) return;
  const removed = map.items[index];
  const comment = removed && isScalar(removed.key) ? removed.key.commentBefore : null;
  map.items.splice(index, 1);
  if (!comment) return;

  const next = map.items[index];
  if (next && isScalar(next.key)) {
    next.key.commentBefore = next.key.commentBefore
      ? `${comment}\n${next.key.commentBefore}`
      : comment;
  } else {
    map.comment = map.comment ? `${comment}\n${map.comment}` : comment;
  }
}

function deleteKey(document: Document.Parsed, key: string): void {
  const map = document.contents;
  if (isMap(map)) {
    deleteMapKey(map, key);
  } else {
    document.delete(key);
  }
}

function writeScalar(document: Document.Parsed, key: string, value: string | undefined): void {
  if (value === undefined) return;
  const cleaned = value.trim();
  if (cleaned.length === 0) {
    deleteKey(document, key);
    return;
  }
  document.set(key, cleaned);
}

function writeList(
  document: Document.Parsed,
  key: (typeof LIST_KEYS)[number],
  values: readonly string[] | undefined,
): void {
  if (values === undefined) return;
  const cleaned = cleanList(values);
  if (cleaned.length === 0) {
    deleteKey(document, key);
    return;
  }

  const map = document.contents;
  const previous = isMap(map) ? findPair(map, key) : null;
  const comment = previous && isNode(previous.value) ? previous.value.comment : null;
  const commentBefore = previous && isNode(previous.value) ? previous.value.commentBefore : null;

  const node = document.createNode(cleaned);
  if (isNode(node)) {
    if (comment) node.comment = comment;
    if (commentBefore) node.commentBefore = commentBefore;
    document.set(key, node);
    return;
  }
  document.set(key, cleaned);
}

function writeLogsource(
  document: Document.Parsed,
  patch: Partial<SigmaLogsourceDraft> | undefined,
): void {
  if (patch === undefined) return;
  const existing = document.get('logsource');
  const hasValue = LOGSOURCE_KEYS.some((key) => (patch[key] ?? '').trim().length > 0);

  if (!isMap(existing)) {
    if (!hasValue) return;
    document.set('logsource', new YAMLMap());
  }

  const logsource = document.get('logsource');
  if (!isMap(logsource)) return;

  for (const key of LOGSOURCE_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    const cleaned = value.trim();
    if (cleaned.length === 0) {
      deleteMapKey(logsource, key);
    } else {
      document.setIn(['logsource', key], cleaned);
    }
  }

  if (logsource.items.length === 0) {
    deleteKey(document, 'logsource');
  }
}

function stringify(document: Document.Parsed): string {
  const text = document.toString({ indent: 2, lineWidth: 0, minContentWidth: 0 });
  return text.endsWith('\n') ? text : `${text}\n`;
}

/**
 * Reformat the YAML while keeping the document's data, comments, and key
 * order. The result is idempotent.
 */
export function formatSigmaRule(text: string): string {
  return stringify(parseRuleDocument(text));
}

/**
 * Write metadata fields onto the current rule. Omitted fields are left alone;
 * an empty string or list removes that key. Detection, unknown fields, and
 * comments are not touched.
 */
export function updateSigmaMetadata(text: string, patch: SigmaMetadataPatch): SigmaEditResult {
  const document = parseRuleDocument(text);

  writeScalar(document, 'title', patch.title);
  writeScalar(document, 'id', patch.id);
  writeScalar(document, 'status', patch.status);
  writeScalar(document, 'description', patch.description);
  writeScalar(document, 'author', patch.author);
  writeScalar(document, 'date', patch.date);
  writeScalar(document, 'modified', patch.modified);
  writeScalar(document, 'level', patch.level);
  writeList(document, 'references', patch.references);
  writeList(document, 'falsepositives', patch.falsepositives);
  writeList(document, 'tags', patch.tags);
  writeLogsource(document, patch.logsource);

  const next = stringify(document);
  return { text: next, changed: next !== text };
}

/** Split a textarea value into list entries, one per line. */
export function metadataListFromText(text: string): string[] {
  return cleanList(text.split(/\r?\n/u));
}

export const SIGMA_MAX_CONDITION_LENGTH = 10_000;

export type SigmaConditionJoiner = 'and' | 'or';

export interface SigmaConditionDraft {
  condition: string;
  selections: string[];
  hasDetection: boolean;
}

export interface SigmaConditionPreset {
  id: string;
  label: string;
  expression: string;
}

/** Read the detection condition and the selection names around it. */
export function readSigmaCondition(text: string): SigmaConditionDraft {
  const document = parseRuleDocument(text);
  const detection = document.get('detection');
  if (!isMap(detection)) {
    return { condition: '', selections: [], hasDetection: false };
  }

  const selections: string[] = [];
  for (const pair of detection.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== 'string') continue;
    const name = pair.key.value;
    if (name === 'condition' || name === 'timeframe') continue;
    selections.push(name);
  }

  return {
    condition: scalarText(detection.get('condition')),
    selections,
    hasDetection: true,
  };
}

/**
 * Write `detection.condition` and leave every selection untouched. An empty
 * condition is rejected because the schema requires one.
 */
export function updateSigmaCondition(text: string, condition: string): SigmaEditResult {
  const cleaned = condition.trim();
  if (cleaned.length === 0) {
    throw new SigmaEditError('A detection condition cannot be empty.');
  }
  if (cleaned.length > SIGMA_MAX_CONDITION_LENGTH) {
    throw new SigmaEditError(
      `The condition exceeds the ${SIGMA_MAX_CONDITION_LENGTH.toLocaleString()} character limit.`,
    );
  }

  const document = parseRuleDocument(text);
  const detection = document.get('detection');
  if (!isMap(detection)) {
    throw new SigmaEditError('The rule has no detection map to update.');
  }

  document.setIn(['detection', 'condition'], cleaned);
  const next = stringify(document);
  return { text: next, changed: next !== text };
}

function sharedSelectionPrefix(names: readonly string[]): string {
  if (names.length < 2) return '';
  let prefix = names[0] ?? '';
  for (const name of names.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < name.length && prefix[index] === name[index]) {
      index += 1;
    }
    prefix = prefix.slice(0, index);
    if (prefix.length === 0) return '';
  }
  const cut = prefix.lastIndexOf('_');
  return cut > 0 ? prefix.slice(0, cut + 1) : '';
}

/**
 * Preset conditions built from the current selection names. The expressions
 * are plain Sigma conditions; this function does not judge their quality.
 */
export function sigmaConditionPresets(selections: readonly string[]): SigmaConditionPreset[] {
  const names = [...new Set(selections.map((name) => name.trim()).filter(Boolean))];
  if (names.length === 0) return [];

  const presets: SigmaConditionPreset[] = [
    { id: 'all', label: 'All selections', expression: names.join(' and ') },
    { id: 'any', label: 'Any selection', expression: names.join(' or ') },
  ];

  if (names.length > 1) {
    presets.push({ id: 'one-of-them', label: 'One of them', expression: '1 of them' });
    presets.push({ id: 'all-of-them', label: 'All of them', expression: 'all of them' });
  }

  const prefix = sharedSelectionPrefix(names);
  if (prefix) {
    presets.push({
      id: 'one-of-prefix',
      label: `One of ${prefix}*`,
      expression: `1 of ${prefix}*`,
    });
    presets.push({
      id: 'all-of-prefix',
      label: `All of ${prefix}*`,
      expression: `all of ${prefix}*`,
    });
  }

  return presets;
}

function isFullyParenthesized(text: string): boolean {
  if (!text.startsWith('(') || !text.endsWith(')')) return false;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth < 0 || (depth === 0 && index < text.length - 1)) return false;
    }
  }
  return depth === 0;
}

/**
 * Append a selection to the condition with an explicit joiner. A compound
 * condition is parenthesized first so the new joiner cannot change how the
 * existing expression binds.
 */
export function appendSigmaSelection(
  condition: string,
  selection: string,
  joiner: SigmaConditionJoiner,
): string {
  const name = selection.trim();
  if (name.length === 0) return condition.trim();
  const base = condition.trim();
  if (base.length === 0) return name;
  const wrapped = /\s/u.test(base) && !isFullyParenthesized(base) ? `(${base})` : base;
  return `${wrapped} ${joiner} ${name}`;
}

