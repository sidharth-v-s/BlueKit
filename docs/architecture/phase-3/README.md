# Phase 3 — MailSleuth and the IOC Workspace

Phase 3 adds the email-analysis module MailSleuth and the IOC workspace. Every email tool is available, runs in a worker, and makes no network request. MailSleuth is reachable at `#/mailsleuth` and through the Email category in the catalog; the workspace is reachable at `#/ioc`.

The scope is deliberately evidence-first: BlueKit parses, extracts, hashes, and explains. It does not authenticate mail, assign a phishing verdict, fetch a URL, or upload an attachment.

## Implemented

| Tool | Engine | Input | Output | Notes |
|---|---|---|---|---|
| EML Inspector | worker | `.eml` file or pasted message | JSON | Headers, MIME tree, bodies, URLs, attachment metadata |
| Header Analyzer | worker | `.eml`, header block, or pasted message | JSON | Identity comparison, Received chain, duplicates, findings |
| Authentication Results | worker | `.eml`, header block, or pasted message | JSON | SPF/DKIM/DMARC/ARC claims with attribution and caveats |
| Email URL Extractor | worker | `.eml`, text, or HTML | JSON | Original, normalised, and defanged URLs; never fetched |
| Attachment Extractor | worker | `.eml` or pasted message | JSON + downloads | Decoded bytes, SHA-1/SHA-256, magic-byte type, risk flags |

`email.report` remains a planned catalog entry. The rest of the MailSleuth requirement — independent authentication checks, provider enrichment, and report generation — is intentionally not enabled yet.

## Workflow

The MailSleuth view presents the tools as independent steps:

1. Parse the raw message with EML Inspector.
2. Compare sender identities and the Received chain with Header Analyzer.
3. Read the relay's authentication claims with Authentication Results.
4. Triage links with Email URL Extractor.
5. Inspect and hash attachments with Attachment Extractor.

Each tool accepts the raw message on its own, so an analyst can skip steps. No tool depends on a shared session object or on another tool having run first.

## IOC workspace

`#/ioc` is a route-level workspace for indicator sets, not a separate parser. It calls the same pure functions as the Phase 2 catalog tools:

- **Extract from text** uses `extractIocs` to find URLs, domains, IPv4/IPv6, emails, MD5/SHA hashes, and CVEs anywhere in a report, email body, or log excerpt.
- **Normalize list** uses `normalizeIndicators` to treat each non-empty line as one indicator, trimming comments, bullets, numbering, wrappers, and refanging defanged forms.

Both modes run on the main thread because the input is capped at 2 MiB and both functions are synchronous. The view does not duplicate parsing logic, so fixes to the tools apply to the workspace automatically.

Workspace behaviour:

- Results can be filtered by type and searched by value.
- URL, domain, and email rows display the defanged form. IP addresses, hashes, and CVEs display their canonical value.
- Every row offers a defanged copy action; rows whose display form differs also offer an explicit refanged copy with a warning.
- Bulk copy exports the currently visible rows as either defanged or refanged values, one per line.
- Extract mode shows occurrence counts and flags private IPv4/IPv6 ranges. Normalize mode shows occurrence counts and source line numbers.
- Warnings from the underlying report are shown in place. No indicator is fetched, resolved, opened, or verified.

The workspace intentionally does not persist input. Reloading clears it, and nothing is added to the archive.

## Input handling

- File bytes are read as a binary string so the parser sees the original octets. UTF-8 decoding happens per MIME part using the declared charset, with a UTF-8 fallback and a final byte-preserving fallback.
- The input cap is 10 MiB for every email tool. It is checked by the runner and again inside the tool.
- `looksLikeEmail` requires at least one recognised message header or two generic RFC 822 header lines. This keeps pasted bodies, URLs, and logs out of the parser while still accepting partial header dumps.
- Header-only tools parse with `decodeBodies: false`; MIME boundaries are still split so headers can be found, but payload bytes are not decoded.

## Parser behaviour

The parser is dependency-free and deliberately conservative.

- Header unfolding, duplicate headers, and original raw header text are preserved for evidence.
- RFC 2047 encoded-words are decoded in header values and filenames. Whitespace between adjacent encoded-words is removed.
- RFC 2231 parameter continuations (`filename*0*`, `filename*1*`) and extended values (`filename*=utf-8''…`) are assembled and percent-decoded.
- Base64 and quoted-printable bodies are decoded locally. Malformed Base64 is reported as a part-level `decodeError` and a warning instead of throwing.
- The part cap is enforced during traversal, not after the tree is built.

