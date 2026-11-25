<script lang="ts">
  import { onMount } from 'svelte';
  import Hammer from 'lucide-svelte/icons/hammer';
  import Plus from 'lucide-svelte/icons/plus';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import X from 'lucide-svelte/icons/x';
  import type { SigmaBuilderDraft, SigmaBuilderSelection } from '@/core/rules/sigma-builder';

  let {
    rule,
    onapply,
    onclose,
  }: {
    rule: string;
    onapply: (text: string) => void;
    onclose: () => void;
  } = $props();

  type BuilderModule = typeof import('@/core/rules/sigma-builder');

  type UiSelection = Omit<SigmaBuilderSelection, 'values'> & { valuesText: string };
  type UiDraft = Omit<
    SigmaBuilderDraft,
    'references' | 'tags' | 'falsepositives' | 'selections'
  > & {
    referencesText: string;
    tagsText: string;
    falsePositivesText: string;
    selections: UiSelection[];
  };

  type Preview =
    | { ok: true; text: string; warnings: string[] }
    | { ok: false; error: string };

  const STATUS_OPTIONS = ['stable', 'test', 'experimental', 'deprecated', 'unsupported'];
  const LEVEL_OPTIONS = ['informational', 'low', 'medium', 'high', 'critical'];
  const MODIFIER_OPTIONS = ['equals', 'contains', 'startswith', 'endswith'] as const;
  const MAX_SELECTIONS = 20;

  let builderModule: BuilderModule | null = null;
  let builderReady = $state(false);
  let loadError = $state<string | null>(null);
  let draft = $state<UiDraft>(freshDraft());
  let confirming = $state(false);
  let notice = $state<string | null>(null);

  const preview = $derived.by((): Preview | null => {
    const module = builderModule;
    if (!builderReady || module === null) return null;
    try {
      return { ok: true, ...module.buildSigmaRule(toCoreDraft(draft)) };
    } catch (caught) {
      return { ok: false, error: caught instanceof Error ? caught.message : String(caught) };
    }
  });

  onMount(() => {
    void (async () => {
      try {
        builderModule = await import('@/core/rules/sigma-builder');
        builderReady = true;
      } catch (caught) {
        loadError = caught instanceof Error ? caught.message : String(caught);
      }
    })();
  });

  function today(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function randomRuleId(): string {
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function freshDraft(): UiDraft {
    return {
      title: '',
      id: randomRuleId(),
      status: 'experimental',
      description: '',
      author: '',
      date: today(),
      logsource: {
        product: 'windows',
        category: 'process_creation',
        service: '',
        definition: '',
      },
      match: 'all',
      level: 'medium',
      referencesText: '',
      tagsText: '',
      falsePositivesText: '',
      selections: [
        {
          name: 'selection',
          field: '',
          modifier: 'equals',
          cased: false,
          match: 'any',
          negate: false,
          valuesText: '',
        },
      ],
    };
  }

  function toCoreDraft(value: UiDraft): SigmaBuilderDraft {
    const { referencesText, tagsText, falsePositivesText, selections, ...rest } = value;
    return {
      ...rest,
      references: referencesText.split('\n'),
      tags: tagsText.split('\n'),
      falsepositives: falsePositivesText.split('\n'),
      selections: selections.map(({ valuesText, ...selection }) => ({
        ...selection,
        values: valuesText.split('\n'),
      })),
    };
  }

  function nextSelectionName(): string {
    const used = new Set(draft.selections.map((selection) => selection.name.trim()));
    if (!used.has('selection')) return 'selection';
    for (let index = 2; index <= MAX_SELECTIONS + 1; index += 1) {
      const name = `selection_${index}`;
      if (!used.has(name)) return name;
    }
    return `selection_${draft.selections.length + 1}`;
  }

  function addSelection(): void {
    if (draft.selections.length >= MAX_SELECTIONS) return;
    draft.selections.push({
      name: nextSelectionName(),
      field: '',
      modifier: 'equals',
      cased: false,
      match: 'any',
      negate: false,
      valuesText: '',
    });
    confirming = false;
    notice = null;
  }

  function removeSelection(index: number): void {
    if (draft.selections.length <= 1) return;
    draft.selections.splice(index, 1);
    confirming = false;
    notice = null;
  }

  function reset(): void {
    draft = freshDraft();
    confirming = false;
    notice = null;
  }

  function markEdited(): void {
    if (confirming) confirming = false;
    if (notice !== null) notice = null;
  }

  function requestApply(): void {
    if (!preview?.ok) return;
    if (rule.trim().length > 0) {
      confirming = true;
      notice = null;
      return;
    }
    commit();
  }

  function commit(): void {
    if (!preview?.ok) return;
    onapply(preview.text);
    confirming = false;
    notice = 'Rule written to the editor. Validate and test it before use.';
  }

  const hasEditorContent = $derived(rule.trim().length > 0);
</script>

<section class="panel builder-panel">
  <div class="panel-head">
    <span class="panel-title">
      <Hammer size={13} strokeWidth={1.9} aria-hidden="true" /> Visual rule builder
    </span>
    <span class="faint head-note">
      Builds a new rule from common patterns. The output is normal Sigma YAML and still needs
      validation and local testing.
    </span>
    <button type="button" class="btn btn-ghost btn-sm close" title="Close visual builder" onclick={onclose}>
      <X size={12} strokeWidth={1.9} aria-hidden="true" /> Close
    </button>
  </div>

  <div class="builder-body" oninput={markEdited} onchange={markEdited}>
    {#if loadError}
      <div class="inline-error">Could not load the builder: {loadError}</div>
    {/if}

    <div class="field-grid">
      <label class="field span-2">
        <span>Title</span>
        <input type="text" bind:value={draft.title} maxlength="256" spellcheck="false" autocomplete="off" />
      </label>
      <label class="field span-2">
        <span>Rule ID</span>
        <input class="mono" type="text" bind:value={draft.id} spellcheck="false" autocomplete="off" />
      </label>

      <label class="field">
        <span>Status</span>
        <select bind:value={draft.status}>
          {#each STATUS_OPTIONS as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Level</span>
        <select bind:value={draft.level}>
          {#each LEVEL_OPTIONS as option (option)}
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

      <label class="field span-4">
        <span>Description</span>
        <textarea class="description" rows="2" bind:value={draft.description} maxlength="65535" spellcheck="false"></textarea>
      </label>
    </div>

    <div class="list-grid">
      <label class="field">
        <span>References · one per line</span>
        <textarea class="mono list" rows="2" bind:value={draft.referencesText} spellcheck="false" placeholder="https://example.test/rule"></textarea>
      </label>
      <label class="field">
        <span>False positives · one per line</span>
        <textarea class="mono list" rows="2" bind:value={draft.falsePositivesText} spellcheck="false" placeholder="Legitimate administrative scripts"></textarea>
      </label>
      <label class="field">
        <span>Tags · one per line</span>
        <textarea class="mono list" rows="2" bind:value={draft.tagsText} spellcheck="false" placeholder="attack.execution"></textarea>
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

    <div class="detection-head">
      <span class="section-title">Selections</span>
      <span class="faint detection-note">
        One field per selection. Values keep leading and trailing spaces; blank lines are dropped.
      </span>
      <div class="join-toggle" role="group" aria-label="Join positive selections with">
        <span class="field-label">Positives</span>
        <div class="segmented">
          <button
            type="button"
            class:active={draft.match === 'all'}
            aria-pressed={draft.match === 'all'}
            onclick={() => (draft.match = 'all')}
          >
            ALL
          </button>
          <button
            type="button"
            class:active={draft.match === 'any'}
            aria-pressed={draft.match === 'any'}
            onclick={() => (draft.match = 'any')}
          >
            ANY
          </button>
        </div>
      </div>
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        onclick={addSelection}
        disabled={draft.selections.length >= MAX_SELECTIONS}
        title={draft.selections.length >= MAX_SELECTIONS ? `At most ${MAX_SELECTIONS} selections` : 'Add a selection'}
      >
        <Plus size={12} strokeWidth={1.9} aria-hidden="true" /> Add selection
      </button>
    </div>

    <div class="selection-list">
      {#each draft.selections as selection, index (index)}
        <div class="selection-card">
          <div class="selection-grid">
            <label class="field">
              <span>Name</span>
              <input class="mono" type="text" bind:value={selection.name} spellcheck="false" autocomplete="off" />
            </label>
            <label class="field">
              <span>Field</span>
              <input class="mono" type="text" bind:value={selection.field} spellcheck="false" autocomplete="off" placeholder="CommandLine" />
            </label>
            <label class="field">
              <span>Modifier</span>
              <select bind:value={selection.modifier}>
                {#each MODIFIER_OPTIONS as option (option)}
                  <option value={option}>{option}</option>
                {/each}
              </select>
            </label>
            <div class="field">
              <span>Multi-value</span>
              <div class="segmented" role="group" aria-label={`Join values in ${selection.name}`}>
                <button
                  type="button"
                  class:active={selection.match === 'any'}
                  aria-pressed={selection.match === 'any'}
                  onclick={() => (selection.match = 'any')}
                >
                  ANY
                </button>
                <button
                  type="button"
                  class:active={selection.match === 'all'}
                  aria-pressed={selection.match === 'all'}
                  onclick={() => (selection.match = 'all')}
                >
                  ALL
                </button>
              </div>
            </div>
            <label class="check">
              <input type="checkbox" bind:checked={selection.cased} /> Cased
            </label>
            <label class="check">
              <input type="checkbox" bind:checked={selection.negate} /> Exclude
            </label>
            <button
              type="button"
              class="btn btn-ghost btn-sm remove"
              onclick={() => removeSelection(index)}
              disabled={draft.selections.length <= 1}
              title={draft.selections.length <= 1 ? 'Keep at least one selection' : `Remove ${selection.name}`}
            >
              <Trash2 size={12} strokeWidth={1.9} aria-hidden="true" /> Remove
            </button>
          </div>

          <label class="field">
            <span>Values · one per line</span>
            <textarea
              class="mono values"
              rows="2"
              bind:value={selection.valuesText}
              spellcheck="false"
              placeholder="\powershell.exe"
            ></textarea>
          </label>
        </div>
      {/each}
    </div>

    <p class="condition-note">
      Positive selections join with <span class="mono">{draft.match === 'all' ? 'and' : 'or'}</span>.
      Excluded selections are appended as <span class="mono">and not …</span>; two or more excluded
      selections are grouped under one negation.
    </p>

    <div class="preview">
      <div class="preview-head">
        <span class="section-title">Preview</span>
        <span class="faint">Generated YAML, refreshed as you edit.</span>
      </div>
      {#if !builderReady && !loadError}
        <div class="faint preview-empty">Loading the builder…</div>
      {:else if preview && !preview.ok}
        <div class="inline-error">{preview.error}</div>
      {:else if preview && preview.ok}
        <pre class="yaml-preview">{preview.text}</pre>
        <div class="checks">
          <span class="row-label">Checks</span>
          {#if preview.warnings.length > 0}
            {#each preview.warnings as warning (warning)}
              <span class="warning">{warning}</span>
            {/each}
          {:else}
            <span class="success">No builder warnings. Validation and local testing still apply.</span>
          {/if}
        </div>
      {/if}
    </div>

    {#if confirming}
      <div class="confirm" role="alert">
        <span>
          The editor already has content. Writing the builder output replaces the entire rule,
          including any edits made since this panel opened.
        </span>
        <div class="confirm-actions">
          <button type="button" class="btn btn-danger btn-sm" onclick={commit}>
            Replace editor
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => (confirming = false)}>
            Cancel
          </button>
        </div>
      </div>
    {/if}

    <div class="actions">
      <button type="button" class="btn btn-primary" onclick={requestApply} disabled={!preview?.ok}>
        {hasEditorContent ? 'Replace editor…' : 'Write to editor'}
      </button>
      <button type="button" class="btn btn-ghost" onclick={reset}>
        <RotateCcw size={13} strokeWidth={1.8} aria-hidden="true" /> Reset form
      </button>
      {#if notice}
        <span class="notice">{notice}</span>
      {:else}
        <span class="faint hint">
          The builder starts a new rule; it does not read the current editor into the form.
        </span>
      {/if}
    </div>
  </div>
</section>

<style>
  .builder-panel {
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

  .builder-body {
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

  .field-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px 10px;
  }

  .span-2 {
    grid-column: span 2;
  }

  .span-4 {
    grid-column: span 4;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .field > span,
  .field-label,
  .row-label,
  .section-title {
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

  .detection-head {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-wrap: wrap;
  }

  .section-title {
    color: var(--text);
    font-size: 10px;
    font-weight: 600;
  }

  .detection-note {
    flex: 1;
    min-width: 0;
    font-size: 10px;
  }

  .join-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .segmented {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .segmented button {
    height: 24px;
    padding: 0 9px;
    border: 0;
    background: var(--surface-2);
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 9.5px;
    cursor: pointer;
  }

  .segmented button + button {
    border-left: 1px solid var(--border);
  }

  .segmented button.active {
    background: var(--accent-soft);
    color: var(--text);
  }

  .selection-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .selection-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 9px 10px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface-2);
  }

  .selection-grid {
    display: grid;
    grid-template-columns: minmax(110px, 1fr) minmax(150px, 1.4fr) 120px auto auto auto auto;
    align-items: end;
    gap: 8px 10px;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 5px;
    min-height: 26px;
    color: var(--muted);
    font-size: 10.5px;
    white-space: nowrap;
  }

  .check input {
    margin: 0;
    accent-color: var(--accent);
  }

  .remove {
    white-space: nowrap;
  }

  .values {
    min-height: 46px;
  }

  .condition-note {
    margin: 0;
    color: var(--muted-2);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .preview {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 9px 10px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface-2);
  }

  .preview-head {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }

  .preview-head .faint {
    font-size: 10px;
  }

  .preview-empty {
    font-size: 10.5px;
  }

  .yaml-preview {
    max-height: 260px;
    margin: 0;
    padding: 8px 9px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-1, rgba(0, 0, 0, 0.18));
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 10.5px;
    line-height: 1.5;
    white-space: pre;
  }

  .checks {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px 12px;
  }

  .checks .row-label {
    flex: 0 0 64px;
  }

  .warning {
    color: var(--warning);
    font-size: 10.5px;
  }

  .success {
    color: var(--success);
    font-size: 10.5px;
  }

  .confirm {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 8px 10px;
    border: 1px solid rgba(216, 166, 87, 0.34);
    border-radius: var(--radius-sm);
    background: var(--warning-soft);
    color: var(--warning);
    font-size: 11px;
  }

  .confirm > span {
    flex: 1;
    min-width: 220px;
  }

  .confirm-actions {
    display: flex;
    gap: 6px;
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

  @media (max-width: 980px) {
    .field-grid,
    .logsource-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .span-4 {
      grid-column: span 2;
    }

    .list-grid {
      grid-template-columns: 1fr;
    }

    .selection-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
    .field-grid,
    .logsource-grid,
    .selection-grid {
      grid-template-columns: 1fr;
    }

    .span-2,
    .span-4 {
      grid-column: span 1;
    }
  }
</style>
