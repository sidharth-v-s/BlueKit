import type { EmailAddress, EmlHeader } from './rfc822';
import { decodeEncodedWords, parseAddressList, parseEmlMessage } from './rfc822';

/**
 * Header-level analysis.
 *
 * Findings are observations, not verdicts. A mismatched Reply-To is normal
 * marketing practice; a broken Received chain is suspicious but can also be a
 * rewriting gateway. The wording keeps that distinction visible.
 */

export interface ReceivedHop {
  /** 0 is the topmost (most recently added) Received header. */
  index: number;
  from: string | null;
  by: string | null;
  via: string | null;
  with: string | null;
  id: string | null;
  for: string | null;
  date: string | null;
  parsedDate: string | null;
  ip: string | null;
  raw: string;
}

export type FindingSeverity = 'observation' | 'warning';

export interface HeaderFinding {
  severity: FindingSeverity;
  code: string;
  message: string;
  evidence?: string;
}

export interface HeaderAnalysis {
  byteLength: number;
  subject: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  replyTo: EmailAddress[];
  sender: EmailAddress[];
  returnPath: string | null;
  date: string | null;
  messageId: string | null;
  mimeVersion: string | null;
  contentType: string | null;
  domains: {
    from: string[];
    replyTo: string[];
    sender: string[];
    to: string[];
    returnPath: string | null;
  };
  received: ReceivedHop[];
  /** Header names that appeared more than once, excluding legitimately repeated ones. */
  duplicates: { name: string; count: number }[];
  findings: HeaderFinding[];
  headers: EmlHeader[];
  warnings: string[];
  limitations: string[];
}

const RECEIVED_KEYWORD = /\b(from|by|via|with|id|for)\b/giu;
const DATE_LIKE = /\d/gu;
const IP_IN_BRACKETS = /\[([0-9a-f:.]+)\]/iu;

function addressDomain(address: string): string | null {
  const at = address.lastIndexOf('@');
  return at === -1 ? null : address.slice(at + 1).toLowerCase().replace(/\.$/u, '');
}

function uniqueDomains(addresses: EmailAddress[]): string[] {
  return [...new Set(addresses.map((address) => addressDomain(address.address)).filter((value): value is string => Boolean(value)))];
}