Parser caps:

| Limit | Value | Behaviour |
|---|---|---|
| MIME parts | 200 | Later parts are omitted; a warning is added |
| MIME depth | 10 | Deeper parts are omitted; a warning is added |
| Attachment hashes in EML Inspector | 50 | Later attachments keep metadata but no hash |

Known parser limits:

- Raw non-ASCII header bytes are decoded best-effort.
- Malformed MIME trees are tolerated, not repaired. A broken boundary can move content into the wrong part.
- Nested `message/rfc822` parts are summarised, not recursively analysed.
- Charset support is whatever the browser's `TextDecoder` provides.

## Header analysis

The Header Analyzer reports:

- `From`, `To`, `Cc`, `Reply-To`, `Sender`, `Return-Path`, `Date`, `Message-ID`, and `MIME-Version`.
- Domain sets for the visible identities and the envelope sender.
- Duplicate non-repeatable headers. `Received`, `DKIM-Signature`, `ARC-Seal`, `ARC-Message-Signature`, and `Authentication-Results` are expected to repeat and are excluded.
- A keyword-scanned Received chain with `from`, `by`, `via`, `with`, `id`, `for`, date, bracket IP, and the raw hop.
- Findings for missing or duplicate headers, invalid dates, display-name address mismatch, Reply-To/Sender/Return-Path domain differences, incomplete Received hops, and adjacent Received-chain mismatches.

Findings are observations. A different Reply-To is normal for bulk mail. A Received-chain mismatch can be a forged header or a rewriting gateway. The finding text says so.

## Authentication evidence

BlueKit does not perform SPF, DKIM, or DMARC verification. The tool reads what a relay claimed and tries to attribute the claim.

- `Authentication-Results` and `ARC-Authentication-Results` are parsed into authserv-id, version, methods, results, reasons, and method properties.
- `Received-SPF`, `DKIM-Signature`, `ARC-Message-Signature`, and `ARC-Seal` are parsed into their tag/value fields.
- The authserv-id is compared with `by` hosts in the Received chain. An unmatched authserv-id is flagged as unattributed evidence.
- SPF, DKIM, DMARC, and ARC outcomes are summarised with their source.
- A DMARC pass whose `header.from` does not align with the visible From domain is flagged.
- DKIM signatures without a `b=` value, incomplete ARC sets, and SPF envelope/From differences are reported.

Every report carries explicit caveats: the result is a relay claim, absence is not proof of spoofing, SPF authenticates the envelope sender rather than the visible From, and DKIM alignment depends on DMARC.

## URL extraction

- Text bodies, HTML bodies, and common HTML URL attributes (`href`, `src`, `action`, `formaction`, `poster`, `data`) are scanned.
- HTML entities are decoded before scanning. Unknown named entities are preserved.
- Defanged input is refanged for parsing: `hxxp`/`hxxps`, `[.]`, `[:]`, and `[@]`. The original text is always preserved in `original`.
- Each record carries `original`, `normalized`, and `defanged` forms, plus scheme, host, port, path, query, fragment, query keys, sources, occurrence count, and flags.
- Invisible and bidi control characters are removed before parsing and flagged.
- Flags include defanged scheme, refanged brackets, embedded credentials, non-standard port, IP-literal host, punycode host, non-HTTP scheme, and very long URL.

Nothing is fetched, resolved, preloaded, or opened. Grouping is by exact hostname; registrable-domain grouping needs a Public Suffix List dataset, which this build does not bundle.

The result view displays the defanged form and offers separate copy actions for the defanged and refanged values. Copying never opens the URL; the refanged copy is labelled with a warning.

## Attachment extraction

- Attachments and non-text MIME parts are decoded locally. Hashes are calculated over the decoded bytes, not the MIME text.
- SHA-1 and SHA-256 are calculated with WebCrypto for up to 50 attachments.
- Type detection reads the first 4 KiB and reports declared MIME and detected magic-byte type separately, with the evidence string.
- Risk flags include risky extension, macro-enabled document, double extension, inline-with-filename, body decode error, empty part, executable content, archive container, active HTML, and declared/detected MIME mismatch.
- Text-like attachments and JSON get a short decoded preview.
- Each attachment has a download button. The JSON export replaces Base64 payloads with a placeholder, so bytes only leave the worker through an explicit download.

