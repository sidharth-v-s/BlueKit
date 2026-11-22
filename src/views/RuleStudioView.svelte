<script lang="ts">
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import Eraser from 'lucide-svelte/icons/eraser';
  import FileText from 'lucide-svelte/icons/file-text';
  import Info from 'lucide-svelte/icons/info';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import Play from 'lucide-svelte/icons/play';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import Upload from 'lucide-svelte/icons/upload';
  import { ui } from '@/app/ui.svelte';
  import { SIGMA_MAX_INPUT_BYTES, SIGMA_SCHEMA_SOURCE } from '@/core/rules/sigma-meta';
  import type { SigmaIssue, SigmaRuleSummary, SigmaValidationReport } from '@/core/rules/sigma';

  const EXAMPLE_RULE = `title: Suspicious PowerShell Encoded Command
id: 3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d
status: experimental
description: Detects PowerShell launched with an encoded command argument.
author: BlueKit example
date: 2026-11-21
logsource:
  product: windows
  category: process_creation
detection:
  selection_image:
    Image|endswith: '\\powershell.exe'
  selection_command:
    CommandLine|contains:
      - ' -enc '
      - ' -encodedcommand '
  condition: selection_image and selection_command
fields:
  - CommandLine
  - ParentImage
falsepositives:
  - Legitimate administrative scripts
level: medium
tags:
  - attack.execution
  - attack.t1059.001
`;

  let rule = $state(EXAMPLE_RULE);
  let report = $state<SigmaValidationReport | null>(null);
  let error = $state<string | null>(null);
  let validating = $state(false);
  let fileInput: HTMLInputElement | null = $state(null);

  const byteLength = $derived(new TextEncoder().encode(rule).byteLength);
  const overLimit = $derived(byteLength > SIGMA_MAX_INPUT_BYTES);
  const status = $derived(report === null ? 'idle' : report.valid ? 'valid' : 'invalid');
  const summary = $derived(report?.summary ?? null);

  function handleKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void validate();
    }
  }

  async function validate(): Promise<void> {
    if (validating) return;
    error = null;
    if (rule.trim().length === 0) {
      report = null;
      error = 'The rule editor is empty.';
      return;
    }
    if (overLimit) {
      report = null;
      error = `The rule exceeds the ${SIGMA_MAX_INPUT_BYTES / 1024} KiB validation limit.`;
      return;
    }

    validating = true;
    try {
      // Ajv, ajv-formats, and the vendored schema stay out of the initial bundle.
      const { validateSigmaRule } = await import('@/core/rules/sigma');
      report = validateSigmaRule(rule);
    } catch (caught) {
      report = null;
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      validating = false;
    }
  }

  function loadExample(): void {
    rule = EXAMPLE_RULE;
    report = null;
    error = null;
  }

  function clear(): void {
    rule = '';
    report = null;
    error = null;
  }

  async function openFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > SIGMA_MAX_INPUT_BYTES) {
      ui.toast(`Rule files are capped at ${SIGMA_MAX_INPUT_BYTES / 1024} KiB.`, 'warning');
      return;
    }
    rule = await file.text();
    report = null;
    error = null;
  }

  function logsourceText(logsource: NonNullable<SigmaRuleSummary['logsource']>): string {
    return ['product', 'category', 'service']
      .map((key) => logsource[key as 'product' | 'category' | 'service'])
      .filter((value): value is string => Boolean(value))
      .join(' · ') || 'unspecified';
  }

  function issueLabel(issue: SigmaIssue): string {
    return issue.layer === 'yaml' ? 'YAML' : 'Schema';
  }
</script>

