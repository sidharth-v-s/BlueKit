<script lang="ts">
  import Copy from 'lucide-svelte/icons/copy';
  import Crosshair from 'lucide-svelte/icons/crosshair';
  import Eraser from 'lucide-svelte/icons/eraser';
  import Info from 'lucide-svelte/icons/info';
  import Search from 'lucide-svelte/icons/search';
  import ShieldAlert from 'lucide-svelte/icons/shield-alert';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import { ui } from '@/app/ui.svelte';
  import { copyText } from '@/core/app/clipboard';
  import { defang, refang } from '@/tools/encoding/defang';
  import { extractIocs, type IocReport } from '@/tools/ioc/extractor';
  import { normalizeIndicators, type BulkIocReport } from '@/tools/ioc/bulk-normalizer';

  type WorkspaceMode = 'extract' | 'normalize';

  interface WorkspaceIndicator {
    type: string;
    value: string;
    count: number;
    sourceLines?: number[];
    private?: boolean;
  }

  interface WorkspaceReport {
    mode: WorkspaceMode;
    indicators: WorkspaceIndicator[];
    unique: number;
    duplicatesRemoved: number;
    ignoredLines: number;
    refanged: boolean;
    warnings: string[];
  }

  const MAX_INPUT_BYTES = 2 * 1024 * 1024;

  const TYPE_LABELS: Record<string, string> = {
    url: 'URL',
    domain: 'Domain',
    ipv4: 'IPv4',
    ipv6: 'IPv6',
    email: 'Email',
    md5: 'MD5',
    sha1: 'SHA-1',
    sha256: 'SHA-256',
    sha512: 'SHA-512',
    cve: 'CVE',
    unknown: 'Unknown',
  };

  const TYPE_ORDER = [
    'url',
    'domain',
    'ipv4',
    'ipv6',
    'email',
    'md5',
    'sha1',
    'sha256',
    'sha512',
    'cve',
    'unknown',
  ];

  let mode = $state<WorkspaceMode>('extract');
  let input = $state('');
  let result = $state<WorkspaceReport | null>(null);
  let error = $state<string | null>(null);
  let typeFilter = $state('all');
  let query = $state('');

  const typeCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const indicator of result?.indicators ?? []) {
      counts.set(indicator.type, (counts.get(indicator.type) ?? 0) + 1);
    }
    return TYPE_ORDER.filter((type) => counts.has(type)).map((type) => ({
      type,
      label: TYPE_LABELS[type] ?? type,
      count: counts.get(type) ?? 0,
    }));
  });

  const filtered = $derived.by(() => {
    if (!result) return [];
    const needle = query.trim().toLowerCase();
    return result.indicators.filter(
      (indicator) =>
        (typeFilter === 'all' || indicator.type === typeFilter) &&
        (needle.length === 0 || indicator.value.toLowerCase().includes(needle)),
    );
  });

  function switchMode(next: WorkspaceMode): void {
    if (mode === next) return;
    mode = next;
    result = null;
    error = null;
    typeFilter = 'all';
  }

  function analyze(): void {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      error = 'Paste text or a one-per-line indicator list first.';
      result = null;
      return;
    }
    if (new TextEncoder().encode(input).byteLength > MAX_INPUT_BYTES) {
      error = 'Input exceeds the 2 MiB workspace limit.';
      result = null;
      return;
    }

    try {
      if (mode === 'extract') {
        const report: IocReport = extractIocs(input);
        const indicators: WorkspaceIndicator[] = report.indicators.map((indicator) => ({
          type: indicator.type,
          value: indicator.value,
          count: indicator.count,
          ...(indicator.private !== undefined ? { private: indicator.private } : {}),
        }));
        result = {
          mode,
          indicators,
          unique: indicators.length,
          duplicatesRemoved: indicators.reduce((total, indicator) => total + indicator.count - 1, 0),
          ignoredLines: 0,
          refanged: report.refanged,
          warnings: report.warnings,
        };
      } else {
        const report: BulkIocReport = normalizeIndicators(input);
        result = {
          mode,
          indicators: report.entries.map((entry) => ({
            type: entry.type,
            value: entry.value,
            count: entry.count,
            sourceLines: entry.sourceLines,
          })),
          unique: report.unique,
          duplicatesRemoved: report.duplicatesRemoved,
          ignoredLines: report.ignoredLines,
          refanged: refang(input) !== input,
          warnings: report.warnings,
        };
      }
      error = null;
      typeFilter = 'all';
      query = '';
    } catch (caught) {
      result = null;
      error = caught instanceof Error ? caught.message : String(caught);
    }
  }

  function clear(): void {
    input = '';
    result = null;
    error = null;
    typeFilter = 'all';
    query = '';
  }

  function displayValue(indicator: WorkspaceIndicator): string {
    if (indicator.type === 'url' || indicator.type === 'domain' || indicator.type === 'email') {
      return defang(indicator.value);
    }
    return indicator.value;
  }

  async function copy(text: string, label: string, warning = false): Promise<void> {
    const ok = await copyText(text);
    if (!ok) {
      ui.toast('Clipboard is unavailable.', 'danger');
      return;
    }
    ui.toast(
      warning ? `${label} copied. Do not open or resolve it unless you trust it.` : `${label} copied.`,
      warning ? 'warning' : 'success',
    );
  }

  function copyVisible(kind: 'defanged' | 'refanged'): void {
    if (filtered.length === 0) {
      ui.toast('There are no visible indicators to copy.', 'warning');
      return;
    }
    const values =
      kind === 'defanged'
        ? filtered.map((indicator) => displayValue(indicator))
        : filtered.map((indicator) => indicator.value);
    void copy(values.join('\n'), `${filtered.length} visible indicator${filtered.length === 1 ? '' : 's'}`, kind === 'refanged');
  }

  function handleKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      analyze();
    }
  }
