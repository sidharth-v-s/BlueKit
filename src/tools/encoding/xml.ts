import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';

/**
 * XML formatter and well-formedness checker.
 *
 * This is intentionally a scanner, not a full XML processor: it checks tag
 * balance, attribute quoting, and entity syntax, then pretty-prints. It never
 * resolves external entities, and it never expands internal ones. A document
 * with a DTD is left as text with a warning, not processed.
 */

const manifest: ToolManifest = {
  id: 'encoding.xml',
  name: 'XML Formatter & Checker',
  version: '0.1.0',
  category: 'encoding',
  description:
    'Check XML tag and attribute syntax and format it. External entities are never resolved.',
  tags: ['xml', 'format', 'well-formed', 'xxe', 'markup'],
  runtime: 'main',
  input: [{ type: DATA_TYPES.text }],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.xml-report.v1' }],
  capabilities: [],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 2,
  related: ['encoding.html-entities', 'encoding.json'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: 8 * 1024 * 1024 },
  ui: {
    inputLabel: 'XML document',
    outputLabel: 'Report and formatted XML',
    placeholder: '<?xml version="1.0"?><root><item id="1">value</item></root>',
    primaryInput: DATA_TYPES.text,
  },
};

interface XmlAttribute {
  name: string;
  value: string;
  quote: '"' | "'";
}

interface XmlElement {
  type: 'element';
  name: string;
  attributes: XmlAttribute[];
  children: XmlNode[];
  selfClosing: boolean;
}

interface XmlText {
  type: 'text';
  value: string;
}

interface XmlLiteral {
  type: 'comment' | 'cdata' | 'pi' | 'doctype' | 'declaration';
  raw: string;
}

type XmlNode = XmlElement | XmlText | XmlLiteral;

export interface XmlError {
  message: string;
  line: number;
  column: number;
}

export interface XmlReport {
  wellFormed: boolean;
  formatted?: string;
  rootElement?: string;
  elementCount: number;
  attributeCount: number;
  maxDepth: number;
  hasDoctype: boolean;
  warnings: string[];
  error?: XmlError;
}

function lineColumn(source: string, index: number): { line: number; column: number } {
  const before = source.slice(0, index);
  const line = before.split('\n').length;
  return { line, column: index - before.lastIndexOf('\n') };
}

function fail(source: string, index: number, message: string): never {
  const { line, column } = lineColumn(source, index);
  throw new ToolFailure('malformed-content', `${message} (line ${line}, column ${column})`, {
    line,
    column,
  });
}

const NAME_START = /[A-Za-z_:]/u;
const NAME_CHAR = /[A-Za-z0-9_.:-]/u;
const ENTITY_PATTERN = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/u;

