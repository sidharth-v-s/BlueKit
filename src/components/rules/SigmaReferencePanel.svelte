<script lang="ts">
  import { onMount } from 'svelte';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import Braces from 'lucide-svelte/icons/braces';
  import Check from 'lucide-svelte/icons/check';
  import Copy from 'lucide-svelte/icons/copy';
  import Database from 'lucide-svelte/icons/database';
  import ListFilter from 'lucide-svelte/icons/list-filter';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import Search from 'lucide-svelte/icons/search';
  import X from 'lucide-svelte/icons/x';
  import type {
    SigmaFieldRef,
    SigmaLogSourceRef,
    SigmaModifierRef,
    SigmaReferenceDataset,
  } from '@/core/rules/sigma-reference';

  let {
    rule,
    onapply,
    onclose,
  }: {
    rule: string;
    onapply: (text: string) => void;
    onclose: () => void;
  } = $props();

  type ReferenceModule = typeof import('@/core/rules/sigma-reference');
  type SigmaEditModule = typeof import('@/core/rules/sigma-edit');

  let referenceModule: Promise<ReferenceModule> | null = null;
  let editModule: Promise<SigmaEditModule> | null = null;
  let reference = $state<ReferenceModule | null>(null);
  let edit = $state<SigmaEditModule | null>(null);

  type Tab = 'logsources' | 'fields' | 'modifiers';

  let tab = $state<Tab>('logsources');
  let dataset = $state<SigmaReferenceDataset | null>(null);
  let activeLogSource = $state<SigmaLogSourceRef>({
    product: '',
    category: '',
    service: '',
    description: '',
  });
  let fieldContext = $state<SigmaLogSourceRef | null>(null);

  let products = $state<string[]>([]);
  let categories = $state<string[]>([]);
  let services = $state<string[]>([]);
  let fieldCategories = $state<string[]>([]);

  let logQuery = $state('');
  let logProduct = $state('');
  let logCategory = $state('');
  let logService = $state('');
  let logSources = $state<SigmaLogSourceRef[]>([]);

  let fieldQuery = $state('');
  let fieldCategory = $state('');
  let fields = $state<SigmaFieldRef[]>([]);

  let modifierQuery = $state('');
  let modifierMode = $state<'all' | 'local' | 'author'>('all');
  let modifiers = $state<SigmaModifierRef[]>([]);

  let loadedSnapshot = $state<string | null>(null);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let busy = $state(false);

  const stale = $derived(loadedSnapshot !== null && rule !== loadedSnapshot);
  const activeSummary = $derived(
    reference ? reference.logSourceSummary(activeLogSource) : '',
  );

  onMount(() => {
    void reload();
  });

  async function reload(): Promise<void> {
    if (busy) return;
    busy = true;
    error = null;
    notice = null;
    try {
      referenceModule ??= import('@/core/rules/sigma-reference');
      editModule ??= import('@/core/rules/sigma-edit');
      const [ref, editor] = await Promise.all([referenceModule, editModule]);
      reference = ref;
      edit = editor;
      dataset = ref.SIGMA_REFERENCE_DATASET;

      const draft = editor.readSigmaMetadata(rule);
      activeLogSource = {
        product: draft.logsource.product,
        category: draft.logsource.category,
        service: draft.logsource.service,
        description: draft.logsource.definition,
      };

      products = ref.logSourceProducts();
      categories = ref.logSourceCategories();
      services = ref.logSourceServices();
      fieldCategories = [
        ...new Set(dataset.fields.flatMap((field) => field.categories)),
      ].sort((left, right) => left.localeCompare(right));

      fieldContext = null;
      refreshLogSources();
      refreshFields();
      refreshModifiers();
      loadedSnapshot = rule;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      dataset = null;
      logSources = [];
      fields = [];
      modifiers = [];
      loadedSnapshot = null;
    } finally {
      busy = false;
    }
  }

  function refreshLogSources(): void {
    if (!reference) return;
    logSources = reference.searchLogSources(logQuery, {
      product: logProduct,
      category: logCategory,
      service: logService,
      limit: 100,
    });
  }

  function refreshFields(): void {
    if (!reference) return;
    fields = reference.searchFields(fieldQuery, {
      logSource: fieldContext ?? undefined,
      category: fieldContext ? undefined : fieldCategory,
      limit: 100,
    });
  }

  function refreshModifiers(): void {
    if (!reference) return;
    modifiers = reference.searchModifiers(modifierQuery, {
      localTestOnly: modifierMode === 'all' ? undefined : modifierMode === 'local',
      limit: 100,
    });
  }

  function showFieldsFor(entry: SigmaLogSourceRef): void {
    fieldContext = entry;
    fieldCategory = '';
    fieldQuery = '';
    refreshFields();
    tab = 'fields';
    notice = null;
  }

  function clearFieldContext(): void {
    fieldContext = null;
    refreshFields();
  }

  function useActiveLogSource(): void {
    if (!reference || reference.logSourceIsEmpty(activeLogSource)) {
      notice = 'The rule has no logsource to use as a field context.';
      return;
    }
    showFieldsFor(activeLogSource);
  }

  async function applyLogSource(entry: SigmaLogSourceRef): Promise<void> {
    if (busy || stale || !edit) return;
    busy = true;
    error = null;
    notice = null;
    try {
      const result = edit.updateSigmaMetadata(rule, {
        logsource: {
          product: entry.product,
          category: entry.category,
          service: entry.service,
        },
      });
      if (!result.changed) {
        activeLogSource = entry;
        fieldContext = entry;
        refreshFields();
        notice = 'The logsource already matches the editor.';
        loadedSnapshot = rule;
        return;
      }
      onapply(result.text);
      loadedSnapshot = result.text;
      activeLogSource = entry;
      fieldContext = entry;
      refreshFields();
      notice = `Wrote ${reference?.logSourceSummary(entry) ?? 'the logsource'}. The Fields tab now follows it.`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      busy = false;
    }
  }

  async function copyText(text: string, label: string): Promise<void> {
    error = null;
    notice = null;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is not available.');
      await navigator.clipboard.writeText(text);
      notice = `Copied ${label}.`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
  }

  function fieldScope(field: SigmaFieldRef): string {
    const parts: string[] = [];
    for (const category of field.categories) parts.push(`category: ${category}`);
    for (const product of field.products) parts.push(`product: ${product}`);
    for (const service of field.services) parts.push(`service: ${service}`);
    return parts.join(' · ');
  }

  function localTest(name: string): boolean {
    return reference?.isLocalTestModifier(name) ?? false;
  }

  function setLogProduct(value: string): void {
    logProduct = value;
    refreshLogSources();
  }

  function setLogCategory(value: string): void {
    logCategory = value;
    refreshLogSources();
  }

  function setLogService(value: string): void {
    logService = value;
    refreshLogSources();
  }
