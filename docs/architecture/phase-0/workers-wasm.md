# Workers and WebAssembly Bundling

**Status:** verified · 2026-11-20

## Question

Can BlueKit run CPU-heavy and WASM-backed analysis off the main thread, from a static bundle, under a strict CSP?

## Decision

- Use **module workers** created with `new Worker(new URL('…', import.meta.url), { type: 'module' })`.
- Let Vite emit the worker as its own chunk.
- Use **one worker** in Phase 1, with cooperative cancellation plus termination on cancel/timeout.
- Load WASM only inside the tool that needs it. Do not preload large engines.
- Production CSP allows `worker-src 'self' blob:` and `script-src 'self' 'wasm-unsafe-eval'`.

## Evidence

### Worker chunk

`src/core/workers/manager.ts` spawns:

```ts
new Worker(new URL('../../workers/tool.worker.ts', import.meta.url), {
  type: 'module',
  name: 'bluekit-tool-worker',
});
```

`npm run build` emits `dist/assets/tool.worker-*.js` (≈6.6 kB minified in the Phase 1 build). The main bundle does not inline the worker.

### Worker round trip

The diagnostics view calls `diagnostics.ping`, which:

1. confirms it is running with `typeof Window === 'undefined'`;
2. compiles and instantiates a 41-byte WASM module;
3. returns `add(20, 22) === 42`.

This exercises worker startup, message serialization, WASM compilation, and the production CSP in one probe.

### WASM probe

`src/core/diagnostics/wasm.ts` embeds a minimal module and calls:

```ts
await WebAssembly.instantiate(WASM_PROBE_BYTES);
```

Under the production CSP, this requires `'wasm-unsafe-eval'`. Without it, compilation is blocked even though `WebAssembly` exists. The probe turns a silent capability failure into a visible diagnostics result.

### Cancellation model

`WorkerManager` terminates the worker on cancellation or timeout and recreates it lazily. This is deliberate:

- parsers are not required to poll an abort flag at every loop;
- a wedged parser cannot hold the UI hostage;
- the cost is a cold start on the next run, which is acceptable for Phase 1.

Cooperative `AbortSignal` checks still exist inside worker handlers (for example, hashing) so normal cancellation is fast.

## Real-engine evidence: YARA-X

The official `@virustotal/yara-x` 1.23.0 WASM package was loaded in a spike:

- `initSync({ module: bytes })` initializes the engine;
- `Compiler.addSource()` throws a structured error on invalid syntax;
- a compiled scanner with `setTimeoutMs()` scans a byte buffer and reports matches.

Measured package size: ≈5.7 MB WASM (≈2.04 MB gzip). That is too large to preload globally; it must be a lazily loaded, per-tool asset. See [yara.md](./yara.md).

## Constraints recorded for later

- **No `eval` and no remote script origins.** WASM is allowed narrowly via `'wasm-unsafe-eval'`; general `'unsafe-eval'` is not.
- **Structured clone boundaries.** Worker payloads must be serializable. Large `ArrayBuffer`s are transferred or copied deliberately, not implicitly.
- **One worker is a Phase 1 simplification.** A pool with per-category workers and memory budgets is a later optimisation.
- **WASM must not be fetched from a CDN.** Bundle it with the app so the CSP and supply chain stay closed.
- **Timeout is a product feature.** Every manifest declares `limits.timeoutMs`; the executor and worker manager enforce it.

## Residual risk

- Browser memory ceilings for large EVTX/PCAP files are not uniform. Per-tool limits must stay conservative and visible.
- A terminated worker loses in-memory state. Tools must be designed to restart from their input, not from hidden worker state.
- WASM engines need licence and supply-chain review before becoming dependencies; feasibility is not approval.
