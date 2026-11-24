<script lang="ts">
  import { onMount } from 'svelte';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import X from 'lucide-svelte/icons/x';
  import type { SigmaConditionJoiner, SigmaConditionPreset } from '@/core/rules/sigma-edit';

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
  let helpers: SigmaEditModule | null = null;

  function loadEditor(): Promise<SigmaEditModule> {
    editModule ??= import('@/core/rules/sigma-edit');
    return editModule;
  }

  let condition = $state('');
  let selections = $state<string[]>([]);
  let presets = $state<SigmaConditionPreset[]>([]);
  let hasDetection = $state(false);
  let loadedSnapshot = $state<string | null>(null);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let busy = $state(false);
  let joiner = $state<SigmaConditionJoiner>('and');

  const stale = $derived(loadedSnapshot !== null && rule !== loadedSnapshot);
  const canApply = $derived(
    !busy && !stale && hasDetection && condition.trim().length > 0,
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
      const module = await loadEditor();
      helpers = module;
      const draft = module.readSigmaCondition(rule);
      condition = draft.condition;
      selections = draft.selections;
      presets = module.sigmaConditionPresets(draft.selections);
      hasDetection = draft.hasDetection;
      loadedSnapshot = rule;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      condition = '';
      selections = [];
      presets = [];
      hasDetection = false;
      loadedSnapshot = null;
    } finally {
      busy = false;
    }
  }

  function appendSelection(name: string): void {
    if (!helpers) return;
    condition = helpers.appendSigmaSelection(condition, name, joiner);
  }

  function applyPreset(preset: SigmaConditionPreset): void {
    condition = preset.expression;
  }

  async function apply(): Promise<void> {
    if (busy || stale || !helpers) return;
    busy = true;
    error = null;
    notice = null;
    try {
      const result = helpers.updateSigmaCondition(rule, condition);
      if (!result.changed) {
        notice = 'The condition already matches the editor.';
        loadedSnapshot = rule;
        return;
      }
      onapply(result.text);
      loadedSnapshot = result.text;
      notice = 'Condition written to the editor. Selections and comments were preserved.';
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      busy = false;
    }
  }
</script>

<section class="panel condition-panel">
  <div class="panel-head">
    <span class="panel-title">
      <GitBranch size={13} strokeWidth={1.9} aria-hidden="true" /> Condition helper
    </span>
    <span class="faint head-note">
      Builds `detection.condition` from the current selection names. The helper writes text; it does
      not evaluate or judge the condition.
    </span>
    <button type="button" class="btn btn-ghost btn-sm close" title="Close condition helper" onclick={onclose}>
      <X size={12} strokeWidth={1.9} aria-hidden="true" /> Close
    </button>
  </div>

  <div class="condition-body">
    {#if error}
      <div class="inline-error">{error}</div>
    {/if}

    {#if stale}
      <div class="stale">
        <span>The editor changed after this helper was loaded. Reload before applying, so the helper does not overwrite newer edits.</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => void reload()} disabled={busy}>
          <RotateCcw size={12} strokeWidth={1.9} aria-hidden="true" /> Reload
        </button>
      </div>
    {/if}

    {#if !hasDetection && !error}
      <div class="inline-error">
        The rule has no detection map. Add a detection block in the YAML editor, then reload.
      </div>
    {:else if hasDetection}
      <div class="condition-row">
        <label class="field grow">
          <span>Detection condition</span>
          <textarea
            class="mono"
            rows="2"
            bind:value={condition}
            spellcheck="false"
            placeholder="selection_image and not filter_system"
          ></textarea>
        </label>

        <div class="join-toggle" role="group" aria-label="Append selections with">
          <span class="field-label">Append with</span>
          <div class="segmented">
            <button
              type="button"
              class:active={joiner === 'and'}
              aria-pressed={joiner === 'and'}
              onclick={() => (joiner = 'and')}
            >
              AND
            </button>
            <button
              type="button"
              class:active={joiner === 'or'}
              aria-pressed={joiner === 'or'}
              onclick={() => (joiner = 'or')}
            >
              OR
            </button>
          </div>
        </div>
      </div>

      <div class="preset-row">
        <span class="row-label">Presets</span>
        <div class="chips">
          {#each presets as preset (preset.id)}
            <button
              type="button"
              class="chip"
              title={preset.expression}
              onclick={() => applyPreset(preset)}
            >
              {preset.label}
            </button>
          {/each}
          {#if presets.length === 0}
            <span class="faint">No selections found; type a condition.</span>
          {/if}
        </div>
      </div>

      <div class="selection-row">
        <span class="row-label">Selections</span>
        <div class="chips">
          {#each selections as selection (selection)}
            <button
              type="button"
              class="chip mono"
              title={`Append ${selection} with ${joiner.toUpperCase()}`}
              onclick={() => appendSelection(selection)}
            >
              {selection}
            </button>
          {/each}
          {#if selections.length === 0}
            <span class="faint">The detection map has no selections besides the condition.</span>
          {/if}
        </div>
      </div>

      <div class="actions">
        <button type="button" class="btn btn-primary" onclick={() => void apply()} disabled={!canApply}>
          Apply to rule
        </button>
        <button type="button" class="btn btn-ghost" onclick={() => void reload()} disabled={busy}>
          <RotateCcw size={13} strokeWidth={1.8} aria-hidden="true" /> Reload from editor
        </button>
        {#if notice}
          <span class="notice">{notice}</span>
        {:else}
          <span class="faint hint">Applying writes only `detection.condition`. Validate separately.</span>
        {/if}
      </div>

      <p class="subset-note">
        Aggregation, `near`, and time windows are valid Sigma but outside the local test subset. The
        helper preserves the text; it does not make an unsupported construct testable.
      </p>
    {/if}
  </div>
</section>

<style>
  .condition-panel {
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

  .condition-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
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

  .condition-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .field.grow {
    flex: 1;
  }

  .field > span,
  .field-label,
  .row-label {
    color: var(--muted-2);
    font-size: 9.5px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .field textarea {
    width: 100%;
    min-width: 0;
    padding: 5px 7px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: 0;
    background: var(--surface-2);
    color: var(--text);
    font-size: 11.5px;
    line-height: 1.5;
    resize: vertical;
  }

  .field textarea:focus {
    border-color: var(--accent-line);
  }

  .join-toggle {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 0 0 auto;
    padding-top: 0;
  }

  .segmented {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .segmented button {
    height: 26px;
    padding: 0 10px;
    border: 0;
    background: var(--surface-2);
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 10px;
    cursor: pointer;
  }

  .segmented button + button {
    border-left: 1px solid var(--border);
  }

  .segmented button.active {
    background: var(--accent-soft);
    color: var(--text);
  }

  .preset-row,
  .selection-row {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }

  .row-label {
    flex: 0 0 64px;
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
    border-color: var(--accent-line);
    background: var(--accent-soft);
    color: var(--text);
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

  .subset-note {
    margin: 0;
    color: var(--muted-2);
    font-size: 10.5px;
    line-height: 1.5;
  }

  @media (max-width: 760px) {
    .condition-row {
      flex-direction: column;
    }

    .join-toggle {
      width: 100%;
    }
  }
</style>