</script>

<div class="page ioc-workspace">
  <header class="page-head">
    <div class="head-copy">
      <div class="eyebrow">IOC workspace · Phase 3</div>
      <h1>Indicator workspace</h1>
      <p class="lede">
        Extract indicators from text or normalize a one-per-line list. Values are refanged, classified,
        and deduplicated locally. Nothing is resolved, fetched, or verified.
      </p>
    </div>
    <div class="head-meta">
      <Crosshair size={15} strokeWidth={1.8} aria-hidden="true" />
      <span class="mono">2 MiB</span>
      <span class="faint">input cap</span>
    </div>
  </header>

  <div class="workspace">
    <section class="panel input-panel">
      <div class="panel-head">
        <span class="panel-title">Input</span>
        <div class="mode-switch" role="group" aria-label="Workspace mode">
          <button
            type="button"
            class="mode"
            class:active={mode === 'extract'}
            aria-pressed={mode === 'extract'}
            onclick={() => switchMode('extract')}
          >
            Extract from text
          </button>
          <button
            type="button"
            class="mode"
            class:active={mode === 'normalize'}
            aria-pressed={mode === 'normalize'}
            onclick={() => switchMode('normalize')}
          >
            Normalize list
          </button>
        </div>
      </div>

      <div class="input-body">
        <p class="mode-note">
          {#if mode === 'extract'}
            Finds URLs, domains, IPv4/IPv6, emails, MD5/SHA hashes, and CVEs anywhere in the text.
          {:else}
            Treats each non-empty line as one indicator. Comments, bullets, numbering, and wrappers are trimmed.
          {/if}
        </p>
        <textarea
          class="textarea mono"
          bind:value={input}
          onkeydown={handleKeydown}
          spellcheck="false"
          placeholder={mode === 'extract'
            ? 'Paste a report, email body, or log excerpt…\n\nhxxps://evil[.]example/login\n203.0.113.9\n44d88612fea8a8f36de82e1278abb02f'
            : 'hxxps://evil[.]example/login\n203.0.113.9\n44d88612fea8a8f36de82e1278abb02f'}
          aria-label="Indicators or text to analyze"
        ></textarea>

        {#if error}
          <div class="inline-error">{error}</div>
        {/if}

        <div class="input-actions">
          <button type="button" class="btn btn-primary" onclick={analyze}>
            <Crosshair size={14} strokeWidth={1.9} aria-hidden="true" />
            {mode === 'extract' ? 'Extract indicators' : 'Normalize indicators'}
          </button>
          <button type="button" class="btn btn-ghost" onclick={clear} disabled={input.length === 0 && !result}>
            <Eraser size={13} strokeWidth={1.8} aria-hidden="true" />
            Clear
          </button>
          <span class="kbd-hint faint">Ctrl Enter to run</span>
        </div>
      </div>
    </section>

    <section class="panel results-panel">
      <div class="panel-head">
        <span class="panel-title">Results</span>
        {#if result}
          <span class="faint xsmall">{result.mode === 'extract' ? 'extraction' : 'normalization'} · {result.unique} unique</span>
        {:else}
          <span class="faint xsmall">local only</span>
        {/if}
      </div>

      {#if !result}
        <div class="empty">
          <Crosshair size={22} strokeWidth={1.4} aria-hidden="true" />
          <span>No results yet.</span>
          <span class="faint">Paste indicators or text, then run the workspace.</span>
        </div>
      {:else}
        <div class="summary">
          <div class="summary-item">
            <span class="summary-value mono">{result.unique}</span>
            <span class="summary-label">Unique</span>
          </div>
          <div class="summary-item">
            <span class="summary-value mono">{result.duplicatesRemoved}</span>
            <span class="summary-label">Duplicates</span>
          </div>
          <div class="summary-item">
            <span class="summary-value mono">{result.mode === 'extract' ? '—' : result.ignoredLines}</span>
            <span class="summary-label">Ignored lines</span>
          </div>
          <div class="summary-item">
            <span class="summary-value mono">{result.refanged ? 'yes' : 'no'}</span>
            <span class="summary-label">Refanged input</span>
          </div>
        </div>

        <div class="type-bar" aria-label="Filter by indicator type">
          <button
            type="button"
            class="chip"
            class:active={typeFilter === 'all'}
            onclick={() => (typeFilter = 'all')}
          >
            All <span class="chip-count mono">{result.unique}</span>
          </button>
          {#each typeCounts as group (group.type)}
            <button
              type="button"
              class="chip"
              class:active={typeFilter === group.type}
              onclick={() => (typeFilter = group.type)}
            >
              {group.label} <span class="chip-count mono">{group.count}</span>
            </button>
          {/each}
        </div>

        <div class="filter-row">
          <label class="search-box">
            <Search size={13} strokeWidth={2} aria-hidden="true" />
            <span class="sr-only">Filter indicators</span>
            <input
              class="search-input"
              type="search"
              placeholder="Filter by value…"
              bind:value={query}
            />
          </label>
          <span class="visible-count faint">{filtered.length} visible</span>
        </div>

        {#if filtered.length === 0}
          <div class="empty compact">
            <span>No indicators match this filter.</span>
            <span class="faint">Clear the search or choose a different type.</span>
          </div>
        {:else}
          <div class="bulk-actions">
            <button type="button" class="btn btn-ghost btn-sm" onclick={() => copyVisible('defanged')}>
              <Copy size={12} aria-hidden="true" /> Copy defanged
            </button>
            <button type="button" class="btn btn-ghost btn-sm" onclick={() => copyVisible('refanged')}>
              <Copy size={12} aria-hidden="true" /> Copy refanged
            </button>
          </div>

          <div class="indicator-list">
            {#each filtered as indicator (indicator.type + '\u0000' + indicator.value)}
              <div class="indicator">
                <span class="type-badge">{TYPE_LABELS[indicator.type] ?? indicator.type}</span>
                <span class="value mono" title={indicator.value}>{displayValue(indicator)}</span>
                <span class="meta">
                  {#if indicator.count > 1}
                    <span class="count mono">×{indicator.count}</span>
                  {/if}
                  {#if indicator.private}
                    <span class="private">private</span>
                  {/if}
                  {#if indicator.sourceLines && indicator.sourceLines.length > 0}
                    <span class="lines mono" title="Source lines">{indicator.sourceLines.join(', ')}</span>
                  {/if}
                </span>
                <span class="row-actions">
                  <button
                    type="button"
                    class="mini"
                    title="Copy the defanged value"
                    onclick={() => copy(displayValue(indicator), 'Indicator', false)}
                  >
                    <Copy size={11} aria-hidden="true" /> Copy
                  </button>
                  {#if displayValue(indicator) !== indicator.value}
                    <button
                      type="button"
                      class="mini live"
                      title="Copy the refanged value. BlueKit will not resolve or open it."
                      onclick={() => copy(indicator.value, 'Refanged indicator', true)}
                    >
                      Refanged
                    </button>
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {/if}

        {#if result.warnings.length > 0}
          <div class="warnings">
            {#each result.warnings as warning}
              <div class="warning">
                <TriangleAlert size={13} strokeWidth={1.9} aria-hidden="true" />
                <span>{warning}</span>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </section>
  </div>

  <section class="panel notes-panel">
    <div class="panel-head">
      <span class="panel-title">
        <Info size={13} strokeWidth={1.9} aria-hidden="true" /> Workspace rules
      </span>
    </div>
    <div class="notes">
      <div class="note">
        <ShieldAlert size={14} strokeWidth={1.9} aria-hidden="true" />
        <p>
          <strong>Refanging is syntactic.</strong> A refanged indicator is not verified. Do not open or
          resolve untrusted values unless you have a controlled environment.
        </p>
      </div>
      <div class="note">
        <ShieldAlert size={14} strokeWidth={1.9} aria-hidden="true" />
        <p>
          <strong>Extraction is heuristic.</strong> Prose and filenames can look like domains. Review the
          type and context before using an indicator.
        </p>
      </div>
      <div class="note">
        <ShieldAlert size={14} strokeWidth={1.9} aria-hidden="true" />
        <p>
          <strong>Private addresses are flagged, not removed.</strong> Loopback, RFC 1918, link-local, and
          IPv6 ULA values are still recorded.
        </p>
      </div>
    </div>
  </section>
</div>

<style>
  .ioc-workspace {
    max-width: 1180px;
  }

  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 22px;
    margin-bottom: 16px;
  }

  .head-copy {
    max-width: 680px;
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
    font-size: 22px;
    line-height: 1.2;
    margin-bottom: 8px;
  }

  .lede {
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.6;
  }

  .head-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    padding-top: 8px;
    color: var(--muted-2);
    font-size: 10.5px;
    white-space: nowrap;
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
    gap: 14px;
    align-items: start;
    margin-bottom: 14px;
  }

  .mode-switch {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface-2);
  }

  .mode {
    height: 23px;
    padding: 0 7px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--muted);
    font-size: 10px;
    white-space: nowrap;
  }

  .mode:hover {
    color: var(--text);
  }

  .mode.active {
    background: var(--surface-3);
    color: var(--text-strong);
  }

  .input-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
  }

  .mode-note {
    color: var(--muted-2);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .textarea {
    width: 100%;
    min-height: 250px;
    resize: vertical;
    padding: 8px 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    color: var(--text);
    font-size: 11.5px;
    line-height: 1.55;
    outline: none;
  }

  .textarea:focus {
    border-color: var(--accent-line);
    box-shadow: 0 0 0 2px rgba(76, 154, 255, 0.12);
  }

  .textarea::placeholder {
    color: var(--muted-2);
  }

  .inline-error {
    padding: 6px 8px;
    border: 1px solid rgba(226, 107, 107, 0.35);
    border-radius: var(--radius);
    background: var(--danger-soft);
    color: var(--danger);
    font-size: 11px;
  }

  .input-actions {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }

  .kbd-hint {
    margin-left: auto;
    font-size: 9.5px;
  }

  .results-panel {
    min-width: 0;
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border-bottom: 1px solid var(--border-soft);
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 8px 11px;
    border-right: 1px solid var(--border-soft);
  }

  .summary-item:last-child {
    border-right: 0;
  }

  .summary-value {
    color: var(--text-strong);
    font-size: 16px;
    line-height: 1.2;
  }

  .summary-label {
    color: var(--muted-2);
    font-size: 9.5px;
  }

  .type-bar {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    padding: 8px 10px 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 7px;
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    background: transparent;
    color: var(--muted);
    font-size: 10px;
    white-space: nowrap;
  }

  .chip:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .chip.active {
    border-color: var(--accent-line);
    background: var(--accent-soft);
    color: #9ecbff;
  }

  .chip-count {
    color: var(--muted-2);
    font-size: 9px;
  }

  .chip.active .chip-count {
    color: #9ecbff;
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 1 1 auto;
    height: 28px;
    padding: 0 7px 0 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    color: var(--muted-2);
  }

  .search-box:focus-within {
    border-color: var(--accent-line);
  }

  .search-input {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font-size: 11.5px;
    outline: none;
  }

  .visible-count {
    flex: 0 0 auto;
    font-size: 9.5px;
  }

  .bulk-actions {
    display: flex;
    gap: 6px;
    padding: 0 10px 8px;
  }

  .indicator-list {
    max-height: 430px;
    overflow: auto;
    border-top: 1px solid var(--border-soft);
  }

  .indicator {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-soft);
  }

  .indicator:last-child {
    border-bottom: 0;
  }

  .indicator:hover {
    background: var(--surface-2);
  }

  .type-badge {
    flex: 0 0 auto;
    min-width: 44px;
    padding: 1px 5px;
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 9px;
    text-align: center;
    text-transform: uppercase;
  }

  .value {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--text);
    font-size: 10.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 0 0 auto;
    color: var(--muted-2);
    font-size: 9px;
  }

  .count {
    color: var(--muted);
  }

  .private {
    padding: 0 4px;
    border: 1px solid rgba(216, 166, 87, 0.3);
    border-radius: 2px;
    color: var(--warning);
  }

  .lines {
    max-width: 74px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-actions {
    display: flex;
    gap: 3px;
    flex: 0 0 auto;
  }

  .mini {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 20px;
    padding: 0 5px;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    color: var(--muted-2);
    font-size: 9px;
  }

  .mini:hover {
    border-color: var(--border);
    background: var(--surface-3);
    color: var(--text);
  }

  .mini.live:hover {
    border-color: rgba(216, 166, 87, 0.4);
    color: var(--warning);
  }

  .warnings {
    border-top: 1px solid var(--border-soft);
  }

  .warning {
    display: flex;
    gap: 7px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-soft);
    color: #e5c28a;
    font-size: 10.5px;
    line-height: 1.5;
  }

  .warning:last-child {
    border-bottom: 0;
  }

  .warning :global(svg) {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 240px;
    padding: 28px 18px;
    color: var(--muted);
    text-align: center;
    font-size: 12px;
  }

  .empty.compact {
    min-height: 100px;
  }

  .empty :global(svg) {
    color: var(--muted-2);
  }

  .notes-panel {
    margin-bottom: 20px;
  }

  .notes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .note {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border-right: 1px solid var(--border-soft);
  }

  .note:last-child {
    border-right: 0;
  }

  .note :global(svg) {
    flex: 0 0 auto;
    margin-top: 1px;
    color: var(--muted-2);
  }

  .note p {
    color: var(--muted);
    font-size: 10.5px;
    line-height: 1.55;
  }

  .note strong {
    color: var(--text);
    font-weight: 600;
  }

  @media (max-width: 980px) {
    .workspace {
      grid-template-columns: minmax(0, 1fr);
    }

    .notes {
      grid-template-columns: minmax(0, 1fr);
    }

    .note {
      border-right: 0;
      border-bottom: 1px solid var(--border-soft);
    }

    .note:last-child {
      border-bottom: 0;
    }
  }

  @media (max-width: 640px) {
    .page-head {
      flex-direction: column;
      gap: 4px;
    }

    .head-meta {
      padding-top: 0;
    }

    .summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .summary-item:nth-child(2) {
      border-right: 0;
    }

    .summary-item:nth-child(-n + 2) {
      border-bottom: 1px solid var(--border-soft);
    }

    .lines {
      display: none;
    }
  }
</style>
