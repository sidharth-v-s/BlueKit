import { stringify } from 'yaml';

/**
 * Visual Sigma rule builder — common simple patterns only.
 *
 * The builder writes metadata, a logsource, one or more field selections, and a
 * generated condition. It does not replace the YAML editor or the validator:
 * the result is a normal Sigma rule that must still be validated and tested.
 */

export const SIGMA_BUILDER_MODIFIERS = ['equals', 'contains', 'startswith', 'endswith'] as const;
export type SigmaBuilderModifier = (typeof SIGMA_BUILDER_MODIFIERS)[number];

export const SIGMA_BUILDER_MAX_SELECTIONS = 20;
export const SIGMA_BUILDER_MAX_VALUES = 100;
export const SIGMA_BUILDER_MAX_VALUE_LENGTH = 4096;
export const SIGMA_BUILDER_MAX_LIST_ITEMS = 100;
export const SIGMA_BUILDER_MAX_CONDITION_LENGTH = 10_000;
export const SIGMA_BUILDER_MAX_RULE_BYTES = 1024 * 1024;
export const SIGMA_BUILDER_MAX_TITLE_LENGTH = 256;
export const SIGMA_BUILDER_MAX_DESCRIPTION_LENGTH = 65_535;

export interface SigmaBuilderSelection {
  name: string;
  field: string;
  modifier: SigmaBuilderModifier;
  cased: boolean;
  match: 'any' | 'all';
  negate: boolean;
  values: string[];
}

export interface SigmaBuilderLogSource {
  product: string;
  category: string;
  service: string;
  definition: string;
}

export interface SigmaBuilderDraft {
  title: string;
  id: string;
  status: string;
  description: string;
  references: string[];
  author: string;
  date: string;
  tags: string[];
  logsource: SigmaBuilderLogSource;
  selections: SigmaBuilderSelection[];
  match: 'all' | 'any';
  falsepositives: string[];
  level: string;
}

export interface SigmaBuilderResult {
  text: string;
  warnings: string[];
}

export class SigmaBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SigmaBuilderError';
  }
}

const RESERVED_SELECTION_NAMES = new Set(['condition', 'timeframe']);
const SELECTION_NAME_PATTERN = /^[A-Za-z0-9_]+$/u;
const FIELD_NAME_PATTERN = /^[A-Za-z0-9_.@$-]+$/u;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01])$/u;

export function emptySigmaBuilderSelection(index = 1): SigmaBuilderSelection {
  return {
    name: index <= 1 ? 'selection' : `selection_${index}`,
    field: '',
    modifier: 'equals',
    cased: false,
    match: 'any',
    negate: false,
    values: [''],
  };
}

