<script lang="ts">
  import Copy from 'lucide-svelte/icons/copy';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import Info from 'lucide-svelte/icons/info';
  import Paperclip from 'lucide-svelte/icons/paperclip';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import OutputToolbar from './OutputToolbar.svelte';
  import { ui } from '@/app/ui.svelte';
  import { copyText } from '@/core/app/clipboard';
  import { formatBytes } from '@/core/runtime/errors';
  import type { EmailAddress, EmlAnalysis } from '@/tools/email/rfc822';

  let { value }: { value: EmlAnalysis } = $props();

  const json = $derived(JSON.stringify(value, null, 2));

  function formatAddresses(addresses: EmailAddress[]): string {
    return addresses
      .map((address) => (address.name ? `${address.name} <${address.address}>` : address.address))
      .join(', ');
  }

  async function copy(text: string, label: string): Promise<void> {
    const ok = await copyText(text);
    ui.toast(ok ? `${label} copied.` : 'Clipboard is unavailable.', ok ? 'success' : 'danger');
  }

  const textBody = $derived(value.bodies.text ?? '');
  const htmlBody = $derived(value.bodies.html ?? '');
</script>

<OutputToolbar text={json} filename="eml-analysis.json" mime="application/json;charset=utf-8" note="bluekit.email-message.v1" />

