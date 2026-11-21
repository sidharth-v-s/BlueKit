<script lang="ts">
  import FileText from 'lucide-svelte/icons/file-text';
  import Upload from 'lucide-svelte/icons/upload';
  import X from 'lucide-svelte/icons/x';
  import { formatBytes } from '@/core/runtime/errors';

  let {
    accept = [],
    file = null,
    disabled = false,
    onselect,
  }: {
    accept?: string[];
    file?: File | null;
    disabled?: boolean;
    onselect: (file: File | null) => void;
  } = $props();

  let dragging = $state(false);
  let input: HTMLInputElement;

  function handleInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    onselect(target.files?.[0] ?? null);
    target.value = '';
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    if (disabled) return;
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) onselect(dropped);
  }

  function browse() {
    if (!disabled) input?.click();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      browse();
    }
  }
</script>

<input
  bind:this={input}
  class="sr-only"
  type="file"
  accept={accept.join(',')}
  onchange={handleInput}
  {disabled}
/>

<div
  class="drop"
  class:dragging
  class:has-file={Boolean(file)}
  class:disabled
  role="button"
  tabindex={disabled ? -1 : 0}
  aria-label={file ? `Selected file ${file.name}. Activate to replace.` : 'Drop a file or browse'}
  onclick={browse}
  onkeydown={onKeydown}
  ondragover={(event) => {
    event.preventDefault();
    if (!disabled) dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
>
  {#if file}
    <span class="file-icon"><FileText size={18} strokeWidth={1.75} /></span>
    <span class="file-main">
      <span class="file-name mono">{file.name}</span>
      <span class="file-meta">{formatBytes(file.size)} · processed locally, never uploaded</span>
    </span>
    <button
      type="button"
      class="btn btn-ghost btn-icon btn-sm"
      aria-label="Remove selected file"
      onclick={(event) => {
        event.stopPropagation();
        onselect(null);
      }}
    >
      <X size={14} />
    </button>
  {:else}
    <span class="file-icon"><Upload size={18} strokeWidth={1.75} /></span>
    <span class="file-main">
      <span class="file-name">Drop file or click to browse</span>
      <span class="file-meta">
        {#if accept.length > 0}
          {accept.join(', ')} ·
        {/if}
        never uploaded
      </span>
    </span>
  {/if}
</div>

<style>
  .drop {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 66px;
    padding: 10px 12px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    background: var(--bg-elevated);
    color: var(--muted);
    cursor: pointer;
    transition: border-color 120ms ease, background 120ms ease;
  }

  .drop:hover,
  .drop:focus-visible {
    border-color: var(--accent-line);
    background: var(--surface-2);
  }

  .drop.dragging {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .drop.has-file {
    border-style: solid;
  }

  .drop.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface-1);
    color: var(--muted);
  }

  .file-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .file-name {
    color: var(--text);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-meta {
    color: var(--muted-2);
    font-size: 10.5px;
  }
</style>
