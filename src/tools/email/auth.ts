import type { HeaderFinding } from './headers';
import { parseReceivedHop } from './headers';
import type { EmailAddress, EmlHeader } from './rfc822';
import { decodeEncodedWords, parseAddressList, parseEmlMessage } from './rfc822';

/**
 * Authentication evidence parsing.
 *
 * BlueKit does not perform SPF, DKIM, or DMARC verification. It reports what the
 * named authenticating system claimed, preserves the raw evidence, and explains
 * why independent verification is unavailable in a static browser app. Do not
 * turn any of these fields into a "safe"/"phishing" verdict.
 */

export interface AuthMethodResult {
  method: string;
  result: string;
  reason: string | null;
  properties: Record<string, string>;
  raw: string;
}

export interface AuthenticationResultsHeader {
  source: 'authentication-results' | 'arc-authentication-results';
  authservId: string | null;
  version: number | null;
  methods: AuthMethodResult[];
  raw: string;
}

export interface ReceivedSpfResult {
  result: string;
  reason: string | null;
  properties: Record<string, string>;
  raw: string;
}

export interface DkimSignature {
  domain: string | null;
  selector: string | null;
  algorithm: string | null;
  canonicalization: string | null;
  signedHeaders: string[];
  bodyHash: string | null;
  signaturePresent: boolean;
  timestamp: string | null;
  identity: string | null;
  raw: string;
  tags: Record<string, string>;
}

export interface TagValueHeader {
  raw: string;
  tags: Record<string, string>;
}

export interface AuthOutcome {
  /** Where the claim came from: an Authentication-Results header or Received-SPF. */
  source: string;
  result: string;
  domain: string | null;
  detail: string;
}

export interface AuthAnalysis {
  byteLength: number;
  authenticationResults: AuthenticationResultsHeader[];
  arcAuthenticationResults: AuthenticationResultsHeader[];
  receivedSpf: ReceivedSpfResult[];
  dkimSignatures: DkimSignature[];
  arcMessageSignatures: TagValueHeader[];
  arcSeals: TagValueHeader[];
  summary: {
    spf: AuthOutcome[];
    dkim: AuthOutcome[];
    dmarc: AuthOutcome[];
    arc: string[];
  };
  authservIds: string[];
  attribution: { authservId: string; matchedReceivedBy: string[] }[];
  findings: HeaderFinding[];
  caveats: string[];
  rawHeaders: { name: string; value: string }[];
  warnings: string[];
}

function splitTopLevel(input: string): string[] {
  const segments: string[] = [];
  let current = '';
  let depth = 0;
  let inQuotes = false;
  for (const char of input) {
    if (char === '"') inQuotes = !inQuotes;
    if (!inQuotes) {
      if (char === '(') depth += 1;
      else if (char === ')' && depth > 0) depth -= 1;
      else if (char === ';' && depth === 0) {
        segments.push(current);
        current = '';
        continue;
      }
    }
    current += char;
  }
  segments.push(current);
  return segments;
}

function takeComments(input: string): { text: string; comments: string[] } {
  const comments: string[] = [];
  const text = input.replace(/\(([^()]*)\)/gu, (_, comment: string) => {
    const trimmed = comment.trim();
    if (trimmed.length > 0) comments.push(trimmed);
    return ' ';
  });
  return { text, comments };
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of input) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && /\s/u.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
}

function parseKeyValueToken(token: string): { key: string; value: string } | null {
  const equals = token.indexOf('=');
  if (equals <= 0) return null;
  return { key: token.slice(0, equals).toLowerCase(), value: unquote(token.slice(equals + 1)) };
}

export function parseAuthenticationResults(
  value: string,
  source: AuthenticationResultsHeader['source'],
): AuthenticationResultsHeader {
  const segments = splitTopLevel(value.replace(/\r?\n[ \t]*/gu, ' '));
  const first = segments.shift()?.trim() ?? '';
  const firstClean = takeComments(first).text.trim();
  const firstTokens = tokenize(firstClean);
  const authservId = firstTokens[0] && !firstTokens[0].includes('=') ? firstTokens[0] : null;
  const versionToken = authservId ? firstTokens[1] : undefined;
  const version = versionToken && /^\d+$/u.test(versionToken) ? Number.parseInt(versionToken, 10) : null;

  const methods: AuthMethodResult[] = [];
  for (const segment of segments) {
    if (!segment.trim()) continue;
    const { text, comments } = takeComments(segment);
    const tokens = tokenize(text.trim());
    if (tokens.length === 0) continue;
    const methodToken = tokens.shift()!;
    const equals = methodToken.indexOf('=');
    if (equals <= 0) continue;
    const properties: Record<string, string> = {};
    for (const token of tokens) {
      const property = parseKeyValueToken(token);
      if (property) properties[property.key] = property.value;
    }
    methods.push({
      method: methodToken.slice(0, equals).toLowerCase(),
      result: methodToken.slice(equals + 1).toLowerCase(),
      reason: comments.length > 0 ? comments.join('; ') : properties['reason'] ?? null,
      properties,
      raw: segment.trim(),
    });
  }

  return { source, authservId, version, methods, raw: value };
}

