/** Bundled WASM probe module: exports add(i32, i32) -> i32. 41 bytes. */
export const WASM_PROBE_BYTES = Uint8Array.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic + version
  0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, // type: (i32, i32) -> i32
  0x03, 0x02, 0x01, 0x00, // function section
  0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, // export "add"
  0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b, // local.get 0; local.get 1; i32.add
]);

export interface WasmProbeResult {
  supported: boolean;
  add: number;
  bytes: number;
  durationMs: number;
}

/** Compile and instantiate the probe module. Proves CSP + bundling allow WASM. */
export async function probeWasm(): Promise<WasmProbeResult> {
  const startedAt = performance.now();
  if (typeof WebAssembly === 'undefined') {
    throw new Error('WebAssembly is not available in this environment.');
  }
  const { instance } = await WebAssembly.instantiate(WASM_PROBE_BYTES);
  const add = instance.exports['add'];
  if (typeof add !== 'function') throw new Error('WASM probe module did not export add().');
  const value = (add as (a: number, b: number) => number)(20, 22);
  if (value !== 42) throw new Error(`WASM probe returned ${value}, expected 42.`);
  return {
    supported: true,
    add: value,
    bytes: WASM_PROBE_BYTES.byteLength,
    durationMs: Math.round(performance.now() - startedAt),
  };
}