export function emptySigmaBuilderDraft(
  options: { id?: string; date?: string } = {},
): SigmaBuilderDraft {
  return {
    title: '',
    id: options.id ?? '',
    status: 'experimental',
    description: '',
    references: [],
    author: '',
    date: options.date ?? '',
    tags: [],
    logsource: {
      product: 'windows',
      category: 'process_creation',
      service: '',
      definition: '',
    },
    selections: [emptySigmaBuilderSelection(1)],
    match: 'all',
    falsepositives: [],
    level: 'medium',
  };
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanMetadataList(values: readonly string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
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

/**
 * Detection values keep leading and trailing spaces: ` -enc ` is a different
 * match from `-enc`. Only empty strings from blank textarea lines are dropped.
 */
function cleanValues(values: readonly string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    cleaned.push(value);
  }
  return cleaned;
}

/** The YAML field key for a selection, including its modifiers. */
export function sigmaBuilderFieldKey(selection: SigmaBuilderSelection): string {
  const field = selection.field.trim();
  const values = cleanValues(selection.values);
  const parts = [field];
  if (selection.modifier !== 'equals') parts.push(selection.modifier);
  if (selection.match === 'all' && values.length > 1) parts.push('all');
  if (selection.cased) parts.push('cased');
  return parts.join('|');
}

function selectionExpression(names: readonly string[], joiner: 'and' | 'or'): string {
  if (names.length === 1) return names[0] ?? '';
  return `(${names.join(` ${joiner} `)})`;
}

function buildCondition(
  selections: readonly { name: string; negate: boolean }[],
  match: 'all' | 'any',
): string {
  const positives = selections.filter((selection) => !selection.negate).map((selection) => selection.name);
  const negatives = selections.filter((selection) => selection.negate).map((selection) => selection.name);
  if (positives.length === 0) {
    throw new SigmaBuilderError('At least one non-negated selection is required.');
  }

  const positive = selectionExpression(positives, match === 'any' ? 'or' : 'and');
  if (negatives.length === 0) return positive;
  const negative =
    negatives.length === 1 ? `not ${negatives[0]}` : `not (${negatives.join(' or ')})`;
  return `${positive} and ${negative}`;
}

function buildLogSource(logsource: SigmaBuilderLogSource): Record<string, string> {
  const built: Record<string, string> = {};
  for (const key of ['category', 'product', 'service', 'definition'] as const) {
    const value = cleanText(logsource[key]);
    if (value.length > 0) built[key] = value;
  }
  return built;
}

export function buildSigmaRule(draft: SigmaBuilderDraft): SigmaBuilderResult {
  const title = cleanText(draft.title);
  if (title.length === 0) throw new SigmaBuilderError('A rule title is required.');
  if (title.length > SIGMA_BUILDER_MAX_TITLE_LENGTH) {
    throw new SigmaBuilderError(
      `The title exceeds the ${SIGMA_BUILDER_MAX_TITLE_LENGTH} character limit.`,
    );
  }

  const description = cleanText(draft.description);
  if (description.length > SIGMA_BUILDER_MAX_DESCRIPTION_LENGTH) {
    throw new SigmaBuilderError('The description exceeds the 65,535 character limit.');
  }

  const date = cleanText(draft.date);
  if (date.length > 0 && !DATE_PATTERN.test(date)) {
    throw new SigmaBuilderError('The date must use YYYY-MM-DD.');
  }

  const logsource = buildLogSource(draft.logsource);
  if (!logsource.category && !logsource.product && !logsource.service) {
    throw new SigmaBuilderError('Set at least one of logsource category, product, or service.');
  }

  if (!Array.isArray(draft.selections) || draft.selections.length === 0) {
    throw new SigmaBuilderError('Add at least one selection.');
  }
  if (draft.selections.length > SIGMA_BUILDER_MAX_SELECTIONS) {
    throw new SigmaBuilderError(
      `A rule can have at most ${SIGMA_BUILDER_MAX_SELECTIONS} selections in the builder.`,
    );
  }

  const names = new Set<string>();
  const detection: Record<string, unknown> = {};
  const conditionSelections: { name: string; negate: boolean }[] = [];

  for (const selection of draft.selections) {
    const name = cleanText(selection.name);
    if (name.length === 0) throw new SigmaBuilderError('Every selection needs a name.');
    if (!SELECTION_NAME_PATTERN.test(name)) {
      throw new SigmaBuilderError(
        `Selection name "${name}" must use only letters, digits, and underscores.`,
      );
    }
    if (RESERVED_SELECTION_NAMES.has(name.toLowerCase())) {
      throw new SigmaBuilderError(`Selection name "${name}" is reserved.`);
    }
    if (names.has(name)) throw new SigmaBuilderError(`Duplicate selection name "${name}".`);
    names.add(name);

    const field = cleanText(selection.field);
    if (field.length === 0) throw new SigmaBuilderError(`Selection "${name}" needs a field.`);
    if (!FIELD_NAME_PATTERN.test(field)) {
      throw new SigmaBuilderError(
        `Field "${field}" must use only letters, digits, dots, underscores, @, $, and hyphens.`,
      );
    }
    if (!SIGMA_BUILDER_MODIFIERS.includes(selection.modifier)) {
      throw new SigmaBuilderError(`Unsupported modifier "${String(selection.modifier)}".`);
    }

    const values = cleanValues(selection.values);
    if (values.length === 0) throw new SigmaBuilderError(`Selection "${name}" needs at least one value.`);
    if (values.length > SIGMA_BUILDER_MAX_VALUES) {
      throw new SigmaBuilderError(
        `Selection "${name}" exceeds the ${SIGMA_BUILDER_MAX_VALUES} value limit.`,
      );
    }
    for (const value of values) {
      if (value.length > SIGMA_BUILDER_MAX_VALUE_LENGTH) {
        throw new SigmaBuilderError(
          `A value in "${name}" exceeds the ${SIGMA_BUILDER_MAX_VALUE_LENGTH} character limit.`,
        );
      }
    }

    detection[name] = {
      [sigmaBuilderFieldKey(selection)]: values.length === 1 ? values[0] : values,
    };
    conditionSelections.push({ name, negate: selection.negate === true });
  }

  const condition = buildCondition(conditionSelections, draft.match === 'any' ? 'any' : 'all');
  if (condition.length > SIGMA_BUILDER_MAX_CONDITION_LENGTH) {
    throw new SigmaBuilderError('The generated condition is too long.');
  }
  detection.condition = condition;

  const references = cleanMetadataList(draft.references);
  const tags = cleanMetadataList(draft.tags);
  const falsepositives = cleanMetadataList(draft.falsepositives);
  if (references.length > SIGMA_BUILDER_MAX_LIST_ITEMS) {
    throw new SigmaBuilderError(`At most ${SIGMA_BUILDER_MAX_LIST_ITEMS} references are allowed.`);
  }
  if (tags.length > SIGMA_BUILDER_MAX_LIST_ITEMS) {
    throw new SigmaBuilderError(`At most ${SIGMA_BUILDER_MAX_LIST_ITEMS} tags are allowed.`);
  }
  if (falsepositives.length > SIGMA_BUILDER_MAX_LIST_ITEMS) {
    throw new SigmaBuilderError(
      `At most ${SIGMA_BUILDER_MAX_LIST_ITEMS} false positives are allowed.`,
    );
  }

  const rule: Record<string, unknown> = { title };
  const id = cleanText(draft.id);
  const status = cleanText(draft.status);
  const author = cleanText(draft.author);
  const level = cleanText(draft.level);
  if (id) rule.id = id;
  if (status) rule.status = status;
  if (description) rule.description = description;
  if (references.length > 0) rule.references = references;
  if (author) rule.author = author;
  if (date) rule.date = date;
  if (tags.length > 0) rule.tags = tags;
  rule.logsource = logsource;
  rule.detection = detection;
  if (falsepositives.length > 0) rule.falsepositives = falsepositives;
  if (level) rule.level = level;

  let text = stringify(rule, { lineWidth: 0, indent: 2 });
  if (!text.endsWith('\n')) text += '\n';

  if (new TextEncoder().encode(text).byteLength > SIGMA_BUILDER_MAX_RULE_BYTES) {
    throw new SigmaBuilderError('The generated rule exceeds the 1 MiB editor limit.');
  }

  const warnings: string[] = [];
  if (!id) warnings.push('No rule id. Add one before sharing or importing.');
  if (!author) warnings.push('No author.');
  if (!description) warnings.push('No description.');

  return { text, warnings };
}
