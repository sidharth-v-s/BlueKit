# Phase 4 — YARA Studio

**Status:** implemented · 2026-11-23 · route `#/yara`

YARA Studio compiles YARA rules with the pinned YARA-X WebAssembly build and scans
user-selected local files. Compilation and scanning run in the existing tool
worker; the view never imports the engine and never touches file bytes on the
main thread.

The page is an authoring and triage aid. A match shows what the rule and engine
reported for those bytes. It is not a malware verdict, a portability guarantee,
or a claim that the rule is a good detection.

## Engine

| Property | Value |
|---|---|
| Engine | YARA-X |
| Package | `@virustotal/yara-x@1.23.0` |
| Licence | BSD-3-Clause |
| Runtime | WebAssembly in the shared tool worker |
| WASM size | ≈5.91 MB (≈2.09 MB gzip) |
| Initialisation | `init()`; the package resolves its own same-origin WASM URL |
| API used | `Compiler.addSource`, `Compiler.build`, `Rules.scanner`, `Scanner.setTimeoutMs`, `Scanner.setMaxMatchesPerPattern`, `Scanner.scan` |
| Resource handling | `Compiler`, `Rules`, and `Scanner` are freed explicitly |

The engine module is reached through a dynamic import inside the worker handler.
The WASM binary is therefore absent from startup and from the initial worker
bundle. Vite emits it as `assets/yara_x_js_bg-*.wasm`, so the production CSP
keeps `connect-src 'self'` and no CDN is involved.

YARA-X is not byte-for-byte YARA 4.x. Results and documentation name the engine
and version. Do not describe a match as generic “YARA compatible” without that
context, the rule source, and the scan limits.

## Implemented

| Piece | Behaviour |
|---|---|
| Rule editor | Multi-rule YARA source, open `.yar`/`.yara`, example rule, clear, export exact source |
| Snippets | Rule skeleton, strings, metadata, condition, `import` |
| Compile validation | Worker compile report with the engine's original errors and warnings |
| Import notes | Detects top-level imports and warns about `vt`, undocumented modules, and `include` |
| Scan targets | Up to 10 local files, 32 MiB each, 64 MiB total, browser file picker or drag-and-drop |
| Scan results | Per-file match/no-match/error, matched rule names, namespace, tags, metadata, string identifiers, offsets, lengths, and bounded hex previews |
| Progress and cancel | Per-file worker progress, explicit cancel, hard worker-manager budget |
| Compatibility | Engine version, licence, supported-feature matrix, module list, and limits in the UI |
| Export | Downloads the exact rule source as `.yar`; no attribution comments are injected |

The generic tool runner also exposes `detection.yara-studio`. Its text field is
the rule source, and an optional file produces a single-file scan. The dedicated
view uses the same worker tool id with an explicit multi-file payload.

## Limits

| Limit | Value | Behaviour |
|---|---|---|
| Rule source | 1 MiB | Rejected before the worker job starts |
| Files per job | 10 | Further additions are refused |
| One file | 32 MiB | Empty or oversized files are refused |
| All files | 64 MiB | The job is refused before reading |
| Engine scan timeout | 10 s per file | Passed to `Scanner.setTimeoutMs`; best effort |
| Worker job budget | 60 s | The worker is terminated when it elapses |
| Matches per pattern | 20 | `Scanner.setMaxMatchesPerPattern` and display cap |
| Matched rules per file | 100 | Additional rules are dropped and the report is marked truncated |
| Patterns per rule | 50 | Additional patterns are dropped and the report is marked truncated |
| Engine messages | 20 × 4,000 chars | Longer lists and messages are truncated |

YARA-X's timeout is not a security boundary. A pathological regex can keep the
scanner busy past its budget, which is why the worker-manager budget terminates
the worker instead of waiting forever. Termination discards the WASM state; the
next run starts a new worker.

## Supported-feature matrix

| Area | Support | Notes |
|---|---|---|
| Rule syntax | supported | Rules, metadata, tags, private/global rules, comments, conditions |
| Strings | supported | Text, hex, regex, and modifiers accepted by the engine |
| Conditions | supported | Full YARA-X condition language |
| Modules | engine-dependent | `pe`, `elf`, `dotnet`, `macho`, `lnk`, `hash`, `math`, `time`, `string`, `console`, `cuckoo` compile in this build |
| `vt` module | unsupported | BlueKit provides no VirusTotal data or network lookups |
| Includes | unsupported | No filesystem is exposed; keep rules self-contained |
| External variables | unsupported | The UI defines none; undefined externals fail compilation |
| Scan timeout | limited | Best effort; worker termination is the hard stop |
| Portability | engine-dependent | YARA-X 1.23.0 behaviour, not a promise about another engine |

Unknown modules are left to the engine, which reports a compile error. The UI
warning is an explanation, not a second parser.

## Result semantics

- `valid: true` with no matches means the rules compiled and none fired on that
  file. It does not mean the file is clean.
- `valid: false` on a file means the engine reported a scan error, such as a
  timeout or resource failure. The original messages are kept.
- A compile failure means no file was scanned.
- Offsets and lengths are byte offsets into the scanned file.
- Hex previews are bounded to 16 bytes and may show `…` when the match is longer.
- Private rules still appear with their `private` flag; global rules keep their
  `global` flag. Tags and metadata are the engine's, not inferred by BlueKit.
- Display truncation is explicit. Nothing is silently dropped without a note.

## Tests

`tests/unit/yara.test.ts` covers source and file caps, import inspection, result
normalization, truncation, previews, and unexpected engine payloads.

`tests/unit/yara-job.test.ts` covers generic and dedicated payload normalization,
file-count limits, empty files, and non-File entries.

`tests/unit/yara-engine.test.ts` initialises the real pinned WASM build in Node
and covers:

- text, hex, regex, metadata, and tags from `tests/fixtures/yara/basic.yar`;
- a valid no-match result;
- engine compile errors for `tests/fixtures/yara/invalid.yar`;
- compile warnings;
- idempotent `free()` and refusing scans after release;
- validate-only calls that release compiled rules.

The browser worker path has an end-to-end smoke test in
`tests/e2e/yara.spec.ts` that validates the example rule and scans an uploaded
file. It was not run in this environment because Playwright has no installed
browser; run `npx playwright install chromium` before `npm run test:e2e`.

## Known gaps

- No syntax highlighting; the editor is a mono textarea with snippets.
- No YARA rule library, collections, favourites, revision history, or diffs.
- No metadata editor separate from the rule text.
- No archive, directory, or memory scanning; targets are individual files.
- No automatic rule migration between YARA and YARA-X.
- No scan history. Export or copy the report if it needs to be retained.

## Sources

- YARA-X: <https://github.com/VirusTotal/yara-x>
- Package: `@virustotal/yara-x@1.23.0`, BSD-3-Clause
- Feasibility notes: `docs/architecture/phase-0/yara.md`