function bareHost(value: string | null): string | null {
  if (!value) return null;
  const token = value.trim().split(/[\s(;]/u)[0] ?? '';
  const host = token.replace(/^\[|\]$/gu, '').toLowerCase().replace(/\.$/u, '');
  return host.length > 0 ? host : null;
}

/**
 * Parse a Received header. Values are free-form and vendors add their own
 * tokens, so this is a keyword scanner rather than a grammar. Unknown text is
 * preserved in `raw`.
 */
export function parseReceivedHop(value: string, index: number): ReceivedHop {
  const normalized = value.replace(/\r?\n[ \t]*/gu, ' ').trim();
  const lastSemicolon = normalized.lastIndexOf(';');
  const candidateDate = lastSemicolon === -1 ? '' : normalized.slice(lastSemicolon + 1).trim();
  const date = candidateDate.replace(DATE_LIKE, '') !== candidateDate ? candidateDate : null;
  const head = date ? normalized.slice(0, lastSemicolon) : normalized;

  const matches = [...head.matchAll(RECEIVED_KEYWORD)];
  const fields: Record<string, string> = {};
  for (let indexMatch = 0; indexMatch < matches.length; indexMatch += 1) {
    const match = matches[indexMatch]!;
    const start = (match.index ?? 0) + match[0].length;
    const end = indexMatch + 1 < matches.length ? matches[indexMatch + 1]!.index ?? head.length : head.length;
    const keyword = match[1]!.toLowerCase();
    const fieldValue = head.slice(start, end).trim();
    if (fieldValue.length > 0 && !(keyword in fields)) fields[keyword] = fieldValue;
  }

  const parsed = date ? Date.parse(date) : Number.NaN;
  return {
    index,
    from: fields['from'] ?? null,
    by: fields['by'] ?? null,
    via: fields['via'] ?? null,
    with: fields['with'] ?? null,
    id: fields['id'] ?? null,
    for: fields['for'] ?? null,
    date,
    parsedDate: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
    ip: IP_IN_BRACKETS.exec(head)?.[1] ?? null,
    raw: normalized,
  };
}

function displayNameAddressMismatch(address: EmailAddress): HeaderFinding | null {
  if (!address.name || !address.name.includes('@')) return null;
  const nameAddress = parseAddressList(address.name)[0]?.address ?? address.name.trim();
  if (!nameAddress.includes('@')) return null;
  if (nameAddress.toLowerCase() === address.address.toLowerCase()) return null;
  return {
    severity: 'warning',
    code: 'display-name-address-mismatch',
    message: `The display name contains an email address (${nameAddress}) that differs from the actual mailbox (${address.address}). This is a common impersonation pattern.`,
    evidence: address.raw,
  };
}

function invalidDate(value: string | null): boolean {
  return Boolean(value && !Number.isFinite(Date.parse(value)));
}

export function analyzeHeaders(raw: string, byteLength: number): HeaderAnalysis {
  const parsed = parseEmlMessage(raw, { decodeBodies: false });
  const headers = parsed.root.headers;
  const get = (name: string) => headers.find((header) => header.name.toLowerCase() === name)?.value ?? null;
  const getDecoded = (name: string) => {
    const value = get(name);
    return value === null ? null : decodeEncodedWords(value);
  };

  const from = parseAddressList(getDecoded('from') ?? '');
  const replyTo = parseAddressList(getDecoded('reply-to') ?? '');
  const sender = parseAddressList(getDecoded('sender') ?? '');
  const to = parseAddressList(getDecoded('to') ?? '');
  const cc = parseAddressList(getDecoded('cc') ?? '');
  const returnPath = get('return-path');
  const returnPathAddress = returnPath
    ? parseAddressList(returnPath)[0]?.address ?? returnPath.replace(/[<>]/gu, '').trim()
    : null;

  const counts = new Map<string, number>();
  for (const header of headers) {
    const name = header.name.toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const repeated = /^(received|dkim-signature|arc-seal|arc-message-signature|authentication-results)$/u;
  const duplicates = [...counts.entries()]
    .filter(([name, count]) => count > 1 && !repeated.test(name))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const received = headers
    .filter((header) => header.name.toLowerCase() === 'received')
    .map((header, index) => parseReceivedHop(header.value, index));

  const findings: HeaderFinding[] = [];
  const add = (finding: HeaderFinding) => {
    if (!findings.some((existing) => existing.code === finding.code && existing.evidence === finding.evidence)) {
      findings.push(finding);
    }
  };

  if (from.length === 0) {
    add({
      severity: 'warning',
      code: 'missing-from',
      message: 'No From header was found. Without a visible sender the message cannot be attributed.',
    });
  }
  if (from.length > 1) {
    add({
      severity: 'warning',
      code: 'multiple-from',
      message: 'Multiple From headers are present. Mail clients and gateways may disagree about the real sender.',
    });
  }
  if ((counts.get('subject') ?? 0) > 1) {
    add({
      severity: 'warning',
      code: 'duplicate-subject',
      message: 'Multiple Subject headers are present. This can hide the subject shown by one client but not another.',
    });
  }
  if ((counts.get('return-path') ?? 0) > 1) {
    add({
      severity: 'warning',
      code: 'duplicate-return-path',
      message: 'Multiple Return-Path headers are present. Envelope sender attribution is ambiguous.',
    });
  }
  if (!get('date')) {
    add({
      severity: 'observation',
      code: 'missing-date',
      message: 'No Date header was found. Sorting and timeline reconstruction will be less reliable.',
    });
  } else if (invalidDate(getDecoded('date'))) {
    add({
      severity: 'observation',
      code: 'invalid-date',
      message: 'The Date header could not be parsed by the browser date parser.',
      evidence: getDecoded('date') ?? undefined,
    });
  }
  if (!get('message-id')) {
    add({
      severity: 'observation',
      code: 'missing-message-id',
      message: 'No Message-ID header was found. Duplicate-message correlation will be weaker.',
    });
  }
  if (!get('mime-version')) {
    add({
      severity: 'observation',
      code: 'missing-mime-version',
      message: 'No MIME-Version header was found. The message may be legacy or malformed.',
    });
  }

  for (const address of from) {
    const mismatch = displayNameAddressMismatch(address);
    if (mismatch) add(mismatch);
  }

  const fromDomains = uniqueDomains(from);
  const replyDomains = uniqueDomains(replyTo);
  const senderDomains = uniqueDomains(sender);
  const returnPathDomain = returnPathAddress ? addressDomain(returnPathAddress) : null;

  if (replyDomains.some((domain) => !fromDomains.includes(domain))) {
    add({
      severity: 'observation',
      code: 'reply-to-domain-mismatch',
      message: `Reply-To domain (${replyDomains.join(', ')}) differs from the From domain (${fromDomains.join(', ') || 'unknown'}). This is common for bulk mail but also used to redirect replies.`,
      evidence: getDecoded('reply-to') ?? undefined,
    });
  }
  if (senderDomains.some((domain) => !fromDomains.includes(domain))) {
    add({
      severity: 'observation',
      code: 'sender-domain-mismatch',
      message: `Sender domain (${senderDomains.join(', ')}) differs from the From domain (${fromDomains.join(', ') || 'unknown'}).`,
      evidence: getDecoded('sender') ?? undefined,
    });
  }
  if (returnPathDomain && fromDomains.length > 0 && !fromDomains.includes(returnPathDomain)) {
    add({
      severity: 'observation',
      code: 'return-path-domain-mismatch',
      message: `Return-Path domain (${returnPathDomain}) differs from the From domain (${fromDomains.join(', ')}). Bulk senders often use a separate envelope domain; compare with SPF alignment.`,
      evidence: returnPath ?? undefined,
    });
  }

  const envelopeFrom = getDecoded('x-envelope-from') ?? getDecoded('envelope-from');
  if (envelopeFrom && returnPathAddress) {
    const envelopeAddress = parseAddressList(envelopeFrom)[0]?.address ?? envelopeFrom.trim();
    if (envelopeAddress.toLowerCase() !== returnPathAddress.toLowerCase()) {
      add({
        severity: 'observation',
        code: 'envelope-from-mismatch',
        message: 'X-Envelope-From and Return-Path name different envelope senders.',
        evidence: envelopeFrom,
      });
    }
  }

  if (received.length === 0) {
    add({
      severity: 'observation',
      code: 'no-received-chain',
      message: 'No Received headers were found. The transport path cannot be reconstructed; this is normal for some exported messages but limits attribution.',
    });
  } else if (received.length === 1) {
    add({
      severity: 'observation',
      code: 'single-received-hop',
      message: 'Only one Received header is present. Internal relay history is unavailable.',
    });
  }

  for (let index = 0; index < received.length - 1; index += 1) {
    const newer = received[index]!;
    const older = received[index + 1]!;
    const newerFrom = bareHost(newer.from);
    const olderBy = bareHost(older.by);
    if (newerFrom && olderBy && newerFrom !== olderBy) {
      add({
        severity: 'observation',
        code: 'received-chain-mismatch',
        message: `Received hop ${index} says it came from "${newerFrom}" but the next hop recorded a handoff by "${olderBy}". Host aliases can explain this; forged or rewritten headers can too.`,
        evidence: newer.raw,
      });
    }
  }

  const missingHopFields = received.filter((hop) => !hop.from || !hop.by).length;
  if (missingHopFields > 0) {
    add({
      severity: 'observation',
      code: 'incomplete-received-hop',
      message: `${missingHopFields} Received header${missingHopFields === 1 ? '' : 's'} lack a from or by clause.`,
    });
  }

  if (fromDomains.length > 1) {
    add({
      severity: 'observation',
      code: 'multiple-from-domains',
      message: `From addresses use multiple domains: ${fromDomains.join(', ')}.`,
    });
  }

  return {
    byteLength,
    subject: getDecoded('subject') ?? '',
    from,
    to,
    cc,
    replyTo,
    sender,
    returnPath,
    date: getDecoded('date'),
    messageId: getDecoded('message-id'),
    mimeVersion: get('mime-version'),
    contentType: get('content-type'),
    domains: {
      from: fromDomains,
      replyTo: replyDomains,
      sender: senderDomains,
      to: uniqueDomains(to),
      returnPath: returnPathDomain,
    },
    received,
    duplicates,
    findings,
    headers,
    warnings: parsed.warnings,
    limitations: [
      'Header findings are observations, not proof of spoofing.',
      'Received headers are written by mail systems and can be forged or rewritten.',
      'Display-name and domain comparisons are exact string comparisons; lookalike and punycode analysis is separate.',
      'Header order and count are reported as found; BlueKit does not repair malformed messages.',
    ],
  };
}
