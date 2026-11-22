import { parseAllDocuments } from 'yaml';
import { SIGMA_MAX_INPUT_BYTES } from './sigma-meta';

/**
 * Sigma local test evaluator — documented subset only.
 *
 * This is authoring feedback, not detection verification. The evaluator does
 * not route by logsource, expand includes, aggregate, or evaluate regexes. When
 * a rule uses a construct outside the subset, the result is a visible failure,
 * never a silent pass.
 */

export const SIGMA_MAX_EVENTS = 500;
export const SIGMA_MAX_EVENTS_BYTES = 2 * 1024 * 1024;
export const SIGMA_EVALUATOR_VERSION = 'sigma-subset 0.1.0';

const ALLOWED_MODIFIERS = new Set(['contains', 'startswith', 'endswith', 'all', 'any', 'cased']);
const MAX_LEAF_VALUES = 500;
const MAX_LEAF_DEPTH = 12;
const MAX_SELECTIONS = 200;
const MAX_CONDITION_TOKENS = 2_000;

export interface SigmaTestUnsupported {
  feature: string;
  location: string;
  message: string;
}

export interface SigmaTestEventResult {
  index: number;
  matched: boolean;
  matchedSelections: string[];
  selectionResults: Record<string, boolean>;
}

export interface SigmaTestSuccess {
  ok: true;
  eventCount: number;
  matchedCount: number;
  events: SigmaTestEventResult[];
  selections: string[];
  condition: string;
  warnings: string[];
  evaluator: string;
}

export interface SigmaTestFailure {
  ok: false;
  error: string;
  unsupported: SigmaTestUnsupported[];
  evaluator: string;
}

export type SigmaTestResult = SigmaTestSuccess | SigmaTestFailure;

type Scalar = string | number | boolean | null;

interface FieldCheck {
  field: string;
  modifiers: Set<string>;
  values: Scalar[];
}

type SelectionModel =
  | { kind: 'fields'; checks: FieldCheck[] }
  | { kind: 'keywords'; values: Scalar[] };

interface RuleModel {
  condition: string;
  selections: Map<string, SelectionModel>;
}

interface BuildSuccess {
  ok: true;
  model: RuleModel;
}

interface BuildFailure {
  ok: false;
  error: string;
  unsupported: SigmaTestUnsupported[];
}

type BuildResult = BuildSuccess | BuildFailure;

type ConditionNode =
  | { kind: 'ref'; name: string }
  | { kind: 'not'; child: ConditionNode }
  | { kind: 'and'; left: ConditionNode; right: ConditionNode }
  | { kind: 'or'; left: ConditionNode; right: ConditionNode }
  | { kind: 'quant'; mode: 'one' | 'all' | 'any'; selector: string };

type Token =
  | { kind: 'ident'; value: string }
  | { kind: 'and' }
  | { kind: 'or' }
  | { kind: 'not' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isScalar(value: unknown): value is Scalar {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function unsupported(
  list: SigmaTestUnsupported[],
  feature: string,
  location: string,
  message: string,
): void {
  list.push({ feature, location, message });
}

function tokenize(input: string): Token[] | string {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (char === undefined) break;
    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }
    if (char === '(') {
      tokens.push({ kind: 'lparen' });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ kind: 'rparen' });
      index += 1;
      continue;
    }
    const match = /^[A-Za-z0-9_.*?-]+/u.exec(input.slice(index));
    if (!match) return `Unexpected character "${char}" in the condition.`;
    const word = match[0];
    const lower = word.toLowerCase();
    if (lower === 'and') tokens.push({ kind: 'and' });
    else if (lower === 'or') tokens.push({ kind: 'or' });
    else if (lower === 'not') tokens.push({ kind: 'not' });
    else tokens.push({ kind: 'ident', value: word });
    if (tokens.length > MAX_CONDITION_TOKENS) {
      return `The condition exceeds the ${MAX_CONDITION_TOKENS}-token local test limit.`;
    }
    index += word.length;
  }
  return tokens;
}

