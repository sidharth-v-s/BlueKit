<script lang="ts">
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import OutputToolbar from './OutputToolbar.svelte';

  interface ReportIssue {
    message: string;
    line?: number;
    column?: number;
  }

  let {
    valid,
    text,
    errors = [],
    error,
    filename,
    language,
    mime = 'text/plain;charset=utf-8',
  }: {
    valid: boolean;
    text?: string;
    errors?: ReportIssue[];
    error?: ReportIssue;
    filename: string;
    language: string;
    mime?: string;
  } = $props();

  const issues = $derived(error ? [error, ...errors] : errors);
</script>

{#if valid && text}
  <OutputToolbar {text} {filename} {mime} note={`${language} · formatted`} />
  <pre class="doc-output mono">{text}</pre>
{:else}
  <div class="doc-errors">
    <div class="doc-error-head">
      <CircleAlert size={14} strokeWidth={1.9} aria-hidden="true" />
      <span>{language} is not well-formed</span>
    </div>
    {#each issues as issue, index (index)}
      <div class="doc-error-row">
        <span class="mono pos">
          {issue.line !== undefined ? `${issue.line}:${issue.column ?? 1}` : '—'}
        </span>
        <span>{issue.message}</span>
      </div>
    {:else}
      <div class="doc-error-row"><span class="mono pos">—</span><span>No detailed error was returned.</span></div>
    {/each}
  </div>
{/if}

<style>
  .doc-output {
    max-height: 520px;
    overflow: auto;
    padding: 11px 12px;
    color: var(--text);
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
  }

  .doc-errors {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    color: var(--danger);
    font-size: 12px;
  }

  .doc-error-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    margin-bottom: 2px;
  }

  .doc-error-row {
    display: flex;
    gap: 9px;
    color: var(--text);
    line-height: 1.5;
  }

  .pos {
    color: var(--muted-2);
    min-width: 42px;
    text-align: right;
  }
</style>
