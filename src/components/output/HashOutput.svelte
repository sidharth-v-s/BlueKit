<script lang="ts">
  import Check from 'lucide-svelte/icons/check';
  import Copy from 'lucide-svelte/icons/copy';
  import FileText from 'lucide-svelte/icons/file-text';
  import OutputToolbar from './OutputToolbar.svelte';
  import { ui } from '@/app/ui.svelte';
  import { copyText } from '@/core/app/clipboard';
  import { formatBytes } from '@/core/runtime/errors';
  import { HASH_ALGORITHMS, type HashToolOutput } from '@/tools/encoding/hash';

  let { value }: { value: HashToolOutput } = $props();

  let copied = $state<string | null>(null);

  const rows = $derived(
    HASH_ALGORITHMS.map((algorithm) => ({ algorithm, digest: value.hashes[algorithm] ?? '' })),
  );

  const plain = $derived(
    rows.map((row) => `${row.algorithm.padEnd(8)} ${row.digest}`).join('\n') +
      `\n\nsource: ${value.source}${value.name ? ` (${value.name})` : ''}\nsize: ${value.sizeBytes} bytes\n`,
  );

  const stamp = $derived(value.name ? value.name.replace(/[^\w.-]+/gu, '_') : 'text');

  async function copy(algorithm: string, digest: string): Promise<void> {
    const ok = await copyText(digest);
    if (ok) {
      copied = algorithm;
      window.setTimeout(() => {
        if (copied === algorithm) copied = null;
      }, 1400);
    }
    ui.toast(ok ? `${algorithm} digest copied.` : 'Clipboard is unavailable.', ok ? 'success' : 'danger');
  }
</script>

<OutputToolbar text={plain} filename={`${stamp}.hashes.txt`} note="SHA family · WebCrypto" />

<div class="summary">
  <span class="source">
    <FileText size={13} strokeWidth={1.8} aria-hidden="true" />
    {#if value.source === 'file'}
      <span class="mono name">{value.name ?? 'file'}</span>
    {:else}
      Text input
    {/if}
  </span>
  <span class="size mono">{formatBytes(value.sizeBytes)}</span>
</div>

<table class="table hash-table">
  <thead>
    <tr>
      <th>Algorithm</th>
      <th>Digest</th>
      <th class="action-col"><span class="sr-only">Copy</span></th>
    </tr>
  </thead>
  <tbody>
    {#each rows as row (row.algorithm)}
      <tr>
        <td class="algo mono">{row.algorithm}</td>
        <td class="digest mono">{row.digest}</td>
        <td class="action-col">
          <button
            type="button"
            class="btn btn-ghost btn-icon btn-sm"
            aria-label={`Copy ${row.algorithm} digest`}
            title={`Copy ${row.algorithm}`}
            onclick={() => copy(row.algorithm, row.digest)}
          >
            {#if copied === row.algorithm}
              <Check size={13} />
            {:else}
              <Copy size={13} />
            {/if}
          </button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 11px;
    border-bottom: 1px solid var(--border-soft);
    background: var(--surface-1);
    color: var(--muted);
    font-size: 11px;
  }

  .source {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
  }

  .size {
    flex: 0 0 auto;
    color: var(--muted-2);
    font-size: 10px;
  }

  .hash-table {
    table-layout: fixed;
  }

  .hash-table .algo {
    width: 72px;
    color: var(--muted);
    font-size: 10.5px;
    white-space: nowrap;
  }

  .hash-table .digest {
    overflow-wrap: anywhere;
    font-size: 11px;
    color: var(--text);
    user-select: text;
  }

  .action-col {
    width: 36px;
    text-align: right;
  }
</style>
