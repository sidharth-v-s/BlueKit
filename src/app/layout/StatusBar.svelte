<script lang="ts">
  import { onMount } from 'svelte';
  import Cpu from 'lucide-svelte/icons/cpu';
  import Database from 'lucide-svelte/icons/database';
  import Wifi from 'lucide-svelte/icons/wifi';
  import WifiOff from 'lucide-svelte/icons/wifi-off';
  import { workerManager, type WorkerState } from '@/core/workers/manager';
  import { session } from '@/core/app/session.svelte';
  import { datasetStatusLabel } from '@/core/datasets/registry';
  import { CONNECTORS_ENABLED } from '@/core/integrations/providers';

  let workerState = $state<WorkerState>(workerManager.state);
  let online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);

  onMount(() => {
    const unsubscribe = workerManager.subscribe((state) => (workerState = state));
    const update = () => (online = navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      unsubscribe();
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  });

  const workerLabel = $derived(
    workerState === 'busy'
      ? 'Worker busy'
      : workerState === 'error'
        ? 'Worker error'
        : workerState === 'unavailable'
          ? 'Worker unavailable'
          : 'Worker idle',
  );

  const workerTone = $derived(
    workerState === 'busy'
      ? 'warn'
      : workerState === 'error' || workerState === 'unavailable'
        ? 'danger'
        : 'ok',
  );
</script>

<footer class="statusbar" aria-label="Application status">
  <span class="item ok" title="All analysis runs in this browser">
    <span class="dot"></span>
    Local processing
  </span>

  <span class="sep" aria-hidden="true"></span>

  <span class="item {workerTone}" title="Single cancellable worker for CPU-heavy tools">
    <Cpu size={11} strokeWidth={1.9} aria-hidden="true" />
    {workerLabel}
  </span>

  <span class="sep" aria-hidden="true"></span>

  <span
    class="item"
    class:warn={!session.persistenceEnabled}
    title={session.storageNote ?? 'Local persistence backend'}
  >
    <Database size={11} strokeWidth={1.9} aria-hidden="true" />
    {session.persistenceEnabled ? 'IndexedDB' : 'Memory only'}
  </span>

  <span class="sep hide-sm" aria-hidden="true"></span>
  <span class="item hide-sm" title="Bundled reference datasets">{datasetStatusLabel()}</span>

  <span class="grow"></span>

  <span class="item hide-sm" title="External provider connectors are disabled in this build">
    {CONNECTORS_ENABLED ? 'External providers on' : 'External requests off'}
  </span>

  <span class="sep" aria-hidden="true"></span>

  <span class="item" class:warn={!online} title={online ? 'Browser network is online' : 'Browser is offline'}>
    {#if online}
      <Wifi size={11} strokeWidth={1.9} aria-hidden="true" />
      Online
    {:else}
      <WifiOff size={11} strokeWidth={1.9} aria-hidden="true" />
      Offline
    {/if}
  </span>

  <span class="sep" aria-hidden="true"></span>
  <span class="item version mono">v0.1.0</span>
</footer>

<style>
  .statusbar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--statusbar-h);
    padding: 0 9px;
    border-top: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--muted-2);
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item.ok {
    color: var(--muted);
  }

  .item.warn {
    color: var(--warning);
  }

  .item.danger {
    color: var(--danger);
  }

  .dot {
    width: 5px;
    height: 5px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--success);
  }

  .sep {
    width: 1px;
    height: 11px;
    flex: 0 0 auto;
    background: var(--border);
  }

  .grow {
    flex: 1 1 auto;
  }

  .version {
    color: var(--muted-2);
    font-size: 9.5px;
  }

  @media (max-width: 720px) {
    .hide-sm {
      display: none;
    }
  }
</style>
