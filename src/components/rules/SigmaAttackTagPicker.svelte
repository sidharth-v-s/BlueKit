<script lang="ts">
  import { onMount } from 'svelte';
  import Check from 'lucide-svelte/icons/check';
  import Crosshair from 'lucide-svelte/icons/crosshair';
  import Plus from 'lucide-svelte/icons/plus';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import Search from 'lucide-svelte/icons/search';
  import X from 'lucide-svelte/icons/x';
  import type {
    AttackDataset,
    AttackTactic,
    AttackTechnique,
  } from '@/core/rules/attack';

  let {
    rule,
    onapply,
    onclose,
  }: {
    rule: string;
    onapply: (text: string) => void;
    onclose: () => void;
  } = $props();

  type AttackModule = typeof import('@/core/rules/attack');
  type SigmaEditModule = typeof import('@/core/rules/sigma-edit');

  let attackModule: Promise<AttackModule> | null = null;
  let editModule: Promise<SigmaEditModule> | null = null;
  let attack: AttackModule | null = null;
  let edit: SigmaEditModule | null = null;

  async function loadModules(): Promise<void> {
    attackModule ??= import('@/core/rules/attack');
    editModule ??= import('@/core/rules/sigma-edit');
    [attack, edit] = await Promise.all([attackModule, editModule]);
  }

  const RESULT_LIMIT = 50;

  let tags = $state<string[]>([]);
  let query = $state('');
  let tacticFilter = $state('');
  let results = $state<AttackTechnique[]>([]);
  let tactics = $state<AttackTactic[]>([]);
  let dataset = $state<AttackDataset | null>(null);
  let loadedSnapshot = $state<string | null>(null);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let busy = $state(false);

  const stale = $derived(loadedSnapshot !== null && rule !== loadedSnapshot);

  onMount(() => {
    void reload();
  });

  $effect(() => {
    void query;
    void tacticFilter;
    if (attack) {
      results = attack.searchAttackTechniques(query, {
        tactic: tacticFilter,
        limit: RESULT_LIMIT,
      });
    }
  });

  async function reload(): Promise<void> {
    if (busy) return;
    busy = true;
    error = null;
    notice = null;
    try {
      await loadModules();
      if (!attack || !edit) return;
      const draft = edit.readSigmaMetadata(rule);
      tags = draft.tags;
      tactics = attack.ATTACK_DATASET.tactics;
      dataset = attack.ATTACK_DATASET;
      query = '';
      tacticFilter = '';
      results = attack.searchAttackTechniques('', { limit: RESULT_LIMIT });
      loadedSnapshot = rule;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      tags = [];
      results = [];
      tactics = [];
      dataset = null;
      loadedSnapshot = null;
    } finally {
      busy = false;
    }
  }

  function tagInfo(tag: string): string {
    if (!attack) return tag;
    return attack.attackTagName(attack.describeAttackTag(tag));
  }

  function addTag(tag: string): void {
    if (!attack) return;
    try {
      tags = attack.mergeAttackTags(tags, [tag]);
      notice = null;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
  }

  function removeTag(tag: string): void {
    if (!attack) return;
    tags = attack.removeAttackTag(tags, tag);
    error = null;
    notice = null;
  }

  function tacticTag(tactic: AttackTactic): string {
    return attack ? attack.attackTacticTag(tactic.shortName) : '';
  }

  function toggleTactic(tactic: AttackTactic): void {
    const tag = tacticTag(tactic);
    if (tags.includes(tag)) {
      removeTag(tag);
    } else {
      addTag(tag);
    }
  }

  function addTechnique(technique: AttackTechnique): void {
    if (!attack) return;
    addTag(attack.attackTechniqueTag(technique.id));
  }

  function techniqueTag(technique: AttackTechnique): string {
    return attack ? attack.attackTechniqueTag(technique.id) : '';
  }

  async function apply(): Promise<void> {
    if (busy || stale || !edit) return;
    busy = true;
    error = null;
    notice = null;
    try {
      const result = edit.updateSigmaMetadata(rule, { tags });
      if (!result.changed) {
        notice = 'The tags already match the editor.';
        loadedSnapshot = rule;
        return;
      }
      onapply(result.text);
      loadedSnapshot = result.text;
      notice = 'Tags written to the editor. Other fields and comments were preserved.';
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      busy = false;
    }
  }

  function techniqueTactics(technique: AttackTechnique): string {
    return technique.tactics.join(' · ');
  }
</script>

<section class="panel attack-panel">
  <div class="panel-head">
    <span class="panel-title">
      <Crosshair size={13} strokeWidth={1.9} aria-hidden="true" /> ATT&CK tags
    </span>
    <span class="faint head-note">
      Versioned Enterprise ATT&amp;CK snapshot loaded locally. Tags are written as
      <span class="mono">attack.*</span>; nothing is fetched at runtime.
    </span>
    <button type="button" class="btn btn-ghost btn-sm close" title="Close ATT&CK tag picker" onclick={onclose}>
      <X size={12} strokeWidth={1.9} aria-hidden="true" /> Close
    </button>
  </div>

  <div class="attack-body">
    {#if error}
      <div class="inline-error">{error}</div>
    {/if}

    {#if stale}
      <div class="stale">
        <span>The editor changed after this picker was loaded. Reload before applying, so the picker does not overwrite newer edits.</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => void reload()} disabled={busy}>
          <RotateCcw size={12} strokeWidth={1.9} aria-hidden="true" /> Reload
        </button>
      </div>
    {/if}

    {#if dataset}
      <div class="tag-row">
        <span class="row-label">Current tags</span>
        <div class="chips">
          {#each tags as tag (tag)}
            <span class="tag-chip" title={tagInfo(tag)}>
              <span class="mono">{tag}</span>
              <button
                type="button"
                class="tag-remove"
                aria-label={`Remove ${tag}`}
                title={`Remove ${tag}`}
                onclick={() => removeTag(tag)}
              >
                <X size={10} strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          {/each}
          {#if tags.length === 0}
            <span class="faint">No tags on this rule.</span>
          {/if}
        </div>
      </div>

      <div class="tag-row">
        <span class="row-label">Tactics</span>
        <div class="chips">
          {#each tactics as tactic (tactic.id)}
            <button
              type="button"
              class="chip"
              class:active={tags.includes(tacticTag(tactic))}
              aria-pressed={tags.includes(tacticTag(tactic))}
              title={`attack.${tactic.shortName} · ${tactic.id}`}
              onclick={() => toggleTactic(tactic)}
            >
              {tactic.name}
            </button>
          {/each}
        </div>
      </div>

      <div class="search-row">
        <label class="search">
          <Search size={13} strokeWidth={1.9} aria-hidden="true" />
          <input
            type="search"
            bind:value={query}
            placeholder="Search technique ID or name"
            aria-label="Search ATT&CK techniques"
            spellcheck="false"
            autocomplete="off"
          />
        </label>
        <select bind:value={tacticFilter} aria-label="Filter techniques by tactic">
          <option value="">All tactics</option>
          {#each tactics as tactic (tactic.id)}
            <option value={tactic.shortName}>{tactic.name}</option>
          {/each}
        </select>
      </div>

      <div class="results" aria-live="polite">
        {#each results as technique (technique.id)}
          {@const tag = techniqueTag(technique)}
          <div class="result">
            <span class="result-id mono">{technique.id}</span>
            <span class="result-name">{technique.name}</span>
            <span class="result-tactics faint">{techniqueTactics(technique)}</span>
            {#if technique.subtechnique}
              <span class="badge badge-muted">sub</span>
            {/if}
            <button
              type="button"
              class="mini"
              class:added={tags.includes(tag)}
              disabled={tags.includes(tag)}
              title={tags.includes(tag) ? 'Already tagged' : `Add ${tag}`}
              onclick={() => addTechnique(technique)}
            >
              {#if tags.includes(tag)}
                <Check size={11} strokeWidth={2} aria-hidden="true" /> Added
              {:else}
                <Plus size={11} strokeWidth={2} aria-hidden="true" /> Add
              {/if}
            </button>
          </div>
        {/each}
        {#if results.length === 0}
          <div class="empty compact">
            <Search size={18} strokeWidth={1.4} aria-hidden="true" />
            <span>No techniques match.</span>
            <span class="faint">Try an ID such as T1059, a name, or a tactic filter.</span>
          </div>
        {/if}
      </div>

      <div class="actions">
        <button type="button" class="btn btn-primary" onclick={() => void apply()} disabled={busy || stale}>
          Apply to rule
        </button>
        <button type="button" class="btn btn-ghost" onclick={() => void reload()} disabled={busy}>
          <RotateCcw size={13} strokeWidth={1.8} aria-hidden="true" /> Reload from editor
        </button>
        {#if notice}
          <span class="notice">{notice}</span>
        {:else}
          <span class="faint hint">Add or remove tags above, then apply. Up to 100 tags per rule.</span>
        {/if}
      </div>

      <footer class="dataset-note">
        <span>Enterprise ATT&amp;CK v{dataset.attackVersion}</span>
        <span>retrieved {dataset.retrieved}</span>
        <span class="mono">{dataset.techniques.length} techniques · {dataset.tactics.length} tactics</span>
        <span class="mono" title={dataset.sourceSha256}>
          SHA-256 {dataset.sourceSha256.slice(0, 16)}…
        </span>
      </footer>
    {:else if !error}
      <div class="empty compact">
        <Crosshair size={19} strokeWidth={1.4} aria-hidden="true" />
        <span>Loading the ATT&amp;CK snapshot…</span>
      </div>
    {/if}
  </div>
</section>

<style>
  .attack-panel {
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

  .attack-body {
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

  .tag-row {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }

  .row-label {
    flex: 0 0 74px;
    color: var(--muted-2);
    font-size: 9.5px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .chips {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .chip {
    height: 23px;
    padding: 0 8px;
    border: 1px solid var(--border-soft);
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--muted);
    font-size: 10.5px;
    cursor: pointer;
  }

  .chip:hover {
    border-color: var(--border);
    color: var(--text);
  }

  .chip.active {
    border-color: var(--accent-line);
    background: var(--accent-soft);
    color: var(--text);
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 23px;
    padding: 0 3px 0 8px;
    border: 1px solid var(--accent-line);
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--text);
    font-size: 10px;
  }

  .tag-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }

  .tag-remove:hover {
    background: var(--surface-3);
    color: var(--text);
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
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

  .search-row select {
    height: 27px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: 0;
    background: var(--surface-2);
    color: var(--text);
    font-family: inherit;
    font-size: 11px;
  }

  .results {
    display: flex;
    flex-direction: column;
    max-height: 250px;
    overflow-y: auto;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface-2);
  }

  .result {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border-soft);
    font-size: 11px;
  }

  .result:last-child {
    border-bottom: 0;
  }

  .result-id {
    flex: 0 0 66px;
    color: var(--accent);
    font-size: 10.5px;
  }

  .result-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-tactics {
    flex: 0 1 190px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 9.5px;
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

  .mini.added {
    border-color: rgba(86, 185, 141, 0.3);
    color: var(--success);
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
    .search-row {
      flex-wrap: wrap;
    }

    .result-tactics {
      display: none;
    }
  }
</style>
