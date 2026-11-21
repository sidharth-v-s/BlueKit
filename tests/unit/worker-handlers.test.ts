import { describe, expect, it } from 'vitest';
import { IMPLEMENTED_TOOLS } from '@/core/registry';
import { workerHandlers } from '@/workers/handlers';

describe('worker dispatch table', () => {
  it('has a handler for every worker-routed tool', () => {
    for (const tool of IMPLEMENTED_TOOLS) {
      if (tool.manifest.runtime === 'main') continue;
      expect(workerHandlers[tool.manifest.id], tool.manifest.id).toBeTypeOf('function');
    }
  });

  it('does not register handlers for tools that do not exist', () => {
    const ids = new Set(IMPLEMENTED_TOOLS.map((tool) => tool.manifest.id));
    for (const id of Object.keys(workerHandlers)) {
      if (id === 'diagnostics.ping') continue;
      expect(ids.has(id), id).toBe(true);
    }
  });
});