function parseCondition(
  condition: string,
  selectionNames: string[],
): { ok: true; node: ConditionNode } | { ok: false; error: string; unsupported: SigmaTestUnsupported[] } {
  const tokenized = tokenize(condition);
  if (typeof tokenized === 'string') {
    return { ok: false, error: tokenized, unsupported: [] };
  }
  const tokens: Token[] = tokenized;
  if (tokens.length === 0) {
    return { ok: false, error: 'The condition is empty.', unsupported: [] };
  }

  const failures: SigmaTestUnsupported[] = [];
  let position = 0;

  function peek(): Token | undefined {
    return tokens[position];
  }

  function isIdent(token: Token | undefined, value: string): boolean {
    return token?.kind === 'ident' && token.value.toLowerCase() === value;
  }

  function parseOr(): ConditionNode | null {
    let left = parseAnd();
    if (!left) return null;
    while (peek()?.kind === 'or') {
      position += 1;
      const right = parseAnd();
      if (!right) return null;
      left = { kind: 'or', left, right };
    }
    return left;
  }

  function parseAnd(): ConditionNode | null {
    let left = parseNot();
    if (!left) return null;
    while (peek()?.kind === 'and') {
      position += 1;
      const right = parseNot();
      if (!right) return null;
      left = { kind: 'and', left, right };
    }
    return left;
  }

  function parseNot(): ConditionNode | null {
    if (peek()?.kind === 'not') {
      position += 1;
      const child = parseNot();
      if (!child) return null;
      return { kind: 'not', child };
    }
    return parsePrimary();
  }

  function parsePrimary(): ConditionNode | null {
    const token = peek();
    if (!token) {
      failures.push({
        feature: 'condition',
        location: condition,
        message: 'The condition ends unexpectedly.',
      });
      return null;
    }
    if (token.kind === 'lparen') {
      position += 1;
      const inner = parseOr();
      if (!inner) return null;
      if (peek()?.kind !== 'rparen') {
        failures.push({
          feature: 'condition',
          location: condition,
          message: 'A closing parenthesis is missing.',
        });
        return null;
      }
      position += 1;
      return inner;
    }
    if (token.kind === 'ident') {
      const lower = token.value.toLowerCase();
      const next = tokens[position + 1];
      if (isIdent(next, 'of')) {
        position += 2;
        const selectorToken = peek();
        if (selectorToken?.kind !== 'ident') {
          failures.push({
            feature: 'condition',
            location: condition,
            message: `"${token.value} of" must be followed by a selection name or wildcard.`,
          });
          return null;
        }
        position += 1;
        if (lower === '1') return { kind: 'quant', mode: 'one', selector: selectorToken.value };
        if (lower === 'all') return { kind: 'quant', mode: 'all', selector: selectorToken.value };
        if (lower === 'any') return { kind: 'quant', mode: 'any', selector: selectorToken.value };
        failures.push({
          feature: 'quantifier',
          location: condition,
          message: `"${token.value} of" is outside the supported subset; use "1 of", "any of", or "all of".`,
        });
        return null;
      }
      if (lower === 'of') {
        failures.push({
          feature: 'condition',
          location: condition,
          message: '"of" must be part of "1 of", "any of", or "all of".',
        });
        return null;
      }
      position += 1;
      return { kind: 'ref', name: token.value };
    }
    failures.push({
      feature: 'condition',
      location: condition,
      message: 'The condition contains an unexpected token.',
    });
    return null;
  }

  const node = parseOr();
  if (!node) {
    return {
      ok: false,
      error: failures[0]?.message ?? 'The condition could not be parsed.',
      unsupported: failures,
    };
  }
  if (position !== tokens.length) {
    return {
      ok: false,
      error: 'The condition has trailing tokens that were not understood.',
      unsupported: [],
    };
  }

  const unknown = new Set<string>();
  const visit = (current: ConditionNode): void => {
    if (current.kind === 'ref') {
      if (!selectionNames.includes(current.name)) unknown.add(current.name);
    } else if (current.kind === 'not') {
      visit(current.child);
    } else if (current.kind === 'and' || current.kind === 'or') {
      visit(current.left);
      visit(current.right);
    } else if (current.kind === 'quant') {
      const resolved =
        current.selector === 'them'
          ? selectionNames
          : selectionNames.filter((name) =>
              wildcardMatch(name.toLowerCase(), current.selector.toLowerCase()),
            );
      if (resolved.length === 0) unknown.add(current.selector);
    }
  };
  visit(node);
  if (unknown.size > 0) {
    return {
      ok: false,
      error: `The condition references unknown selection${unknown.size === 1 ? '' : 's'}: ${[...unknown].join(', ')}.`,
      unsupported: [],
    };
  }

  return { ok: true, node };
}

