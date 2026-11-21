# Phase 0 — Feasibility Findings

Phase 0 asked one question: can BlueKit be a genuinely useful Blue Team workbench that runs entirely in a browser from static hosting, with no BlueKit backend?

The answer is **yes, within documented limits**. This directory records what was tested, what worked, what did not, and which product decisions follow from the evidence. Findings are dated 2026-11-20. Re-test when a browser major version, hosting provider, or third-party policy changes.

## Documents

| Document | Question answered |
|---|---|
| [static-hosting.md](./static-hosting.md) | Can the build run at the root and under `/bluekit/` with no server routes? |
| [workers-wasm.md](./workers-wasm.md) | Do module workers and WebAssembly survive the production bundle and CSP? |
| [storage-opfs.md](./storage-opfs.md) | What persists locally, what falls back, and what must the UI disclose? |
| [eml-parsing.md](./eml-parsing.md) | Can `.eml` inspection be useful without a mail library or a backend? |
| [evtx-feasibility.md](./evtx-feasibility.md) | How far can EVTX analysis get in the browser, and what is still missing? |
| [yara.md](./yara.md) | Which YARA/YARA-X browser engine is viable, and under what licence? |
| [sigma.md](./sigma.md) | Can Sigma rules be validated and tested locally against a documented subset? |
| [providers.md](./providers.md) | Which threat-intelligence APIs permit direct browser requests? |

Supporting security policy: [../security/csp.md](../security/csp.md).

## Method

Each spike had to produce **runnable evidence**, not a vendor claim:

1. Build the smallest thing that exercises the risky capability.
2. Run it through the same bundler and production CSP the app uses.
3. Record exact versions, byte sizes, response headers, or parser output.
4. Write down the failure mode and the fallback.
5. Keep the spike code in the repository where it remains useful; do not promote it to an "available" tool until it has tests and documented limits.

Spikes that inform a future phase stay **prototype** or **planned**. The catalog never labels an untested idea as available.

## Exit criteria

| Criterion | Result |
|---|---|
| No backend required | **Met.** The app is a static Vite build. Hash routing avoids server rewrites. |
| Web Worker + WASM bundling | **Met.** Vite emits a separate module worker; a bundled WASM module compiles under the production CSP. |
| IndexedDB + fallback | **Met.** IndexedDB adapter with a memory fallback; OPFS is feature-detected and probed. |
| `.eml` parsing | **Met for a prototype.** Header/MIME/body/URL/attachment extraction works; authentication and full RFC coverage remain future work. |
| EVTX feasibility | **Partial by design.** Container headers parse; BinXML record decoding is explicitly not implemented. |
| YARA engine | **Met.** YARA-X's official WASM package compiles rules and scans bytes. Not yet integrated. |
| Sigma validation | **Met for validation and a test subset.** Official JSON Schema + a documented evaluator subset. |
| Provider CORS/terms | **Met as a decision matrix.** Several providers block browsers; no connector is enabled. |
| Implementation choices documented | **Met.** This directory plus the CSP note. |

## Consequences for Phase 1

- Ship a **static SPA** with hash routing; no SSR, no edge functions.
- Keep CPU-heavy work in **workers** and treat cancellation as worker termination.
- Use a **small hand-rolled IndexedDB adapter** rather than adding a database dependency.
- Keep `.eml` and EVTX tools as **prototypes** with visible limitation notices.
- Keep all external providers **disabled** until terms review and consent UX exist.
- Treat the production CSP as part of the product contract, not deployment trivia.
