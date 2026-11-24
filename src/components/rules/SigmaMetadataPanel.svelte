<script lang="ts">
  import { onMount } from 'svelte';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import X from 'lucide-svelte/icons/x';
  import type {
    SigmaEditResult,
    SigmaMetadataDraft,
    SigmaMetadataPatch,
  } from '@/core/rules/sigma-edit';

  let {
    rule,
    onapply,
    onclose,
  }: {
    rule: string;
    onapply: (text: string) => void;
    onclose: () => void;
  } = $props();

  type SigmaEditModule = typeof import('@/core/rules/sigma-edit');

  let editModule: Promise<SigmaEditModule> | null = null;

  function loadEditor(): Promise<SigmaEditModule> {
    editModule ??= import('@/core/rules/sigma-edit');
    return editModule;
  }

  function blankLogsource() {
    return { product: '', category: '', service: '', definition: '' };
  }

  function blankDraft(): SigmaMetadataDraft {
    return {
      title: '',
      id: '',
      status: '',
      description: '',
      author: '',
      date: '',
      modified: '',
      level: '',
      references: [],
      falsepositives: [],
      tags: [],
      logsource: blankLogsource(),
    };
  }

  let draft = $state<SigmaMetadataDraft>(blankDraft());
  let referencesText = $state('');
  let falsePositivesText = $state('');
  let tagsText = $state('');
  let statusOptions = $state<string[]>([]);
  let levelOptions = $state<string[]>([]);
  let loadedSnapshot = $state<string | null>(null);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let busy = $state(false);

  const stale = $derived(loadedSnapshot !== null && rule !== loadedSnapshot);

  onMount(() => {
    void reload();
  });

  async function reload(): Promise<void> {
    if (busy) return;
    busy = true;
    error = null;
    notice = null;
    try {
      const { readSigmaMetadata, SIGMA_STATUS_VALUES, SIGMA_LEVEL_VALUES } = await loadEditor();
      const next = readSigmaMetadata(rule);
      draft = next;
      statusOptions = [...SIGMA_STATUS_VALUES];
      levelOptions = [...SIGMA_LEVEL_VALUES];
      referencesText = next.references.join('\n');
      falsePositivesText = next.falsepositives.join('\n');
      tagsText = next.tags.join('\n');
      loadedSnapshot = rule;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      draft = blankDraft();
      referencesText = '';
      falsePositivesText = '';
      tagsText = '';
      loadedSnapshot = null;
    } finally {
      busy = false;
    }
  }

  async function apply(): Promise<void> {
    if (busy || stale) return;
    busy = true;
    error = null;
    notice = null;
    try {
      const { updateSigmaMetadata, metadataListFromText } = await loadEditor();
      const patch: SigmaMetadataPatch = {
        title: draft.title,
        id: draft.id,
        status: draft.status,
        description: draft.description,
        author: draft.author,
        date: draft.date,
        modified: draft.modified,
        level: draft.level,
        references: metadataListFromText(referencesText),
        falsepositives: metadataListFromText(falsePositivesText),
        tags: metadataListFromText(tagsText),
        logsource: { ...draft.logsource },
      };
      const result: SigmaEditResult = updateSigmaMetadata(rule, patch);
      if (!result.changed) {
        notice = 'No metadata changes to apply.';
        loadedSnapshot = rule;
        return;
      }
      onapply(result.text);
      loadedSnapshot = result.text;
      notice = 'Metadata written to the editor. Detection and comments were preserved.';
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      busy = false;
    }
  }
</script>