function wildcardMatch(value: string, pattern: string): boolean {
  let valueIndex = 0;
  let patternIndex = 0;
  let starIndex = -1;
  let matchIndex = 0;

  while (valueIndex < value.length) {
    const patternChar = pattern[patternIndex];
    if (patternChar === '?' || (patternChar !== undefined && patternChar !== '*' && patternChar === value[valueIndex])) {
      valueIndex += 1;
      patternIndex += 1;
    } else if (patternChar === '*') {
      starIndex = patternIndex;
      matchIndex = valueIndex;
      patternIndex += 1;
    } else if (starIndex !== -1) {
      patternIndex = starIndex + 1;
      matchIndex += 1;
      valueIndex = matchIndex;
    } else {
      return false;
    }
  }
  while (pattern[patternIndex] === '*') patternIndex += 1;
  return patternIndex === pattern.length;
}

function hasWildcard(value: string): boolean {
  return value.includes('*') || value.includes('?');
}

function lookupField(event: Record<string, unknown>, field: string): { found: boolean; value: unknown } {
  if (Object.prototype.hasOwnProperty.call(event, field)) {
    return { found: true, value: event[field] };
  }
  const parts = field.split('.');
  let current: unknown = event;
  for (const part of parts) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { found: false, value: undefined };
    }
    current = current[part];
  }
  return { found: true, value: current };
}

function flattenValues(value: unknown, out: Scalar[], depth = 0): void {
  if (out.length >= MAX_LEAF_VALUES || depth > MAX_LEAF_DEPTH) return;
  if (isScalar(value)) {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenValues(item, out, depth + 1);
    return;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) flattenValues(item, out, depth + 1);
  }
}

function scalarMatches(
  keyword: Scalar,
  eventValue: unknown,
  modifiers: Set<string>,
  cased: boolean,
): boolean {
  if (keyword === null) return eventValue === null || eventValue === undefined;
  if (eventValue === null || eventValue === undefined) return false;
  if (!isScalar(eventValue)) return false;

  let needle = String(keyword);
  let haystack = String(eventValue);
  if (!cased) {
    needle = needle.toLowerCase();
    haystack = haystack.toLowerCase();
  }

  if (modifiers.has('contains')) {
    if (hasWildcard(needle)) return wildcardMatch(haystack, `*${needle}*`);
    return haystack.includes(needle);
  }
  if (modifiers.has('startswith')) {
    if (hasWildcard(needle)) return wildcardMatch(haystack, `${needle}*`);
    return haystack.startsWith(needle);
  }
  if (modifiers.has('endswith')) {
    if (hasWildcard(needle)) return wildcardMatch(haystack, `*${needle}`);
    return haystack.endsWith(needle);
  }
  if (hasWildcard(needle)) return wildcardMatch(haystack, needle);
  return haystack === needle;
}

function matchFieldCheck(event: Record<string, unknown>, check: FieldCheck): boolean {
  const { found, value } = lookupField(event, check.field);
  const leafValues: unknown[] = [];
  if (Array.isArray(value)) {
    for (const item of value) leafValues.push(item);
  } else if (found) {
    leafValues.push(value);
  } else {
    leafValues.push(undefined);
  }

  const cased = check.modifiers.has('cased');
  const requireAll = check.modifiers.has('all');
  const keywordMatches = (keyword: Scalar): boolean =>
    leafValues.some((leaf) => scalarMatches(keyword, leaf, check.modifiers, cased));

  return requireAll ? check.values.every(keywordMatches) : check.values.some(keywordMatches);
}

