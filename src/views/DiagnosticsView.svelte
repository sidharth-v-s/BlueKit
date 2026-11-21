<script lang="ts">
  import { onMount } from 'svelte';
  import Activity from 'lucide-svelte/icons/activity';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import Copy from 'lucide-svelte/icons/copy';
  import Download from 'lucide-svelte/icons/download';
  import Info from 'lucide-svelte/icons/info';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import { router } from '@/app/router.svelte';
  import { ui } from '@/app/ui.svelte';
  import { session } from '@/core/app/session.svelte';
  import { copyText } from '@/core/app/clipboard';
  import { downloadText, fileStamp } from '@/core/export-import/download';
  import { registry } from '@/core/registry';
  import { runCapabilityChecks, type CapabilityCheck } from '@/core/diagnostics/checks';

  let checks = $state<CapabilityCheck[]>([]);
  let busy = $state(false);
  let lastRun = $state<string | null>(null);
  let error = $state<string | null>(null);

  const pass = $derived(checks.filter((check) => check.status === 'pass').length);
  const warn = $derived(checks.filter((check) => check.status === 'warn').length);
  const fail = $derived(checks.filter((check) => check.status === 'fail').length);

  const report = $derived.by(() => {
    const locationText = typeof location === 'undefined' ? 'unknown' : location.href;
    return JSON.stringify(
      {
        app: 'BlueKit',
        version: '0.1.0',
        generatedAt: lastRun,
        location: locationText,
        secureContext: typeof isSecureContext === 'boolean' ? isSecureContext : null,
        userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
        storageBackend: session.adapter?.backend ?? null,
        registry: {
          total: registry.entries.length,
          available: registry.available().length,
          prototypes: registry.prototypes().length,
          planned: registry.planned().length,
          problems: registry.problems,
        },
        checks,
      },
      null,
      2,
    );
  });

  async function run(): Promise<void> {
    if (!session.adapter) {
      error = 'Storage adapter is not ready. Reload the application.';
      return;
    }
    busy = true;
    error = null;
    try {
      checks = await runCapabilityChecks(session.adapter);
      lastRun = new Date().toISOString();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Diagnostics failed.';
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void run();
  });

  async function copyReport(): Promise<void> {
    const ok = await copyText(report);
    ui.toast(ok ? 'Diagnostics report copied.' : 'Clipboard is unavailable.', ok ? 'success' : 'danger');
  }

  function downloadReport(): void {
    downloadText(`bluekit-diagnostics-${fileStamp()}.json`, report, 'application/json;charset=utf-8');
    ui.toast('Diagnostics report downloaded.', 'info');
  }
</script>

