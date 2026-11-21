import { WorkerManager } from '@/core/workers/manager';
import { formatBytes } from '@/core/runtime/errors';
import type { StorageAdapter } from '@/core/storage/db';
import { probeWasm } from './wasm';

export interface CapabilityCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  detail: string;
}

async function checkWorker(): Promise<CapabilityCheck> {
  const manager = new WorkerManager();
  if (!manager.supported) {
    return {
      id: 'worker',
      label: 'Web Worker execution',
      status: 'fail',
      detail: 'Web Workers are unavailable. CPU-heavy tools cannot run.',
    };
  }
  try {
    const result = await manager.run(
      'diagnostics.ping',
      {},
      { timeoutMs: 5000 },
    );
    const output = result.output as { inWorker?: boolean; wasm?: { add?: number } } | undefined;
    return {
      id: 'worker',
      label: 'Web Worker execution',
      status: 'pass',
      detail: output?.inWorker
        ? `Worker responded; WASM in worker returned ${String(output.wasm?.add ?? '?')}.`
        : 'Worker responded but did not report a worker context.',
    };
  } catch (error) {
    return {
      id: 'worker',
      label: 'Web Worker execution',
      status: 'fail',
      detail: error instanceof Error ? error.message : 'Worker probe failed.',
    };
  } finally {
    manager.dispose();
  }
}

async function checkWasm(): Promise<CapabilityCheck> {
  try {
    const result = await probeWasm();
    return {
      id: 'wasm',
      label: 'WebAssembly compile & instantiate',
      status: 'pass',
      detail: `${result.bytes}-byte module compiled in ${result.durationMs} ms (add = ${result.add}).`,
    };
  } catch (error) {
    return {
      id: 'wasm',
      label: 'WebAssembly compile & instantiate',
      status: 'fail',
      detail: error instanceof Error ? error.message : 'WASM probe failed. Check CSP.',
    };
  }
}

async function checkOpfs(): Promise<CapabilityCheck> {
  const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
  if (typeof storage.getDirectory !== 'function') {
    return {
      id: 'opfs',
      label: 'Origin Private File System',
      status: 'warn',
      detail: 'OPFS is unavailable. Large-file tools must use Blob/File and memory limits.',
    };
  }
  try {
    const root = await storage.getDirectory();
    const name = `.bluekit-probe-${Date.now().toString(36)}`;
    const handle = await root.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(new TextEncoder().encode('bluekit'));
    await writable.close();
    await root.removeEntry(name);
    return {
      id: 'opfs',
      label: 'Origin Private File System',
      status: 'pass',
      detail: 'Created, wrote, and deleted a probe file.',
    };
  } catch (error) {
    return {
      id: 'opfs',
      label: 'Origin Private File System',
      status: 'warn',
      detail: `OPFS is present but the probe failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function checkStorage(adapter: StorageAdapter): Promise<CapabilityCheck> {
  const base = adapter.backend === 'indexeddb' ? 'IndexedDB is active.' : 'Running on the in-memory fallback.';
  try {
    const estimate = await navigator.storage?.estimate?.();
    const usage = estimate?.usage !== undefined ? formatBytes(estimate.usage) : 'unknown';
    const quota = estimate?.quota !== undefined ? formatBytes(estimate.quota) : 'unknown';
    return {
      id: 'storage',
      label: 'Local persistence',
      status: adapter.backend === 'indexeddb' ? 'pass' : 'fail',
      detail: `${base} Usage ${usage} of ${quota}.`,
    };
  } catch {
    return {
      id: 'storage',
      label: 'Local persistence',
      status: adapter.backend === 'indexeddb' ? 'pass' : 'fail',
      detail: `${base} Storage estimate unavailable.`,
    };
  }
}

function checkCrypto(): CapabilityCheck {
  const subtle = Boolean(globalThis.crypto?.subtle);
  return {
    id: 'crypto',
    label: 'WebCrypto',
    status: subtle ? 'pass' : 'fail',
    detail: subtle
      ? 'crypto.subtle is available for hashing and HMAC. MD5 is not provided by WebCrypto.'
      : 'crypto.subtle is unavailable; hashing tools cannot run in this context.',
  };
}

function checkSecureContext(): CapabilityCheck {
  const secure = globalThis.isSecureContext;
  return {
    id: 'secure-context',
    label: 'Secure context',
    status: secure ? 'pass' : 'fail',
    detail: secure
      ? `Secure context (${location.protocol}//${location.host}).`
      : 'Not a secure context. Service workers and OPFS require HTTPS or localhost.',
  };
}

function checkServiceWorker(): CapabilityCheck {
  const supported = 'serviceWorker' in navigator;
  return {
    id: 'service-worker',
    label: 'Service Worker',
    status: 'info',
    detail: supported
      ? 'Supported, not registered in Phase 1. Offline app-shell caching is scheduled after the foundation stabilises.'
      : 'Not supported; offline caching will be unavailable.',
  };
}

function checkCsp(): CapabilityCheck {
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  return {
    id: 'csp',
    label: 'Content Security Policy',
    status: 'info',
    detail: meta
      ? 'Build-time CSP meta tag detected. Web Workers and wasm-unsafe-eval are allowed; no remote origins are.'
      : 'No CSP meta tag in this build (expected in dev). Production builds inject the policy.',
  };
}

export async function runCapabilityChecks(adapter: StorageAdapter): Promise<CapabilityCheck[]> {
  const [worker, wasm, opfs, storage] = await Promise.all([
    checkWorker(),
    checkWasm(),
    checkOpfs(),
    checkStorage(adapter),
  ]);
  return [checkSecureContext(), worker, wasm, storage, opfs, checkCrypto(), checkServiceWorker(), checkCsp()];
}
