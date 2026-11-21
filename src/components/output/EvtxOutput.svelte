<script lang="ts">
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import OutputToolbar from './OutputToolbar.svelte';
  import { formatBytes } from '@/core/runtime/errors';
  import type { EvtxProbeResult } from '@/tools/forensics/evtx-probe';

  let { value }: { value: EvtxProbeResult } = $props();

  const json = $derived(JSON.stringify(value, null, 2));

  function hex(value: number | null): string {
    return value === null ? '—' : `0x${value.toString(16)}`;
  }
</script>

<OutputToolbar text={json} filename="evtx-container-probe.json" mime="application/json;charset=utf-8" note="bluekit.evtx-probe.v1" />

<div class="content">
  <section class="block">
    <header class="block-head">
      <h3>File header</h3>
      <span class="badge badge-success">container valid</span>
    </header>
    <dl class="kv">
      <dt>File</dt>
      <dd class="mono break">{value.fileName ?? '(unnamed)'}</dd>
      <dt>Size</dt>
      <dd class="mono">{formatBytes(value.fileSizeBytes)}</dd>
      <dt>Signature</dt>
      <dd class="mono">{value.magicValid ? 'ElfFile\\0' : 'invalid'}</dd>
      <dt>Version</dt>
      <dd class="mono">{value.majorVersion}.{value.minorVersion}</dd>
      <dt>Header size</dt>
      <dd class="mono">{value.headerSizeBytes} bytes (block {value.headerBlockSize})</dd>
      <dt>Chunks</dt>
      <dd class="mono">
        {value.declaredChunkCount} declared · {value.chunksPresentOnDisk} on disk
      </dd>
      <dt>Chunk range</dt>
      <dd class="mono">{value.firstChunkNumber}–{value.lastChunkNumber}</dd>
      <dt>Next record ID</dt>
      <dd class="mono">{value.nextRecordId}</dd>
      <dt>Flags</dt>
      <dd class="mono">{hex(value.flags)}</dd>
      <dt>Header checksum</dt>
      <dd class="mono">{hex(value.declaredHeaderChecksum)} (not verified)</dd>
    </dl>
  </section>

  <section class="block">
    <header class="block-head">
      <h3>Chunk headers</h3>
      <span class="faint">{value.chunks.length} inspected</span>
    </header>
    <div class="table-scroll">
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Offset</th>
            <th>Magic</th>
            <th>Record no.</th>
            <th>Record ID</th>
            <th>Free space</th>
          </tr>
        </thead>
        <tbody>
          {#each value.chunks as chunk (chunk.index)}
            <tr>
              <td class="mono xsmall">{chunk.index}</td>
              <td class="mono xsmall">{hex(chunk.offset)}</td>
              <td>
                {#if chunk.magicValid}
                  <span class="badge badge-success">ElfChnk</span>
                {:else}
                  <span class="badge badge-danger">invalid</span>
                {/if}
              </td>
              <td class="mono xsmall">{chunk.firstEventRecordNumber ?? '—'}–{chunk.lastEventRecordNumber ?? '—'}</td>
              <td class="mono xsmall">{chunk.firstEventRecordId ?? '—'}–{chunk.lastEventRecordId ?? '—'}</td>
              <td class="mono xsmall">{hex(chunk.freeSpaceOffset)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  {#if value.warnings.length > 0}
    <section class="block">
      <header class="block-head">
        <h3>Warnings</h3>
      </header>
      <div class="warnings">
        {#each value.warnings as warning}
          <div class="warning">
            <TriangleAlert size={13} strokeWidth={1.9} aria-hidden="true" />
            <span>{warning}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section class="block feasibility">
    <header class="block-head">
      <h3>Feasibility boundary</h3>
      <span class="badge badge-warning">records not parsed</span>
    </header>
    <div class="feas">
      <div class="feas-row">
        <span class="feas-label">Container parsing</span>
        <span class="badge badge-success">{value.feasibility.containerParsing}</span>
      </div>
      <div class="feas-row">
        <span class="feas-label">Record parsing</span>
        <span class="badge badge-warning">{value.feasibility.recordParsing.replace(/-/gu, ' ')}</span>
      </div>
      <div class="feas-note">
        <CircleAlert size={14} strokeWidth={1.9} aria-hidden="true" />
        <p>{value.feasibility.recommendedPath}</p>
      </div>
    </div>
  </section>
</div>

<style>
  .content {
    display: flex;
    flex-direction: column;
  }

  .block {
    border-bottom: 1px solid var(--border-soft);
  }

  .block:last-child {
    border-bottom: 0;
  }

  .block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 31px;
    padding: 0 11px;
    background: rgba(255, 255, 255, 0.012);
    border-bottom: 1px solid var(--border-soft);
  }

  .block-head h3 {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .block-head .faint {
    font-size: 9.5px;
  }

  .kv {
    display: grid;
    grid-template-columns: 132px minmax(0, 1fr);
    margin: 0;
    padding: 9px 11px;
    row-gap: 5px;
    column-gap: 12px;
    font-size: 11.5px;
  }

  .kv dt {
    color: var(--muted-2);
    font-size: 10px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    padding-top: 1px;
  }

  .kv dd {
    margin: 0;
    min-width: 0;
    color: var(--text);
  }

  .break {
    overflow-wrap: anywhere;
  }

  .table-scroll {
    overflow-x: auto;
  }

  .warnings {
    display: flex;
    flex-direction: column;
  }

  .warning {
    display: flex;
    gap: 8px;
    padding: 7px 11px;
    border-bottom: 1px solid var(--border-soft);
    background: rgba(216, 166, 87, 0.05);
    color: #e5c28a;
    font-size: 11.5px;
    line-height: 1.5;
  }

  .warning:last-child {
    border-bottom: 0;
  }

  .warning :global(svg) {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  .feas {
    padding: 9px 11px 11px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .feas-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .feas-label {
    color: var(--muted);
    font-size: 11.5px;
  }

  .feas-note {
    display: flex;
    gap: 8px;
    padding: 8px 9px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--bg-elevated);
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.55;
  }

  .feas-note :global(svg) {
    flex: 0 0 auto;
    margin-top: 1px;
    color: var(--warning);
  }

  @media (max-width: 620px) {
    .kv {
      grid-template-columns: 96px minmax(0, 1fr);
    }
  }
</style>