<section class="panel metadata-panel">
  <div class="panel-head">
    <span class="panel-title">Metadata editor</span>
    <span class="faint head-note">
      Writes the fields below onto the current YAML. Detection, unknown keys, key order, and comments
      stay in place.
    </span>
    <button type="button" class="btn btn-ghost btn-sm close" title="Close metadata editor" onclick={onclose}>
      <X size={12} strokeWidth={1.9} aria-hidden="true" /> Close
    </button>
  </div>

  <div class="metadata-body">
    {#if error}
      <div class="inline-error">{error}</div>
    {/if}

    {#if stale}
      <div class="stale">
        <span>The editor changed after this form was loaded. Reload before applying, so form values do not overwrite newer edits.</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => void reload()} disabled={busy}>
          <RotateCcw size={12} strokeWidth={1.9} aria-hidden="true" /> Reload
        </button>
      </div>
    {/if}

    <div class="field-grid">
      <label class="field span-2">
        <span>Title</span>
        <input type="text" bind:value={draft.title} spellcheck="false" autocomplete="off" />
      </label>
      <label class="field span-2">
        <span>ID</span>
        <input class="mono" type="text" bind:value={draft.id} spellcheck="false" autocomplete="off" />
      </label>

      <label class="field">
        <span>Status</span>
        <select bind:value={draft.status}>
          <option value="">—</option>
          {#each statusOptions as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Level</span>
        <select bind:value={draft.level}>
          <option value="">—</option>
          {#each levelOptions as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Author</span>
        <input type="text" bind:value={draft.author} spellcheck="false" autocomplete="off" />
      </label>
      <label class="field">
        <span>Date</span>
        <input class="mono" type="text" bind:value={draft.date} placeholder="YYYY-MM-DD" spellcheck="false" autocomplete="off" />
      </label>
      <label class="field">
        <span>Modified</span>
        <input class="mono" type="text" bind:value={draft.modified} placeholder="YYYY-MM-DD" spellcheck="false" autocomplete="off" />
      </label>

      <label class="field span-3">
        <span>Description</span>
        <textarea class="description" rows="2" bind:value={draft.description} spellcheck="false"></textarea>
      </label>
    </div>

    <div class="list-grid">
      <label class="field">
        <span>References · one per line</span>
        <textarea class="mono list" rows="3" bind:value={referencesText} spellcheck="false" placeholder="https://example.test/rule"></textarea>
      </label>
      <label class="field">
        <span>False positives · one per line</span>
        <textarea class="mono list" rows="3" bind:value={falsePositivesText} spellcheck="false" placeholder="Legitimate administrative scripts"></textarea>
      </label>
      <label class="field">
        <span>Tags · one per line</span>
        <textarea class="mono list" rows="3" bind:value={tagsText} spellcheck="false" placeholder="attack.execution"></textarea>
      </label>
    </div>

    <fieldset class="logsource">
      <legend>Logsource</legend>
      <div class="field-grid logsource-grid">
        <label class="field">
          <span>Product</span>
          <input class="mono" type="text" bind:value={draft.logsource.product} spellcheck="false" autocomplete="off" />
        </label>
        <label class="field">
          <span>Category</span>
          <input class="mono" type="text" bind:value={draft.logsource.category} spellcheck="false" autocomplete="off" />
        </label>
        <label class="field">
          <span>Service</span>
          <input class="mono" type="text" bind:value={draft.logsource.service} spellcheck="false" autocomplete="off" />
        </label>
        <label class="field">
          <span>Definition</span>
          <input type="text" bind:value={draft.logsource.definition} spellcheck="false" autocomplete="off" />
        </label>
      </div>
    </fieldset>

    <div class="actions">
      <button type="button" class="btn btn-primary" onclick={() => void apply()} disabled={busy || stale || error !== null}>
        Apply to rule
      </button>
      <button type="button" class="btn btn-ghost" onclick={() => void reload()} disabled={busy}>
        <RotateCcw size={13} strokeWidth={1.8} aria-hidden="true" /> Reload from editor
      </button>
      {#if notice}
        <span class="notice">{notice}</span>
      {:else}
        <span class="faint hint">Empty fields are removed. Lists are trimmed and de-duplicated on apply.</span>
      {/if}
    </div>
  </div>
</section>

<style>
  .metadata-panel {
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

  .metadata-body {
    display: flex;
    flex-direction: column;
    gap: 11px;
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

  .field-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px 10px;
  }

  .span-2 {
    grid-column: span 2;
  }

  .span-3 {
    grid-column: span 3;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .field > span {
    color: var(--muted-2);
    font-size: 9.5px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .field input,
  .field select,
  .field textarea {
    width: 100%;
    min-width: 0;
    padding: 0 7px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: 0;
    background: var(--surface-2);
    color: var(--text);
    font-family: inherit;
    font-size: 11.5px;
  }

  .field input,
  .field select {
    height: 26px;
  }

  .field textarea {
    padding: 5px 7px;
    line-height: 1.5;
    resize: vertical;
  }

  .field input:focus,
  .field select:focus,
  .field textarea:focus {
    border-color: var(--accent-line);
  }

  .field input::placeholder,
  .field textarea::placeholder {
    color: var(--muted-2);
  }

  .list-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .logsource {
    margin: 0;
    padding: 9px 10px 10px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface-2);
  }

  .logsource legend {
    padding: 0 4px;
    color: var(--muted-2);
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .logsource-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .notice {
    color: var(--success, #7ac28a);
    font-size: 10.5px;
  }

  .hint {
    font-size: 10px;
  }

  @media (max-width: 900px) {
    .field-grid,
    .logsource-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .span-3 {
      grid-column: span 2;
    }

    .list-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
