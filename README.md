# BlueKit

A browser-native Blue Team workbench for parsing, inspecting, enriching, and authoring detections — locally, from static hosting, with no BlueKit backend.

BlueKit is built for analysts who need a quick, honest answer without uploading evidence to someone else's service. Everything runs in the browser. External providers are optional, explicit, and disabled by default.

## Status

**Phases 0 and 1 are implemented.** Phase 0 proved the risky browser capabilities and recorded the findings. Phase 1 provides the application foundation: shell, navigation, command palette, catalog, execution contract, worker manager, local storage, import/export, and design system.

**Phase 2 is complete for the planned utility set.** Encoding, validation, IOC-normalization, compression, diff, Unicode inspection, and file-triage utilities are available, along with a parameter-aware generic runner. Deeper analysis tools remain explicitly planned for later phases.

**Phase 3 delivers MailSleuth and the IOC workspace.** MailSleuth parses RFC 822/MIME messages, compares header identities, reads relay authentication claims, extracts and defangs URLs, and hashes attachments locally. Its route is `#/mailsleuth`; every email tool runs in a worker with no network access. The IOC workspace at `#/ioc` extracts indicators from text or normalizes a one-per-line list, with type filters, value search, and explicit defanged/refanged copy actions.

**Phase 4 begins with Sigma validation, local subset testing, a Sigma library, and YARA Studio.** Rule Studio at `#/rules` validates YAML syntax and the vendored official Sigma detection-rule schema, keeping the two failure layers separate. It formats YAML, edits metadata, builds detection conditions, and applies ATT&CK tags through a versioned local dataset without rewriting detection blocks, runs a documented local test subset against pasted sample events, and stores rules locally with revision snapshots, diffs, restore, collections, favourites, import/export, and attribution sidecars. YARA Studio at `#/yara` compiles rules with YARA-X 1.23.0 in a worker and scans local files with explicit limits, progress, and cancellation. The schema, Ajv validator, Sigma evaluator, YAML editor, ATT&CK dataset, and YARA WASM engine are lazy-loaded, and unsupported constructs fail visibly instead of passing silently. Local test results are authoring feedback, not detection verification.

Shipped tools:

| Tool | Status | Notes |
|---|---|---|
| Base64 Encode | available | Main thread, 4 MiB limit |
| Base64 Decode | available | Standard and URL-safe; hex fallback for non-UTF-8 |
| Base32 Encode & Decode | available | RFC 4648 standard alphabet |
| Hex Encoder & Decoder | available | Plain, spaced, colon, and 0x-prefixed output |
| URL Encode & Decode | available | Component and full-URI scope; strict escapes |
| HTML Entity Encode & Decode | available | Named and numeric references; no DOM parsing |
| ROT-N / ROT13 | available | Obfuscation only, with explicit warning |
| Defang & Refang | available | hxxp, [.], [@], [:] conventions |
| Hash Calculator | available | SHA-1/256/384/512 in a worker, text or local file |
| HMAC Calculator | available | SHA-1/256/384/512 in a worker; key never leaves the tab |
| JSON Formatter & Validator | available | Line/column errors, formatted and minified output |
| YAML Validator & Formatter | available | Duplicate-key diagnostics and line/column errors |
| XML Formatter & Checker | available | Tag/attribute checks; external entities never resolved |
| Regex Tester & Extractor | available | Worker isolation, ReDoS guard, capture and replace |
| Timestamp Converter | available | Unix s/ms/µs/ns, ISO 8601, FILETIME, .NET ticks |
| IOC Extractor | available | URLs, domains, IPs, hashes, emails, CVEs; refangs defanged input |
| Bulk IOC Normalizer | available | One-per-line refang, classification, and deduplication |
| File Type Identifier | available | Magic-byte detection from a bounded header |
| Strings Extractor | available | ASCII + UTF-16LE with offsets, worker-bounded output |
| Entropy Calculator | available | Whole-file and 1 KiB chunk entropy, worker |
| Unicode Inspector | available | Code points, UTF-8/UTF-16 bytes, normalization, hidden characters, confusables |
| XOR | available | Repeating-key XOR; text/hex input, text/hex/Base64 output |
| Gzip / Zlib | available | Worker; gzip, zlib, raw deflate; 64 MiB expansion cap |
| Data Comparison | available | Unified diff; `---` separator line; coarse fallback for huge changes |
| EML Inspector | available | RFC 822/MIME parser in a worker; headers, MIME tree, bodies, URLs, attachments |
| Header Analyzer | available | Identity comparison, Received chain, duplicates, observations |
| Authentication Results | available | SPF/DKIM/DMARC/ARC relay claims with attribution and caveats |
| Email URL Extractor | available | Text and HTML URLs; original, normalised, defanged; never fetched |
| Attachment Extractor | available | SHA-1/SHA-256, magic bytes, risk flags, explicit download |
| Sigma Rule Validator | available | YAML + vendored official Sigma schema; separate diagnostics; lazy-loaded. Rule Studio adds YAML formatting, a metadata editor, a condition helper, an ATT&CK tag picker with a versioned local dataset, local subset testing, a local library, stored revisions with diffs/restore, collections, and favourites |
| YARA Studio | available | YARA-X 1.23.0 WASM in a worker; compile validation, local multi-file scan, progress/cancel, bounded matches; lazy-loaded |
| EVTX Header Probe | prototype | Container/file headers only; no BinXML record decoding |

