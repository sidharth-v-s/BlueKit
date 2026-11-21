<script lang="ts">
  import Copy from 'lucide-svelte/icons/copy';
  import Info from 'lucide-svelte/icons/info';
  import Link2 from 'lucide-svelte/icons/link-2';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import OutputToolbar from './OutputToolbar.svelte';
  import { ui } from '@/app/ui.svelte';
  import { copyText } from '@/core/app/clipboard';
  import { formatBytes } from '@/core/runtime/errors';
  import type { EmailUrlRecord } from '@/tools/email/urls';
  import type { EmailUrlReport } from '@/tools/email/url-extractor';

  let { value }: { value: EmailUrlReport } = $props();

  const json = $derived(JSON.stringify(value, null, 2));

  async function copy(text: string, label: string, warning = false): Promise<void> {
    const ok = await copyText(text);
    if (!ok) {
      ui.toast('Clipboard is unavailable.', 'danger');
      return;
    }
    ui.toast(warning ? `${label} copied. Do not open unless you trust it.` : `${label} copied.`, warning ? 'warning' : 'success');
  }

  function flagClass(flag: string): string {
    if (flag === 'embedded-credentials' || flag === 'ip-literal-host' || flag === 'punycode-host') return 'warning';
    if (flag === 'non-standard-port' || flag === 'very-long-url' || flag === 'non-http-scheme') return 'warning';
    return 'muted';
  }

  function hostLabel(url: EmailUrlRecord): string {
    return url.port ? `${url.host}:${url.port}` : url.host;
  }
</script>

<OutputToolbar
  text={json}
  filename="email-urls.json"
  mime="application/json;charset=utf-8"
  note="bluekit.email-urls.v1 · extraction only; no URL was fetched"
/>

