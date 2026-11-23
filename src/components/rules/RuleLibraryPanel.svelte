<script lang="ts">
  import { onMount } from 'svelte';
  import Download from 'lucide-svelte/icons/download';
  import FileText from 'lucide-svelte/icons/file-text';
  import HardDrive from 'lucide-svelte/icons/hard-drive';
  import History from 'lucide-svelte/icons/history';
  import Search from 'lucide-svelte/icons/search';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Upload from 'lucide-svelte/icons/upload';
  import ConfirmDialog from '@/components/ConfirmDialog.svelte';
  import { ui } from '@/app/ui.svelte';
  import { session } from '@/core/app/session.svelte';
  import { downloadText, fileStamp } from '@/core/export-import/download';
  import { formatBytes } from '@/core/runtime/errors';
  import {
    buildRuleRecord,
    deleteRuleRecord,
    exportRuleText,
    MAX_RULE_BUNDLE_BYTES,
    metadataFromReport,
    parseRulesBundle,
    readRuleRecords,
    RuleLibraryError,
    ruleFilename,
    saveRuleRecord,
    serializeRulesBundle,
    type RuleRecord,
  } from '@/core/rules/library';
  import {
    deleteRuleRevisions,
    diffRevision,
    readRuleRevisions,
    recordRuleRevision,
    restoreRuleRevision,
    type RuleRevision,
    type RuleRevisionDiff,
  } from '@/core/rules/revisions';
  import { SIGMA_MAX_INPUT_BYTES } from '@/core/rules/sigma-meta';

  let {
    rule,
    currentRecordId,
    onload,
    onsaved,
    onnew,
    ondelete,
  }: {
    rule: string;
    currentRecordId: string | null;
    onload: (record: RuleRecord) => void;
    onsaved: (record: RuleRecord) => void;
    onnew: () => void;
    ondelete: (id: string) => void;
  } = $props();

  let records = $state<RuleRecord[]>([]);
  let query = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let importInput: HTMLInputElement | null = $state(null);
  let pendingDelete = $state<RuleRecord | null>(null);
  let historyRecord = $state<RuleRecord | null>(null);
  let historyRevisions = $state<RuleRevision[]>([]);
  let historyBusy = $state(false);
  let historyError = $state<string | null>(null);
  let historyDiff = $state<RuleRevisionDiff | null>(null);
  let pendingRestore = $state<RuleRevision | null>(null);

  const persistenceEnabled = $derived(session.persistenceEnabled);

  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return records;
    return records.filter((record) =>
      [
        record.title,
        record.sigmaId,
        record.status,
        record.level,
        record.author,
        record.tags.join(' '),
        record.attribution?.source,
      ]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  });

  onMount(() => {
    void refresh();
  });

  async function refresh(): Promise<void> {
    if (!session.adapter) {
      error = 'Local storage is not available in this session.';
      return;
    }
    try {
      records = await readRuleRecords(session.adapter);
      error = null;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
  }

  function describeError(caught: unknown): string {
    if (caught instanceof RuleLibraryError) return caught.message;
    return caught instanceof Error ? caught.message : String(caught);
  }

  async function saveCurrent(): Promise<void> {
    if (!session.adapter) {
      ui.toast('Local storage is not available.', 'warning');
      return;
    }
    if (rule.trim().length === 0) {
      ui.toast('The rule editor is empty.', 'warning');
      return;
    }

    busy = true;
    try {
      const content = rule;
      const previous = records.find((record) => record.id === currentRecordId) ?? null;
      const { validateSigmaRule } = await import('@/core/rules/sigma');
      const report = validateSigmaRule(content);
      const record = buildRuleRecord({
        content,
        metadata: metadataFromReport(report),
        previous,
      });
      await saveRuleRecord(session.adapter, record);
      // Revision history is a convenience; a snapshot failure must not make a
      // successful save look like a failed one.
      try {
        await recordRuleRevision(session.adapter, record);
      } catch {
        ui.toast('The rule was saved, but its revision snapshot could not be stored.', 'warning');
      }
      await session.refreshStorage();
      await refresh();
      if (historyRecord?.id === record.id) await openHistory(record);
      onsaved(record);
      ui.toast(
        report.valid
          ? `Saved "${record.title ?? 'Untitled rule'}" locally.`
          : 'Draft saved locally. The schema issues are still present.',
        report.valid ? 'success' : 'warning',
      );
    } catch (caught) {
      ui.toast(describeError(caught), 'danger');
    } finally {
      busy = false;
    }
  }

  function load(record: RuleRecord): void {
    onload(record);
    ui.toast(`Loaded "${record.title ?? 'Untitled rule'}".`, 'info');
  }

  function exportOne(record: RuleRecord): void {
    try {
      downloadText(ruleFilename(record), exportRuleText(record), 'application/yaml;charset=utf-8');
      ui.toast('Rule exported with attribution comments.', 'success');
    } catch (caught) {
      ui.toast(describeError(caught), 'danger');
    }
  }

  function exportAll(): void {
    if (records.length === 0) {
      ui.toast('There are no saved rules to export.', 'warning');
      return;
    }
    try {
      const text = serializeRulesBundle(records);
      downloadText(`bluekit-rules-${fileStamp()}.rules.json`, text, 'application/json;charset=utf-8');
      ui.toast(`Exported ${records.length} rule${records.length === 1 ? '' : 's'}.`, 'success');
    } catch (caught) {
      ui.toast(describeError(caught), 'danger');
    }
  }

  async function importFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!session.adapter) {
      ui.toast('Local storage is not available.', 'warning');
      return;
    }

    busy = true;
    try {
      const isBundle =
        file.name.toLowerCase().endsWith('.json') || file.type.toLowerCase().includes('json');
      let imported: RuleRecord[];

      if (isBundle) {
        if (file.size > MAX_RULE_BUNDLE_BYTES) {
          throw new RuleLibraryError(
            `Rule bundles are capped at ${MAX_RULE_BUNDLE_BYTES / 1024 / 1024} MiB.`,
          );
        }
        imported = parseRulesBundle(await file.text());
      } else {
        if (file.size > SIGMA_MAX_INPUT_BYTES) {
          throw new RuleLibraryError(`Sigma rule files are capped at ${SIGMA_MAX_INPUT_BYTES / 1024} KiB.`);
        }
        const content = await file.text();
        const { validateSigmaRule } = await import('@/core/rules/sigma');
        const report = validateSigmaRule(content);
        imported = [
          buildRuleRecord({
            content,
            metadata: metadataFromReport(report),
            source: 'imported',
            attribution: {
              source: file.name,
              license: 'Unknown',
              importedAt: new Date().toISOString(),
              note: 'Imported as a single YAML file; the file supplied no licence or source metadata.',
            },
          }),
        ];
      }

      for (const record of imported) {
        await saveRuleRecord(session.adapter, record);
        try {
          await recordRuleRevision(session.adapter, record);
        } catch {
          // Import still succeeds; the rule is visible in the library.
        }
      }
      await session.refreshStorage();
      await refresh();
      onload(imported[0] as RuleRecord);
      ui.toast(
        `Imported ${imported.length} rule${imported.length === 1 ? '' : 's'}. Review the source and licence before trusting them.`,
        'success',
      );
    } catch (caught) {
      ui.toast(describeError(caught), 'danger');
    } finally {
      busy = false;
    }
  }

  async function confirmDelete(): Promise<void> {
    const record = pendingDelete;
    pendingDelete = null;
    if (!record || !session.adapter) return;
    try {
      await deleteRuleRevisions(session.adapter, record.id);
      await deleteRuleRecord(session.adapter, record.id);
      await session.refreshStorage();
      await refresh();
      if (historyRecord?.id === record.id) closeHistory();
      ondelete(record.id);
      ui.toast(`Deleted "${record.title ?? 'Untitled rule'}".`, 'info');
    } catch (caught) {
      ui.toast(describeError(caught), 'danger');
    }
  }

  async function openHistory(record: RuleRecord): Promise<void> {
    historyRecord = record;
    historyDiff = null;
    await loadHistory(record);
  }

  async function loadHistory(record: RuleRecord | null = historyRecord): Promise<void> {
    if (!record || !session.adapter) return;
    historyBusy = true;
    historyError = null;
    try {
      historyRevisions = await readRuleRevisions(session.adapter, record.id);
    } catch (caught) {
      historyRevisions = [];
      historyError = caught instanceof Error ? caught.message : String(caught);
    } finally {
      historyBusy = false;
    }
  }

  function closeHistory(): void {
    historyRecord = null;
    historyRevisions = [];
    historyDiff = null;
    historyError = null;
  }

  function showDiff(revision: RuleRevision): void {
    if (!historyRecord) return;
    try {
      historyDiff = diffRevision(historyRecord, revision);
    } catch (caught) {
      historyDiff = null;
      ui.toast(caught instanceof Error ? caught.message : String(caught), 'danger');
    }
  }

  async function confirmRestore(): Promise<void> {
    const revision = pendingRestore;
    const current = historyRecord;
    pendingRestore = null;
    if (!revision || !current || !session.adapter) return;

    try {
      const restored = restoreRuleRevision(current, revision);
      await saveRuleRecord(session.adapter, restored);
      try {
        await recordRuleRevision(session.adapter, restored);
      } catch {
        // The restored content is saved; only its snapshot failed.
      }
      await session.refreshStorage();
      await refresh();
      onload(restored);
      await openHistory(restored);
      ui.toast(
        `Restored revision r${revision.revision} as r${restored.revision}. The old revisions are unchanged.`,
        'success',
      );
    } catch (caught) {
      ui.toast(describeError(caught), 'danger');
    }
  }

  function revisionBytes(revision: RuleRevision): string {
    return formatBytes(new TextEncoder().encode(revision.content).byteLength);
  }

  function formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