<div class="page diagnostics">
  <header class="page-head">
    <div>
      <div class="eyebrow">Runtime checks</div>
      <h1>Diagnostics</h1>
      <p class="lede">
        Verify the browser capabilities BlueKit depends on: workers, WASM, storage, OPFS, crypto, and the
        production security policy. Checks run locally.
      </p>
    </div>
    <div class="head-actions">
      <button type="button" class="btn" onclick={copyReport} disabled={checks.length === 0}>
        <Copy size={13} strokeWidth={1.9} aria-hidden="true" /> Copy report
      </button>
      <button type="button" class="btn" onclick={downloadReport} disabled={checks.length === 0}>
        <Download size={13} strokeWidth={1.9} aria-hidden="true" /> Download
      </button>
      <button type="button" class="btn btn-primary" disabled={busy} onclick={run}>
        {#if busy}
          <LoaderCircle size={13} class="spin" aria-hidden="true" /> Running…
        {:else}
          <Activity size={13} strokeWidth={2} aria-hidden="true" /> Run checks
        {/if}
      </button>
    </div>
  </header>

  <div class="summary-row">
    <div class="summary tone-ok">
      <CircleCheck size={15} strokeWidth={1.9} aria-hidden="true" />
      <span class="mono">{pass}</span>
      <span>passed</span>
    </div>
    <div class="summary tone-warn">
      <TriangleAlert size={15} strokeWidth={1.9} aria-hidden="true" />
      <span class="mono">{warn}</span>
      <span>warnings</span>
    </div>
    <div class="summary tone-bad">
      <CircleAlert size={15} strokeWidth={1.9} aria-hidden="true" />
      <span class="mono">{fail}</span>
      <span>failed</span>
    </div>
    <div class="summary muted">
      <span class="summary-label">Last run</span>
      <span class="mono">{lastRun ? lastRun.slice(11, 19) : '—'}</span>
    </div>
  </div>

  {#if error}
    <div class="error-box">
      <CircleAlert size={14} strokeWidth={1.9} aria-hidden="true" />
      <span>{error}</span>
    </div>
  {/if}

  <section class="panel">
    <div class="panel-head">
      <span class="panel-title">Capability matrix</span>
      <span class="faint xsmall">{checks.length} checks</span>
    </div>
    <div class="panel-body flush">
      {#if busy && checks.length === 0}
        <div class="empty">
          <LoaderCircle size={17} class="spin" aria-hidden="true" />
          <span>Running capability probes…</span>
        </div>
      {:else}
        {#each checks as check (check.id)}
          <div class="check">
            <span class="check-icon {check.status}">
              {#if check.status === 'pass'}
                <CircleCheck size={15} strokeWidth={1.9} aria-hidden="true" />
              {:else if check.status === 'warn'}
                <TriangleAlert size={15} strokeWidth={1.9} aria-hidden="true" />
              {:else if check.status === 'fail'}
                <CircleAlert size={15} strokeWidth={1.9} aria-hidden="true" />
              {:else}
                <Info size={15} strokeWidth={1.9} aria-hidden="true" />
              {/if}
            </span>
            <div class="check-main">
              <div class="check-head">
                <span class="check-label">{check.label}</span>
                <span class="badge {check.status === 'pass' ? 'badge-success' : check.status === 'warn' ? 'badge-warning' : check.status === 'fail' ? 'badge-danger' : 'badge-muted'}">
                  {check.status}
                </span>
              </div>
              <div class="check-detail">{check.detail}</div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>

  <div class="grid">
    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">Registry integrity</span>
        <span class="badge {registry.problems.length === 0 ? 'badge-success' : 'badge-danger'}">
          {registry.problems.length === 0 ? 'valid' : `${registry.problems.length} problem(s)`}
        </span>
      </div>
      <div class="panel-body">
        <div class="registry-stats">
          <div><span class="mono">{registry.entries.length}</span><span>entries</span></div>
          <div><span class="mono">{registry.available().length}</span><span>available</span></div>
          <div><span class="mono">{registry.prototypes().length}</span><span>prototype</span></div>
          <div><span class="mono">{registry.planned().length}</span><span>planned</span></div>
        </div>
        {#if registry.problems.length > 0}
          <ul class="problem-list mono">
            {#each registry.problems as problem}
              <li>{problem}</li>
            {/each}
          </ul>
        {:else}
          <p class="small muted">
            Manifests validate at startup: ids, ports, capabilities, runtime rules, and related-tool references.
          </p>
        {/if}
        <button type="button" class="btn btn-sm registry-link" onclick={() => router.navigate('/tools')}>
          Open catalog
        </button>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">Environment</span>
      </div>
      <div class="panel-body">
        <dl class="env-list">
          <dt>Origin</dt>
          <dd class="mono break">{typeof location === 'undefined' ? '—' : location.origin}</dd>
          <dt>Secure context</dt>
          <dd class="mono">{typeof isSecureContext === 'boolean' ? String(isSecureContext) : 'unknown'}</dd>
          <dt>Storage backend</dt>
          <dd class="mono">{session.adapter?.backend ?? 'not ready'}</dd>
          <dt>Persistence</dt>
          <dd class="mono">{session.persistenceEnabled ? 'enabled' : 'session only'}</dd>
          <dt>Datasets</dt>
          <dd class="mono">none bundled</dd>
        </dl>
      </div>
    </section>
  </div>

  <p class="foot-note">
    Phase 0 feasibility evidence and supported-feature limits live under
    <span class="mono">docs/architecture/phase-0/</span>. A passing probe proves the capability in this browser,
    not that every parser or rule feature is implemented.
  </p>
</div>

<style>
  .diagnostics {
    max-width: 1000px;
  }

  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 14px;
  }

  .eyebrow {
    color: var(--muted-2);
    font-family: var(--font-mono);
    font-size: 9.5px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    margin-bottom: 5px;
  }

  h1 {
    font-size: 21px;
    margin-bottom: 7px;
  }

  .lede {
    max-width: 640px;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.6;
  }

  .head-actions {
    display: flex;
    gap: 6px;
    flex: 0 0 auto;
    padding-top: 7px;
  }

  .summary-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .summary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 27px;
    padding: 0 9px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface-1);
    color: var(--muted);
    font-size: 10.5px;
  }

  .summary .mono {
    color: var(--text-strong);
    font-size: 13px;
  }

  .summary.tone-ok :global(svg) {
    color: var(--success);
  }

  .summary.tone-warn :global(svg) {
    color: var(--warning);
  }

  .summary.tone-bad :global(svg) {
    color: var(--danger);
  }

  .summary.muted {
    margin-left: auto;
    color: var(--muted-2);
  }

  .summary-label {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 9px;
  }

  .error-box {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding: 8px 10px;
    border: 1px solid rgba(224, 108, 108, 0.28);
    border-radius: var(--radius);
    background: var(--danger-soft);
    color: #f0a3a3;
    font-size: 11.5px;
  }

  .check {
    display: flex;
    gap: 10px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--border-soft);
  }

  .check:last-child {
    border-bottom: 0;
  }

  .check-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--muted-2);
  }

  .check-icon.pass {
    color: var(--success);
    border-color: rgba(86, 185, 141, 0.24);
    background: var(--success-soft);
  }

  .check-icon.warn {
    color: var(--warning);
    border-color: rgba(216, 166, 87, 0.24);
    background: var(--warning-soft);
  }

  .check-icon.fail {
    color: var(--danger);
    border-color: rgba(224, 108, 108, 0.26);
    background: var(--danger-soft);
  }

  .check-main {
    flex: 1 1 auto;
    min-width: 0;
  }

  .check-head {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }

  .check-label {
    color: var(--text-strong);
    font-size: 11.5px;
    font-weight: 550;
  }

  .check-detail {
    margin-top: 2px;
    color: var(--muted);
    font-size: 10.5px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-top: 14px;
    align-items: start;
  }

  .registry-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    margin-bottom: 10px;
  }

  .registry-stats > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 7px 4px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--bg-elevated);
  }

  .registry-stats .mono {
    color: var(--text-strong);
    font-size: 15px;
  }

  .registry-stats span:last-child {
    color: var(--muted-2);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .problem-list {
    margin: 0 0 9px;
    padding-left: 16px;
    color: #f0a3a3;
    font-size: 10px;
    line-height: 1.5;
  }

  .registry-link {
    margin-top: 9px;
  }

  .env-list {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 6px 10px;
    margin: 0;
    font-size: 11px;
  }

  .env-list dt {
    color: var(--muted-2);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .env-list dd {
    margin: 0;
    color: var(--muted);
    font-size: 10.5px;
  }

  .break {
    overflow-wrap: anywhere;
  }

  .foot-note {
    margin-top: 12px;
    color: var(--muted-2);
    font-size: 10.5px;
    line-height: 1.5;
  }

  @media (max-width: 860px) {
    .page-head {
      flex-direction: column;
      gap: 10px;
    }

    .head-actions {
      padding-top: 0;
      flex-wrap: wrap;
    }

    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 520px) {
    .summary.muted {
      margin-left: 0;
    }

    .registry-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
