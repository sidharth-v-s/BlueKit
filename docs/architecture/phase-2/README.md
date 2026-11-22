# Phase 2 — Core Analyst Utilities

Phase 2 turns the foundation into daily-use tools. The initial utility set is complete; remaining roadmap items are listed at the end.

## Implemented

| Tool | Engine | Input | Output | Notes |
|---|---|---|---|---|
| Base64 Encode & Decode | main | text | text | Standard and URL-safe; hex fallback for non-UTF-8 |
| Hash Calculator | worker | text or file | JSON report | SHA-1/256/384/512; text or a local file |
| Base32 Encode & Decode | main | text | text | RFC 4648 standard alphabet |
| Hex Encoder & Decoder | main | text | text | Strict decoding; plain/spaced/colon/0x formats |
| URL Encode & Decode | main | text | text | Component and full-URI scopes; strict escapes |
| HTML Entity Encode & Decode | main | text | text | Named + numeric references; unknown entities preserved |
| ROT-N / ROT13 | main | text | text | ASCII letters only; obfuscation warning |
| Defang & Refang | main | text | text | `hxxp`, `[.]`, `[@]`, `[:]` conventions |
| JSON Formatter & Validator | main | text | JSON report | `JSON.parse` semantics; line/column fallback scanner |
| Timestamp Converter | main | text | JSON report | Ambiguous numeric widths return candidates |
| IOC Extractor | main | text | JSON report | Heuristic extraction; refangs common defanged forms |
| Bulk IOC Normalizer | main | text | JSON report | One-per-line cleanup, classification, dedupe |
| File Type Identifier | main | file | JSON report | 4 KiB magic-byte read; never trusts extension |
| HMAC Calculator | worker | text | JSON report | WebCrypto SHA-1/256/384/512; key never reported |
| Regex Tester & Extractor | worker | text | JSON report | ReDoS guard + worker termination on timeout |
| Strings Extractor | worker | file | text | ASCII + UTF-16LE, both byte alignments, bounded |
| Entropy Calculator | worker | file | JSON report | Whole file + 1 KiB chunks |
| YAML Validator & Formatter | worker | text | JSON report | Pinned `yaml@2.9.1`; duplicate keys rejected |
| XML Formatter & Checker | main | text | JSON report | Scanner, not a DOM parser; entities never resolved |
| Unicode Inspector | main | text | JSON report | Code points, UTF-8/UTF-16 bytes, normalization, hidden characters, small confusable map |
| XOR | main | text | text | Repeating-key; symmetric, so decode uses the same tool |
| Gzip / Zlib | worker | file or text | JSON report | gzip, zlib, raw deflate; expansion capped at 64 MiB |
| Data Comparison | main | text | unified diff | Two blocks separated by a line containing `---` |

## Runner parameters

Tools that need a switch expose `ui.fields` in the manifest. The generic
runner renders selects, text fields, and toggles and passes their values in
`RunnerInput.params`. The main payload still travels through typed input
ports; parameters are deliberately small and serializable. This is why the
regex, HMAC, YAML, encoding, compression, and comparison tools need no bespoke
UI. `readChoice` validates select values against the manifest options; a stale
or crafted parameter cannot select an unsupported branch.

## Shared decisions

### Bounded, local, honest

Every tool reads local input only. File tools use `File`/`Blob` slicing where possible. CPU-heavy or potentially unbounded work (hash, HMAC, regex, YAML, strings, entropy, compression) runs in a worker with a declared timeout and a hard output cap.

### Reports, not verdicts

- JSON validity is exact; everything else is a hint.
- IOC extraction is regex-based. Domains can include filenames or product names that look like domains; the report says so.
- Magic bytes identify containers, not intent. OOXML/JAR/APK remain "ZIP container" until deeper parsing exists.
- High entropy means compression, encryption, or packing — not malware.
- Timestamp ambiguity is shown as multiple candidates, not silently resolved.
- ROT-N and defanging are obfuscation/sharing conventions, not security controls.
- XML entity declarations are reported but never expanded or fetched.

### Limits