</script>

<section class="panel reference-panel">
  <div class="panel-head">
    <span class="panel-title">
      <BookOpen size={13} strokeWidth={1.9} aria-hidden="true" /> Sigma reference
    </span>
    <span class="faint head-note">
      Vendored Sigma {dataset?.specVersion ?? ''} taxonomy. Reference only; unknown values are not
      errors.
    </span>
    <button type="button" class="btn btn-ghost btn-sm close" title="Close Sigma reference" onclick={onclose}>
      <X size={12} strokeWidth={1.9} aria-hidden="true" /> Close
    </button>
  </div>

  <div class="reference-body">
    {#if error}
      <div class="inline-error">{error}</div>
    {/if}

    {#if stale}
      <div class="stale">
        <span>The editor changed after this reference was loaded. Reload before applying a logsource, so the panel does not overwrite newer edits.</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => void reload()} disabled={busy}>
          <RotateCcw size={12} strokeWidth={1.9} aria-hidden="true" /> Reload
        </button>
      </div>
    {/if}

    {#if dataset}
      <div class="tab-row" role="tablist" aria-label="Sigma reference sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'logsources'}
          class:active={tab === 'logsources'}
          onclick={() => (tab = 'logsources')}
        >
          <Database size={12} strokeWidth={1.9} aria-hidden="true" /> Log sources
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'fields'}
          class:active={tab === 'fields'}
          onclick={() => (tab = 'fields')}
        >
          <ListFilter size={12} strokeWidth={1.9} aria-hidden="true" /> Fields
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'modifiers'}
          class:active={tab === 'modifiers'}
          onclick={() => (tab = 'modifiers')}
        >
          <Braces size={12} strokeWidth={1.9} aria-hidden="true" /> Modifiers
        </button>
      </div>

      {#if activeSummary}
        <div class="current-row">
          <span class="row-label">In the rule</span>
          <span class="mono current">{activeSummary}</span>
          <button type="button" class="mini" onclick={useActiveLogSource}>
            <ListFilter size={11} strokeWidth={2} aria-hidden="true" /> Fields
          </button>
        </div>
      {:else}
        <div class="current-row">
          <span class="row-label">In the rule</span>
          <span class="faint">No logsource keys.</span>
        </div>
      {/if}

      {#if tab === 'logsources'}
        <div class="filter-row">
          <label class="search">
            <Search size={13} strokeWidth={1.9} aria-hidden="true" />
            <input
              type="search"
              value={logQuery}
              placeholder="Search category, product, service, or description"
              aria-label="Search Sigma logsources"
              spellcheck="false"
              autocomplete="off"
              oninput={(event) => {
                logQuery = event.currentTarget.value;
                refreshLogSources();
              }}
            />
          </label>
          <select value={logProduct} aria-label="Filter by product" onchange={(event) => setLogProduct(event.currentTarget.value)}>
            <option value="">All products</option>
            {#each products as product (product)}
              <option value={product}>{product}</option>
            {/each}
          </select>
          <select value={logCategory} aria-label="Filter by category" onchange={(event) => setLogCategory(event.currentTarget.value)}>
            <option value="">All categories</option>
            {#each categories as category (category)}
              <option value={category}>{category}</option>
            {/each}
          </select>
          <select value={logService} aria-label="Filter by service" onchange={(event) => setLogService(event.currentTarget.value)}>
            <option value="">All services</option>
            {#each services as service (service)}
              <option value={service}>{service}</option>
            {/each}
          </select>
        </div>

        <div class="results" aria-live="polite">
          {#each logSources as entry (`${entry.product}|${entry.category}|${entry.service}`)}
            <div class="result logsource">
              <div class="result-main">
                <span class="mono result-title">{reference?.logSourceSummary(entry)}</span>
                {#if entry.description}
                  <span class="result-desc faint">{entry.description}</span>
                {/if}
              </div>
              <button
                type="button"
                class="mini"
                title={`Show fields for ${reference?.logSourceSummary(entry)}`}
                onclick={() => showFieldsFor(entry)}
              >
                <ListFilter size={11} strokeWidth={2} aria-hidden="true" /> Fields
              </button>
              <button
                type="button"
                class="mini use"
                disabled={busy || stale}
                title={`Write ${reference?.logSourceSummary(entry)} to the rule`}
                onclick={() => void applyLogSource(entry)}
              >
                <Check size={11} strokeWidth={2} aria-hidden="true" /> Use
              </button>
            </div>
          {/each}
          {#if logSources.length === 0}
            <div class="empty compact">
              <Search size={18} strokeWidth={1.4} aria-hidden="true" />
              <span>No logsources match.</span>
              <span class="faint">Try a category such as process_creation or clear the filters.</span>
            </div>
          {/if}
        </div>
      {:else if tab === 'fields'}
        <div class="filter-row">
          <label class="search">
            <Search size={13} strokeWidth={1.9} aria-hidden="true" />
            <input
              type="search"
              value={fieldQuery}
              placeholder="Search field name, description, or example"
              aria-label="Search Sigma fields"
              spellcheck="false"
              autocomplete="off"
              oninput={(event) => {
                fieldQuery = event.currentTarget.value;
                refreshFields();
              }}
            />
          </label>
          <select
            value={fieldCategory}
            aria-label="Filter fields by category"
            disabled={fieldContext !== null}
            onchange={(event) => {
              fieldCategory = event.currentTarget.value;
              refreshFields();
            }}
          >
            <option value="">All field categories</option>
            {#each fieldCategories as category (category)}
              <option value={category}>{category}</option>
            {/each}
          </select>
          <button type="button" class="btn btn-ghost btn-sm" onclick={useActiveLogSource}>
            Use rule logsource
          </button>
          {#if fieldContext}
            <button type="button" class="btn btn-ghost btn-sm" onclick={clearFieldContext}>
              Clear context
            </button>
          {/if}
        </div>

        {#if fieldContext}
          <div class="context">
            Fields listed for <span class="mono">{reference?.logSourceSummary(fieldContext)}</span>. The
            taxonomy may not list fields for every logsource.
          </div>
        {/if}

        <div class="results" aria-live="polite">
          {#each fields as field (`${field.name}|${fieldScope(field)}`)}
            <div class="result field">
              <div class="result-main">
                <div class="field-head">
                  <span class="mono result-title">{field.name}</span>
                  <span class="faint scope">{fieldScope(field)}</span>
                </div>
                {#if field.description}
                  <span class="result-desc">{field.description}</span>
                {:else if field.example}
                  <span class="result-desc faint mono">{field.example}</span>
                {/if}
              </div>
              <button
                type="button"
                class="mini"
                title={`Copy ${field.name}`}
                onclick={() => void copyText(field.name, field.name)}
              >
                <Copy size={11} strokeWidth={2} aria-hidden="true" /> Copy
              </button>
            </div>
          {/each}
          {#if fields.length === 0}
            <div class="empty compact">
              <ListFilter size={18} strokeWidth={1.4} aria-hidden="true" />
              <span>No fields listed.</span>
              <span class="faint">The vendored taxonomy has no field list for this context. Check the source documentation.</span>
            </div>
          {/if}
        </div>
      {:else}
        <div class="filter-row">
          <label class="search">
            <Search size={13} strokeWidth={1.9} aria-hidden="true" />
            <input
              type="search"
              value={modifierQuery}
              placeholder="Search modifier name, group, or description"
              aria-label="Search Sigma modifiers"
              spellcheck="false"
              autocomplete="off"
              oninput={(event) => {
                modifierQuery = event.currentTarget.value;
                refreshModifiers();
              }}
            />
          </label>
          <div class="segmented" role="group" aria-label="Filter modifiers by local-test support">
            <button
              type="button"
              class:active={modifierMode === 'all'}
              aria-pressed={modifierMode === 'all'}
              onclick={() => {
                modifierMode = 'all';
                refreshModifiers();
              }}
            >
              All
            </button>
            <button
              type="button"
              class:active={modifierMode === 'local'}
              aria-pressed={modifierMode === 'local'}
              onclick={() => {
                modifierMode = 'local';
                refreshModifiers();
              }}
            >
              Local test
            </button>
            <button
              type="button"
              class:active={modifierMode === 'author'}
              aria-pressed={modifierMode === 'author'}
              onclick={() => {
                modifierMode = 'author';
                refreshModifiers();
              }}
            >
              Author only
            </button>
          </div>
        </div>

        <div class="results" aria-live="polite">
          {#each modifiers as modifier (modifier.name)}
            <div class="result modifier">
              <div class="result-main">
                <div class="field-head">
                  <span class="mono result-title">|{modifier.name}</span>
                  <span class="faint scope">{modifier.group}</span>
                  {#if localTest(modifier.name)}
                    <span class="badge badge-success">local test</span>
                  {:else}
                    <span class="badge badge-muted">author only</span>
                  {/if}
                </div>
                {#if modifier.description}
                  <span class="result-desc">{modifier.description}</span>
                {/if}
              </div>
              <button
                type="button"
                class="mini"
                title={`Copy |${modifier.name}`}
                onclick={() => void copyText(`|${modifier.name}`, `|${modifier.name}`)}
              >
                <Copy size={11} strokeWidth={2} aria-hidden="true" /> Copy
              </button>
            </div>
          {/each}
          {#if modifiers.length === 0}
            <div class="empty compact">
              <Search size={18} strokeWidth={1.4} aria-hidden="true" />
              <span>No modifiers match.</span>
              <span class="faint">Clear the search or switch the support filter.</span>
            </div>
          {/if}
        </div>
      {/if}

      <div class="actions">
        <button type="button" class="btn btn-ghost" onclick={() => void reload()} disabled={busy}>
          <RotateCcw size={13} strokeWidth={1.8} aria-hidden="true" /> Reload from editor
        </button>
        {#if notice}
          <span class="notice">{notice}</span>
        {:else}
          <span class="faint hint">Use writes only logsource keys. Copy puts a name on the clipboard.</span>
        {/if}
      </div>

      <footer class="dataset-note">
        <span>Sigma specification {dataset.specVersion}</span>
        <span>released {dataset.released}</span>
        <span class="mono">{dataset.logSources.length} logsources · {dataset.fields.length} fields · {dataset.modifiers.length} modifiers</span>
        <span class="mono" title={`${dataset.sourceSha256}\n${dataset.modifiersSha256}`}>
          SHA-256 {dataset.sourceSha256.slice(0, 16)}…
        </span>
      </footer>
    {:else if !error}
      <div class="empty compact">
        <BookOpen size={19} strokeWidth={1.4} aria-hidden="true" />
        <span>Loading the Sigma reference…</span>
      </div>
    {/if}
  </div>
</section>

<style>
  .reference-panel {
    margin-bottom: 14px;
  }

  .head-note {
    flex: 1;
    min-width: 0;
    font-size: 10px;
  }

  .close {
    flex: 0 0 auto;
  }

  .reference-body {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 12px;
  }

  .inline-error {
    border: 1px solid rgba(224, 108, 108, 0.34);
    border-radius: var(--radius-sm);
    background: var(--danger-soft);
    color: #f0a3a3;
    padding: 7px 9px;
    font-size: 11.5px;
  }

  .stale {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 9px;
    border: 1px solid rgba(216, 166, 87, 0.34);
    border-radius: var(--radius-sm);
    background: var(--warning-soft);
    color: var(--warning);
    font-size: 11px;
  }

  .stale span {
    flex: 1;
  }

  .tab-row {
    display: flex;
    align-items: center;
    gap: 4px;
    border-bottom: 1px solid var(--border-soft);
  }

  .tab-row button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--muted);
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  .tab-row button:hover {
    color: var(--text);
  }

  .tab-row button.active {
    border-bottom-color: var(--accent);
    color: var(--text);
  }

  .current-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .row-label {
    flex: 0 0 64px;
    color: var(--muted-2);
    font-size: 9.5px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .current {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--accent);
    font-size: 11px;
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 220px;
    height: 27px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--muted-2);
  }

  .search:focus-within {
    border-color: var(--accent-line);
  }

  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text);
    font-family: inherit;
    font-size: 11.5px;
  }

  .filter-row select {
    height: 27px;
    max-width: 180px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: 0;
    background: var(--surface-2);
    color: var(--text);
    font-family: inherit;
    font-size: 11px;
  }

  .segmented {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .segmented button {
    height: 27px;
    padding: 0 9px;
    border: 0;
    background: var(--surface-2);
    color: var(--muted);
    font-family: inherit;
    font-size: 10.5px;
    cursor: pointer;
  }

  .segmented button + button {
    border-left: 1px solid var(--border);
  }

  .segmented button.active {
    background: var(--accent-soft);
    color: var(--text);
  }

  .context {
    color: var(--muted-2);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .results {
    display: flex;
    flex-direction: column;
    max-height: 280px;
    overflow-y: auto;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface-2);
  }

  .result {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 5px 8px;
    border-bottom: 1px solid var(--border-soft);
    font-size: 11px;
  }

  .result:last-child {
    border-bottom: 0;
  }

  .result-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .field-head {
    display: flex;
    align-items: baseline;
    gap: 7px;
    min-width: 0;
  }

  .result-title {
    flex: 0 0 auto;
    color: var(--text);
    font-size: 10.5px;
  }

  .scope {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 9.5px;
  }

  .result-desc {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 10.5px;
  }

  .result-desc.faint {
    color: var(--muted-2);
  }

  .mini {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex: 0 0 auto;
    height: 21px;
    padding: 0 6px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    background: var(--surface-1);
    color: var(--muted);
    font-size: 10px;
    cursor: pointer;
  }

  .mini:hover:not(:disabled) {
    border-color: var(--accent-line);
    color: var(--text);
  }

  .mini.use {
    border-color: rgba(86, 185, 141, 0.3);
    color: var(--success);
  }

  .mini:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .notice {
    color: var(--success);
    font-size: 10.5px;
  }

  .hint {
    font-size: 10px;
  }

  .dataset-note {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    color: var(--muted-2);
    font-size: 9.5px;
  }

  @media (max-width: 760px) {
    .filter-row select {
      max-width: none;
      flex: 1 1 120px;
    }

    .result.logsource {
      flex-wrap: wrap;
    }
  }
</style>
