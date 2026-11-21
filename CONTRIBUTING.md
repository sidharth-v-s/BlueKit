# Contributing to BlueKit

BlueKit is a local-first Blue Team workbench. Contributions are welcome when they preserve the product's core constraints.

## Non-negotiable constraints

1. **No BlueKit backend.** No server routes, edge functions, accounts, telemetry, or proxy. Static hosting only.
2. **No silent network access.** A tool that talks to a provider must declare `network`, `dataHandling`, and `network.direct`, and must require explicit user action.
3. **No evidence upload.** File inputs stay local unless the user explicitly invokes an external lookup.
4. **No execution of hostile content.** Do not run samples, render email HTML with scripts, or evaluate untrusted code.
5. **No fake capability.** A prototype is labeled prototype. A planned tool is not executable. Do not simulate results.
6. **No hidden limits.** Every tool declares input size, timeout, and memory expectations.

## Before you start

```bash
npm install
npm run check
npm test
npm run build
```

All four must pass before a change is ready for review.

## Adding a tool

1. **Create the implementation** under `src/tools/<category>/`.
2. **Define a manifest** with:
   - dotted lowercase id (`category.tool-name`), semver version;
   - exact input/output ports using `DATA_TYPES`;
   - only the capabilities you actually use;
   - `runtime: "worker"` or `"wasm-worker"` for CPU-heavy or WASM work, plus `worker.execute` (and `wasm.execute` where relevant);
   - `network: "none"` unless a provider is explicitly involved;
   - `dataHandling: "local-only"` unless the user initiates an external request;
   - honest `status` (`available`, `prototype`, `planned`) and roadmap `phase`;
   - concrete `limits`.
3. **Register it** in `src/core/registry/index.ts`. Implemented entries automatically win over planned catalog metadata with the same id.
4. **If it runs in a worker**, add a handler in `src/workers/handlers.ts`. The worker never accepts an arbitrary tool id from untrusted input.
5. **Add output rendering** if the default text/JSON view is insufficient. Keep large outputs bounded.
6. **Write tests** under `tests/unit/`. Cover the happy path, malformed input, limits, and at least one realistic fixture.
7. **Update documentation** if the tool changes the product's claims or limitations.
8. **Add third-party notices** if you introduce a dependency or bundled asset.

### Manifest checklist

- [ ] Id is stable and dotted; it is never reused for a different tool.
- [ ] Input and output ports are truthful.
- [ ] Capabilities match actual behavior.
- [ ] Limits are enforced in code, not just declared.
- [ ] Errors use `ToolFailure` with a meaningful code and message.
- [ ] Cancellation is respected or the worker manager can terminate safely.
- [ ] No DOM, storage, or `fetch` access inside a tool unless the contract explicitly allows it.
- [ ] Prototype limitations are visible in the UI and docs.

## Adding a dependency

Dependencies must earn their weight:

- state the problem the dependency solves;
- check licence compatibility and add it to `THIRD_PARTY_NOTICES.md`;
- prefer small, maintained, browser-native packages;
- vendor/version anything that affects reproducibility (schemas, datasets, WASM engines);
- never load code or WASM from a CDN;
- keep the production CSP at `'self'` unless a reviewed provider integration requires an explicit origin.

## Working in workers

- Module workers are created through `new Worker(new URL(..., import.meta.url), { type: 'module' })`.
- Payloads must be structured-cloneable.
- Report progress through the provided callback; do not touch the DOM.
- Check `signal.aborted` at safe checkpoints.
- Assume the worker may be terminated at any time; do not keep required state only in worker memory.
- Add a timeout budget that matches the manifest.

## Storage changes

- Add new stores to `STORES` and a migration path.
- Never make an existing record unreadable without a migration.
- Keep session-only values out of IndexedDB.
- Update the archive allow-list only for durable user content, and keep import validation strict.
- Add tests for round trips and malformed stored data.

## UI and design

- Use the existing tokens in `src/styles/tokens.css`; do not hardcode colors.
- Keep the dense, terminal/IDE-inspired layout. Avoid dashboard cards and decorative chrome.
- Every interactive element must be keyboard reachable and have a visible focus state.
- Respect `prefers-reduced-motion` and the in-app reduced-motion setting.
- Do not add remote fonts, images, or scripts.
- Output renderers must cap size and offer copy/download where useful.

## Security review triggers

Open a design discussion before:

- adding any remote origin to the CSP;
- handling credentials or API keys;
- parsing a new binary format with a native/WASM parser;
- allowing user-authored rules or regex to execute;
- adding file-system or OPFS writes;
- changing archive import/export semantics.

## Commit and review expectations

- Keep changes focused; do not mix a refactor with a behavior change.
- Include tests and documentation with the change.
- Explain the failure modes you considered.
- If a claim cannot be tested in this environment, say so explicitly.

## Reporting issues

Include:

- browser and version;
- whether the issue occurs in dev, production build, or both;
- base path (`/` or `/bluekit/`);
- exact input (redacted);
- expected vs actual output;
- diagnostics results (worker, WASM, storage, OPFS).
