<script lang="ts">
  import Filter from 'lucide-svelte/icons/filter';
  import Search from 'lucide-svelte/icons/search';
  import X from 'lucide-svelte/icons/x';
  import ToolRow from '@/components/ToolRow.svelte';
  import { router } from '@/app/router.svelte';
  import { session } from '@/core/app/session.svelte';
  import { registry, type RegistryEntry } from '@/core/registry';
  import { CATEGORIES, CATEGORY_MAP, isCategoryId, type ToolStatus } from '@/core/schemas/types';

  type StatusFilter = 'all' | ToolStatus;

  let query = $state('');
  let statusFilter = $state<StatusFilter>('all');

  const categoryFilter = $derived(
    router.route.name === 'tools' && router.route.category && isCategoryId(router.route.category)
      ? router.route.category
      : null,
  );

  const categoryMeta = $derived(categoryFilter ? CATEGORY_MAP[categoryFilter] : null);

  const entries = $derived.by((): RegistryEntry[] => {
    let pool: RegistryEntry[];
    if (query.trim()) {
      pool = registry.search(query, 200);
    } else {
      pool = categoryFilter ? registry.forCategory(categoryFilter) : [...registry.entries];
    }

    if (categoryFilter && query.trim()) {
      pool = pool.filter((entry) => entry.manifest.category === categoryFilter);
    }
    if (statusFilter !== 'all') {
      pool = pool.filter((entry) => entry.manifest.status === statusFilter);
    }
    if (!session.settings.showPlannedTools) {
      pool = pool.filter((entry) => entry.manifest.status !== 'planned');
    }

    const weight: Record<ToolStatus, number> = { available: 0, prototype: 1, planned: 2 };
    return [...pool].sort(
      (a, b) =>
        weight[a.manifest.status] - weight[b.manifest.status] ||
        a.manifest.name.localeCompare(b.manifest.name),
    );
  });

  const totalInScope = $derived(
    (categoryFilter ? registry.forCategory(categoryFilter) : registry.entries).filter(
      (entry) => session.settings.showPlannedTools || entry.manifest.status !== 'planned',
    ).length,
  );

  function setCategory(id: string | null): void {
    router.navigate(id ? `/tools/${id}` : '/tools');
  }
</script>

<div class="page tools-view">
  <header class="page-head">
    <div>
      <div class="eyebrow">Tool catalog</div>
      <h1>{categoryMeta?.label ?? 'All Tools'}</h1>
      <p class="lede">
        {categoryMeta?.description ??
          'Every tool declares its runtime, capabilities, network posture, and data handling. Planned entries are catalog metadata, not shipped functionality.'}
      </p>
    </div>
    <div class="header-count">
      <span class="mono">{entries.length}</span>
      <span>shown of {totalInScope}</span>
    </div>
  </header>

  <div class="filters">
    <div class="search-box">
      <Search size={14} strokeWidth={2} aria-hidden="true" />
      <input
        class="search-input"
        type="search"
        placeholder="Filter by name, tag, description…"
        aria-label="Filter tools"
        bind:value={query}
      />
      {#if query}
        <button type="button" class="clear" aria-label="Clear search" onclick={() => (query = '')}>
          <X size={13} />
        </button>
      {/if}
    </div>

    <label class="status-filter">
      <Filter size={13} strokeWidth={1.9} aria-hidden="true" />
      <span class="sr-only">Filter by status</span>
      <select class="select" bind:value={statusFilter}>
        <option value="all">All statuses</option>
        <option value="available">Available</option>
        <option value="prototype">Prototype</option>
        <option value="planned">Planned</option>
      </select>
    </label>
  </div>

  <div class="chips" aria-label="Categories">
    <button
      type="button"
      class="chip"
      class:active={categoryFilter === null}
      onclick={() => setCategory(null)}
    >
      All
      <span class="chip-count mono">{registry.entries.length}</span>
    </button>
    {#each CATEGORIES as category (category.id)}
      <button
        type="button"
        class="chip"
        class:active={categoryFilter === category.id}
        title={category.description}
        onclick={() => setCategory(category.id)}
      >
        {category.shortLabel}
        <span class="chip-count mono">{registry.forCategory(category.id).length}</span>
      </button>
    {/each}
  </div>

  {#if !session.settings.showPlannedTools}
    <div class="notice">
      Planned entries are hidden. <button type="button" class="link" onclick={() => router.navigate('/settings')}>Change in settings</button>
    </div>
  {/if}

  <section class="panel list-panel">
    <div class="panel-body flush">
      {#if entries.length === 0}
        <div class="empty">
          <span>No tools match this filter.</span>
          <span class="faint">Clear the search or choose a different category.</span>
        </div>
      {:else}
        {#each entries as entry (entry.manifest.id)}
          <ToolRow {entry} />
        {/each}
      {/if}
    </div>
  </section>
</div>

<style>
  .tools-view {
    max-width: 1080px;
  }

  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 15px;
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
    max-width: 680px;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.6;
  }

  .header-count {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex: 0 0 auto;
    padding-top: 8px;
    color: var(--muted-2);
    font-size: 10px;
    white-space: nowrap;
  }

  .header-count .mono {
    color: var(--text-strong);
    font-size: 19px;
  }

  .filters {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 9px;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
    height: 31px;
    padding: 0 8px 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-elevated);
    color: var(--muted);
  }

  .search-box:focus-within {
    border-color: var(--accent-line);
    box-shadow: 0 0 0 2px rgba(76, 154, 255, 0.12);
  }

  .search-input {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font-size: 12.5px;
    outline: none;
  }

  .search-input::placeholder {
    color: var(--muted-2);
  }

  .clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 3px;
    background: var(--surface-2);
    color: var(--muted);
  }

  .status-filter {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    color: var(--muted-2);
  }

  .status-filter .select {
    width: 132px;
    height: 31px;
    font-size: 11.5px;
  }

  .chips {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 23px;
    padding: 0 7px;
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    background: transparent;
    color: var(--muted);
    font-size: 10.5px;
    white-space: nowrap;
  }

  .chip:hover {
    border-color: var(--border);
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

  .notice {
    margin-bottom: 10px;
    padding: 6px 9px;
    border: 1px solid rgba(216, 166, 87, 0.25);
    border-radius: var(--radius);
    background: var(--warning-soft);
    color: #e5c28a;
    font-size: 11px;
  }

  .link {
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  @media (max-width: 720px) {
    .page-head {
      flex-direction: column;
      gap: 4px;
    }

    .header-count {
      padding-top: 0;
    }

    .filters {
      flex-wrap: wrap;
    }

    .search-box {
      flex-basis: 100%;
    }
  }
</style>