function parseXml(source: string): { nodes: XmlNode[]; warnings: string[] } {
  const nodes: XmlNode[] = [];
  const stack: XmlElement[] = [];
  const warnings: string[] = [];
  let index = 0;

  const append = (node: XmlNode): void => {
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else nodes.push(node);
  };

  const checkEntities = (value: string): void => {
    if (ENTITY_PATTERN.test(value)) {
      warnings.push('Text contains an entity reference that is not one of the five predefined XML entities.');
    }
  };

  while (index < source.length) {
    const open = source.indexOf('<', index);
    if (open === -1) {
      const tail = source.slice(index);
      if (tail.trim().length > 0) {
        if (stack.length === 0) fail(source, index, 'Text outside the root element');
        checkEntities(tail);
        append({ type: 'text', value: tail });
      }
      index = source.length;
      break;
    }

    if (open > index) {
      const text = source.slice(index, open);
      if (stack.length === 0) {
        if (text.trim().length > 0) fail(source, index, 'Text outside the root element');
      } else {
        checkEntities(text);
        append({ type: 'text', value: text });
      }
    }

    if (source.startsWith('<!--', open)) {
      const end = source.indexOf('-->', open + 4);
      if (end === -1) fail(source, open, 'Unterminated comment');
      append({ type: 'comment', raw: source.slice(open, end + 3) });
      index = end + 3;
      continue;
    }

    if (source.startsWith('<![CDATA[', open)) {
      if (stack.length === 0) fail(source, open, 'CDATA outside the root element');
      const end = source.indexOf(']]>', open + 9);
      if (end === -1) fail(source, open, 'Unterminated CDATA section');
      append({ type: 'cdata', raw: source.slice(open, end + 3) });
      index = end + 3;
      continue;
    }

    if (source.startsWith('<!DOCTYPE', open)) {
      let cursor = open + 9;
      let bracketDepth = 0;
      while (cursor < source.length) {
        const char = source[cursor];
        if (char === '[') bracketDepth += 1;
        else if (char === ']') bracketDepth -= 1;
        else if (char === '>' && bracketDepth <= 0) break;
        cursor += 1;
      }
      if (cursor >= source.length) fail(source, open, 'Unterminated DOCTYPE');
      const raw = source.slice(open, cursor + 1);
      if (/<!ENTITY/iu.test(raw)) {
        warnings.push(
          'DOCTYPE declares entities. They are not expanded or resolved; treat the formatted output as text only.',
        );
      }
      if (/<!ENTITY[^>]*(?:SYSTEM|PUBLIC)/iu.test(raw)) {
        warnings.push('DOCTYPE declares an external entity. BlueKit never fetches it.');
      }
      append({ type: 'doctype', raw });
      index = cursor + 1;
      continue;
    }

    if (source.startsWith('<?', open)) {
      const end = source.indexOf('?>', open + 2);
      if (end === -1) fail(source, open, 'Unterminated processing instruction');
      const raw = source.slice(open, end + 2);
      append({ type: /^<\?xml\b/u.test(raw) ? 'declaration' : 'pi', raw });
      index = end + 2;
      continue;
    }

    if (source.startsWith('</', open)) {
      let cursor = open + 2;
      if (!NAME_START.test(source[cursor] ?? '')) fail(source, cursor, 'Expected a closing tag name');
      const nameStart = cursor;
      while (cursor < source.length && NAME_CHAR.test(source[cursor]!)) cursor += 1;
      const name = source.slice(nameStart, cursor);
      while (cursor < source.length && /\s/u.test(source[cursor]!)) cursor += 1;
      if (source[cursor] !== '>') fail(source, cursor, `Expected ">" after closing tag </${name}`);
      const element = stack.pop();
      if (!element) fail(source, open, `Unexpected closing tag </${name}>`);
      if (element.name !== name) {
        fail(source, open, `Closing tag </${name}> does not match <${element.name}>`);
      }
      index = cursor + 1;
      continue;
    }

    // Opening element.
    let cursor = open + 1;
    if (!NAME_START.test(source[cursor] ?? '')) fail(source, cursor, 'Expected an element name');
    const nameStart = cursor;
    while (cursor < source.length && NAME_CHAR.test(source[cursor]!)) cursor += 1;
    const name = source.slice(nameStart, cursor);
    const attributes: XmlAttribute[] = [];
    let selfClosing = false;

    for (;;) {
      while (cursor < source.length && /\s/u.test(source[cursor]!)) cursor += 1;
      if (cursor >= source.length) fail(source, open, `Unterminated start tag <${name}>`);
      const char = source[cursor]!;
      if (char === '>') {
        cursor += 1;
        break;
      }
      if (char === '/') {
        if (source[cursor + 1] !== '>') fail(source, cursor, 'Expected "/>"');
        selfClosing = true;
        cursor += 2;
        break;
      }
      if (!NAME_START.test(char)) fail(source, cursor, `Unexpected character "${char}" in <${name}>`);
      const attrStart = cursor;
      while (cursor < source.length && NAME_CHAR.test(source[cursor]!)) cursor += 1;
      const attrName = source.slice(attrStart, cursor);
      if (attributes.some((attribute) => attribute.name === attrName)) {
        fail(source, attrStart, `Duplicate attribute "${attrName}"`);
      }
      while (cursor < source.length && /\s/u.test(source[cursor]!)) cursor += 1;
      if (source[cursor] !== '=') fail(source, cursor, `Attribute "${attrName}" has no value`);
      cursor += 1;
      while (cursor < source.length && /\s/u.test(source[cursor]!)) cursor += 1;
      const quote = source[cursor];
      if (quote !== '"' && quote !== "'") {
        fail(source, cursor, `Attribute "${attrName}" value must be quoted`);
      }
      const valueStart = cursor + 1;
      const valueEnd = source.indexOf(quote, valueStart);
      if (valueEnd === -1) fail(source, cursor, `Unterminated value for attribute "${attrName}"`);
      const value = source.slice(valueStart, valueEnd);
      if (value.includes('<')) fail(source, valueStart, `Attribute "${attrName}" contains an unescaped "<"`);
      checkEntities(value);
      attributes.push({ name: attrName, value, quote });
      cursor = valueEnd + 1;
    }

    const element: XmlElement = { type: 'element', name, attributes, children: [], selfClosing };
    append(element);
    if (!selfClosing) stack.push(element);
    index = cursor;
  }

  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1]!;
    fail(source, source.length, `Unclosed element <${unclosed.name}>`);
  }

  const roots = nodes.filter((node) => node.type === 'element');
  if (roots.length === 0) fail(source, 0, 'Document has no root element');
  if (roots.length > 1) fail(source, 0, 'Document has more than one root element');

  return { nodes, warnings };
}

