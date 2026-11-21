<script lang="ts">
  import Copy from 'lucide-svelte/icons/copy';
  import Download from 'lucide-svelte/icons/download';
  import Info from 'lucide-svelte/icons/info';
  import Paperclip from 'lucide-svelte/icons/paperclip';
  import ShieldAlert from 'lucide-svelte/icons/shield-alert';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import OutputToolbar from './OutputToolbar.svelte';
  import { ui } from '@/app/ui.svelte';
  import { copyText } from '@/core/app/clipboard';
  import { downloadBlob } from '@/core/export-import/download';
  import { formatBytes } from '@/core/runtime/errors';
  import type { AttachmentReport, EmailAttachmentRecord } from '@/tools/email/attachment-extractor';

  let { value }: { value: AttachmentReport } = $props();

  const reportJson = $derived(
    JSON.stringify(
      {
        ...value,
        attachments: value.attachments.map((attachment) => ({
          ...attachment,
          dataBase64: attachment.dataIncluded ? '(included; use the download button)' : null,
        })),
      },
      null,
      2,
    ),
  );

  function base64ToBytes(input: string): Uint8Array {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function copy(text: string, label: string): Promise<void> {
    const ok = await copyText(text);
    ui.toast(ok ? `${label} copied.` : 'Clipboard is unavailable.', ok ? 'success' : 'danger');
  }

  function download(attachment: EmailAttachmentRecord): void {
    if (!attachment.dataBase64) {
      ui.toast(attachment.dataOmittedReason ?? 'Attachment data was not included.', 'warning');
      return;
    }
    const bytes = base64ToBytes(attachment.dataBase64);
    downloadBlob(
      attachment.downloadName,
      new Blob([bytes.buffer as ArrayBuffer], { type: attachment.contentType || 'application/octet-stream' }),
    );
    ui.toast(`Downloaded ${attachment.downloadName}. Review before opening.`, 'info');
  }

  function flagClass(flag: string): string {
    if (flag.includes('executable') || flag.includes('active-html') || flag.includes('double-extension')) return 'danger';
    if (flag.includes('risky') || flag.includes('macro') || flag.includes('mismatch') || flag.includes('decode')) return 'warning';
    return 'muted';
  }

  function detectedLabel(attachment: EmailAttachmentRecord): string {
    if (!attachment.detected) return 'Not identified';
    return `${attachment.detected.label} · ${attachment.detected.confidence}`;
  }
</script>

<OutputToolbar
  text={reportJson}
  filename="email-attachments.json"
  mime="application/json;charset=utf-8"
  note="bluekit.email-attachments.v1 · attachment bytes excluded from JSON export"
/>

<div class="content">
  <section class="block">
    <header class="block-head">
      <h3>Extraction summary</h3>
      <span class="mono faint">{formatBytes(value.byteLength)} message</span>
    </header>
    <dl class="kv">
      <dt>Attachments</dt>
      <dd class="strong">{value.attachments.length}</dd>
      <dt>Decoded size</dt>
      <dd class="mono">{formatBytes(value.totalBytes)}</dd>
      <dt>Download data</dt>
      <dd class="mono">
        {value.includeData ? `${formatBytes(value.includedBytes)} included` : 'disabled for this run'}
      </dd>
    </dl>
  </section>

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
      <h3>Attachments</h3>
      <span class="faint">declared and detected types shown separately</span>
    </header>
    {#if value.attachments.length === 0}
      <div class="body-empty">No attachments or non-text MIME parts were found.</div>
    {:else}
      <div class="att-list">
        {#each value.attachments as attachment (attachment.path)}
          <article class="att">
            <header class="att-head">
              <span class="att-name">
                <Paperclip size={13} strokeWidth={1.8} aria-hidden="true" />
                {attachment.filename ?? '(unnamed)'}
              </span>
              <span class="mono xsmall faint">{formatBytes(attachment.sizeBytes)}</span>
              <span class="grow"></span>
              <button
                type="button"
                class="btn btn-sm"
                disabled={!attachment.dataBase64}
                title={attachment.dataOmittedReason ?? 'Download this attachment'}
                onclick={() => download(attachment)}
              >
                <Download size={12} aria-hidden="true" /> Download
              </button>
            </header>

            <dl class="kv att-kv">
              <dt>Declared</dt>
              <dd class="mono xsmall">{attachment.contentType}</dd>
              <dt>Detected</dt>
              <dd class="mono xsmall">{detectedLabel(attachment)}</dd>
              {#if attachment.detected}
                <dt>Evidence</dt>
                <dd class="xsmall faint">{attachment.detected.evidence}</dd>
              {/if}
              <dt>Transfer</dt>
              <dd class="mono xsmall">{attachment.transferEncoding}</dd>
              {#if attachment.disposition}
                <dt>Disposition</dt>
                <dd class="mono xsmall">{attachment.disposition}</dd>
              {/if}
              {#if attachment.contentId}
                <dt>Content-ID</dt>
                <dd class="mono xsmall break">{attachment.contentId}</dd>
              {/if}
              <dt>SHA-1</dt>
              <dd class="mono xsmall break">
                {#if attachment.sha1}
                  <button type="button" class="hash-copy" title="Copy SHA-1" onclick={() => copy(attachment.sha1 ?? '', 'SHA-1')}>
                    {attachment.sha1}
                  </button>
                {:else}
                  <span class="faint">not calculated</span>
                {/if}
              </dd>
              <dt>SHA-256</dt>
              <dd class="mono xsmall break">
                {#if attachment.sha256}
                  <button type="button" class="hash-copy" title="Copy SHA-256" onclick={() => copy(attachment.sha256 ?? '', 'SHA-256')}>
                    {attachment.sha256}
                  </button>
                {:else}
                  <span class="faint">not calculated</span>
                {/if}
              </dd>
              <dt>Magic bytes</dt>
              <dd class="mono xsmall break">{attachment.magicHex || '—'}</dd>
            </dl>

            {#if attachment.riskFlags.length > 0}
              <div class="flags">
                <ShieldAlert size={13} strokeWidth={1.9} aria-hidden="true" />
                {#each attachment.riskFlags as flag}
                  <span class="flag {flagClass(flag)}">{flag}</span>
                {/each}
              </div>
            {/if}

            {#if attachment.dataOmittedReason}
              <div class="omitted">{attachment.dataOmittedReason}</div>
            {/if}
            {#if attachment.textPreview}
              <pre class="preview mono">{attachment.textPreview}</pre>
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

  .body-empty {
    padding: 10px 11px;
    color: var(--muted-2);
    font-size: 11.5px;
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

  .att-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px 12px;
  }

  .att {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    padding: 9px 10px;
  }

  .att-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .att-name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    font-size: 12.5px;
    color: var(--text);
    overflow-wrap: anywhere;
  }

  .att-kv {
    margin-top: 7px;
    grid-template-columns: 92px minmax(0, 1fr);
    row-gap: 3px;
  }

  .flags {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    margin-top: 7px;
    color: var(--muted);
  }

  .flag {
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 5px;
    font-family: var(--font-mono);
    font-size: 9.5px;
  }

  .flag.danger {
    border-color: var(--danger);
    color: var(--danger);
  }

  .flag.warning {
    border-color: var(--warning);
    color: var(--warning);
  }

  .flag.muted {
    color: var(--muted-2);
  }

  .omitted {
    margin-top: 7px;
    color: var(--warning);
    font-size: 11px;
  }

  .preview {
    margin-top: 7px;
    max-height: 160px;
    overflow: auto;
    padding: 7px 8px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--surface-1);
    color: var(--muted);
    font-size: 10.5px;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
