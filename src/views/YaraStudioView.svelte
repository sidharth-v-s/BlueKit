<script lang="ts">
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import Download from 'lucide-svelte/icons/download';
  import Eraser from 'lucide-svelte/icons/eraser';
  import FileText from 'lucide-svelte/icons/file-text';
  import Info from 'lucide-svelte/icons/info';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import Play from 'lucide-svelte/icons/play';
  import ScanSearch from 'lucide-svelte/icons/scan-search';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import Square from 'lucide-svelte/icons/square';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import Upload from 'lucide-svelte/icons/upload';
  import { ui } from '@/app/ui.svelte';
  import { downloadText } from '@/core/export-import/download';
  import { formatBytes, toToolError } from '@/core/runtime/errors';
  import { workerManager } from '@/core/workers/manager';
  import {
    detectYaraImports,
    validateYaraSource,
    yaraFileProblem,
    yaraSourceBytes,
    yaraSourceWarnings,
    type YaraCompileReport,
    type YaraFileScan,
    type YaraScanReport,
  } from '@/core/rules/yara';
  import {
    YARA_ENGINE,
    YARA_FEATURES,
    YARA_JOB_TIMEOUT_MS,
    YARA_MAX_FILE_BYTES,
    YARA_MAX_FILES,
    YARA_MAX_SOURCE_BYTES,
    YARA_MAX_TOTAL_BYTES,
    YARA_MODULES,
    YARA_SCAN_TIMEOUT_MS,
  } from '@/core/rules/yara-meta';

  const EXAMPLE_RULE = `rule BlueKit_Encoded_PowerShell : demo bluekit {
  meta:
    author = "BlueKit example"
    description = "PowerShell command line with an encoded-command flag."
    reference = "https://attack.mitre.org/techniques/T1059/001/"
  strings:
    $ps = "powershell" nocase
    $enc1 = " -enc " nocase
    $enc2 = " -encodedcommand " nocase
  condition:
    $ps and any of ($enc*)
}
`;

  const SNIPPETS: Array<{ label: string; text: string }> = [
    {
      label: 'rule skeleton',
      text: `rule NewRule : tag {
  meta:
    author = ""
  strings:
    $a = "text"
  condition:
    $a
}`,
    },
    {
      label: 'strings',
      text: `  strings:
    $text = "literal"
    $hex = { 4d 5a 90 00 }
    $re = /pattern-[0-9]+/`,
    },
    {
      label: 'meta',
      text: `  meta:
    author = ""
    description = ""
    reference = ""`,
    },
    {
      label: 'condition',
      text: '  condition:\n    any of them',
    },
    {
      label: 'import pe',
      text: 'import "pe"',
    },
  ];

  let source = $state(EXAMPLE_RULE);
  let files = $state<File[]>([]);
  let compileReport = $state<YaraCompileReport | null>(null);
  let scanReport = $state<YaraScanReport | null>(null);
  let error = $state<string | null>(null);
  let validating = $state(false);
  let scanning = $state(false);
  let progress = $state<string | null>(null);
  let dragging = $state(false);
  let editor: HTMLTextAreaElement | null = $state(null);
  let ruleFileInput: HTMLInputElement | null = $state(null);
  let targetInput: HTMLInputElement | null = $state(null);
  let controller: AbortController | null = null;

  const busy = $derived(validating || scanning);
  const sourceBytes = $derived(yaraSourceBytes(source));
  const overLimit = $derived(sourceBytes > YARA_MAX_SOURCE_BYTES);
  const sourceWarnings = $derived(yaraSourceWarnings(source));
  const imports = $derived(detectYaraImports(source));
  const selectedBytes = $derived(files.reduce((total, file) => total + file.size, 0));
  const selectedProblem = $derived(
    files.length > YARA_MAX_FILES
      ? `Select at most ${YARA_MAX_FILES} files.`
      : selectedBytes > YARA_MAX_TOTAL_BYTES
        ? `The selection exceeds the ${YARA_MAX_TOTAL_BYTES / 1024 / 1024} MiB job cap.`
        : null,
  );
  const canScan = $derived(
    files.length > 0 && selectedProblem === null && !overLimit && source.trim().length > 0 && !busy,
  );
  const canValidate = $derived(!overLimit && source.trim().length > 0 && !busy);
  const report = $derived(scanReport ?? compileReport);

  $effect(() => {
    // Reports belong to the exact source and file selection that produced them.
    void source;
    void files;
    compileReport = null;
    scanReport = null;
  });

  function handleKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void validate();
    } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      void scan();
    }
  }

  function insertSnippet(text: string): void {
    const start = editor?.selectionStart ?? source.length;
    const end = editor?.selectionEnd ?? start;
    const before = source.slice(0, start);
    const after = source.slice(end);
    const needsBreak = before.length > 0 && !before.endsWith('\n');
    source = `${before}${needsBreak ? '\n' : ''}${text}${after}`;
    requestAnimationFrame(() => {
      editor?.focus();
      const caret = before.length + (needsBreak ? 1 : 0) + text.length;
      editor?.setSelectionRange(caret, caret);
    });
  }

  async function openRuleFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > YARA_MAX_SOURCE_BYTES) {
      ui.toast(`Rule files are capped at ${YARA_MAX_SOURCE_BYTES / 1024} KiB.`, 'warning');
      return;
    }
    const text = await file.text();
    if (yaraSourceBytes(text) > YARA_MAX_SOURCE_BYTES) {
      ui.toast(`Rule files are capped at ${YARA_MAX_SOURCE_BYTES / 1024} KiB.`, 'warning');
      return;
    }
    source = text;
    error = null;
  }

  function addFiles(incoming: FileList | File[] | null): void {
    if (!incoming) return;
    const candidates = Array.from(incoming);
    if (candidates.length === 0) return;

    const next = [...files];
    let total = selectedBytes;
    for (const file of candidates) {
      if (next.length >= YARA_MAX_FILES) {
        ui.toast(`A scan job accepts at most ${YARA_MAX_FILES} files.`, 'warning');
        break;
      }
      const problem = yaraFileProblem(file.name, file.size);
      if (problem) {
        ui.toast(problem, 'warning');
        continue;
      }
      if (total + file.size > YARA_MAX_TOTAL_BYTES) {
        ui.toast(`The selection exceeds the ${YARA_MAX_TOTAL_BYTES / 1024 / 1024} MiB job cap.`, 'warning');
        break;
      }
      const duplicate = next.some(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified,
      );
      if (duplicate) continue;
      next.push(file);
      total += file.size;
    }
    files = next;
  }

  function removeFile(index: number): void {
    files = files.filter((_, position) => position !== index);
  }

  function describeError(caught: unknown): string {
    const normalized = toToolError(caught);
    return normalized.message;
  }

  async function validate(): Promise<void> {
    if (busy) return;
    error = null;
    const problem = validateYaraSource(source);
    if (problem) {
      error = problem;
      return;
    }

    validating = true;
    compileReport = null;
    scanReport = null;
    progress = null;
    const snapshot = source;
    try {
      const result = await workerManager.run(
        'detection.yara-studio',
        { action: 'validate', source: snapshot },
        { timeoutMs: YARA_JOB_TIMEOUT_MS },
      );
      if (source === snapshot) compileReport = result.output as YaraCompileReport;
    } catch (caught) {
      error = describeError(caught);
    } finally {
      validating = false;
    }
  }

  async function scan(): Promise<void> {
    if (busy) return;
    error = null;
    const problem = validateYaraSource(source);
    if (problem) {
      error = problem;
      return;
    }
    if (files.length === 0) {
      error = 'Select at least one local file to scan.';
      return;
    }
    if (selectedProblem) {
      error = selectedProblem;
      return;
    }

    scanning = true;
    compileReport = null;
    scanReport = null;
    progress = 'Starting YARA-X…';
    const snapshot = source;
    const targets = [...files];
    const active = new AbortController();
    controller = active;
    try {
      const result = await workerManager.run(
        'detection.yara-studio',
        { action: 'scan', source: snapshot, files: targets },
        {
          timeoutMs: YARA_JOB_TIMEOUT_MS,
          signal: active.signal,
          onProgress: (update) => (progress = update.message),
        },
      );
      if (source === snapshot) scanReport = result.output as YaraScanReport;
    } catch (caught) {
      error = active.signal.aborted ? 'Scan cancelled.' : describeError(caught);
    } finally {
      scanning = false;
      progress = null;
      controller = null;
    }
  }

  function cancelScan(): void {
    controller?.abort();
  }

  function loadExample(): void {
    source = EXAMPLE_RULE;
    files = [];
    error = null;
  }

  function clear(): void {
    source = '';
    files = [];
    error = null;
  }

  function ruleFilename(): string {
    const identifier = /\brule\s+([A-Za-z_][A-Za-z0-9_]*)/u.exec(source)?.[1] ?? 'yara-rule';
    const base =
      identifier
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/gu, '-')
        .replace(/^-+|-+$/gu, '')
        .slice(0, 80) || 'yara-rule';
    return `${base}.yar`;
  }

  function downloadRule(): void {
    if (source.trim().length === 0) {
      ui.toast('The rule editor is empty.', 'warning');
      return;
    }
    downloadText(ruleFilename(), source, 'text/plain;charset=utf-8');
    ui.toast('Exported the exact rule source.', 'success');
  }

  function supportClass(support: string): string {
    if (support === 'supported') return 'badge-success';
    if (support === 'unsupported') return 'badge-danger';
    if (support === 'limited') return 'badge-warning';
    return 'badge-accent';
  }

  function formatOffset(offset: number): string {
    return `0x${offset.toString(16)}`;
  }

  function fileStatus(file: YaraFileScan): 'match' | 'no match' | 'error' {
    if (!file.valid) return 'error';
    return file.matches.length > 0 ? 'match' : 'no match';
  }

  function fileBadge(file: YaraFileScan): string {
    const status = fileStatus(file);
    return status === 'match' ? 'badge-warning' : status === 'error' ? 'badge-danger' : 'badge-muted';
  }