Everything else in the catalog is explicitly `planned` and cannot be executed.

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run check      # svelte-check + TypeScript
npm test           # unit tests (Vitest)
npm run build      # static production build
npm run build:subpath   # build for /bluekit/
npm run preview    # serve the production build locally
npm run test:e2e   # Playwright smoke tests (install a browser first)
```

The browser smoke tests need a Playwright browser once:

```bash
npx playwright install chromium
npm run test:e2e
```

Requirements: Node.js 20+ and a modern Chromium/Firefox/Safari. Web Workers, IndexedDB, and WASM are required for the full experience; diagnostics report anything missing.

## What it does not do

- No account, no sync, no telemetry.
- No BlueKit proxy or API. If a provider blocks browser CORS, BlueKit offers a manual lookup instead.
- No evidence upload. File tools read local `File` objects and never send them anywhere.
- No malware execution. Attachments and samples are identified, hashed, and inspected as data.
- No claim that a prototype is production-grade. Prototype tools show their limitations.

## Architecture

```
src/
  app/            shell, layout, command palette, router, UI state
  components/     shared UI, output renderers, design-system primitives
  core/
    app/          session state (settings, favorites, tabs)
    datasets/     dataset registry (no bundled datasets yet)
    diagnostics/  capability checks, WASM probe
    export-import/ versioned JSON archive
    integrations/ provider CORS/terms matrix
    registry/     catalog merge, search, manifest validation
    runtime/      execution contract, errors, main-thread executor
    schemas/      shared types, categories, data types
    storage/      IndexedDB adapter + repositories
    workers/      worker protocol, manager, dispatch
  styles/         tokens, base CSS, self-hosted fonts
  tools/          tool implementations
  views/          route-level views
  workers/        worker entry point
tests/unit/       Vitest suites
docs/             architecture, security, Phase 0 findings
```

Key contracts:

- **Manifest first.** Every tool declares inputs, outputs, capabilities, network posture, data handling, runtime, status, phase, and limits.
- **Narrow execution context.** Tools get progress, logging, an abort signal, limits, and optional read-only datasets. They do not get the DOM, storage, or arbitrary network access.
- **Workers for CPU-heavy work.** Cancellation terminates the worker; the next run recreates it.
- **Typed ports.** Data types such as `text/plain`, `application/json`, and `bluekit.email-message.v1` are the vocabulary for the future pipeline engine.
- **Local-only by construction.** Session values (API keys, active inputs) are never persisted. Archive export uses an allow-list.

## Documentation

- [Phase 0 findings](docs/architecture/phase-0/README.md)
- [Phase 2 utilities](docs/architecture/phase-2/README.md)
- [Phase 3 MailSleuth and IOC workspace](docs/architecture/phase-3/README.md)
- [Phase 4 Rule Studio](docs/architecture/phase-4/README.md)
- [Static hosting and subpaths](docs/architecture/phase-0/static-hosting.md)
- [Workers and WASM](docs/architecture/phase-0/workers-wasm.md)
- [Storage and OPFS](docs/architecture/phase-0/storage-opfs.md)
- [EML parsing](docs/architecture/phase-0/eml-parsing.md)
- [EVTX feasibility](docs/architecture/phase-0/evtx-feasibility.md)
- [YARA/YARA-X](docs/architecture/phase-0/yara.md)
- [Sigma validation](docs/architecture/phase-0/sigma.md)
- [Provider CORS and terms](docs/architecture/phase-0/providers.md)
- [Content Security Policy](docs/security/csp.md)
- [Contributing](CONTRIBUTING.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

The authoritative product and technical requirements live in [BLUEKIT_SPEC.md](BLUEKIT_SPEC.md).

## Deployment

Build with `npm run build` and serve `dist/` from any static host. For a project subpath, use `npm run build:subpath` and serve the output under `/bluekit/`.

Routing is hash-based (`#/tools/email`), so deep links work without rewrite rules. HTTPS (or `localhost`) is required for OPFS and future service-worker support. The production CSP is injected at build time; see the [CSP note](docs/security/csp.md) for header recommendations.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: keep tools local, honest, tested, and within declared limits. Do not add a backend to work around a browser limitation.

## Licence

Application code is provided under the licence declared by the project owner. Third-party dependencies retain their own licences; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
