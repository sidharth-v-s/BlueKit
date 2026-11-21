<script lang="ts">
  import { onMount } from 'svelte';
  import Database from 'lucide-svelte/icons/database';
  import Download from 'lucide-svelte/icons/download';
  import HardDrive from 'lucide-svelte/icons/hard-drive';
  import Info from 'lucide-svelte/icons/info';
  import Keyboard from 'lucide-svelte/icons/keyboard';
  import Plug from 'lucide-svelte/icons/plug';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Upload from 'lucide-svelte/icons/upload';
  import ConfirmDialog from '@/components/ConfirmDialog.svelte';
  import FileDrop from '@/components/FileDrop.svelte';
  import { router } from '@/app/router.svelte';
  import { ui } from '@/app/ui.svelte';
  import { session, type AppSettings } from '@/core/app/session.svelte';
  import { DATASETS } from '@/core/datasets/registry';
  import { PROVIDERS, type DirectBrowserStatus } from '@/core/integrations/providers';
  import { downloadText, fileStamp } from '@/core/export-import/download';
  import { formatBytes } from '@/core/runtime/errors';
  import type { ArchiveStats } from '@/core/export-import/archive';

  type ConfirmAction = 'recent' | 'cache' | 'all' | null;

  let confirmAction = $state<ConfirmAction>(null);
  let exportBusy = $state(false);
  let importing = $state(false);
  let importFile = $state<File | null>(null);
  let importStats = $state<ArchiveStats | null>(null);

  const summary = $derived(session.storageSummary);

  const statusLabel: Record<DirectBrowserStatus, string> = {
    supported: 'Supported',
    candidate: 'Candidate',
    'cors-blocked': 'CORS blocked',
    'policy-restricted': 'Policy restricted',
    unverified: 'Unverified',
    'dataset-only': 'Dataset only',
  };

  const statusTone: Record<DirectBrowserStatus, string> = {
    supported: 'badge-success',
    candidate: 'badge-accent',
    'cors-blocked': 'badge-danger',
    'policy-restricted': 'badge-warning',
    unverified: 'badge-warning',
    'dataset-only': 'badge-muted',
  };

  const confirmCopy = $derived.by(() => {
    if (confirmAction === 'recent') {
      return {
        title: 'Clear recent tools?',
        message: 'This removes the recent-tool list and its persisted record. Favorites, tabs, and settings are kept.',
        label: 'Clear recents',
        danger: false,
      };
    }
    if (confirmAction === 'cache') {
      return {
        title: 'Clear cached enrichment?',
        message: 'This removes cached provider results and dataset enrichment values. Tools and preferences are kept.',
        label: 'Clear cache',
        danger: false,
      };
    }
    if (confirmAction === 'all') {
      return {
        title: 'Delete all local data?',
        message:
          'This clears settings, favorites, recents, tabs, rules, investigations, and cached data from this browser. Export an archive first if you need it. This cannot be undone.',
        label: 'Delete everything',
        danger: true,
      };
    }
    return { title: '', message: '', label: 'Confirm', danger: false };
  });

  function scrollToSection(section: string): void {
    const element = document.getElementById(`settings-${section}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onMount(() => {
    if (router.route.section) {
      const section = router.route.section;
      window.setTimeout(() => scrollToSection(section), 40);
    }
  });

  function setDensity(density: AppSettings['density']): void {
    void session.saveSettings({ density });
  }

  function onMotionChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    void session.saveSettings({ reduceMotion: value === 'reduced' ? 'reduced' : 'system' });
  }

  async function exportArchive(): Promise<void> {
    exportBusy = true;
    try {
      const { json, stats } = await session.buildExport();
      downloadText(`bluekit-${fileStamp()}.bluekit.json`, json, 'application/json;charset=utf-8');
      ui.toast(`Exported ${stats.records} record${stats.records === 1 ? '' : 's'} across ${stats.stores} store(s).`, 'success');
    } catch (error) {
      ui.toast(error instanceof Error ? error.message : 'Export failed.', 'danger');
    } finally {
      exportBusy = false;
    }
  }

  async function importArchive(): Promise<void> {
    if (!importFile) return;
    importing = true;
    importStats = null;
    try {
      const text = await importFile.text();
      const stats = await session.importFromText(text);
      importStats = stats;
      importFile = null;
      ui.toast(`Imported ${stats.records} record${stats.records === 1 ? '' : 's'} (merge, not replace).`, 'success');
    } catch (error) {
      ui.toast(error instanceof Error ? error.message : 'Import failed.', 'danger');
    } finally {
      importing = false;
    }
  }

  async function runConfirm(): Promise<void> {
    const action = confirmAction;
    if (!action) return;
    confirmAction = null;
    try {
      if (action === 'recent') {
        await session.clearRecentHistory();
        ui.toast('Recent history cleared.', 'success');
      } else if (action === 'cache') {
        await session.clearCachedEnrichment();
        ui.toast('Cached enrichment cleared.', 'success');
      } else {
        await session.deleteAllLocalData();
        ui.toast('All local data cleared.', 'success');
      }
    } catch (error) {
      ui.toast(error instanceof Error ? error.message : 'Operation failed.', 'danger');
    }
  }

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/u.test(navigator.platform);
</script>

<div class="page settings">
  <header class="page-head">
    <div>
      <div class="eyebrow">Preferences</div>
      <h1>Settings</h1>
      <p class="lede">
        Everything here stays in this browser. Nothing is synced, and no setting contacts a BlueKit service.
      </p>
    </div>
  </header>

  <nav class="section-nav" aria-label="Settings sections">
    <button type="button" class="nav-chip" onclick={() => scrollToSection('appearance')}>Appearance</button>
    <button type="button" class="nav-chip" onclick={() => scrollToSection('storage')}>Storage</button>
    <button type="button" class="nav-chip" onclick={() => scrollToSection('integrations')}>Integrations</button>
    <button type="button" class="nav-chip" onclick={() => scrollToSection('datasets')}>Datasets</button>
    <button type="button" class="nav-chip" onclick={() => scrollToSection('shortcuts')}>Shortcuts</button>
    <button type="button" class="nav-chip" onclick={() => scrollToSection('about')}>About</button>
  </nav>

  <section class="panel section" id="settings-appearance">
    <div class="panel-head">
      <span class="panel-title">Appearance</span>
      <span class="faint xsmall">Dark theme only in v0.1</span>
    </div>
    <div class="section-body">
      <div class="setting-row">
        <div class="setting-copy">
          <span class="setting-label">Density</span>
          <span class="setting-help">Compact is tuned for analysis tables and dense metadata.</span>
        </div>
        <div class="segmented" role="group" aria-label="Density">
          <button
            type="button"
            class:active={session.settings.density === 'compact'}
            onclick={() => setDensity('compact')}
          >
            Compact
          </button>
          <button
            type="button"
            class:active={session.settings.density === 'comfortable'}
            onclick={() => setDensity('comfortable')}
          >
            Comfortable
          </button>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-copy">
          <span class="setting-label">Motion</span>
          <span class="setting-help">System respects your OS preference. Reduced disables non-essential transitions.</span>
        </div>
        <select class="select compact-select" value={session.settings.reduceMotion} onchange={onMotionChange}>
          <option value="system">Follow system</option>
          <option value="reduced">Reduced</option>
        </select>
      </div>

      <label class="setting-row clickable">
        <div class="setting-copy">
          <span class="setting-label">Show planned catalog entries</span>
          <span class="setting-help">Planned tools are searchable but cannot run. Hiding them reduces catalog noise.</span>
        </div>
        <input
          type="checkbox"
          checked={session.settings.showPlannedTools}
          onchange={(event) =>
            void session.saveSettings({
              showPlannedTools: (event.currentTarget as HTMLInputElement).checked,
            })}
        />
      </label>

      <label class="setting-row clickable">
        <div class="setting-copy">
          <span class="setting-label">Collapse sidebar</span>
          <span class="setting-help">Keep navigation compact. Category links remain available when expanded.</span>
        </div>
        <input
          type="checkbox"
          checked={session.settings.sidebarCollapsed}
          onchange={(event) =>
            void session.saveSettings({
              sidebarCollapsed: (event.currentTarget as HTMLInputElement).checked,
            })}
        />
      </label>
    </div>
  </section>

  <section class="panel section" id="settings-storage">
    <div class="panel-head">
      <span class="panel-title">Storage &amp; archive</span>
      <span class="badge {session.persistenceEnabled ? 'badge-success' : 'badge-warning'}">
        {session.persistenceEnabled ? 'IndexedDB' : 'Memory fallback'}
      </span>
    </div>
    <div class="section-body">
      {#if session.storageNote}
        <div class="notice">
          <Info size={13} strokeWidth={1.9} aria-hidden="true" />
          <span>{session.storageNote}</span>
        </div>
      {/if}

      <div class="storage-grid">
        <div class="storage-stat">
          <span class="stat-icon"><Database size={15} strokeWidth={1.8} aria-hidden="true" /></span>
          <div>
            <div class="stat-label">Backend</div>
            <div class="stat-value">{session.persistenceEnabled ? 'IndexedDB' : 'In-memory'}</div>
          </div>
        </div>
        <div class="storage-stat">
          <span class="stat-icon"><HardDrive size={15} strokeWidth={1.8} aria-hidden="true" /></span>
          <div>
            <div class="stat-label">Usage</div>
            <div class="stat-value">
              {summary?.usageBytes !== undefined ? formatBytes(summary.usageBytes) : 'unknown'}
              {#if summary?.quotaBytes !== undefined}
                <span class="faint"> / {formatBytes(summary.quotaBytes)}</span>
              {/if}
            </div>
          </div>
        </div>
      </div>

      {#if summary}
        <div class="count-grid">
          {#each Object.entries(summary.counts) as [store, count]}
            <span class="count-item">
              <span class="count-key mono">{store}</span>
              <span class="count-value mono">{count}</span>
            </span>
          {/each}
        </div>
      {/if}

      <div class="action-block">
        <div class="action-copy">
          <span class="setting-label">Export local archive</span>
          <span class="setting-help">
            Versioned JSON with settings, favorites, recents, and saved records. Session-only values and API keys are never included.
          </span>
        </div>
        <button type="button" class="btn" disabled={exportBusy} onclick={exportArchive}>
          <Download size={13} strokeWidth={1.9} aria-hidden="true" />
          {exportBusy ? 'Exporting…' : 'Export .bluekit.json'}
        </button>
      </div>

      <div class="action-block import-block">
        <div class="action-copy">
          <span class="setting-label">Import local archive</span>
          <span class="setting-help">
            Validated against the archive schema, 25 MB size limit, and safe record keys. Imports merge; they do not replace existing records.
          </span>
        </div>
        <div class="import-controls">
          <FileDrop accept={['.json', '.bluekit']} file={importFile} disabled={importing} onselect={(next) => (importFile = next)} />
          <button type="button" class="btn" disabled={!importFile || importing} onclick={importArchive}>
            <Upload size={13} strokeWidth={1.9} aria-hidden="true" />
            {importing ? 'Importing…' : 'Import selected'}
          </button>
        </div>
        {#if importStats}
          <div class="import-result">
            Last import: {importStats.records} records across {importStats.stores} store(s), {formatBytes(importStats.bytes)}.
          </div>
        {/if}
      </div>

      <div class="danger-zone">
        <div class="danger-title">Local data controls</div>
        <div class="danger-actions">
          <button type="button" class="btn btn-sm" onclick={() => (confirmAction = 'recent')}>
            Clear recents
          </button>
          <button type="button" class="btn btn-sm" onclick={() => (confirmAction = 'cache')}>
            Clear cached enrichment
          </button>
          <button type="button" class="btn btn-danger btn-sm" onclick={() => (confirmAction = 'all')}>
            <Trash2 size={12} strokeWidth={1.9} aria-hidden="true" />
            Delete all local data
          </button>
        </div>
        <p class="danger-note">
          Browser storage can be evicted under pressure. Export anything you need to keep.
        </p>
      </div>
    </div>
  </section>

  <section class="panel section" id="settings-integrations">
    <div class="panel-head">
      <span class="panel-title">Integrations</span>
      <span class="badge badge-warning badge-dot">No connectors enabled</span>
    </div>
    <div class="section-body">
      <p class="section-copy">
        Direct browser integrations are evaluated against CORS evidence, credential exposure, quotas, and terms.
        A blocked provider stays manual; BlueKit will not add a proxy to work around it.
      </p>
      <div class="provider-list">
        {#each PROVIDERS as provider (provider.id)}
          <details class="provider">
            <summary>
              <span class="provider-name">{provider.name}</span>
              <span class="badge {statusTone[provider.status]}">{statusLabel[provider.status]}</span>
              <span class="mono faint xsmall">CORS: {provider.cors}</span>
              <span class="provider-intent">{provider.intendedUse}</span>
            </summary>
            <div class="provider-body">
              <dl>
                <dt>Credentials</dt>
                <dd>{provider.credentials}</dd>
                <dt>Data sent</dt>
                <dd>{provider.dataSent}</dd>
                <dt>Evidence</dt>
                <dd class="mono xsmall">{provider.evidence}</dd>
                <dt>Cache policy</dt>
                <dd>{provider.cachePolicy}</dd>
                <dt>Manual fallback</dt>
                <dd class="mono xsmall break">{provider.manualFallback}</dd>
              </dl>
              {#if provider.notes.length > 0}
                <ul class="provider-notes">
                  {#each provider.notes as note}
                    <li>{note}</li>
                  {/each}
                </ul>
              {/if}
              <a class="provider-link" href={provider.termsUrl} target="_blank" rel="noopener noreferrer">
                Provider terms
              </a>
            </div>
          </details>
        {/each}
      </div>
    </div>
  </section>

  <section class="panel section" id="settings-datasets">
    <div class="panel-head">
      <span class="panel-title">Datasets</span>
      <span class="faint xsmall">No datasets bundled in this build</span>
    </div>
    <div class="section-body flush">
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Status</th>
              <th>License</th>
              <th>Used by</th>
            </tr>
          </thead>
          <tbody>
            {#each DATASETS as dataset (dataset.id)}
              <tr>
                <td>
                  <span class="strong">{dataset.name}</span>
                  <div class="mono xsmall faint">{dataset.upstream}</div>
                </td>
                <td><span class="badge badge-muted">{dataset.status}</span></td>
                <td class="xsmall">{dataset.license}</td>
                <td class="mono xsmall">{dataset.usedBy.join(', ')}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="section-copy padded">
        Dataset contracts include version, upstream, license, checksum, and release timestamp before any data ships.
        Reference lookups that need data stay planned until a validated snapshot exists.
      </p>
    </div>
  </section>

  <section class="panel section" id="settings-shortcuts">
    <div class="panel-head">
      <span class="panel-title">Keyboard</span>
      <span class="faint xsmall">Works without a mouse</span>
    </div>
    <div class="section-body flush">
      <table class="table shortcuts">
        <tbody>
          <tr><td class="mono">{isMac ? '⌘' : 'Ctrl'} K</td><td>Open or close the command palette</td></tr>
          <tr><td class="mono">{isMac ? '⌘' : 'Ctrl'} ↵</td><td>Run the active tool</td></tr>
          <tr><td class="mono">↑ ↓</td><td>Move through palette results</td></tr>
          <tr><td class="mono">↵</td><td>Open the selected palette result</td></tr>
          <tr><td class="mono">Esc</td><td>Dismiss palette, navigation overlay, or cancel a running tool</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="panel section" id="settings-about">
    <div class="panel-head">
      <span class="panel-title">About</span>
      <span class="mono faint xsmall">v0.1.0</span>
    </div>
    <div class="section-body about">
      <div class="about-grid">
        <div>
          <div class="about-label">Application</div>
          <div class="about-value">BlueKit — browser-native Blue Team workbench</div>
        </div>
        <div>
          <div class="about-label">Stack</div>
          <div class="about-value">Vite · Svelte 5 · TypeScript · Web Workers · IndexedDB</div>
        </div>
        <div>
          <div class="about-label">Deployment</div>
          <div class="about-value">Static assets only. No BlueKit API, accounts, or server-side processing.</div>
        </div>
        <div>
          <div class="about-label">Data handling</div>
          <div class="about-value">Local-only by default. External requests require explicit future connector approval.</div>
        </div>
      </div>
      <div class="about-links">
        <button type="button" class="btn btn-sm" onclick={() => router.navigate('/diagnostics')}>
          Open diagnostics
        </button>
        <button type="button" class="btn btn-sm" onclick={() => router.navigate('/tools')}>
          Browse tools
        </button>
      </div>
      <p class="about-note">
        <Keyboard size={12} strokeWidth={1.9} aria-hidden="true" />
        Phase 1 foundation. Planned tools and reference datasets are catalog metadata until implemented.
      </p>
    </div>
  </section>

  <div class="integration-foot">
    <Plug size={12} strokeWidth={1.9} aria-hidden="true" />
    Integrations stay disabled until CORS, credentials, quotas, and terms are all reviewed.
  </div>
</div>

<ConfirmDialog
  open={confirmAction !== null}
  title={confirmCopy.title}
  message={confirmCopy.message}
  confirmLabel={confirmCopy.label}
  danger={confirmCopy.danger}
  onconfirm={runConfirm}
  oncancel={() => (confirmAction = null)}
/>

<style>
  .settings {
    max-width: 980px;
  }

  .page-head {
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
    max-width: 700px;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.6;
  }

  .section-nav {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-soft);
  }

  .nav-chip {
    height: 23px;
    padding: 0 8px;
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    background: transparent;
    color: var(--muted);
    font-size: 10.5px;
  }

  .nav-chip:hover {
    border-color: var(--border);
    background: var(--surface-2);
    color: var(--text);
  }

  .section {
    margin-bottom: 14px;
    scroll-margin-top: 10px;
  }

  .section-body {
    padding: 3px 0;
  }

  .section-body.flush {
    padding: 0;
  }

  .section-body.padded {
    padding: 10px 12px;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-soft);
  }

  .setting-row:last-child {
    border-bottom: 0;
  }

  .setting-row.clickable {
    cursor: pointer;
  }

  .setting-row.clickable:hover {
    background: rgba(255, 255, 255, 0.015);
  }

  .setting-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .setting-label {
    color: var(--text);
    font-size: 12px;
    font-weight: 550;
  }

  .setting-help {
    color: var(--muted-2);
    font-size: 10.5px;
    line-height: 1.45;
  }

  .segmented {
    display: flex;
    flex: 0 0 auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .segmented button {
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-right: 1px solid var(--border);
    background: var(--surface-1);
    color: var(--muted);
    font-size: 10.5px;
  }

  .segmented button:last-child {
    border-right: 0;
  }

  .segmented button:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .segmented button.active {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }

  .compact-select {
    width: 142px;
    height: 27px;
    flex: 0 0 auto;
    font-size: 11px;
  }

  input[type='checkbox'] {
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
    accent-color: var(--accent);
  }

  .notice {
    display: flex;
    gap: 8px;
    margin: 9px 12px;
    padding: 8px 9px;
    border: 1px solid rgba(216, 166, 87, 0.25);
    border-radius: var(--radius);
    background: var(--warning-soft);
    color: #e5c28a;
    font-size: 11px;
    line-height: 1.5;
  }

  .notice :global(svg) {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  .storage-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 0 12px 10px;
  }

  .storage-stat {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 10px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--bg-elevated);
  }

  .stat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 27px;
    height: 27px;
    flex: 0 0 auto;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--muted);
  }

  .stat-label {
    color: var(--muted-2);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 11.5px;
  }

  .count-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 12px 12px;
  }

  .count-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 21px;
    padding: 0 6px;
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    background: var(--surface-1);
  }

  .count-key {
    color: var(--muted-2);
    font-size: 9px;
  }

  .count-value {
    color: var(--text);
    font-size: 10px;
  }

  .action-block {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 11px 12px;
    border-top: 1px solid var(--border-soft);
  }

  .action-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .import-block {
    flex-direction: column;
    align-items: stretch;
  }

  .import-controls {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .import-controls :global(.drop) {
    flex: 1 1 auto;
  }

  .import-result {
    padding: 6px 8px;
    border: 1px solid rgba(86, 185, 141, 0.24);
    border-radius: var(--radius);
    background: var(--success-soft);
    color: #86d8b4;
    font-size: 10.5px;
  }

  .danger-zone {
    margin: 12px;
    padding: 10px 11px;
    border: 1px solid rgba(224, 108, 108, 0.28);
    border-radius: var(--radius);
    background: rgba(224, 108, 108, 0.045);
  }

  .danger-title {
    color: #f0a3a3;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .danger-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .danger-note {
    margin-top: 7px;
    color: var(--muted-2);
    font-size: 10px;
  }

  .section-copy {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.55;
    padding: 10px 12px;
  }

  .provider-list {
    border-top: 1px solid var(--border-soft);
  }

  .provider {
    border-bottom: 1px solid var(--border-soft);
  }

  .provider:last-child {
    border-bottom: 0;
  }

  .provider summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 5px 12px;
    cursor: pointer;
    list-style: none;
  }

  .provider summary::-webkit-details-marker {
    display: none;
  }

  .provider summary:hover {
    background: var(--surface-2);
  }

  .provider-name {
    color: var(--text-strong);
    font-size: 11.5px;
    font-weight: 550;
    white-space: nowrap;
  }

  .provider-intent {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--muted-2);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .provider-body {
    padding: 2px 12px 10px;
    background: var(--bg-elevated);
  }

  .provider-body dl {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 6px 10px;
    margin: 6px 0;
    font-size: 10.5px;
  }

  .provider-body dt {
    color: var(--muted-2);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .provider-body dd {
    margin: 0;
    color: var(--muted);
    line-height: 1.5;
  }

  .break {
    overflow-wrap: anywhere;
  }

  .provider-notes {
    margin: 6px 0;
    padding-left: 16px;
    color: var(--muted);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .provider-link {
    display: inline-block;
    margin-top: 3px;
    font-size: 10.5px;
  }

  .table-scroll {
    overflow-x: auto;
  }

  .shortcuts td {
    font-size: 11.5px;
  }

  .shortcuts td:first-child {
    width: 110px;
    color: var(--text);
    white-space: nowrap;
  }

  .about {
    padding: 12px;
  }

  .about-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 11px;
  }

  .about-label {
    color: var(--muted-2);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 2px;
  }

  .about-value {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.5;
  }

  .about-links {
    display: flex;
    gap: 6px;
    margin-top: 13px;
  }

  .about-note {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding-top: 9px;
    border-top: 1px solid var(--border-soft);
    color: var(--muted-2);
    font-size: 10px;
  }

  .integration-foot {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 2px 2px;
    color: var(--muted-2);
    font-size: 10px;
  }

  @media (max-width: 720px) {
    .setting-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }

    .storage-grid,
    .about-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .action-block {
      flex-direction: column;
    }

    .import-controls {
      flex-direction: column;
      align-items: stretch;
    }

    .provider summary {
      flex-wrap: wrap;
    }

    .provider-intent {
      flex-basis: 100%;
    }
  }
</style>