<div class="content">
  <section class="block">
    <header class="block-head">
      <h3>Message summary</h3>
      <span class="mono faint">{formatBytes(value.byteLength)}</span>
    </header>
    <dl class="kv">
      <dt>Subject</dt>
      <dd class="strong">{value.subject || '(no subject)'}</dd>
      <dt>From</dt>
      <dd>{formatAddresses(value.from) || '—'}</dd>
      <dt>To</dt>
      <dd>{formatAddresses(value.to) || '—'}</dd>
      {#if value.cc.length > 0}
        <dt>Cc</dt>
        <dd>{formatAddresses(value.cc)}</dd>
      {/if}
      {#if value.replyTo.length > 0}
        <dt>Reply-To</dt>
        <dd>{formatAddresses(value.replyTo)}</dd>
      {/if}
      <dt>Date</dt>
      <dd class="mono">{value.date ?? '—'}</dd>
      <dt>Message-ID</dt>
      <dd class="mono break">{value.messageId ?? '—'}</dd>
      <dt>Return-Path</dt>
      <dd class="mono break">{value.returnPath ?? '—'}</dd>
      <dt>MIME-Version</dt>
      <dd class="mono">{value.mimeVersion ?? '—'}</dd>
      <dt>Received hops</dt>
      <dd class="mono">{value.received.length}</dd>
    </dl>
  </section>

  {#if value.observations.length > 0 || value.warnings.length > 0}
    <section class="block">
      <header class="block-head">
        <h3>Findings &amp; limits</h3>
        <span class="faint">observations are not verdicts</span>
      </header>
      <div class="findings">
        {#each value.warnings as warning}
          <div class="finding warn">
            <TriangleAlert size={14} strokeWidth={1.9} aria-hidden="true" />
            <span>{warning}</span>
          </div>
        {/each}
        {#each value.observations as observation}
          <div class="finding note">
            <Info size={14} strokeWidth={1.9} aria-hidden="true" />
            <span>{observation}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section class="block">
    <header class="block-head">
      <h3>Bodies</h3>
      <span class="faint">HTML is never rendered</span>
    </header>
    {#if textBody}
      <div class="body-label">text/plain · {textBody.length} chars</div>
      <pre class="body mono">{textBody}</pre>
    {:else}
      <div class="body-empty">No text/plain body.</div>
    {/if}
    {#if htmlBody}
      <details class="html-source">
        <summary>HTML source ({htmlBody.length} chars, not rendered)</summary>
        <pre class="body mono">{htmlBody}</pre>
      </details>
    {/if}
  </section>

  <section class="block">
    <header class="block-head">
      <h3>URLs</h3>
      <span class="faint">{value.urls.length} extracted · not clickable by design</span>
    </header>
    {#if value.urls.length === 0}
      <div class="body-empty">No URLs found in the bodies.</div>
    {:else}
      <ul class="url-list">
        {#each value.urls as url}
          <li>
            <span class="mono url">{url}</span>
            <button
              type="button"
              class="btn btn-ghost btn-icon btn-sm"
              aria-label="Copy URL"
              title="Copy URL"
              onclick={() => copy(url, 'URL')}
            >
              <Copy size={12} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="block">
    <header class="block-head">
      <h3>Attachments</h3>
      <span class="faint">{value.attachments.length} found</span>
    </header>
    {#if value.attachments.length === 0}
      <div class="body-empty">No attachments or non-text MIME parts.</div>
    {:else}
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Content type</th>
              <th>Size</th>
              <th>SHA-256</th>
              <th>Magic bytes</th>
            </tr>
          </thead>
          <tbody>
            {#each value.attachments as attachment (attachment.path)}
              <tr>
                <td>
                  <span class="att-name">
                    <Paperclip size={12} strokeWidth={1.8} aria-hidden="true" />
                    {attachment.filename ?? '(unnamed)'}
                  </span>
                  {#if !attachment.declaredAttachment}
                    <span class="badge badge-muted">inferred</span>
                  {/if}
                </td>
                <td class="mono xsmall">{attachment.contentType}</td>
                <td class="mono xsmall nowrap">{formatBytes(attachment.sizeBytes)}</td>
                <td class="mono xsmall break">
                  {#if attachment.sha256}
                    <button
                      type="button"
                      class="hash-copy"
                      title="Copy SHA-256"
                      onclick={() => copy(attachment.sha256 ?? '', 'SHA-256')}
                    >
                      {attachment.sha256}
                    </button>
                  {:else}
                    <span class="faint">not hashed</span>
                  {/if}
                </td>
                <td class="mono xsmall break">{attachment.magicHex || '—'}</td>
              </tr>
              {#if attachment.textPreview}
                <tr class="preview-row">
                  <td colspan="5">
                    <pre class="preview mono">{attachment.textPreview}</pre>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="block">
    <header class="block-head">
      <h3>MIME parts</h3>
      <span class="faint">{value.parts.length} summarized</span>
    </header>
    <div class="table-scroll">
      <table class="table">
        <thead>
          <tr>
            <th>Path</th>
            <th>Type</th>
            <th>Charset</th>
            <th>Transfer</th>
            <th>Size</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {#each value.parts as part (part.path)}
            <tr>
              <td class="mono xsmall">{part.path}</td>
              <td class="mono xsmall">{part.contentType}</td>
              <td class="mono xsmall">{part.charset ?? '—'}</td>
              <td class="mono xsmall">{part.transferEncoding}</td>
              <td class="mono xsmall nowrap">{formatBytes(part.sizeBytes)}</td>
              <td class="xsmall">
                {#if part.isAttachment}
                  <span class="badge badge-warning">attachment</span>
                {:else}
                  <span class="badge">body</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section class="block">
    <header class="block-head">
      <h3>Authentication headers</h3>
      <span class="faint">{value.authenticationHeaders.length} found</span>
    </header>
    {#if value.authenticationHeaders.length === 0}
      <div class="body-empty">
        No Authentication-Results, Received-SPF, DKIM-Signature, or ARC results. Absence is not evidence of spoofing.
      </div>
    {:else}
      <div class="table-scroll">
        <table class="table">
          <tbody>
            {#each value.authenticationHeaders as header}
              <tr>
                <td class="mono xsmall auth-name">{header.name}</td>
                <td class="mono xsmall break">{header.value}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="block">
    <details class="headers">
      <summary>
        <span>All headers</span>
        <span class="faint mono">{value.headers.length}</span>
        <ExternalLink size={12} aria-hidden="true" />
      </summary>
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Header</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {#each value.headers as header}
              <tr>
                <td class="mono xsmall auth-name">{header.name}</td>
                <td class="mono xsmall break">{header.value}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </details>
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
    text-align: right;
  }

  .kv {
    display: grid;
    grid-template-columns: 130px minmax(0, 1fr);
    margin: 0;
    padding: 8px 11px;
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
    word-break: break-word;
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

  .body-label {
    padding: 6px 11px 0;
    color: var(--muted-2);
    font-family: var(--font-mono);
    font-size: 9.5px;
  }

  .body {
    max-height: 240px;
    overflow: auto;
    padding: 8px 11px 11px;
    color: var(--text);
    font-size: 11.5px;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
  }

  .body-empty {
    padding: 10px 11px;
    color: var(--muted-2);
    font-size: 11.5px;
  }

  .html-source {
    border-top: 1px solid var(--border-soft);
  }

  .html-source summary {
    padding: 7px 11px;
    color: var(--muted);
    font-size: 10.5px;
    cursor: pointer;
  }

  .url-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .url-list li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 11px;
    border-bottom: 1px solid var(--border-soft);
  }

  .url-list li:last-child {
    border-bottom: 0;
  }

  .url {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 10.5px;
    color: var(--text);
    overflow-wrap: anywhere;
    user-select: text;
  }

  .table-scroll {
    overflow-x: auto;
  }

  .att-name {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text-strong);
    font-size: 11.5px;
    overflow-wrap: anywhere;
  }

  .hash-copy {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 9.5px;
    text-align: left;
    overflow-wrap: anywhere;
  }

  .hash-copy:hover {
    color: var(--accent);
  }

  .preview-row td {
    background: var(--bg-elevated);
    padding: 4px 11px;
  }

  .preview {
    max-height: 90px;
    overflow: auto;
    color: var(--muted);
    font-size: 10px;
    white-space: pre-wrap;
  }

  .auth-name {
    width: 150px;
    color: var(--muted);
    white-space: nowrap;
  }

  .headers summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 31px;
    padding: 0 11px;
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    cursor: pointer;
    list-style: none;
  }

  .headers summary::-webkit-details-marker {
    display: none;
  }

  .headers summary:hover {
    background: var(--surface-2);
  }

  @media (max-width: 620px) {
    .kv {
      grid-template-columns: 92px minmax(0, 1fr);
    }
  }
</style>
