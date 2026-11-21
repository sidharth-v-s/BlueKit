import { probeWasm } from '@/core/diagnostics/wasm';
import type { ToolResult } from '@/core/runtime/types';
import type { WorkerHandlerContext } from './handlers';

/**
 * Worker diagnostics handler.
 *
 * Registered here rather than in the catalog: it is not an analyst tool, it is
 * evidence that the worker + WASM path works under the production CSP.
 */
export async function runPingHandler(
  _payload: unknown,
  context: WorkerHandlerContext,
): Promise<ToolResult> {
  context.report(25, 'Ping received in worker');
  const wasm = await probeWasm();
  context.report(100, 'Worker probe complete');
  return {
    output: {
      inWorker: typeof Window === 'undefined',
      wasm,
      userAgent: self.navigator.userAgent,
    },
    meta: { probe: 'diagnostics.ping' },
  };
}