<div class="content">
  <section class="block">
    <header class="block-head">
      <h3>Extraction summary</h3>
      <span class="mono faint">{formatBytes(value.byteLength)} input</span>
    </header>
    <dl class="kv">
      <dt>Input</dt>
      <dd class="mono">{value.inputKind}{value.fileName ? ` · ${value.fileName}` : ''}</dd>
      {#if value.subject}
        <dt>Subject</dt>
        <dd class="break">{value.subject}</dd>
      {/if}
      <dt>Unique URLs</dt>
      <dd class="strong mono">{value.urls.length}</dd>
      <dt>Exact hosts</dt>
      <dd class="mono">{value.hosts.length}</dd>
    </dl>
  </section>

  {#if value.hosts.length > 0}
    <section class="block">
      <header class="block-head">
        <h3>Hosts</h3>
        <span class="faint">exact hostname grouping</span>
      </header>
      <div class="hosts">
        {#each value.hosts as host (host.host)}
          <span class="host-chip mono">{host.host}<span class="host-count">{host.count}</span></span>
        {/each}
      </div>
    </section>
  {/if}

  {#if value.warnings.length > 0}
    <section class="block">
      <header class="block-head">
        <h3>Warnings</h3>
        <TriangleAlert size={13} strokeWidth={1.9} aria-hidden="true" />
      </header>
      <div class="findings">
        {#each value.warnings as warning}
          <div class="finding warn">
            <TriangleAlert size={14} strokeWidth={1.9} aria-hidden="true" />
            <span>{warning}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section class="block">
    <header class="block-head">
      <h3>URLs</h3>
      <span class="faint">defanged for display · copy actions are explicit</span>
    </header>
    {#if value.urls.length === 0}
      <div class="body-empty">No absolute HTTP, HTTPS, or FTP URLs were found.</div>
    {:else}
      <div class="url-list">
        {#each value.urls as url (url.normalized)}
          <article class="url">
            <header class="url-head">
              <Link2 size={13} strokeWidth={1.8} aria-hidden="true" class="url-icon" />
              <span class="defanged mono">{url.defanged}</span>
              <span class="grow"></span>
              <button
                type="button"
                class="btn btn-sm"
                title="Copy the defanged display form"
                onclick={() => copy(url.defanged, 'Defanged URL')}
              >
                <Copy size={12} aria-hidden="true" /> Defanged
              </button>
              <button
                type="button"
                class="btn btn-sm"
                title="Copy the refanged URL. BlueKit will not open it."
                onclick={() => copy(url.normalized, 'Refanged URL', true)}
              >
                <Copy size={12} aria-hidden="true" /> Refanged
              </button>
            </header>

            <dl class="kv url-kv">
              <dt>Normalized</dt>
              <dd class="mono xsmall break">{url.normalized}</dd>
              <dt>Original</dt>
              <dd class="mono xsmall break">{url.original}</dd>
              <dt>Scheme</dt>
              <dd class="mono xsmall">{url.scheme}</dd>
              <dt>Host</dt>
              <dd class="mono xsmall break">{hostLabel(url)}</dd>
              <dt>Path</dt>
              <dd class="mono xsmall break">{url.path}</dd>
              {#if url.query}
                <dt>Query</dt>
                <dd class="mono xsmall break">{url.query}</dd>
                <dt>Query keys</dt>
                <dd class="mono xsmall break">{url.queryKeys.join(', ') || '—'}</dd>
              {/if}
              {#if url.fragment}
                <dt>Fragment</dt>
                <dd class="mono xsmall break">{url.fragment}</dd>
              {/if}
              <dt>Occurrences</dt>
              <dd class="mono xsmall">{url.occurrences} · {url.sources.join(', ')}</dd>
            </dl>

            {#if url.flags.length > 0}
              <div class="flags">
                {#each url.flags as flag}
                  <span class="flag {flagClass(flag)}">{flag}</span>
                {/each}
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <section class="block">
    <header class="block-head">
      <h3>Notes &amp; limits</h3>
      <Info size={13} strokeWidth={1.9} aria-hidden="true" />
    </header>
    <div class="findings">
      {#each value.notes as note}
        <div class="finding note">
          <Info size={14} strokeWidth={1.9} aria-hidden="true" />
          <span>{note}</span>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .grow {
    flex: 1 1 auto;
  }

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
    text-align: right;
  }

  .kv {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    margin: 0;
    padding: 8px 11px;
    row-gap: 4px;
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

  .strong {
    color: var(--text-strong);
    font-weight: 600;
  }

  .break {
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .hosts {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 9px 11px;
  }

  .host-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px;
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    background: var(--surface-2);
    color: var(--text);
    font-size: 10px;
  }

  .host-count {
    color: var(--muted-2);
    font-size: 9px;
  }

  .url-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 11px 12px;
  }

  .url {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    padding: 8px 9px;
  }

  .url-head {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }

  .url-icon {
    flex: 0 0 auto;
    color: var(--muted-2);
  }

  .defanged {
    color: var(--text-strong);
    font-size: 11.5px;
    overflow-wrap: anywhere;
  }

  .url-kv {
    margin-top: 7px;
    padding: 0;
    grid-template-columns: 86px minmax(0, 1fr);
    row-gap: 3px;
  }

  .flags {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    margin-top: 7px;
  }

  .flag {
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 5px;
    font-family: var(--font-mono);
    font-size: 9.5px;
  }

  .flag.warning {
    border-color: var(--warning);
    color: var(--warning);
  }

  .flag.muted {
    color: var(--muted-2);
  }

  .findings {
    display: flex;
    flex-direction: column;
  }

  .finding {
    display: flex;
    gap: 8px;
    padding: 7px 11px;
    border-bottom: 1px solid var(--border-soft);
    font-size: 11.5px;
    line-height: 1.5;
  }

  .finding:last-child {
    border-bottom: 0;
  }

  .finding.warn {
    background: rgba(216, 166, 87, 0.05);
    color: #e5c28a;
  }

  .finding.warn :global(svg) {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  .finding.note {
    color: var(--muted);
  }

  .finding.note :global(svg) {
    flex: 0 0 auto;
    margin-top: 1px;
    color: var(--muted-2);
  }

  .body-empty {
    padding: 10px 11px;
    color: var(--muted-2);
    font-size: 11.5px;
  }
</style>