<div class="page rule-studio">
  <header class="page-head">
    <div class="head-copy">
      <div class="eyebrow">Rule Studio · Phase 4</div>
      <h1>Sigma validation</h1>
      <p class="lede">
        Check Sigma rule syntax and structure against the vendored official schema, offline. Validation
        is shape checking: it does not test detection logic, run a rule, or judge detection quality.
      </p>
    </div>
    <div class="head-meta">
      <ShieldCheck size={15} strokeWidth={1.8} aria-hidden="true" />
      <span class="mono">1 MiB</span>
      <span class="faint">rule cap</span>
    </div>
  </header>

  <div class="workspace">
    <section class="panel editor-panel">
      <div class="panel-head">
        <span class="panel-title">Rule editor</span>
        <input
          class="file-input"
          type="file"
          accept=".yml,.yaml,text/yaml,application/yaml,text/plain"
          bind:this={fileInput}
          onchange={openFile}
          aria-label="Open a Sigma rule file"
        />
        <div class="head-actions">
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => fileInput?.click()}>
            <Upload size={12} strokeWidth={1.9} aria-hidden="true" /> Open file
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={loadExample}>
            <FileText size={12} strokeWidth={1.9} aria-hidden="true" /> Example
          </button>
        </div>
      </div>

      <div class="editor-body">
        <textarea
          class="textarea mono rule-textarea"
          bind:value={rule}
          onkeydown={handleKeydown}
          spellcheck="false"
          aria-label="Sigma rule YAML"
          placeholder="title: Example rule&#10;logsource:&#10;  product: windows&#10;detection:&#10;  selection:&#10;    EventID: 4688&#10;  condition: selection"
        ></textarea>

        {#if error}
          <div class="inline-error">{error}</div>
        {/if}

        <div class="input-actions">
          <button type="button" class="btn btn-primary" onclick={() => void validate()} disabled={validating || overLimit}>
            {#if validating}
              <LoaderCircle size={14} strokeWidth={2} class="spin" aria-hidden="true" />
              Validating…
            {:else}
              <Play size={14} strokeWidth={1.9} aria-hidden="true" />
              Validate rule
            {/if}
          </button>
          <button type="button" class="btn btn-ghost" onclick={clear} disabled={rule.length === 0 && !report}>
            <Eraser size={13} strokeWidth={1.8} aria-hidden="true" />
            Clear
          </button>
          <span class="kbd-hint faint">Ctrl Enter to validate</span>
          <span class="size-hint mono" class:over={overLimit}>
            {byteLength.toLocaleString()} B / {SIGMA_MAX_INPUT_BYTES / 1024} KiB
          </span>
        </div>
      </div>
    </section>

    <section class="panel report-panel">
      <div class="panel-head">
        <span class="panel-title">Validation report</span>
        {#if status === 'valid'}
          <span class="badge badge-success badge-dot">Schema valid</span>
        {:else if status === 'invalid'}
          <span class="badge badge-danger badge-dot">Issues found</span>
        {:else}
          <span class="badge badge-muted">Not validated</span>
        {/if}
      </div>

      {#if report === null}
        <div class="empty">
          <ShieldCheck size={22} strokeWidth={1.4} aria-hidden="true" />
          <span>No report yet.</span>
          <span class="faint">Validate the rule to check YAML and the Sigma schema.</span>
        </div>
      {:else}
        <div class="report-body">
          <div class="summary-grid">
            <div class="summary-item">
              <span class="summary-label">YAML</span>
              <span class="summary-value mono">{report.issues.some((issue) => issue.layer === 'yaml') ? 'invalid' : 'parsed'}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Schema</span>
              <span class="summary-value mono">{report.schemaValid ? 'valid' : 'invalid'}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Issues</span>
              <span class="summary-value mono">{report.issues.length}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Warnings</span>
              <span class="summary-value mono">{report.warnings.length}</span>
            </div>
          </div>

          {#if report.valid}
            <div class="verdict valid">
              <CircleCheck size={15} strokeWidth={1.9} aria-hidden="true" />
              <div>
                <strong>Valid against the Sigma detection schema.</strong>
                <p>
                  The rule matches the schema's required fields and shapes. That says nothing about the
                  quality of the detection or whether it will fire on real telemetry.
                </p>
              </div>
            </div>
          {:else}
            <div class="verdict invalid">
              <CircleAlert size={15} strokeWidth={1.9} aria-hidden="true" />
              <div>
                <strong>{report.issues.length} issue{report.issues.length === 1 ? '' : 's'} found.</strong>
                <p>Fix each issue at its layer. YAML errors hide schema results; resolve them first.</p>
              </div>
            </div>
          {/if}

          {#if report.issues.length > 0}
            <div class="issue-list">
              {#each report.issues as issue, index (issue.layer + '\u0000' + issue.path + '\u0000' + index)}
                <div class="issue">
                  <span class="layer" class:yaml={issue.layer === 'yaml'}>{issueLabel(issue)}</span>
                  <div class="issue-copy">
                    <span class="issue-path mono">{issue.path}</span>
                    <span class="issue-message">{issue.message}</span>
                    {#if issue.keyword}
                      <span class="issue-keyword mono">keyword: {issue.keyword}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          {#if report.warnings.length > 0}
            <div class="warnings">
              {#each report.warnings as warning}
                <div class="warning">
                  <TriangleAlert size={13} strokeWidth={1.9} aria-hidden="true" />
                  <span>{warning}</span>
                </div>
              {/each}
            </div>
          {/if}

          {#if summary}
            <div class="summary-block">
              <div class="summary-title">Rule summary</div>
              <dl class="summary-dl">
                <dt>Title</dt>
                <dd>{summary.title ?? '—'}</dd>
                <dt>ID</dt>
                <dd class="mono">{summary.id ?? '—'}</dd>
                <dt>Status</dt>
                <dd>{summary.status ?? '—'}</dd>
                <dt>Level</dt>
                <dd>{summary.level ?? '—'}</dd>
                <dt>Author</dt>
                <dd>{summary.author ?? '—'}</dd>
                <dt>Logsource</dt>
                <dd class="mono">{summary.logsource ? logsourceText(summary.logsource) : '—'}</dd>
                <dt>Condition</dt>
                <dd class="mono condition">{summary.condition ?? '—'}</dd>
                <dt>Selections</dt>
                <dd class="mono">{summary.detectionKeys.length > 0 ? summary.detectionKeys.join(', ') : '—'}</dd>
              </dl>
              {#if summary.tags.length > 0}
                <div class="tag-row">
                  {#each summary.tags as tag}
                    <span class="tag mono">{tag}</span>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </section>
  </div>

  <section class="panel notes-panel">
    <div class="panel-head">
      <span class="panel-title">
        <Info size={13} strokeWidth={1.9} aria-hidden="true" /> What this checks
      </span>
    </div>
    <div class="notes">
      <div class="note">
        <ShieldCheck size={14} strokeWidth={1.9} aria-hidden="true" />
        <p>
          <strong>Two separate layers.</strong> YAML syntax errors mean the document could not be parsed.
          Schema errors mean the YAML parsed but does not match the Sigma detection-rule schema. They are
          never merged into one “invalid rule” message.
        </p>
      </div>
      <div class="note">
        <TriangleAlert size={14} strokeWidth={1.9} aria-hidden="true" />
        <p>
          <strong>Subset warnings are not passes.</strong> Correlation, time windows, and aggregations are
          flagged because local event testing will not cover them. A warning does not make a rule invalid.
        </p>
      </div>
      <div class="note">
        <ShieldCheck size={14} strokeWidth={1.9} aria-hidden="true" />
        <p>
          <strong>Offline and pinned.</strong> The schema is vendored from SigmaHQ and checksummed in
          {SIGMA_SCHEMA_SOURCE.path}; Ajv loads only when validation first runs. Local event testing and a
          persistent rule library remain planned.
        </p>
      </div>
    </div>
  </section>

  <footer class="schema-note">
    <span class="mono">{report?.schemaTitle ?? SIGMA_SCHEMA_SOURCE.title}</span>
    <span class="faint">SHA-256 {(report?.schemaSha256 ?? SIGMA_SCHEMA_SOURCE.sha256).slice(0, 16)}…</span>
    <span class="faint">{report?.validator ?? 'ajv 8.20.0 + yaml 2.9.1'}</span>
  </footer>
</div>

<style>
  .rule-studio {
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
    max-width: 700px;
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
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    gap: 14px;
    align-items: start;
    margin-bottom: 14px;
  }

  .head-actions {
    display: flex;
    gap: 4px;
  }

  .file-input {
    display: none;
  }

  .editor-body {
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

  .input-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .kbd-hint {
    font-size: 10px;
  }

  .size-hint {
    margin-left: auto;
    color: var(--muted-2);
    font-size: 10px;
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

  .issue-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .issue {
    display: flex;
    gap: 9px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-soft);
  }

  .issue:last-child {
    border-bottom: 0;
  }

  .layer {
    flex: 0 0 auto;
    height: 17px;
    padding: 0 5px;
    border: 1px solid rgba(224, 108, 108, 0.34);
    border-radius: 3px;
    color: #f0a3a3;
    font-size: 9.5px;
    line-height: 16px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .layer.yaml {
    border-color: rgba(216, 166, 87, 0.34);
    color: #e5c28a;
  }

  .issue-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .issue-path {
    color: var(--muted-2);
    font-size: 10.5px;
    overflow-wrap: anywhere;
  }

  .issue-message {
    color: var(--text);
    font-size: 11.5px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .issue-keyword {
    color: var(--muted-2);
    font-size: 10px;
  }

  .warnings {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .warning {
    display: flex;
    gap: 8px;
    padding: 7px 9px;
    border: 1px solid rgba(216, 166, 87, 0.28);
    border-radius: var(--radius-sm);
    background: var(--warning-soft);
    color: #e5c28a;
    font-size: 11.5px;
    line-height: 1.5;
  }

  .summary-block {
    border-top: 1px solid var(--border-soft);
    padding-top: 10px;
  }

  .summary-title {
    color: var(--muted-2);
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 7px;
  }

  .summary-dl {
    display: grid;
    grid-template-columns: 74px minmax(0, 1fr);
    gap: 4px 10px;
    margin: 0;
    font-size: 11.5px;
  }

  .summary-dl dt {
    color: var(--muted-2);
  }

  .summary-dl dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .condition {
    color: #9ecbff;
  }

  .tag-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  .tag {
    padding: 1px 5px;
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    color: var(--muted);
    font-size: 10px;
    background: var(--surface-2);
  }

  .notes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding: 12px;
  }

  .note {
    display: flex;
    gap: 8px;
    color: var(--muted-2);
  }

  .note p {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.55;
  }

  .note strong {
    color: var(--text);
  }

  .schema-note {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    padding: 8px 2px 0;
    color: var(--muted-2);
    font-size: 10px;
  }

  @media (max-width: 980px) {
    .workspace {
      grid-template-columns: minmax(0, 1fr);
    }

    .notes {
      grid-template-columns: minmax(0, 1fr);
    }

    .rule-textarea {
      min-height: 320px;
    }
  }

  @media (max-width: 620px) {
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .summary-item:nth-child(2) {
      border-right: 0;
    }

    .summary-item:nth-child(-n + 2) {
      border-bottom: 1px solid var(--border-soft);
    }
  }
</style>