function matchKeywordSelection(event: Record<string, unknown>, values: Scalar[]): boolean {
  const leaves: Scalar[] = [];
  flattenValues(event, leaves);
  return values.some((keyword) => {
    if (keyword === null) return leaves.some((leaf) => leaf === null);
    const needle = String(keyword).toLowerCase();
    return leaves.some((leaf) => {
      if (leaf === null) return false;
      const haystack = String(leaf).toLowerCase();
      return hasWildcard(needle) ? wildcardMatch(haystack, `*${needle}*`) : haystack.includes(needle);
    });
  });
}

function buildSelection(
  name: string,
  raw: unknown,
  failures: SigmaTestUnsupported[],
  errorRef: { message: string | null },
): SelectionModel | null {
  if (Array.isArray(raw)) {
    const values: Scalar[] = [];
    for (const item of raw) {
      if (!isScalar(item)) {
        unsupported(
          failures,
          'keyword-list-object',
          `detection.${name}`,
          'Objects inside keyword lists are outside the local test subset.',
        );
        return null;
      }
      values.push(item);
    }
    if (values.length === 0) {
      errorRef.message = `Selection "${name}" is empty.`;
      return null;
    }
    return { kind: 'keywords', values };
  }

  if (!isRecord(raw)) {
    errorRef.message = `Selection "${name}" must be a map or a list.`;
    return null;
  }

  const checks: FieldCheck[] = [];
  for (const [fieldSpec, rawValue] of Object.entries(raw)) {
    const parts = fieldSpec.split('|');
    const field = parts[0] ?? '';
    if (field.length === 0) {
      errorRef.message = `Selection "${name}" has an empty field name.`;
      return null;
    }
    const modifiers = new Set(parts.slice(1).map((modifier) => modifier.toLowerCase()));
    for (const modifier of modifiers) {
      if (!ALLOWED_MODIFIERS.has(modifier)) {
        unsupported(
          failures,
          `modifier:${modifier}`,
          `detection.${name}.${fieldSpec}`,
          `The "${modifier}" modifier is outside the local test subset.`,
        );
        return null;
      }
    }

    const values: Scalar[] = [];
    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        if (!isScalar(item)) {
          unsupported(
            failures,
            'nested-value',
            `detection.${name}.${fieldSpec}`,
            'Nested maps inside field lists are outside the local test subset.',
          );
          return null;
        }
        values.push(item);
      }
    } else if (isScalar(rawValue)) {
      values.push(rawValue);
    } else {
      unsupported(
        failures,
        'nested-value',
        `detection.${name}.${fieldSpec}`,
        'Nested maps as field values are outside the local test subset.',
      );
      return null;
    }

    if (values.length === 0) {
      errorRef.message = `Field "${fieldSpec}" in selection "${name}" has no values.`;
      return null;
    }
    checks.push({ field, modifiers, values });
  }

  if (checks.length === 0) {
    errorRef.message = `Selection "${name}" is empty.`;
    return null;
  }
  return { kind: 'fields', checks };
}

