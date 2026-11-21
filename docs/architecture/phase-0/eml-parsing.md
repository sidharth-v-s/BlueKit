# `.eml` Parsing in the Browser

**Status:** prototype · 2026-11-20

## Question

Can a useful phishing/email triage surface be built with no mail library, no DOM rendering of hostile HTML, and no upload?

## Decision

Ship a **dependency-free RFC 822 / MIME parser prototype** (`src/tools/email/rfc822.ts`) with an explicit limitations list. Keep the catalog status `prototype` until authentication checks, charset edge cases, and a larger fixture corpus exist.

## What works

- Header unfolding, including CRLF folds.
- Address-list parsing with quoted display names and angle addresses.
- RFC 2047 encoded-words (`B` and `Q`) for common charsets.
- Quoted-printable and Base64 transfer decoding.
- Recursive `multipart/*` traversal with depth and part-count caps.
- First `text/plain` and `text/html` bodies.
- URL extraction from text and entity-decoded HTML.
- Attachment detection by disposition, filename, or non-text content type.
- Attachment SHA-256 (first 50 attachments), byte size, content type, transfer encoding, and a 16-byte magic prefix.
- Observations for `<script>` and remote-resource references in HTML.
- Received-chain and authentication header capture (`Authentication-Results`, `Received-SPF`, `DKIM-Signature`, etc.) as raw evidence.

## What it deliberately does not do

| Limitation | Consequence |
|---|---|
| No SPF/DKIM/DMARC cryptographic verification | Headers are reported, not trusted. The UI must say "claimed", not "valid". |
| RFC 2231 parameter continuations/charsets are not fully decoded | Some non-ASCII filenames remain encoded. |
| Nested `message/rfc822` parts are summarized, not recursively analyzed | Forwarded-message phishing can hide one level down. |
| Malformed MIME is tolerated, not repaired | The tree reflects what was present; warnings are shown. |
| HTML is never rendered with scripts | Safe preview only; remote resources are reported, not fetched. |
| No full RFC 5322 grammar | Obscure address forms may parse imperfectly. |
| Unknown charsets fall back to UTF-8 then byte-preserving text | Some text may be mojibake; the fallback is visible. |

## Evidence

Unit tests cover:

- CRLF header unfolding;
- RFC 2047 B/Q decoding (`Hello 🌏`, `café`);
- quoted-printable soft line breaks;
- quoted display names in address lists;
- a multipart message with a Base64 `.exe` attachment (filename, size, magic `00 01 02 03 04`, 64-hex SHA-256);
- HTML `<script>` and remote-resource observations;
- a missing multipart boundary producing a warning rather than silent data loss.

The parser is used by `email.eml-inspector`. At the time of this Phase 0 note it was registered as `prototype`, not `available`.

> **Phase 3 update:** `email.eml-inspector` is now `available` (v0.2.0) and runs in a worker. RFC 2231/2047 decoding, part/depth caps, malformed-Base64 reporting, and the separate MailSleuth tools are documented in [Phase 3](../phase-3/README.md).

## Product rules

- **Never upload the message.** The tool's manifest declares `network: "none"` and `dataHandling: "local-only"`.
- **Never execute or open attachments.** Only metadata, a bounded text preview, and a hash are produced.
- **Defang URLs in the report, not in the analysis.** The analyst needs the real indicator; the UI can offer a defanged copy.
- **Authentication results are evidence, not verdicts.** A missing `Authentication-Results` header is not proof of spoofing.
- **Show parser warnings prominently.** Silent partial parses are worse than an honest error.

## Next steps before promotion

1. Add a fixture corpus of real-world malformed messages with expected output.
2. Decode RFC 2231 parameters and additional charsets.
3. Add explicit `message/rfc822` recursion with a depth cap.
4. Add defang/refang and IOC extraction as separate, testable steps.
5. Decide whether to implement SPF/DKIM/DMARC verification or link out; do not fake a verdict.
6. Add a size cap and streaming strategy for very large messages.