Attachment caps:

| Limit | Value | Behaviour |
|---|---|---|
| Hashed attachments | 50 | Later attachments keep metadata but no hash |
| Per-attachment download data | 10 MiB | Larger attachments are metadata-only |
| Total download data | 16 MiB | Later attachments are metadata-only |
| Magic-byte read | First 4 KiB | Larger files are not read for detection |

Risk flags are observations. An `.exe` extension and executable magic bytes are meaningful, but neither is a malware verdict.

## Limits

| Tool | Input limit | Timeout |
|---|---|---|
| EML Inspector | 10 MiB | 45 s |
| Header Analyzer | 10 MiB | 30 s |
| Authentication Results | 10 MiB | 30 s |
| Email URL Extractor | 10 MiB | 30 s |
| Attachment Extractor | 10 MiB | 45 s |

The worker is terminated on cancellation or timeout. That is the backstop for parsing and hashing work that cannot be interrupted cooperatively.

## Provider integration

The provider matrix in `src/core/integrations/providers.ts` records CORS evidence, credential expectations, quota notes, and terms status for the candidates in the spec.

- `CONNECTORS_ENABLED` is `false`. No provider connector runs, and no consent or key-management UI is shipped.
- HIBP Pwned Passwords is the only provider marked `supported`; it is still not wired into an email workflow.
- OTX, NVD, Cloudflare DoH, MITRE ATT&CK, and RDAP showed permissive CORS evidence and remain candidates.
- VirusTotal, AbuseIPDB, URLhaus, MalwareBazaar, and CISA KEV are blocked or dataset-only for direct browser use.
- GreyNoise is inconclusive; Google Safe Browsing is policy-restricted.

The production CSP keeps `connect-src 'self'`. Enabling any connector requires a deliberate CSP change, a consent flow, key handling that never persists secrets, per-provider rate-limit handling, and a review of the provider's terms. None of that is in scope for this phase.

## Security and privacy decisions

- **No HTML rendering.** Email HTML is decoded to text and scanned for URLs. Broken markup, scripts, and remote resources are never placed in a live document context.
- **No URL contact.** The extractor does not call `fetch`, resolve DNS, preload, or navigate. Punycode is flagged from the hostname, not resolved.
- **No recursive MIME expansion.** `message/rfc822` is summarised so a message cannot force unbounded recursion.
- **Bounded output.** Part count, depth, hash count, per-attachment data, total data, and worker timeouts are all capped.
- **Explicit downloads.** Attachment bytes are written to disk only when the analyst clicks the download button.
- **Evidence preserved.** Raw headers, raw Received hops, original URL text, declared MIME types, and magic-byte evidence are kept alongside normalised values.

## Residual risk

- Header analysis is heuristic. Keyword scanning of Received headers and string comparison of hostnames can be misled by aliases, gateways, and unusual vendor syntax.
- Authentication attribution is a string match between an authserv-id and a Received `by` host. It is not a cryptographic chain check.
- SPF, DKIM, DMARC, and ARC results are relay claims. BlueKit cannot detect a malicious or compromised relay from the message alone.
- Malformed MIME is tolerated. Content can be attributed to the wrong part, and a broken boundary may hide later parts.
- URL extraction is regex-based. It can miss obfuscated links, relative links, and URLs split by markup, and it can produce false positives from prose.
- Exact-host grouping is not registrable-domain grouping. Subdomains and public-suffix structure are not collapsed.
- Magic-byte coverage is the hand-authored table from Phase 2. Unknown formats fall back to low-confidence or binary results.
- Attachment risk flags are not malware analysis. No archive expansion, macro inspection, or sandboxing is performed.
- Decoded attachment bytes and Base64 output are held in worker and main-thread memory. The caps bound the exposure but browser memory ceilings vary.
- Hashes cover decoded MIME payload bytes. A provider that hashes a re-encoded or transformed file may report a different value.
- An analyst can still copy a URL or download an attachment. BlueKit removes automatic exposure, not human risk.

## Deferred

- `email.report` local report generation (planned).
- Independent SPF, DKIM, DMARC, and ARC verification.
- Recursive `message/rfc822` analysis.
- Registrable-domain grouping with a versioned Public Suffix List dataset.
- Lookalike-domain and homoglyph scoring beyond punycode flagging.
- Provider enrichment connectors, consent UI, key handling, and CSP changes.
- Archive expansion, macro inspection, and attachment detonation-adjacent analysis.