| Tool | Input limit | Timeout |
|---|---|---|
| Base64 encode | 4 MiB | 30 s |
| Base64 decode | 8 MiB | 30 s |
| Hash | 64 MiB | 45 s |
| Base32 | 4 MiB | 30 s |
| Hex | 8 MiB | 30 s |
| URL | 2 MiB | 30 s |
| HTML entities | 4 MiB | 30 s |
| ROT-N | 4 MiB | 30 s |
| Defang / refang | 2 MiB | 30 s |
| JSON | 8 MiB | 30 s |
| Timestamp | 64 KiB | 30 s |
| IOC extractor | 2 MiB | 30 s |
| Bulk IOC normalizer | 2 MiB | 30 s |
| File type | 512 MiB (4 KiB read) | 30 s |
| HMAC | 8 MiB | 30 s |
| Regex | 512 KiB | 10 s |
| Strings | 64 MiB | 45 s |
| Entropy | 64 MiB | 45 s |
| YAML | 2 MiB | 30 s |
| XML | 8 MiB | 30 s |
| Unicode inspector | 512 KiB | 30 s |
| XOR | 8 MiB | 30 s |
| Gzip / Zlib | 16 MiB in; 64 MiB out | 45 s |
| Data comparison | 2 MiB | 30 s |

The runner enforces the input limit before a tool executes. Tools still re-check file size because the worker path is a separate boundary.

## Implementation notes

### JSON error positions

Chromium includes `position N` in `JSON.parse` errors. Node's V8 in 2026 does not. When the engine omits the position, the tool walks the document with a small JSON grammar scanner to find the first syntax error. This keeps the UI consistent across environments without shipping a full parser.

### IOC refanging

Common forms are normalized before extraction:

- `hxxp` / `hxxps` → `http` / `https`
- `[.]`, `(.)`, `{.}` → `.`
- `[:]` → `:`
- `[@]`, `(@)` → `@`

IPv4 candidates are validated octet-by-octet and rejected when embedded in a longer dotted sequence. IPv6 candidates are validated with the URL parser. Private/loopback/link-local addresses are flagged, not removed.

The bulk normalizer is line-oriented: it strips bullets, numbering, quotes, and
trailing punctuation, refangs, lowercases URL hosts without touching paths,
then deduplicates case-insensitively while keeping source line numbers.
Unclassifiable lines are kept as `unknown`, never silently dropped.

### Regex safety

JavaScript regular expressions cannot be interrupted cooperatively. The tool
therefore runs in a worker and relies on terminating that worker when the
timeout expires. A static check rejects the obvious nested-quantifier shapes
(`(a+)+`, `(a*)*`) and multiple unbounded wildcards before execution. This is a
speed bump, not a proof: a pattern that passes the static check can still be
slow, and the worker timeout is the real backstop.

### YAML

The tool pins `yaml@2.9.1`, parses with the core schema, `strict: true`, and
`uniqueKeys: true`, and reports line/column positions from the library's pretty
errors. Formatting normalises through `toJS()` → `stringify()`, so anchors and
aliases are resolved in the output.

The pin moved from 2.8.1 to 2.9.1 for the upstream fix to a stack-overflow
advisory on deeply nested collections. The YAML tool remains worker-bounded, and
Rule Studio adds its own depth, alias, and input caps for untrusted rules.

### XML

The scanner validates element nesting, attribute quoting and uniqueness, entity
syntax, comment/CDATA termination, and single-root structure. Formatting uses
indentation only for element-only content; mixed content stays on one line so
whitespace is not changed. `DOCTYPE` declarations are preserved as text and
flagged. No entity is expanded, and no external identifier is resolved.

### Strings

ASCII runs use printable bytes including tab. UTF-16LE requires a printable low byte and a zero high byte. Both even and odd start offsets are scanned. Output is capped at 5,000 matches and 512 characters per string; truncation is explicit.

### Entropy

Shannon entropy in bits per byte. Chunks default to 1 KiB. The report includes overall entropy, per-chunk min/average/max, a five-bucket histogram, and up to 25 high-entropy chunks (≥7.2 bits/byte).

### Unicode inspection