function escapeAttribute(value: string, quote: '"' | "'"): string {
  return quote === '"' ? value.replace(/"/gu, '&quot;') : value.replace(/'/gu, '&apos;');
}

function serializeInline(node: XmlNode): string {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element') return node.raw;
  const attrs = node.attributes
    .map((attribute) => ` ${attribute.name}=${attribute.quote}${escapeAttribute(attribute.value, attribute.quote)}${attribute.quote}`)
    .join('');
  if (node.selfClosing) return `<${node.name}${attrs} />`;
  return `<${node.name}${attrs}>${node.children.map(serializeInline).join('')}</${node.name}>`;
}

function hasElementChild(node: XmlElement): boolean {
  return node.children.some((child) => child.type === 'element');
}

function hasNonWhitespaceText(node: XmlElement): boolean {
  return node.children.some((child) => child.type === 'text' && child.value.trim().length > 0);
}

function serialize(node: XmlNode, depth: number, indent: string): string {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element') return node.raw;

  const pad = indent.repeat(depth);
  const attrs = node.attributes
    .map((attribute) => ` ${attribute.name}=${attribute.quote}${escapeAttribute(attribute.value, attribute.quote)}${attribute.quote}`)
    .join('');

  if (node.selfClosing) return `${pad}<${node.name}${attrs} />`;
  if (node.children.length === 0) return `${pad}<${node.name}${attrs}></${node.name}>`;

  // Mixed content and text-only content must not be reflowed: whitespace is
  // significant there. Keep the element on one line.
  if (!hasElementChild(node) || hasNonWhitespaceText(node)) {
    return `${pad}<${node.name}${attrs}>${node.children.map(serializeInline).join('')}</${node.name}>`;
  }

  const inner = node.children.map((child) => serialize(child, depth + 1, indent)).join('\n');
  return `${pad}<${node.name}${attrs}>\n${inner}\n${pad}</${node.name}>`;
}

function count(node: XmlNode, depth: number): { elements: number; attributes: number; maxDepth: number } {
  if (node.type !== 'element') return { elements: 0, attributes: 0, maxDepth: depth };
  let elements = 1;
  let attributes = node.attributes.length;
  let maxDepth = depth;
  for (const child of node.children) {
    const nested = count(child, depth + 1);
    elements += nested.elements;
    attributes += nested.attributes;
    maxDepth = Math.max(maxDepth, nested.maxDepth);
  }
  return { elements, attributes, maxDepth };
}

export function inspectXml(source: string): XmlReport {
  let parsed: { nodes: XmlNode[]; warnings: string[] };
  try {
    parsed = parseXml(source);
  } catch (error) {
    if (error instanceof ToolFailure) {
      const details = error.details ?? {};
      return {
        wellFormed: false,
        elementCount: 0,
        attributeCount: 0,
        maxDepth: 0,
        hasDoctype: /<!DOCTYPE/iu.test(source),
        warnings: [],
        error: {
          message: error.message,
          line: typeof details['line'] === 'number' ? details['line'] : 1,
          column: typeof details['column'] === 'number' ? details['column'] : 1,
        },
      };
    }
    throw error;
  }

  const root = parsed.nodes.find((node): node is XmlElement => node.type === 'element');
  if (!root) throw new ToolFailure('malformed-content', 'Document has no root element.');

  const stats = count(root, 0);
  return {
    wellFormed: true,
    formatted: `${parsed.nodes.map((node) => serialize(node, 0, '  ')).join('\n')}\n`,
    rootElement: root.name,
    elementCount: stats.elements,
    attributeCount: stats.attributes,
    maxDepth: stats.maxDepth,
    hasDoctype: parsed.nodes.some((node) => node.type === 'doctype'),
    warnings: parsed.warnings,
  };
}

async function execute(input: RunnerInput): Promise<ToolResult<XmlReport>> {
  const text = input.text ?? '';
  if (text.trim().length === 0) throw new ToolFailure('invalid-input', 'Paste XML to check.');

  const report = inspectXml(text);
  return {
    output: report,
    ...(report.warnings.length > 0
      ? {
          warnings: report.warnings.map((message, index) => ({
            code: `xml-warning-${index}`,
            message,
          })),
        }
      : {}),
    meta: {
      wellFormed: report.wellFormed,
      elements: report.elementCount,
      hasDoctype: report.hasDoctype,
    },
  };
}

export const xmlTool: BlueKitTool<RunnerInput, XmlReport> = { manifest, execute };

export type { XmlNode };