</script>

<section class="panel library-panel">
  <div class="panel-head">
    <span class="panel-title">Rule library</span>
    <div class="head-actions">
      <button type="button" class="btn btn-ghost btn-sm" onclick={onnew} disabled={busy}>
        <FileText size={12} strokeWidth={1.9} aria-hidden="true" /> New
      </button>
      <button type="button" class="btn btn-primary btn-sm" onclick={() => void saveCurrent()} disabled={busy || rule.trim().length === 0}>
        <HardDrive size={12} strokeWidth={1.9} aria-hidden="true" />
        {currentRecordId ? 'Save changes' : 'Save rule'}
      </button>
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => importInput?.click()} disabled={busy}>
        <Upload size={12} strokeWidth={1.9} aria-hidden="true" /> Import
      </button>
      <button type="button" class="btn btn-ghost btn-sm" onclick={exportAll} disabled={records.length === 0}>
        <Download size={12} strokeWidth={1.9} aria-hidden="true" /> Export all
      </button>
      <input
        class="file-input"
        type="file"
        accept=".yml,.yaml,.json,text/yaml,application/yaml,application/json,text/plain"
        bind:this={importInput}
        onchange={importFile}
        aria-label="Import Sigma rules"
      />
    </div>
  </div>

  <div class="library-body">
    <div class="library-toolbar">
      <label class="search-box">
        <Search size={13} strokeWidth={2} aria-hidden="true" />
        <span class="sr-only">Filter saved rules</span>
        <input class="search-input" type="search" placeholder="Filter saved rules…" bind:value={query} />
      </label>
      <span class="count faint">
        {filtered.length === records.length
          ? `${records.length} saved`
          : `${filtered.length} of ${records.length}`}
      </span>
      {#if !persistenceEnabled}
        <span class="badge badge-warning" title="IndexedDB is unavailable. Saved rules disappear when this tab closes.">
          session only
        </span>
      {/if}
    </div>

    {#if historyRecord}
      <div class="history">
        <div class="history-head">
          <span class="history-title">
            <History size={13} strokeWidth={1.9} aria-hidden="true" />
            History · {historyRecord.title ?? 'Untitled rule'}
          </span>
          <span class="badge badge-accent mono">current r{historyRecord.revision}</span>
          <div class="history-actions">
            <button
              type="button"
              class="mini"
              onclick={() => void loadHistory()}
              disabled={historyBusy}
            >
              Refresh
            </button>
            <button type="button" class="mini" onclick={closeHistory}>Close</button>
          </div>
        </div>

        {#if historyError}
          <div class="inline-error">{historyError}</div>
        {:else if historyBusy}
          <p class="history-note">Reading local revisions…</p>
        {:else if historyRevisions.length === 0}
          <p class="history-note">
            No saved revisions yet. Snapshots are recorded from this build onward, so saves made
            before revision history existed are not recoverable.
          </p>
        {:else}
          <div class="revision-list">
            {#each historyRevisions as revision (revision.revision)}
              <div class="revision-row" class:current={revision.revision === historyRecord.revision}>
                <span class="mono revision-number">r{revision.revision}</span>
                <span class="faint">{formatDate(revision.recordedAt)}</span>
                <span class="faint">{revisionBytes(revision)}</span>
                {#if revision.revision === historyRecord.revision}
                  <span class="badge badge-accent">current</span>
                {/if}
                <span class="revision-title">{revision.metadata.title ?? 'Untitled Sigma rule'}</span>
                <div class="revision-actions">
                  {#if revision.revision !== historyRecord.revision}
                    <button type="button" class="mini" onclick={() => showDiff(revision)}>Diff</button>
                    <button type="button" class="mini" onclick={() => (pendingRestore = revision)}>
                      Restore
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}

        {#if historyDiff}
          <div class="diff-head">
            <span class="mono">r{historyDiff.fromRevision} → r{historyDiff.toRevision}</span>
            <span class="faint">+{historyDiff.added} / −{historyDiff.removed} lines</span>
            <span class="faint">
              {historyDiff.hunks} hunk{historyDiff.hunks === 1 ? '' : 's'}
            </span>
            <button type="button" class="mini" onclick={() => (historyDiff = null)}>Hide</button>
          </div>
          <pre class="diff-output mono">{historyDiff.diff}</pre>
          {#if historyDiff.coarse}
            <p class="history-note">
              The changed region was too large for an exact line diff; it is shown as a full
              replacement.
            </p>
          {/if}
        {/if}
      </div>
    {/if}

    {#if error}
      <div class="inline-error">{error}</div>
    {:else if records.length === 0}
      <div class="empty compact">
        <HardDrive size={20} strokeWidth={1.4} aria-hidden="true" />
        <span>No saved rules yet.</span>
        <span class="faint">Save the editor contents, import a YAML file or bundle, or export an archive.</span>
      </div>
    {:else if filtered.length === 0}
      <div class="empty compact">
        <span>No saved rules match this filter.</span>
        <span class="faint">Clear the search to see the whole library.</span>
      </div>
    {:else}
      <div class="rule-list">
        {#each filtered as record (record.id)}
          <div class="rule-row" class:current={record.id === currentRecordId}>
            <div class="rule-main">
              <div class="rule-title-row">
                <span class="rule-title">{record.title ?? 'Untitled Sigma rule'}</span>
                <span
                  class="badge {record.schemaValid === true
                    ? 'badge-success'
                    : record.schemaValid === false
                      ? 'badge-danger'
                      : 'badge-muted'}"
                >
                  {record.schemaValid === true ? 'schema ok' : record.schemaValid === false ? 'schema issues' : 'unvalidated'}
                </span>
                {#if record.source === 'imported'}
                  <span class="badge badge-accent" title={record.attribution?.source}>imported</span>
                {/if}
                {#if record.revision > 1}
                  <span class="badge badge-muted mono">r{record.revision}</span>
                {/if}
              </div>
              <div class="rule-meta">
                {#if record.sigmaId}<span class="mono">{record.sigmaId}</span>{/if}
                {#if record.status}<span>{record.status}</span>{/if}
                {#if record.level}<span>{record.level}</span>{/if}
                <span class="faint">updated {formatDate(record.updatedAt)}</span>
                {#if record.attribution?.source}
                  <span class="faint" title={record.attribution.license ?? 'Licence not supplied'}>
                    source: {record.attribution.source}
                  </span>
                {/if}
              </div>
              {#if record.tags.length > 0}
                <div class="rule-tags">
                  {#each record.tags.slice(0, 6) as tag}
                    <span class="tag mono">{tag}</span>
                  {/each}
                  {#if record.tags.length > 6}
                    <span class="faint xsmall">+{record.tags.length - 6}</span>
                  {/if}
                </div>
              {/if}
            </div>
            <div class="rule-actions">
              <button type="button" class="mini" onclick={() => load(record)}>Load</button>
              <button
                type="button"
                class="mini"
                title="Show local revisions and diffs"
                onclick={() => void openHistory(record)}
              >
                History
              </button>
              <button type="button" class="mini" onclick={() => exportOne(record)}>Export</button>
              <button
                type="button"
                class="mini danger"
                title="Delete this local rule"
                onclick={() => (pendingDelete = record)}
              >
                <Trash2 size={11} aria-hidden="true" />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<ConfirmDialog
  open={pendingDelete !== null}
  title="Delete saved rule?"
  message={pendingDelete
    ? `Deleting "${pendingDelete.title ?? 'Untitled rule'}" removes the local record. Export it first if you need a copy. This cannot be undone.`
    : ''}
  confirmLabel="Delete rule"
  danger
  onconfirm={() => void confirmDelete()}
  oncancel={() => (pendingDelete = null)}
/>

<ConfirmDialog
  open={pendingRestore !== null}
  title="Restore this revision?"
  message={pendingRestore && historyRecord
    ? `Restoring r${pendingRestore.revision} saves its content as a new revision r${
        historyRecord.revision + 1
      }. The editor is replaced, including any unsaved edits. Existing revisions are kept.`
    : ''}
  confirmLabel="Restore revision"
  onconfirm={() => void confirmRestore()}
  oncancel={() => (pendingRestore = null)}
/>

<style>
  .library-panel {
    margin-bottom: 14px;
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .file-input {
    display: none;
  }

  .library-body {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 10px 12px 12px;
  }

  .library-toolbar {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--muted-2);
  }

  .search-box:focus-within {
    border-color: var(--accent-line);
  }

  .search-input {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text);
    font-size: 11.5px;
  }

  .count {
    white-space: nowrap;
    font-size: 10.5px;
  }

  .history {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 9px;
    border: 1px solid var(--accent-line);
    border-radius: var(--radius);
    background: var(--accent-soft);
  }

  .history-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .history-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 500;
  }

  .history-actions {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }

  .history-note {
    color: var(--muted-2);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .revision-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .revision-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 5px 7px;
    border-bottom: 1px solid var(--border-soft);
    background: var(--surface-2);
    font-size: 10.5px;
  }

  .revision-row:last-child {
    border-bottom: 0;
  }

  .revision-row.current {
    background: var(--surface-3);
  }

  .revision-number {
    min-width: 34px;
    color: var(--text);
  }

  .revision-title {
    flex: 1 1 160px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .revision-actions {
    display: flex;
    gap: 3px;
    margin-left: auto;
  }

  .diff-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 10.5px;
  }

  .diff-head .mini {
    margin-left: auto;
  }

  .diff-output {
    margin: 0;
    max-height: 320px;
    overflow: auto;
    padding: 8px 9px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text);
    font-size: 10.5px;
    line-height: 1.5;
    white-space: pre;
  }

  .rule-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .rule-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 9px;
    border-bottom: 1px solid var(--border-soft);
  }

  .rule-row:last-child {
    border-bottom: 0;
  }

  .rule-row:hover {
    background: rgba(255, 255, 255, 0.018);
  }

  .rule-row.current {
    background: var(--accent-soft);
  }

  .rule-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .rule-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .rule-title {
    font-size: 12.5px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .rule-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    color: var(--muted-2);
    font-size: 10px;
  }

  .rule-tags {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 1px;
  }

  .rule-actions {
    display: flex;
    align-items: center;
    gap: 3px;
    flex: 0 0 auto;
  }

  .mini {
    height: 21px;
    padding: 0 6px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--muted);
    font-size: 10px;
    cursor: pointer;
  }

  .mini:hover {
    border-color: var(--border);
    color: var(--text);
  }

  .mini.danger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 23px;
    padding: 0;
  }

  .mini.danger:hover {
    border-color: rgba(224, 108, 108, 0.34);
    color: #f0a3a3;
  }

  .tag {
    padding: 1px 5px;
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    background: var(--surface-2);
    color: var(--muted);
    font-size: 9.5px;
  }

  .inline-error {
    border: 1px solid rgba(224, 108, 108, 0.34);
    border-radius: var(--radius-sm);
    background: var(--danger-soft);
    color: #f0a3a3;
    padding: 7px 9px;
    font-size: 11.5px;
  }

  .empty.compact {
    min-height: 120px;
    border: 1px dashed var(--border-soft);
    border-radius: var(--radius);
  }

  @media (max-width: 760px) {
    .head-actions {
      justify-content: flex-start;
    }

    .rule-row {
      flex-direction: column;
    }

    .rule-actions {
      align-self: stretch;
      justify-content: flex-end;
    }
  }
</style>