The inspector iterates by code point, not UTF-16 index. It reports both
`characters` (UTF-16 units) and `codePoints` because the difference matters for
length checks, filters, and log parsers. Each listed character includes its
code point, UTF-8 and UTF-16 bytes, width, and findings: control, format,
zero-width, bidi, combining, variation selector, tag, private-use,
noncharacter, surrogate, non-ASCII, and confusable.

Normalization uses the platform's `String.prototype.normalize` (NFC, NFD, NFKC,
NFKD) and reports whether the form changed the text. The confusable map is a
small, hand-authored Latin lookalike table; it is a hint, not a homoglyph
detector. Warnings exclude plain non-ASCII characters, since international text
is normal.

### XOR

XOR is symmetric, so one tool covers encoding and decoding. Input and key can be
UTF-8 text or hex bytes. Output defaults to an escaped display form because XOR
almost never yields valid UTF-8; hex and Base64 are available for exact
round-trips. The tool applies a repeating key only. It does not search for keys,
score candidate plaintext, or claim to break encryption.

### Compression

Compression uses the browser's `CompressionStream` and `DecompressionStream`
for gzip, zlib (`deflate`), and raw deflate. It runs in a worker and reads the
stream incrementally, aborting as soon as the output exceeds 64 MiB. That cap
is the defence against a small gzip bomb expanding without bound. Text input for
decompression auto-detects Base64 or hex (hex first, because a hex gzip header
is also Base64-alphabet text); plain text is the fallback. Decompressed bytes
are shown as text only when they are valid UTF-8, otherwise as escaped bytes,
and only the first 1 MiB is previewed.

This is not a ZIP reader. A ZIP archive needs central-directory parsing and
per-entry limits, which is a later tool.

### Data comparison

Two blocks arrive in one text box because the generic runner has one text
input. A whole line equal to the separator (default `---`) divides them. The
diff trims common prefix and suffix, then runs an LCS over the remaining lines.
The dynamic-programming table is capped at 2,000,000 cells; above that, the
changed region is shown as a full replacement and the result carries a
`diff-coarse` warning. Output is a unified diff with configurable context
(0–20 lines). Whitespace-insensitive comparison collapses runs of whitespace
and trims both sides before comparing, while the output preserves the original
lines.

### File signatures and datasets

No third-party dataset is bundled in Phase 2. The magic-byte table used by the
File Type Identifier is hand-authored from public format documentation and
lives with the tool. That is sufficient for triage, but it is not a complete
signature corpus. The planned File Signature Reference tool and its
`file-signatures` dataset entry remain Phase 5 work, with `version: null` and
`status: "planned"` until a source, licence, release timestamp, and checksum can
be recorded together. Structured field-level comparison across JSON/YAML
records is likewise deferred; Phase 2 ships the line diff.

## Deferred beyond Phase 2

Nothing remains from the Phase 2 utility scope. These items were considered and
left for later phases:

- File Signature Reference browser (Phase 5; the current table is embedded in
  file-type detection)
- Field-level structured comparison for JSON/YAML records (Phase 6)
- ZIP archive inspection with per-entry expansion limits (Phase 6)

## Residual risk

- File tools allocate the whole file in memory on the worker path. Limits are conservative but browser memory ceilings vary.
- Regex extraction is language-agnostic and will produce false positives. Do not use it as an authoritative feed without validation.
- The static ReDoS check does not catch every pathological pattern; only the worker timeout bounds execution.
- YAML formatting resolves anchors/aliases, so it is a normaliser rather than a source-preserving formatter.
- The XML checker is not a conforming XML processor. It does not validate against a schema or expand entities.
- Timestamp support covers common widths, not every vendor-specific epoch. Add formats only with a named source and test vector.
- The 64 MiB decompression cap is checked after each streamed chunk. A single chunk can briefly push the worker's memory high-water mark above the cap; worker termination remains the backstop.
- XOR does not recover keys or rank candidate plaintext. A successful-looking decode is not proof of the original content.
- The Unicode confusable table is deliberately small. NFKC plus visual review is the useful check; the findings list is not a phishing verdict.
- The line diff falls back to whole-region replacement above the cell cap, so it is not always a minimal edit script.
- File-type coverage is limited to the hand-authored magic table. Unknown or short signatures can produce low-confidence or binary fallbacks.