export function parseReceivedSpf(value: string): ReceivedSpfResult {
  const { text, comments } = takeComments(value.replace(/\r?\n[ \t]*/gu, ' '));
  const [head = '', ...rest] = splitTopLevel(text);
  const headTokens = head.trim().split(/\s+/u).filter(Boolean);
  const result = headTokens.shift()?.toLowerCase() ?? 'unknown';
  const properties: Record<string, string> = {};
  // Values such as client-ip often sit in the first segment after the result.
  for (const token of headTokens) {
    const property = parseKeyValueToken(token);
    if (property) properties[property.key] = property.value;
  }
  for (const segment of rest) {
    const property = parseKeyValueToken(segment.trim());
    if (property) properties[property.key] = property.value;
  }
  return {
    result,
    reason: comments.length > 0 ? comments.join('; ') : properties['problem'] ?? null,
    properties,
    raw: value,
  };
}

export function parseTagValueHeader(value: string): TagValueHeader {
  const tags: Record<string, string> = {};
  for (const segment of splitTopLevel(value.replace(/\r?\n[ \t]*/gu, ' '))) {
    const equals = segment.indexOf('=');
    if (equals <= 0) continue;
    tags[segment.slice(0, equals).trim().toLowerCase()] = segment.slice(equals + 1).trim();
  }
  return { raw: value, tags };
}

export function parseDkimSignature(value: string): DkimSignature {
  const { tags, raw } = parseTagValueHeader(value);
  return {
    domain: tags['d'] ?? null,
    selector: tags['s'] ?? null,
    algorithm: tags['a'] ?? null,
    canonicalization: tags['c'] ?? null,
    signedHeaders: tags['h'] ? tags['h'].split(':').map((header) => header.trim()).filter(Boolean) : [],
    bodyHash: tags['bh'] ?? null,
    signaturePresent: Boolean(tags['b']),
    timestamp: tags['t'] ?? null,
    identity: tags['i'] ?? null,
    raw,
    tags,
  };
}

function addressDomain(address: string): string | null {
  const at = address.lastIndexOf('@');
  return at === -1 ? null : address.slice(at + 1).toLowerCase().replace(/\.$/u, '');
}

function firstDomain(addresses: EmailAddress[]): string | null {
  return addresses.length > 0 ? addressDomain(addresses[0]!.address) : null;
}

function methodOutcomes(headers: AuthenticationResultsHeader[], method: string): AuthOutcome[] {
  const outcomes: AuthOutcome[] = [];
  for (const header of headers) {
    for (const result of header.methods) {
      if (result.method !== method) continue;
      outcomes.push({
        source: `${header.source === 'arc-authentication-results' ? 'ARC ' : ''}Authentication-Results (${header.authservId ?? 'unknown authserv-id'})`,
        result: result.result,
        domain:
          result.properties['header.d'] ??
          result.properties['header.from'] ??
          result.properties['smtp.mailfrom'] ??
          result.properties['smtp.helo'] ??
          null,
        detail: result.reason ?? result.raw,
      });
    }
  }
  return outcomes;
}