function buildRuleModel(ruleText: string): BuildResult {
  if (ruleText.trim().length === 0) {
    return { ok: false, error: 'The rule editor is empty.', unsupported: [] };
  }
  if (new TextEncoder().encode(ruleText).byteLength > SIGMA_MAX_INPUT_BYTES) {
    return {
      ok: false,
      error: `The rule exceeds the ${SIGMA_MAX_INPUT_BYTES / 1024} KiB evaluation limit.`,
      unsupported: [],
    };
  }

  let documents;
  try {
    documents = parseAllDocuments(ruleText, { prettyErrors: true, strict: false });
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : String(caught),
      unsupported: [],
    };
  }

  const nonEmpty = documents.filter((document) => document.contents !== null);
  const yamlError = nonEmpty.flatMap((document) => document.errors)[0];
  if (yamlError) {
    return { ok: false, error: yamlError.message, unsupported: [] };
  }
  if (nonEmpty.length === 0) {
    return { ok: false, error: 'The rule editor is empty.', unsupported: [] };
  }
  if (nonEmpty.length > 1) {
    return { ok: false, error: 'A Sigma rule must be a single YAML document.', unsupported: [] };
  }

  let data: unknown;
  try {
    data = nonEmpty[0]?.toJS({ maxAliasCount: 20 });
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : String(caught),
      unsupported: [],
    };
  }
  if (!isRecord(data)) {
    return { ok: false, error: 'The rule must be a YAML map.', unsupported: [] };
  }

  const failures: SigmaTestUnsupported[] = [];
  if (data.correlation !== undefined) {
    unsupported(
      failures,
      'correlation',
      'correlation',
      'Correlation rules are outside the local test subset.',
    );
  }

  const detection = data.detection;
  if (!isRecord(detection)) {
    return { ok: false, error: 'The rule has no detection map.', unsupported: failures };
  }
  if (detection.timeframe !== undefined) {
    unsupported(
      failures,
      'timeframe',
      'detection.timeframe',
      'Time-window evaluation is outside the local test subset.',
    );
  }

  const condition = detection.condition;
  if (typeof condition !== 'string' || condition.trim().length === 0) {
    return { ok: false, error: 'The detection condition is missing.', unsupported: failures };
  }
  if (/\|\s*(?:count|sum|min|max|avg)\b/iu.test(condition)) {
    unsupported(
      failures,
      'aggregation',
      'detection.condition',
      'Aggregation expressions are outside the local test subset.',
    );
  }
  if (/\bnear\b/iu.test(condition)) {
    unsupported(
      failures,
      'near',
      'detection.condition',
      'The near operator is outside the local test subset.',
    );
  }
  if (condition.includes('|')) {
    unsupported(
      failures,
      'condition-pipe',
      'detection.condition',
      'Detection pipelines in the condition are outside the local test subset.',
    );
  }

  const selections = new Map<string, SelectionModel>();
  const errorRef: { message: string | null } = { message: null };
  for (const [name, raw] of Object.entries(detection)) {
    if (name === 'condition' || name === 'timeframe') continue;
    if (selections.size >= MAX_SELECTIONS) {
      return {
        ok: false,
        error: `The rule exceeds the ${MAX_SELECTIONS}-selection local test limit.`,
        unsupported: failures,
      };
    }
    const selection = buildSelection(name, raw, failures, errorRef);
    if (!selection) {
      if (failures.length > 0) {
        return {
          ok: false,
          error: 'The rule uses constructs outside the local test subset.',
          unsupported: failures,
        };
      }
      if (errorRef.message) return { ok: false, error: errorRef.message, unsupported: failures };
      return { ok: false, error: `Selection "${name}" could not be parsed.`, unsupported: failures };
    }
    selections.set(name, selection);
  }

  if (selections.size === 0) {
    return { ok: false, error: 'The rule defines no selections.', unsupported: failures };
  }
  if (failures.length > 0) {
    return {
      ok: false,
      error: 'The rule uses constructs outside the local test subset.',
      unsupported: failures,
    };
  }

  const parsed = parseCondition(condition, [...selections.keys()]);
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      unsupported: parsed.unsupported,
    };
  }

  return { ok: true, model: { condition, selections } };
}

function selectionMatches(selection: SelectionModel, event: Record<string, unknown>): boolean {
  if (selection.kind === 'keywords') return matchKeywordSelection(event, selection.values);
  return selection.checks.every((check) => matchFieldCheck(event, check));
}