</script>

<div class="page yara-studio">
  <header class="page-head">
    <div class="head-copy">
      <div class="eyebrow">Rule Studio · Phase 4</div>
      <h1>YARA Studio</h1>
      <p class="lede">
        Compile YARA rules and scan local files with {YARA_ENGINE.name} {YARA_ENGINE.version} in a
        Web Worker. Rules and bytes stay in this browser. Compilation is not a portability promise:
        name the engine and version when sharing results.
      </p>
    </div>
    <div class="head-meta">
      <ShieldCheck size={15} strokeWidth={1.8} aria-hidden="true" />
      <span class="mono">{YARA_ENGINE.name} {YARA_ENGINE.version}</span>
      <span class="faint">WASM worker</span>
    </div>
  </header>

  <div class="workspace">
    <section class="panel editor-panel">
      <div class="panel-head">
        <span class="panel-title">Rule editor</span>
        <input
          class="file-input"
          type="file"
          accept=".yar,.yara,text/plain"
          bind:this={ruleFileInput}
          onchange={openRuleFile}
          aria-label="Open a YARA rule file"
        />
        <div class="head-actions">
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => ruleFileInput?.click()}>
            <Upload size={12} strokeWidth={1.9} aria-hidden="true" /> Open rule
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onclick={downloadRule}
            disabled={source.trim().length === 0}
          >
            <Download size={12} strokeWidth={1.9} aria-hidden="true" /> Export
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={loadExample}>
            <FileText size={12} strokeWidth={1.9} aria-hidden="true" /> Example
          </button>
        </div>
      </div>

      <div class="editor-body">
        <textarea
          class="textarea mono rule-textarea"
          bind:this={editor}
          bind:value={source}
          onkeydown={handleKeydown}
          spellcheck="false"
          aria-label="YARA rule source"
          placeholder={'rule Example : demo {\n  strings:\n    $a = "suspicious"\n  condition:\n    $a\n}'}
        ></textarea>

        <div class="snippet-row" aria-label="Rule snippets">
          {#each SNIPPETS as snippet}
            <button
              type="button"
              class="snippet"
              onclick={() => insertSnippet(snippet.text)}
              disabled={busy}
            >
              {snippet.label}
            </button>
          {/each}
        </div>

        {#if sourceWarnings.length > 0}
          <div class="warnings">
            {#each sourceWarnings as warning}
              <div class="warning">
                <TriangleAlert size={13} strokeWidth={1.9} aria-hidden="true" />
                <span>{warning}</span>
              </div>
            {/each}
          </div>
        {/if}

        {#if imports.length > 0}
          <p class="import-note">
            Imports: {imports.join(', ')}. The documented module list is
            <span class="mono">{YARA_MODULES.join(', ')}</span>.
          </p>
        {/if}

        {#if error}
          <div class="inline-error">{error}</div>
        {/if}
        {#if progress}
          <div class="progress-note" role="status">
            <LoaderCircle size={13} strokeWidth={2} class="spin" aria-hidden="true" />
            <span>{progress}</span>
          </div>
        {/if}

        <div class="input-actions">
          <button type="button" class="btn btn-primary" onclick={() => void validate()} disabled={!canValidate}>
            {#if validating}
              <LoaderCircle size={14} strokeWidth={2} class="spin" aria-hidden="true" />
              Validating…
            {:else}
              <ShieldCheck size={14} strokeWidth={1.9} aria-hidden="true" />
              Validate rule
            {/if}
          </button>
          <span class="kbd-hint faint">Ctrl Enter</span>
          <span class="size-hint mono" class:over={overLimit}>
            {sourceBytes.toLocaleString()} B / {YARA_MAX_SOURCE_BYTES / 1024} KiB
          </span>
        </div>
      </div>
    </section>

    <section class="panel scan-panel">
      <div class="panel-head">
        <span class="panel-title">Local scan targets</span>
        <span class="badge badge-muted">{files.length} / {YARA_MAX_FILES} files</span>
      </div>

      <div class="scan-body">
        <input
          class="file-input"
          type="file"
          multiple
          bind:this={targetInput}
          onchange={(event) => {
            const input = event.currentTarget as HTMLInputElement;
            addFiles(input.files);
            input.value = '';
          }}
          aria-label="Select local files to scan"
        />

        <div
          class="file-drop"
          class:dragging
          class:has-files={files.length > 0}
          role="button"
          tabindex={busy ? -1 : 0}
          aria-label="Add local files to scan"
          onclick={() => {
            if (!busy) targetInput?.click();
          }}
          onkeydown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && !busy) {
              event.preventDefault();
              targetInput?.click();
            }
          }}
          ondragover={(event) => {
            event.preventDefault();
            if (!busy) dragging = true;
          }}
          ondragleave={() => (dragging = false)}
          ondrop={(event) => {
            event.preventDefault();
            dragging = false;
            if (!busy) addFiles(event.dataTransfer?.files ?? null);
          }}
        >
          <Upload size={18} strokeWidth={1.7} aria-hidden="true" />
          <div class="drop-copy">
            <span class="drop-title">
              {files.length > 0 ? 'Add more local files' : 'Drop files or click to browse'}
            </span>
            <span class="faint">
              Up to {YARA_MAX_FILES} files · {YARA_MAX_FILE_BYTES / 1024 / 1024} MiB each ·
              {YARA_MAX_TOTAL_BYTES / 1024 / 1024} MiB total · never uploaded
            </span>
          </div>
        </div>

        {#if files.length > 0}
          <div class="target-list">
            {#each files as file, index (file.name + file.size + file.lastModified + index)}
              <div class="target-row">
                <FileText size={12} strokeWidth={1.8} aria-hidden="true" />
                <span class="target-name mono" title={file.name}>{file.name}</span>
                <span class="target-size faint">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  class="mini danger"
                  aria-label={`Remove ${file.name}`}
                  onclick={() => removeFile(index)}
                  disabled={busy}
                >
                  <Trash2 size={11} aria-hidden="true" />
                </button>
              </div>
            {/each}
          </div>
        {/if}

        {#if selectedProblem}
          <div class="inline-error">{selectedProblem}</div>
        {/if}

        <div class="input-actions">
          <button type="button" class="btn btn-primary" onclick={() => void scan()} disabled={!canScan}>
            {#if scanning}
              <LoaderCircle size={14} strokeWidth={2} class="spin" aria-hidden="true" />
              Scanning…
            {:else}
              <ScanSearch size={14} strokeWidth={1.9} aria-hidden="true" />
              Scan files
            {/if}
          </button>
          {#if scanning}
            <button type="button" class="btn btn-ghost" onclick={cancelScan}>
              <Square size={12} strokeWidth={2} aria-hidden="true" />
              Cancel
            </button>
          {:else}
            <span class="kbd-hint faint">Ctrl Shift Enter</span>
          {/if}
          <span class="size-hint mono">{formatBytes(selectedBytes)} selected</span>
        </div>

        <p class="mode-note">
          The engine timeout is best effort. The worker is terminated at
          {YARA_JOB_TIMEOUT_MS / 1000} seconds, which is the hard stop. Scan only files you are
          authorised to inspect.
        </p>
      </div>
    </section>
  </div>

  <section class="panel report-panel">
    <div class="panel-head">
      <span class="panel-title">Engine report</span>
      {#if scanReport}
        <span class="badge {scanReport.valid ? 'badge-success' : 'badge-danger'} badge-dot">
          {scanReport.valid ? 'compiled' : 'compile failed'}
        </span>
      {:else if compileReport}
        <span class="badge {compileReport.valid ? 'badge-success' : 'badge-danger'} badge-dot">
          {compileReport.valid ? 'compiled' : 'compile failed'}
        </span>
      {:else}
        <span class="badge badge-muted">Not run</span>
      {/if}
    </div>

    {#if report === null}
      <div class="empty">
        <ShieldCheck size={22} strokeWidth={1.4} aria-hidden="true" />
        <span>No engine report yet.</span>
        <span class="faint">Validate the rule, or add files and scan them.</span>
      </div>
    {:else}
      <div class="report-body">
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">Engine</span>
            <span class="summary-value mono">{report.engine.name} {report.engine.version}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Rule source</span>
            <span class="summary-value mono">{formatBytes(report.sourceBytes)}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Warnings</span>
            <span class="summary-value mono">{report.warnings.length}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">{scanReport ? 'Matched files' : 'State'}</span>
            <span class="summary-value mono">
              {scanReport ? `${scanReport.matchedFiles} / ${scanReport.files.length}` : report.valid ? 'valid' : 'invalid'}
            </span>
          </div>
        </div>

        {#if report.valid}
          <div class="verdict valid">
            <CircleCheck size={15} strokeWidth={1.9} aria-hidden="true" />
            <div>
              <strong>Compiled by {report.engine.name} {report.engine.version}.</strong>
              <p>
                Compilation checks syntax and engine support. It does not prove the rule is a good
                detection, and it does not guarantee the same behaviour on another YARA engine.
              </p>
            </div>
          </div>
        {:else}
          <div class="verdict invalid">
            <CircleAlert size={15} strokeWidth={1.9} aria-hidden="true" />
            <div>
              <strong>The rule did not compile.</strong>
              <p>Fix the engine messages below. No file was scanned.</p>
            </div>
          </div>
        {/if}

        {#if report.errors.length > 0}
          <div class="engine-messages errors">
            {#each report.errors as message, index (index)}
              <pre class="engine-message mono">{message}</pre>
            {/each}
          </div>
        {/if}

        {#if report.warnings.length > 0}
          <div class="engine-messages warnings">
            {#each report.warnings as message, index (index)}
              <pre class="engine-message mono">{message}</pre>
            {/each}
          </div>
        {/if}

        {#if scanReport}
          <div class="scan-results">
            {#if scanReport.files.length === 0}
              <div class="empty compact">
                <span>No files were scanned.</span>
              </div>
            {:else}
              {#each scanReport.files as file, fileIndex (fileIndex)}
                <details class="file-result" open={file.matches.length > 0}>
                  <summary>
                    <FileText size={13} strokeWidth={1.8} aria-hidden="true" />
                    <span class="file-result-name mono">{file.name}</span>
                    <span class="faint">{formatBytes(file.size)} · {file.durationMs} ms</span>
                    <span class="badge {fileBadge(file)}">{fileStatus(file)}</span>
                    {#if file.matches.length > 0}
                      <span class="faint">{file.matches.length} rule{file.matches.length === 1 ? '' : 's'}</span>
                    {/if}
                  </summary>

                  <div class="file-result-body">
                    {#if file.errors.length > 0}
                      <div class="engine-messages errors">
                        {#each file.errors as message, index (index)}
                          <pre class="engine-message mono">{message}</pre>
                        {/each}
                      </div>
                    {/if}
                    {#if file.warnings.length > 0}
                      <div class="engine-messages warnings">
                        {#each file.warnings as message, index (index)}
                          <pre class="engine-message mono">{message}</pre>
                        {/each}
                      </div>
                    {/if}

                    {#if file.matches.length === 0 && file.valid}
                      <p class="no-match">No rule in this rule set matched the file.</p>
                    {/if}

                    {#each file.matches as match (match.namespace + '\u0000' + match.identifier)}
                      <div class="rule-match">
                        <div class="rule-match-head">
                          <span class="badge badge-warning">match</span>
                          <span class="rule-name mono">{match.identifier}</span>
                          <span class="faint mono">{match.namespace}</span>
                          {#if match.isPrivate}<span class="badge badge-muted">private</span>{/if}
                          {#if match.isGlobal}<span class="badge badge-muted">global</span>{/if}
                        </div>
                        {#if match.tags.length > 0}
                          <div class="tag-row">
                            {#each match.tags as tag}
                              <span class="tag mono">{tag}</span>
                            {/each}
                          </div>
                        {/if}
                        {#if match.metadata.length > 0}
                          <div class="metadata-row">
                            {#each match.metadata as entry (entry.identifier)}
                              <span class="metadata-item">
                                <span class="metadata-key mono">{entry.identifier}</span>
                                <span class="metadata-value">{String(entry.value)}</span>
                              </span>
                            {/each}
                          </div>
                        {/if}

                        {#if match.patterns.length > 0}
                          <div class="pattern-table">
                            <div class="pattern-row pattern-head">
                              <span>String</span>
                              <span>Kind</span>
                              <span>Offset</span>
                              <span>Length</span>
                              <span>Preview</span>
                            </div>
                            {#each match.patterns as pattern (pattern.identifier)}
                              {#if pattern.matches.length > 0}
                                {#each pattern.matches as hit, index (pattern.identifier + hit.offset + index)}
                                  <div class="pattern-row">
                                    <span class="mono">{pattern.identifier}</span>
                                    <span class="faint">{pattern.kind}</span>
                                    <span class="mono">{formatOffset(hit.offset)}</span>
                                    <span class="mono">{hit.length}</span>
                                    <span class="mono preview" title={hit.preview ?? ''}>{hit.ascii ?? '—'}</span>
                                  </div>
                                {/each}
                              {/if}
                            {/each}
                          </div>
                          {#if match.patterns.some((pattern) => pattern.truncated)}
                            <p class="truncation-note">
                              Match display is capped. The engine reported more bytes for at least one
                              string.
                            </p>
                          {/if}
                        {/if}
                      </div>
                    {/each}

                    {#if file.truncated}
                      <p class="truncation-note">
                        Display caps were reached for this file. Reduce the rule set or narrow the
                        patterns to see every match.
                      </p>
                    {/if}
                  </div>
                </details>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <div class="bottom-grid">
    <section class="panel matrix-panel">
      <div class="panel-head">
        <span class="panel-title">
          <Info size={13} strokeWidth={1.9} aria-hidden="true" /> Supported features
        </span>
        <span class="badge badge-accent">{report?.engine.name ?? YARA_ENGINE.name} {report?.engine.version ?? YARA_ENGINE.version}</span>
      </div>
      <div class="matrix-body">
        {#each YARA_FEATURES as feature}
          <div class="matrix-row">
            <span class="matrix-area">{feature.area}</span>
            <span class="badge {supportClass(feature.support)}">{feature.support}</span>
            <span class="matrix-detail">{feature.detail}</span>
          </div>
        {/each}
      </div>
    </section>

    <section class="panel notes-panel">
      <div class="panel-head">
        <span class="panel-title">
          <ShieldCheck size={13} strokeWidth={1.9} aria-hidden="true" /> Boundaries
        </span>
      </div>
      <div class="notes">
        <div class="note">
          <ShieldCheck size={14} strokeWidth={1.9} aria-hidden="true" />
          <p>
            <strong>Local only.</strong> Rule source and file bytes go to the tool worker, never to a
            server. The WASM binary and its assets load from this origin, so the CSP stays
            <span class="mono">connect-src 'self'</span>.
          </p>
        </div>
        <div class="note">
          <TriangleAlert size={14} strokeWidth={1.9} aria-hidden="true" />
          <p>
            <strong>Hard stop is worker termination.</strong> YARA-X can be told to time out, but a
            pathological pattern can still occupy the worker. Cancelling or exceeding
            {YARA_JOB_TIMEOUT_MS / 1000} seconds terminates the worker and discards its WASM state.
          </p>
        </div>
        <div class="note">
          <Info size={14} strokeWidth={1.9} aria-hidden="true" />
          <p>
            <strong>Not a compatibility claim.</strong> This build names {YARA_ENGINE.name}
            {YARA_ENGINE.version}. Do not describe a match as “YARA compatible” without naming the
            engine, version, rule source, and scan limits.
          </p>
        </div>
      </div>
    </section>
  </div>

  <footer class="engine-note">
    <span class="mono">{YARA_ENGINE.packageName} @ {YARA_ENGINE.version}</span>
    <span class="faint">{YARA_ENGINE.licence}</span>
    <span class="faint">WASM loaded lazily · per-file timeout {YARA_SCAN_TIMEOUT_MS / 1000}s</span>
  </footer>
</div>

<style>
  .yara-studio {
    max-width: 1180px;
  }

  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 22px;
    margin-bottom: 16px;
  }

  .head-copy {
    max-width: 720px;
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
    font-size: 22px;
    line-height: 1.2;
    margin-bottom: 8px;
  }

  .lede {
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.6;
  }

  .head-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    padding-top: 8px;
    color: var(--muted-2);
    font-size: 10.5px;
    white-space: nowrap;
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
    gap: 14px;
    align-items: start;
    margin-bottom: 14px;
  }

  .head-actions {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .file-input {
    display: none;
  }

  .editor-body,
  .scan-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }

  .rule-textarea {
    min-height: 460px;
    font-size: 12px;
    line-height: 1.65;
    tab-size: 2;
    resize: vertical;
  }

  .snippet-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .snippet {
    height: 22px;
    padding: 0 7px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--muted);
    font-size: 10px;
    font-family: var(--font-mono);
    cursor: pointer;
  }

  .snippet:hover:not(:disabled) {
    border-color: var(--accent-line);
    color: var(--text);
  }

  .snippet:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .input-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .kbd-hint,
  .size-hint {
    font-size: 10px;
  }

  .size-hint {
    margin-left: auto;
    color: var(--muted-2);
  }

  .size-hint.over {
    color: var(--danger);
  }

  .inline-error {
    border: 1px solid rgba(224, 108, 108, 0.34);
    border-radius: var(--radius-sm);
    background: var(--danger-soft);
    color: #f0a3a3;
    padding: 7px 9px;
    font-size: 11.5px;
  }

  .progress-note {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--muted);
    font-size: 11.5px;
  }

  .file-drop {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 74px;
    padding: 11px 12px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    background: var(--bg-elevated);
    color: var(--muted-2);
    cursor: pointer;
  }

  .file-drop:hover,
  .file-drop.dragging {
    border-color: var(--accent-line);
    background: var(--accent-soft);
  }

  .file-drop.has-files {
    min-height: 58px;
  }

  .drop-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .drop-title {
    color: var(--text);
    font-size: 12px;
  }

  .target-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .target-row {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 8px;
    border-bottom: 1px solid var(--border-soft);
    background: var(--surface-2);
  }

  .target-row:last-child {
    border-bottom: 0;
  }

  .target-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  }

  .target-size {
    flex: 0 0 auto;
    font-size: 10px;
  }

  .mini {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 23px;
    height: 21px;
    padding: 0;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--muted);
    cursor: pointer;
  }

  .mini.danger:hover:not(:disabled) {
    border-color: rgba(224, 108, 108, 0.34);
    color: #f0a3a3;
  }

  .mini:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .mode-note {
    color: var(--muted-2);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .import-note {
    color: var(--muted-2);
    font-size: 10.5px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .report-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    border-right: 1px solid var(--border-soft);
    background: var(--surface-2);
    min-width: 0;
  }

  .summary-item:last-child {
    border-right: 0;
  }

  .summary-label {
    color: var(--muted-2);
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .summary-value {
    font-size: 12px;
    color: var(--text);
    overflow-wrap: anywhere;
  }

  .verdict {
    display: flex;
    gap: 9px;
    padding: 9px 10px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
  }

  .verdict strong {
    display: block;
    font-size: 12px;
    margin-bottom: 2px;
  }

  .verdict p {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.55;
  }

  .verdict.valid {
    border-color: rgba(86, 185, 141, 0.32);
    background: var(--success-soft);
    color: #86d8b4;
  }

  .verdict.invalid {
    border-color: rgba(224, 108, 108, 0.34);
    background: var(--danger-soft);
    color: #f0a3a3;
  }

  .engine-messages {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .engine-message {
    margin: 0;
    padding: 8px 9px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-size: 10.5px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .errors .engine-message {
    border-color: rgba(224, 108, 108, 0.3);
    background: var(--danger-soft);
    color: #f0a3a3;
  }

  .warnings .engine-message {
    border-color: rgba(216, 166, 87, 0.28);
    background: var(--warning-soft);
    color: #e5c28a;
  }

  .scan-results {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .file-result {
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface-2);
    overflow: hidden;
  }

  .file-result > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    cursor: pointer;
    font-size: 11px;
    list-style: none;
  }

  .file-result > summary::-webkit-details-marker {
    display: none;
  }

  .file-result > summary:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .file-result-name {
    overflow-wrap: anywhere;
  }

  .file-result-body {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 9px;
    border-top: 1px solid var(--border-soft);
  }

  .no-match {
    color: var(--muted-2);
    font-size: 11px;
  }

  .rule-match {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
  }

  .rule-match-head {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }

  .rule-name {
    font-size: 12px;
    font-weight: 500;
  }

  .tag-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .tag {
    padding: 1px 5px;
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    background: var(--surface-2);
    color: var(--muted);
    font-size: 9.5px;
  }

  .metadata-row {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .metadata-item {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    padding: 2px 6px;
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    background: var(--surface-2);
    font-size: 10px;
    max-width: 100%;
  }

  .metadata-key {
    color: var(--muted-2);
    font-size: 9.5px;
  }

  .metadata-value {
    overflow-wrap: anywhere;
  }

  .pattern-table {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    overflow-x: auto;
  }

  .pattern-row {
    display: grid;
    grid-template-columns: 130px 70px 90px 62px minmax(140px, 1fr);
    gap: 8px;
    align-items: baseline;
    padding: 4px 7px;
    border-bottom: 1px solid var(--border-soft);
    font-size: 10.5px;
    min-width: 620px;
  }

  .pattern-row:last-child {
    border-bottom: 0;
  }

  .pattern-head {
    background: var(--surface-3);
    color: var(--muted-2);
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .preview {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .truncation-note {
    color: var(--muted-2);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .bottom-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
    gap: 14px;
    align-items: start;
    margin-bottom: 14px;
  }

  .matrix-body {
    display: flex;
    flex-direction: column;
    padding: 4px 12px 12px;
  }

  .matrix-row {
    display: grid;
    grid-template-columns: 120px 118px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    padding: 7px 0;
    border-bottom: 1px solid var(--border-soft);
  }

  .matrix-row:last-child {
    border-bottom: 0;
  }

  .matrix-area {
    font-size: 11px;
    color: var(--text);
  }

  .matrix-detail {
    color: var(--muted);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .notes {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }

  .note {
    display: flex;
    gap: 8px;
  }

  .note p {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.55;
  }

  .note strong {
    color: var(--text);
  }

  .engine-note {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 2px 2px 4px;
    font-size: 10px;
    color: var(--muted-2);
  }

  .empty.compact {
    min-height: 90px;
    border: 1px dashed var(--border-soft);
    border-radius: var(--radius);
  }

  @media (max-width: 980px) {
    .workspace,
    .bottom-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .matrix-row {
      grid-template-columns: 110px 110px minmax(0, 1fr);
    }
  }

  @media (max-width: 640px) {
    .page-head {
      flex-direction: column;
      gap: 8px;
    }

    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .summary-item:nth-child(2) {
      border-right: 0;
    }

    .summary-item:nth-child(1),
    .summary-item:nth-child(2) {
      border-bottom: 1px solid var(--border-soft);
    }

    .matrix-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .matrix-detail {
      grid-column: 1 / -1;
    }
  }
</style>