function sameHost(left: string, right: string): boolean {
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function failing(result: string): boolean {
  return ['fail', 'softfail', 'permerror', 'temperror', 'none'].includes(result);
}

export function analyzeAuthentication(raw: string, byteLength: number): AuthAnalysis {
  const parsed = parseEmlMessage(raw, { decodeBodies: false });
  const headers = parsed.root.headers;
  const byName = (name: string) => headers.filter((header) => header.name.toLowerCase() === name);
  const get = (name: string) => byName(name)[0]?.value ?? null;
  const getDecoded = (name: string) => {
    const value = get(name);
    return value === null ? null : decodeEncodedWords(value);
  };

  const authenticationResults = byName('authentication-results').map((header) =>
    parseAuthenticationResults(header.value, 'authentication-results'),
  );
  const arcAuthenticationResults = byName('arc-authentication-results').map((header) =>
    parseAuthenticationResults(header.value, 'arc-authentication-results'),
  );
  const receivedSpf = byName('received-spf').map((header) => parseReceivedSpf(header.value));
  const dkimSignatures = byName('dkim-signature').map((header) => parseDkimSignature(header.value));
  const arcMessageSignatures = byName('arc-message-signature').map((header) => parseTagValueHeader(header.value));
  const arcSeals = byName('arc-seal').map((header) => parseTagValueHeader(header.value));

  const allResults = [...authenticationResults, ...arcAuthenticationResults];
  const summary = {
    spf: methodOutcomes(authenticationResults, 'spf'),
    dkim: methodOutcomes(authenticationResults, 'dkim'),
    dmarc: methodOutcomes(authenticationResults, 'dmarc'),
    arc: arcAuthenticationResults.map((header) => header.authservId ?? 'unknown'),
  };
  for (const spf of receivedSpf) {
    if (summary.spf.length === 0) {
      summary.spf.push({
        source: 'Received-SPF',
        result: spf.result,
        domain: spf.properties['envelope-from'] ?? null,
        detail: spf.reason ?? spf.raw,
      });
    }
  }

  const authservIds = [...new Set(allResults.map((header) => header.authservId).filter((value): value is string => Boolean(value)))];
  const received = byName('received').map((header, index) => parseReceivedHop(header.value, index));
  const receivedBy = [...new Set(received.map((hop) => hop.by?.split(/[\s(;]/u)[0]?.toLowerCase()).filter((value): value is string => Boolean(value)))];
  const attribution = authservIds.map((authservId) => ({
    authservId,
    matchedReceivedBy: receivedBy.filter((host) => sameHost(host, authservId.toLowerCase())),
  }));

  const from = parseAddressList(getDecoded('from') ?? '');
  const fromDomain = firstDomain(from);
  const findings: HeaderFinding[] = [];
  const add = (finding: HeaderFinding) => {
    if (!findings.some((existing) => existing.code === finding.code && existing.message === finding.message)) {
      findings.push(finding);
    }
  };

  if (allResults.length === 0 && receivedSpf.length === 0) {
    add({
      severity: 'observation',
      code: 'no-authentication-evidence',
      message: 'No Authentication-Results, ARC-Authentication-Results, or Received-SPF header was found. Absence is not evidence of spoofing.',
    });
  }

  if (authservIds.length === 0 && allResults.length > 0) {
    add({
      severity: 'warning',
      code: 'missing-authserv-id',
      message: 'Authentication-Results is present but no authenticating domain (authserv-id) could be parsed. The claim cannot be attributed.',
    });
  }

  if (authservIds.length > 1) {
    add({
      severity: 'observation',
      code: 'multiple-authserv-ids',
      message: `Authentication results come from multiple authenticating domains: ${authservIds.join(', ')}. Compare them with the Received chain before trusting either.`,
    });
  }

  for (const item of attribution) {
    if (item.matchedReceivedBy.length === 0 && receivedBy.length > 0) {
      add({
        severity: 'warning',
        code: 'authserv-id-unattributed',
        message: `The Authentication-Results claim names "${item.authservId}", which does not match any Received "by" host in this message. Treat the result as unverified evidence.`,
      });
    }
  }

  for (const header of authenticationResults) {
    for (const result of header.methods) {
      if (result.method === 'spf' && result.result === 'fail') {
        add({
          severity: 'warning',
          code: 'spf-fail',
          message: 'The receiving system reported SPF fail. SPF authenticates the envelope sender, not necessarily the visible From address.',
          evidence: result.raw,
        });
      } else if (result.method === 'spf' && result.result === 'softfail') {
        add({
          severity: 'observation',
          code: 'spf-softfail',
          message: 'The receiving system reported SPF softfail. This is a weak signal and is often caused by forwarding.',
          evidence: result.raw,
        });
      }
      if (result.method === 'dkim' && failing(result.result)) {
        add({
          severity: result.result === 'fail' ? 'warning' : 'observation',
          code: `dkim-${result.result}`,
          message: `The receiving system reported DKIM ${result.result}. BlueKit did not verify the signature.`,
          evidence: result.raw,
        });
      }
      if (result.method === 'dmarc' && failing(result.result)) {
        add({
          severity: result.result === 'fail' ? 'warning' : 'observation',
          code: `dmarc-${result.result}`,
          message: `The receiving system reported DMARC ${result.result}. This is the strongest alignment signal in the header set, but it is still a relay's claim.`,
          evidence: result.raw,
        });
      }
      if (result.method === 'dmarc' && result.result === 'pass' && fromDomain) {
        const headerFrom = result.properties['header.from'];
        if (headerFrom && !sameHost(headerFrom.toLowerCase(), fromDomain)) {
          add({
            severity: 'warning',
            code: 'dmarc-pass-domain-mismatch',
            message: `DMARC pass names header.from "${headerFrom}", but the visible From domain is "${fromDomain}". This needs explanation.`,
            evidence: result.raw,
          });
        }
      }
    }
  }

  for (const spf of receivedSpf) {
    if (spf.result === 'fail') {
      add({
        severity: 'warning',
        code: 'received-spf-fail',
        message: 'Received-SPF reports fail. Check the envelope sender and whether the message was forwarded.',
        evidence: spf.raw,
      });
    } else if (spf.result === 'softfail') {
      add({
        severity: 'observation',
        code: 'received-spf-softfail',
        message: 'Received-SPF reports softfail. Forwarding commonly causes this.',
        evidence: spf.raw,
      });
    }
  }

  const dkimDomains = dkimSignatures.map((signature) => signature.domain).filter((value): value is string => Boolean(value));
  if (dkimDomains.length > 0 && fromDomain && !dkimDomains.some((domain) => sameHost(domain.toLowerCase(), fromDomain))) {
    add({
      severity: 'observation',
      code: 'dkim-domain-no-alignment',
      message: `DKIM signing domain (${dkimDomains.join(', ')}) does not match the From domain (${fromDomain}). Third-party signing is legitimate, but DMARC alignment depends on the policy and identifiers.`,
    });
  }
  for (const signature of dkimSignatures) {
    if (!signature.signaturePresent) {
      add({
        severity: 'warning',
        code: 'dkim-signature-empty',
        message: 'A DKIM-Signature header is present without a b= signature value.',
      });
    }
  }

  if (arcAuthenticationResults.length > 0 && (arcSeals.length === 0 || arcMessageSignatures.length === 0)) {
    add({
      severity: 'observation',
      code: 'arc-incomplete',
      message: 'ARC-Authentication-Results is present without a complete ARC-Seal/ARC-Message-Signature set. The ARC chain is incomplete.',
    });
  }

  for (const outcome of summary.spf) {
    const envelope = outcome.domain ?? '';
    if (fromDomain && envelope && envelope.includes('@') && !sameHost(addressDomain(envelope) ?? '', fromDomain)) {
      add({
        severity: 'observation',
        code: 'spf-envelope-domain-mismatch',
        message: `SPF was evaluated for envelope sender ${envelope}, while the visible From domain is ${fromDomain}. A pass does not authenticate the visible sender.`,
      });
    }
  }

  const rawHeaders = headers
    .filter((header) =>
      ['authentication-results', 'arc-authentication-results', 'received-spf', 'dkim-signature', 'arc-seal', 'arc-message-signature'].includes(
        header.name.toLowerCase(),
      ),
    )
    .map((header: EmlHeader) => ({ name: header.name, value: header.value }));

  const caveats = [
    'BlueKit did not perform independent SPF, DKIM, or DMARC verification. DNS lookups and signature validation require context this static browser build does not have.',
    'Authentication-Results is supplied by a mail system. Identify the authserv-id and compare it with the Received chain before trusting it.',
    'SPF authenticates the envelope sender. It does not authenticate the visible From header.',
    'DKIM proves a domain signed the message; it does not prove the signer is the visible sender unless DMARC alignment passes.',
    'DMARC pass is an alignment result reported by a relay. A missing or failing result is not automatically malicious.',
    'Absence of authentication headers is not evidence of spoofing; headers can be added downstream or stripped by export.',
  ];

  return {
    byteLength,
    authenticationResults,
    arcAuthenticationResults,
    receivedSpf,
    dkimSignatures,
    arcMessageSignatures,
    arcSeals,
    summary,
    authservIds,
    attribution,
    findings,
    caveats,
    rawHeaders,
    warnings: parsed.warnings,
  };
}