function evaluateCondition(
  node: ConditionNode,
  results: Map<string, boolean>,
  selectionNames: string[],
): boolean {
  switch (node.kind) {
    case 'ref':
      return results.get(node.name) ?? false;
    case 'not':
      return !evaluateCondition(node.child, results, selectionNames);
    case 'and':
      return (
        evaluateCondition(node.left, results, selectionNames) &&
        evaluateCondition(node.right, results, selectionNames)
      );
    case 'or':
      return (
        evaluateCondition(node.left, results, selectionNames) ||
        evaluateCondition(node.right, results, selectionNames)
      );
    case 'quant': {
      const names =
        node.selector === 'them'
          ? selectionNames
          : selectionNames.filter((name) =>
              wildcardMatch(name.toLowerCase(), node.selector.toLowerCase()),
            );
      if (names.length === 0) return false;
      if (node.mode === 'all') return names.every((name) => results.get(name) ?? false);
      return names.some((name) => results.get(name) ?? false);
    }
  }
}

function parseEvents(text: string): { ok: true; events: Record<string, unknown>[] } | { ok: false; error: string } {
  if (text.trim().length === 0) {
    return { ok: false, error: 'Paste one JSON event or an array of events first.' };
  }
  if (new TextEncoder().encode(text).byteLength > SIGMA_MAX_EVENTS_BYTES) {
    return {
      ok: false,
      error: `The event sample exceeds the ${SIGMA_MAX_EVENTS_BYTES / 1024 / 1024} MiB limit.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? `Event JSON is invalid: ${caught.message}` : 'Event JSON is invalid.',
    };
  }

  const rawEvents = Array.isArray(parsed) ? parsed : [parsed];
  if (rawEvents.length > SIGMA_MAX_EVENTS) {
    return { ok: false, error: `The sample exceeds the ${SIGMA_MAX_EVENTS}-event limit.` };
  }
  const events: Record<string, unknown>[] = [];
  for (let index = 0; index < rawEvents.length; index += 1) {
    const event = rawEvents[index];
    if (!isRecord(event)) {
      return { ok: false, error: `Event ${index + 1} is not a JSON object.` };
    }
    events.push(event);
  }
  return { ok: true, events };
}

export function runSigmaLocalTest(ruleText: string, eventsText: string): SigmaTestResult {
  const built = buildRuleModel(ruleText);
  if (!built.ok) {
    return {
      ok: false,
      error: built.error,
      unsupported: built.unsupported,
      evaluator: SIGMA_EVALUATOR_VERSION,
    };
  }

  const parsedEvents = parseEvents(eventsText);
  if (!parsedEvents.ok) {
    return {
      ok: false,
      error: parsedEvents.error,
      unsupported: [],
      evaluator: SIGMA_EVALUATOR_VERSION,
    };
  }

  const condition = parseCondition(built.model.condition, [...built.model.selections.keys()]);
  if (!condition.ok) {
    return {
      ok: false,
      error: condition.error,
      unsupported: condition.unsupported,
      evaluator: SIGMA_EVALUATOR_VERSION,
    };
  }

  const selectionNames = [...built.model.selections.keys()];
  const results: SigmaTestEventResult[] = parsedEvents.events.map((event, index) => {
    const selectionResults: Record<string, boolean> = {};
    for (const [name, selection] of built.model.selections) {
      selectionResults[name] = selectionMatches(selection, event);
    }
    const matchedSelections = selectionNames.filter((name) => selectionResults[name] === true);
    const matched = evaluateCondition(
      condition.node,
      new Map(Object.entries(selectionResults)),
      selectionNames,
    );
    return { index, matched, matchedSelections, selectionResults };
  });

  const warnings = [
    'Local test only. A match on sample events proves the subset evaluator ran; it does not verify the detection.',
    'logsource is displayed as metadata and is not used to route events.',
    'Matching is case-insensitive unless a field uses the cased modifier. Keyword lists search all leaf values.',
  ];

  return {
    ok: true,
    eventCount: results.length,
    matchedCount: results.filter((result) => result.matched).length,
    events: results,
    selections: selectionNames,
    condition: built.model.condition,
    warnings,
    evaluator: SIGMA_EVALUATOR_VERSION,
  };
}
