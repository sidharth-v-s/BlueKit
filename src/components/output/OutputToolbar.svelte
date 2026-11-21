<script lang="ts">
  import Copy from 'lucide-svelte/icons/copy';
  import Download from 'lucide-svelte/icons/download';
  import { ui } from '@/app/ui.svelte';
  import { copyText } from '@/core/app/clipboard';
  import { downloadText } from '@/core/export-import/download';

  let {
    text,
    filename,
    mime = 'text/plain;charset=utf-8',
    note,
  }: {
    text: string;
    filename: string;
    mime?: string;
    note?: string;
  } = $props();

  const chars = $derived(text.length);
  const lines = $derived(text.length === 0 ? 0 : text.split('\n').length);

  async function copy(): Promise<void> {
    const ok = await copyText(text);
    ui.toast(ok ? 'Copied to clipboard.' : 'Clipboard is unavailable in this context.', ok ? 'success' : 'danger');
  }

  function download(): void {
    downloadText(filename, text, mime);
    ui.toast(`Downloaded ${filename}.`, 'info');
  }
</script>

<div class="toolbar">
  <span class="stats mono">{lines} lines · {chars} chars</span>
  {#if note}<span class="note">{note}</span>{/if}
  <span class="grow"></span>
  <button type="button" class="btn btn-sm" onclick={copy}>
    <Copy size={12} strokeWidth={1.9} aria-hidden="true" />
    Copy
  </button>
  <button type="button" class="btn btn-sm" onclick={download}>
    <Download size={12} strokeWidth={1.9} aria-hidden="true" />
    Download
  </button>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--border-soft);
    background: rgba(255, 255, 255, 0.014);
  }

  .stats {
    color: var(--muted-2);
    font-size: 9.5px;
    white-space: nowrap;
  }

  .note {
    color: var(--muted-2);
    font-size: 9.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .grow {
    flex: 1 1 auto;
  }
</style>
