# YARA and YARA-X in the Browser

**Status:** engine feasibility verified · not yet a dependency · 2026-11-20

## Question

Is there a YARA-family engine that compiles and scans locally in a static browser app, under an acceptable licence, with predictable bundle cost?

## Decision

**YARA-X via its official WASM package is the viable path.** Keep it out of the main bundle and load it only in the Phase 4 Rule Studio / file-scanning tools. Do not adopt an unofficial JS reimplementation as the primary engine.

## Evidence

Package evaluated: `@virustotal/yara-x` **1.23.0**, licence **BSD-3-Clause**.

Measured:

| Property | Result |
|---|---|
| WASM binary | ≈5.7 MB uncompressed |
| WASM binary (gzip) | ≈2.04 MB |
| Initialization | `initSync({ module: bytes })` |
| Compile API | `Compiler.addSource()` |
| Syntax errors | throws a structured error; not silently accepted |
| Scan API | compiled scanner over a byte buffer |
| Time limit | `scanner.setTimeoutMs()` works |

Behaviour verified in a spike:

- a valid rule compiled and matched a byte buffer;
- an invalid rule caused `addSource()` to throw;
- the scanner honored a timeout instead of hanging the page.

## Why YARA-X

- It is the maintained modern YARA-family engine from VirusTotal, not a third-party port.
- The official package ships a browser-consumable WASM build, so there is no custom Emscripten toolchain to maintain.
- BSD-3-Clause is compatible with the project's distribution model, subject to notices.
- Compilation and scanning are the two operations Rule Studio actually needs.

## Bundle and runtime rules

- **Lazy-load only.** 2 MB gzip is unacceptable on first paint.
- **Worker execution.** Compilation and scanning belong in a worker; a malicious or pathological rule must not freeze the UI.
- **Timeout every scan.** Use a per-run budget and surface `timeout` as a structured error.
- **Cache the compiled engine, not the rule set.** Recompile rules after edits; keep initialization cheap by reusing the loaded module within a session.
- **No CDN fetch.** Bundle the WASM asset so the CSP stays `'self'` and the supply chain is reproducible.
- **Record the engine version** in scan results and exports.

## Feature boundaries to document before shipping

The YARA language surface is larger than any single UI. Rule Studio must state what it supports and reject or warn on the rest. At minimum:

- text, hex, and regex strings, including modifiers;
- conditions and boolean operators;
- includes/modules, with an explicit allow-list;
- external variables;
- rule tags and metadata;
- `private`/`global` rules;
- scan limits (file size, match count, timeout).

Do not silently drop unsupported constructs. A rule that validates in the editor but behaves differently at scan time is a detection-engineering hazard.

## Not chosen

| Option | Reason |
|---|---|
| Hand-written YARA parser/evaluator | Incomplete language coverage; high correctness risk for detections. |
| Unofficial WASM/JS ports | Maintenance and provenance risk; licensing needs separate review. |
| Server-side scanning | Violates the no-backend, local-only product contract. |
| Native CLI via WebAssembly shell | Not a browser capability; no process execution. |

## Residual risk

- WASM memory growth limits vary by browser; large files and many rules need caps.
- The engine's error messages may be terse; the UI must translate them without hiding the original text.
- YARA-X and YARA are related but not identical. Rule compatibility claims must name the engine and version.
- The package is not yet a dependency. Phase 4 must pin an exact version, record the integrity hash, and add the licence notice.

## Sources

- YARA-X: <https://github.com/VirusTotal/yara-x>
- Package metadata: `@virustotal/yara-x@1.23.0`, BSD-3-Clause.
