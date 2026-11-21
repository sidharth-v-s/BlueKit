import { ToolFailure } from '@/core/runtime/errors';
import type { BlueKitTool, RunnerInput, ToolContext, ToolResult } from '@/core/runtime/types';
import { DATA_TYPES, DEFAULT_LIMITS, type ToolManifest } from '@/core/schemas/types';
import { decodePartText, isAttachment, parseEmlMessage, decodeEncodedWords } from './rfc822';
import { looksLikeEmail, MAX_EMAIL_BYTES, readEmailInput } from './input';
import { extractUrls, type EmailUrlRecord } from './urls';

const manifest: ToolManifest = {
  id: 'email.url-extractor',
  name: 'Email URL Extractor',
  version: '0.1.0',
  category: 'email',
  description:
    'Extract URLs from text and HTML bodies, decode entities, show normalised and defanged forms, and never fetch or navigate. Also accepts pasted text.',
  tags: ['email', 'url', 'html', 'defang', 'mailsleuth'],
  runtime: 'worker',
  input: [
    { type: DATA_TYPES.file, accept: ['.eml', '.txt', '.html', '.htm', 'message/rfc822'], description: 'Email or text file' },
    { type: DATA_TYPES.text, description: 'Raw message, body text, or HTML' },
  ],
  output: [{ type: DATA_TYPES.json, format: 'bluekit.email-urls.v1' }],
  capabilities: ['worker.execute', 'file.read'],
  network: 'none',
  dataHandling: 'local-only',
  status: 'available',
  phase: 3,
  related: ['email.eml-inspector', 'encoding.defang', 'ioc.extractor'],
  limits: { ...DEFAULT_LIMITS, maxInputBytes: MAX_EMAIL_BYTES, timeoutMs: 30_000 },
  ui: {
    inputLabel: 'Raw email, body text, or HTML',
    outputLabel: 'Extracted URLs',
    placeholder: 'Paste an email, a body, or HTML source…',
    primaryInput: DATA_TYPES.file,
  },
};

export interface EmailUrlReport {
  byteLength: number;
  fileName?: string;
  inputKind: 'email' | 'text' | 'html';
  subject: string | null;
  urls: EmailUrlRecord[];
  hosts: { host: string; count: number }[];
  warnings: string[];
  notes: string[];
}

function htmlLike(input: string): boolean {
  return /<\/?(?:html|body|head|a|img|div|p|table|script)\b/iu.test(input);
}

function emailBodies(raw: string): { text?: string; html?: string; subject: string | null; warnings: string[] } {
  const parsed = parseEmlMessage(raw);
  let text: string | undefined;
  let html: string | undefined;
  for (const part of parsed.parts) {
    if (isAttachment(part)) continue;
    if (part.contentType === 'text/plain' && text === undefined) text = decodePartText(part);
    else if (part.contentType === 'text/html' && html === undefined) html = decodePartText(part);
  }
  const subjectHeader = parsed.root.headers.find((header) => header.name.toLowerCase() === 'subject');
  return {
    ...(text !== undefined ? { text } : {}),
    ...(html !== undefined ? { html } : {}),
    subject: subjectHeader ? decodeEncodedWords(subjectHeader.value) : null,
    warnings: parsed.warnings,
  };
}

export async function runUrlExtractor(
  input: RunnerInput,
  report: (pct: number | undefined, message: string) => void,
  signal: AbortSignal,
): Promise<ToolResult<EmailUrlReport>> {
  report(5, 'Reading input');
  const email = await readEmailInput(input, manifest.limits!.maxInputBytes);
  if (signal.aborted) throw new ToolFailure('cancelled', 'Operation cancelled.');

  let inputKind: EmailUrlReport['inputKind'];
  let sources: { kind: 'text' | 'html'; text: string }[];
  let subject: string | null = null;
  let parseWarnings: string[] = [];

  if (looksLikeEmail(email.raw)) {
    report(35, 'Parsing message bodies');
    const bodies = emailBodies(email.raw);
    inputKind = 'email';
    subject = bodies.subject;
    parseWarnings = bodies.warnings;
    sources = [
      ...(bodies.text ? [{ kind: 'text' as const, text: bodies.text }] : []),
      ...(bodies.html ? [{ kind: 'html' as const, text: bodies.html }] : []),
    ];
    if (sources.length === 0) {
      parseWarnings = [...parseWarnings, 'No text/plain or text/html body was found; no URL sources were available.'];
    }
  } else if (htmlLike(email.raw)) {
    inputKind = 'html';
    sources = [{ kind: 'html', text: email.raw }];
  } else {
    inputKind = 'text';
    sources = [{ kind: 'text', text: email.raw }];
  }

  if (signal.aborted) throw new ToolFailure('cancelled', 'Operation cancelled.');
  report(70, 'Extracting URLs');
  const extraction = extractUrls(sources);
  report(100, 'Done');

  const reportBody: EmailUrlReport = {
    byteLength: email.byteLength,
    ...(email.fileName ? { fileName: email.fileName } : {}),
    inputKind,
    subject,
    urls: extraction.urls,
    hosts: extraction.hosts,
    warnings: [...parseWarnings, ...extraction.warnings],
    notes: [
      'URLs are never fetched, resolved, or opened by this tool.',
      'The normalized form is for comparison only; it is not a claim that the URL is safe or unsafe.',
      'The defanged form is a display convention, not a security control.',
      'Registrable-domain grouping needs a Public Suffix List dataset; this build groups by exact hostname.',
    ],
  };

  return {
    output: reportBody,
    ...(reportBody.warnings.length > 0
      ? { warnings: reportBody.warnings.map((message, index) => ({ code: `url-warning-${index}`, message })) }
      : {}),
    meta: {
      fileName: email.fileName ?? null,
      inputKind,
      urls: reportBody.urls.length,
      hosts: reportBody.hosts.length,
    },
  };
}

async function execute(
  input: RunnerInput,
  context: ToolContext,
  signal: AbortSignal,
): Promise<ToolResult<EmailUrlReport>> {
  return runUrlExtractor(
    input,
    (pct, message) => context.reportProgress({ ...(pct !== undefined ? { pct } : {}), message }),
    signal,
  );
}

export const urlExtractorTool: BlueKitTool<RunnerInput, EmailUrlReport> = { manifest, execute };
