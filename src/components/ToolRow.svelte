<script lang="ts">
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import Star from 'lucide-svelte/icons/star';
  import CategoryIcon from './CategoryIcon.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import type { RegistryEntry } from '@/core/registry';
  import { session } from '@/core/app/session.svelte';
  import { router } from '@/app/router.svelte';
  import { CATEGORY_MAP } from '@/core/schemas/types';

  let { entry }: { entry: RegistryEntry } = $props();
  const manifest = $derived(entry.manifest);
  const favorite = $derived(session.isFavorite(manifest.id));

  function open() {
    session.recordOpen(manifest.id);
    router.tool(manifest.id);
  }
</script>

<button class="tool-row" type="button" onclick={open} aria-label="Open {manifest.name}">
  <span class="cat-icon"><CategoryIcon category={manifest.category} size={16} /></span>

  <span class="main">
    <span class="line">
      <span class="name">{manifest.name}</span>
      {#if favorite}
        <Star size={11} strokeWidth={2} class="star" aria-label="Favorite" />
      {/if}
      <span class="cat faint">{CATEGORY_MAP[manifest.category]?.shortLabel}</span>
    </span>
    <span class="desc">{manifest.description}</span>
    {#if manifest.tags.length > 0}
      <span class="tags">
        {#each manifest.tags.slice(0, 5) as tag}
          <span class="tag">{tag}</span>
        {/each}
      </span>
    {/if}
  </span>

  <span class="meta">
    <StatusBadge status={manifest.status} phase={manifest.phase} />
    <span class="runtime mono">{manifest.runtime}</span>
    <ChevronRight size={14} strokeWidth={1.75} class="chev" aria-hidden="true" />
  </span>
</button>

<style>
  .tool-row {
    display: flex;
    width: 100%;
    gap: 11px;
    padding: 9px 11px;
    border: 0;
    border-bottom: 1px solid var(--border-soft);
    background: transparent;
    color: inherit;
    text-align: left;
    transition: background 100ms ease;
  }

  .tool-row:hover {
    background: var(--surface-2);
  }

  .tool-row:hover :global(.chev) {
    color: var(--accent);
  }

  .cat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    margin-top: 1px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--muted);
  }

  .main {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .name {
    color: var(--text-strong);
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .line :global(.star) {
    color: var(--warning);
    flex: 0 0 auto;
  }

  .cat {
    font-size: 10.5px;
    white-space: nowrap;
    flex: 0 0 auto;
  }

  .desc {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.4;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 1px;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    align-self: center;
  }

  .runtime {
    color: var(--muted-2);
    font-size: 10.5px;
  }

  .meta :global(.chev) {
    color: var(--muted-2);
    transition: color 100ms ease;
  }

  @media (max-width: 720px) {
    .runtime {
      display: none;
    }

    .cat {
      display: none;
    }
  }
</style>
