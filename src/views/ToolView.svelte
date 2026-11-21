<script lang="ts">
  import { onMount } from 'svelte';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import Play from 'lucide-svelte/icons/play';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import Square from 'lucide-svelte/icons/square';
  import Star from 'lucide-svelte/icons/star';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import X from 'lucide-svelte/icons/x';
  import CategoryIcon from '@/components/CategoryIcon.svelte';
  import FileDrop from '@/components/FileDrop.svelte';
  import StatusBadge from '@/components/StatusBadge.svelte';
  import DocumentOutput from '@/components/output/DocumentOutput.svelte';
  import EvtxOutput from '@/components/output/EvtxOutput.svelte';
  import EmailAttachmentsOutput from '@/components/output/EmailAttachmentsOutput.svelte';
  import EmailUrlsOutput from '@/components/output/EmailUrlsOutput.svelte';
  import EmlOutput from '@/components/output/EmlOutput.svelte';
  import HashOutput from '@/components/output/HashOutput.svelte';
  import JsonOutput from '@/components/output/JsonOutput.svelte';
  import TextOutput from '@/components/output/TextOutput.svelte';
  import { router } from '@/app/router.svelte';
  import { ui } from '@/app/ui.svelte';
  import { session } from '@/core/app/session.svelte';
  import { registry, type RegistryEntry } from '@/core/registry';
  import { executeTool } from '@/core/runtime/executor';
  import { formatBytes } from '@/core/runtime/errors';
  import type {
    ProgressUpdate,
    RunnerInput,
    ToolLogEntry,
    ToolRunOutcome,
  } from '@/core/runtime/types';
  import { CATEGORY_MAP, DATA_TYPES, type DataType, type ToolField } from '@/core/schemas/types';
  import type { HashToolOutput } from '@/tools/encoding/hash';
  import type { XmlReport } from '@/tools/encoding/xml';
  import type { YamlReport } from '@/tools/encoding/yaml';
  import type { EmlAnalysis } from '@/tools/email/rfc822';
  import type { AttachmentReport } from '@/tools/email/attachment-extractor';
  import type { EmailUrlReport } from '@/tools/email/url-extractor';
  import type { EvtxProbeResult } from '@/tools/forensics/evtx-probe';
  import type { StringsOutput } from '@/tools/malware/strings';

  const entry = $derived(
    router.route.name === 'tool' && router.route.id ? registry.get(router.route.id) : undefined,
  );
  const manifest = $derived(entry?.manifest);
  const related = $derived(entry ? registry.related(entry) : []);
  const categoryMeta = $derived(manifest ? CATEGORY_MAP[manifest.category] : null);

  const filePort = $derived(manifest?.input.find((port) => port.type === DATA_TYPES.file));
  const acceptsFile = $derived(Boolean(filePort));
  const TEXT_INPUT_TYPES: ReadonlySet<DataType> = new Set([
    DATA_TYPES.text,
    DATA_TYPES.json,
    DATA_TYPES.yaml,
  ]);
  const acceptsText = $derived(
    manifest?.input.some((port) => TEXT_INPUT_TYPES.has(port.type)) ?? false,
  );
  const fields: ToolField[] = $derived(manifest?.ui?.fields ?? []);

  $effect(() => {
    const id = manifest?.id ?? null;
    if (id === paramsFor) return;
    paramsFor = id;
    const next: Record<string, string | boolean> = {};
    for (const field of fields) {
      if (field.type === 'toggle') next[field.key] = field.defaultValue === 'true';
      else if (field.defaultValue !== undefined) next[field.key] = field.defaultValue;
    }
    params = next;
  });

  let file = $state<File | null>(null);
  let text = $state('');
  let params = $state<Record<string, string | boolean>>({});
  let paramsFor: string | null = null;
  let running = $state(false);
  let progress = $state<ProgressUpdate | null>(null);
  let outcome = $state<ToolRunOutcome | null>(null);
  let logs = $state<ToolLogEntry[]>([]);
  let showLogs = $state(false);
  let controller: AbortController | null = null;

  const canRun = $derived(
    Boolean(manifest && manifest.status !== 'planned' && entry?.tool) &&
      !running &&
      (acceptsFile ? Boolean(file) || (acceptsText && text.trim().length > 0) : text.trim().length > 0),
  );

  const inputLabel = $derived(manifest?.ui?.inputLabel ?? 'Input');
  const placeholder = $derived(manifest?.ui?.placeholder ?? 'Paste input…');
  const warnings = $derived(outcome?.ok ? outcome.warnings : []);
  const failure = $derived(outcome && !outcome.ok ? outcome.error : null);
  const successOutput = $derived(outcome?.ok ? outcome.result.output : null);

  const outputFilename = $derived(
    manifest?.id === 'encoding.hash'
      ? 'hashes.json'
      : manifest?.id === 'email.eml-inspector'
        ? 'eml-analysis.json'
        : manifest?.id === 'email.header-analyzer'
          ? 'email-header-analysis.json'
          : manifest?.id === 'email.auth-results'
            ? 'email-auth-results.json'
            : manifest?.id === 'email.url-extractor'
              ? 'email-urls.json'
              : manifest?.id === 'email.attachment-extractor'
                ? 'email-attachments.json'
                : manifest?.id === 'windows.evtx-probe'
          ? 'evtx-container-probe.json'
          : manifest?.id === 'encoding.json'
            ? 'json-report.json'
            : manifest?.id === 'encoding.timestamp'
              ? 'timestamp-report.json'
              : manifest?.id === 'ioc.extractor'
                ? 'ioc-list.json'
                : manifest?.id === 'malware.file-type'
                  ? 'file-type.json'
                  : manifest?.id === 'malware.entropy'
                    ? 'entropy-report.json'
                    : manifest?.id === 'malware.strings'
                      ? 'strings.txt'
                      : manifest?.id === 'encoding.base32'
                        ? 'base32-output.txt'
                        : manifest?.id === 'encoding.hex'
                          ? 'hex-output.txt'
                          : manifest?.id === 'encoding.url'
                            ? 'url-output.txt'
                            : manifest?.id === 'encoding.html-entities'
                              ? 'html-entities-output.txt'
                              : manifest?.id === 'encoding.rot13'
                                ? 'rot-output.txt'
                                : manifest?.id === 'encoding.defang'
                                  ? 'indicators.txt'
                                  : manifest?.id === 'encoding.hmac'
                                    ? 'hmac.json'
                                    : manifest?.id === 'encoding.regex'
                                      ? 'regex-report.json'
                                      : manifest?.id === 'encoding.xml'
                                        ? 'xml-report.json'
                                        : manifest?.id === 'encoding.yaml'
                                          ? 'yaml-report.json'
                                          : manifest?.id === 'ioc.bulk-normalizer'
                                            ? 'ioc-normalized.json'
                                            : manifest?.id === 'encoding.unicode-inspector'
                                              ? 'unicode-report.json'
                                              : manifest?.id === 'encoding.xor'
                                                ? 'xor-output.txt'
                                                : manifest?.id === 'encoding.compress'
                                                  ? 'compression-report.json'
                                                  : manifest?.id === 'encoding.diff'
                                                    ? 'diff.patch'
                                                    : manifest?.id === 'encoding.base64-encode'
                                                      ? 'bluekit-encoded.txt'
                                                      : `${manifest?.id ?? 'bluekit'}.txt`,
  );

  function fileAccept(): string[] {
    return filePort?.accept ?? [];
  }

  function chooseFile(next: File | null): void {
    file = next;
    outcome = null;
  }

  function clearInput(): void {
    file = null;
    text = '';
    outcome = null;
    logs = [];
  }

  async function run(): Promise<void> {
    if (!entry?.tool || !manifest || running) return;
    if (!canRun) {
      ui.toast('Provide input before running this tool.', 'warning');
      return;
    }

    const input: RunnerInput = {};
    if (acceptsText && text.trim().length > 0) input.text = text;
    if (acceptsFile && file) input.file = file;
    if (fields.length > 0) input.params = { ...params };

    const active = new AbortController();
    controller = active;
    running = true;
    progress = null;
    outcome = null;
    logs = [];
    showLogs = false;

    try {
      const result = await executeTool(entry.tool, manifest, input, {
        signal: active.signal,
        onProgress: (update) => {
          progress = update;
        },
        onLog: (logEntry) => {
          logs = [...logs, logEntry].slice(-300);
        },
      });
      outcome = result;
      if (result.ok) {
        ui.toast(`${manifest.name} finished in ${result.durationMs} ms.`, 'success');
      } else if (result.error.code === 'cancelled') {
        ui.toast('Run cancelled.', 'warning');
      } else {
        ui.toast(result.error.message, 'danger');
      }
    } finally {
      running = false;
      controller = null;
      progress = null;
    }
  }

  function cancel(): void {
    if (!controller) return;
    ui.toast('Cancelling run…', 'info');
    controller.abort();
  }

  function onRunShortcut(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void run();
    }
  }

  onMount(() => {
    if (manifest && registry.has(manifest.id)) session.recordOpen(manifest.id);

    const handler = (event: KeyboardEvent): void => {
      if (ui.paletteOpen) return;
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void run();
      } else if (event.key === 'Escape' && running) {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
</script>

<div class="page tool-view">
  {#if !entry || !manifest}
    <div class="empty not-found">
      <CircleAlert size={22} strokeWidth={1.6} aria-hidden="true" />
      <h1>Tool not found</h1>
      <p>No catalog entry matches <span class="mono">{router.route.id ?? '(missing id)'}</span>.</p>
      <button type="button" class="btn" onclick={() => router.navigate('/tools')}>
        <ArrowLeft size={13} aria-hidden="true" /> Back to catalog
      </button>
    </div>
  {:else}
    <header class="tool-head">
      <div class="crumbs">
        <button type="button" class="crumb" onclick={() => router.navigate('/tools')}>All Tools</button>
        <ChevronRight size={11} aria-hidden="true" />
        <button
          type="button"
          class="crumb"
          onclick={() => router.navigate(`/tools/${manifest.category}`)}
        >
          {categoryMeta?.shortLabel ?? manifest.category}
        </button>
        <ChevronRight size={11} aria-hidden="true" />
        <span class="crumb current">{manifest.name}</span>
      </div>

      <div class="title-row">
        <span class="tool-icon"><CategoryIcon category={manifest.category} size={20} /></span>
        <div class="title-main">
          <div class="title-line">
            <h1>{manifest.name}</h1>
            <StatusBadge status={manifest.status} phase={manifest.phase} />
          </div>
          <p class="descr">{manifest.description}</p>
        </div>
        <div class="title-actions">
          <button
            type="button"
            class="btn btn-icon"
            class:active={session.isFavorite(manifest.id)}
            aria-label={session.isFavorite(manifest.id) ? 'Remove from favorites' : 'Add to favorites'}
            title={session.isFavorite(manifest.id) ? 'Remove from favorites' : 'Add to favorites'}
            onclick={() => session.toggleFavorite(manifest.id)}
          >
            <Star
              size={15}
              strokeWidth={1.9}
              fill={session.isFavorite(manifest.id) ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>

      <div class="meta-row">
        <span class="tag">runtime: {manifest.runtime}</span>
        <span class="tag">network: {manifest.network}</span>
        <span class="tag">{manifest.dataHandling}</span>
        <span class="tag">phase {manifest.phase}</span>
        <span class="tag">v{manifest.version}</span>
        {#each manifest.tags.slice(0, 6) as tag}
          <span class="tag dim">{tag}</span>
        {/each}
      </div>
    </header>

    {#if manifest.status === 'planned'}
      <section class="panel planned">
        <div class="planned-head">
          <span class="planned-badge">Planned · Phase {manifest.phase}</span>
          <span class="faint">Catalog entry only</span>
        </div>
        <div class="planned-body">
          <p>
            <strong>{manifest.name}</strong> is on the roadmap but has no implementation in this build.
            The registry lists it so the intended surface stays searchable and honest; it cannot be executed.
          </p>
          <dl class="planned-grid">
            <dt>Runtime</dt>
            <dd class="mono">{manifest.runtime}</dd>
            <dt>Network</dt>
            <dd class="mono">{manifest.network}</dd>
            <dt>Capabilities</dt>
            <dd class="mono">{manifest.capabilities.length ? manifest.capabilities.join(', ') : 'none declared'}</dd>
            <dt>Inputs</dt>
            <dd class="mono">{manifest.input.map((port) => port.type).join(', ') || '—'}</dd>
            <dt>Outputs</dt>
            <dd class="mono">{manifest.output.map((port) => port.type).join(', ') || '—'}</dd>
          </dl>
          <div class="planned-actions">
            <button type="button" class="btn" onclick={() => router.navigate(`/tools/${manifest.category}`)}>
              Browse {categoryMeta?.shortLabel ?? 'category'} tools
            </button>
          </div>
        </div>
      </section>
    {:else}
      <div class="runner-grid">
        <section class="panel input-panel">
          <div class="panel-head">
            <span class="panel-title">Input</span>
            <div class="panel-tools">
              <span class="faint xsmall">{inputLabel}</span>
              {#if text || file}
                <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Clear input" title="Clear input" onclick={clearInput}>
                  <X size={13} />
                </button>
              {/if}
            </div>
          </div>

          <div class="panel-body input-body">
            {#if acceptsFile}
              <FileDrop accept={fileAccept()} {file} disabled={running} onselect={chooseFile} />
            {/if}

            {#if acceptsText}
              {#if acceptsFile}
                <div class="or"><span>or paste text</span></div>
              {/if}
              <textarea
                class="textarea input-text"
                rows={acceptsFile ? 7 : 12}
                bind:value={text}
                {placeholder}
                disabled={running}
                spellcheck="false"
                aria-label={inputLabel}
                onkeydown={onRunShortcut}
              ></textarea>
              <div class="input-hint">
                <span>{text.length.toLocaleString()} characters</span>
                {#if acceptsFile && file}
                  <span class="warn-text">A selected file takes precedence over pasted text.</span>
                {:else}
                  <span>Processed in this browser. Never uploaded.</span>
                {/if}
              </div>
            {:else if acceptsFile}
              <div class="input-hint">
                <span>This tool reads a local file only.</span>
                <span>Never uploaded.</span>
              </div>
            {/if}

            {#if fields.length > 0}
              <div class="fields" class:with-input={acceptsText || acceptsFile}>
                {#each fields as field (field.key)}
                  <label class="field" class:wide={field.type !== 'select' && field.type !== 'toggle'}>
                    <span class="field-label">{field.label}</span>
                    {#if field.type === 'select'}
                      <select
                        class="select"
                        disabled={running}
                        value={String(params[field.key] ?? field.defaultValue ?? '')}
                        onchange={(event) => (params[field.key] = event.currentTarget.value)}
                      >
                        {#each field.options ?? [] as option (option.value)}
                          <option value={option.value}>{option.label}</option>
                        {/each}
                      </select>
                    {:else if field.type === 'toggle'}
                      <input
                        type="checkbox"
                        class="check"
                        disabled={running}
                        checked={params[field.key] === true}
                        onchange={(event) => (params[field.key] = event.currentTarget.checked)}
                      />
                    {:else}
                      <input
                        type="text"
                        class="input field-input"
                        disabled={running}
                        placeholder={field.placeholder ?? ''}
                        value={String(params[field.key] ?? field.defaultValue ?? '')}
                        oninput={(event) => (params[field.key] = event.currentTarget.value)}
                        onkeydown={onRunShortcut}
                      />
                    {/if}
                    {#if field.help}<span class="field-help">{field.help}</span>{/if}
                  </label>
                {/each}
              </div>
            {/if}
          </div>

          <div class="run-bar">
            <button type="button" class="btn btn-primary" disabled={!canRun || running} onclick={run}>
              {#if running}
                <span class="spin-dot"></span> Running…
              {:else}
                <Play size={13} strokeWidth={2} aria-hidden="true" /> Run tool
              {/if}
            </button>
            {#if running}
              <button type="button" class="btn" onclick={cancel}>
                <Square size={12} aria-hidden="true" /> Cancel
              </button>
            {/if}
            <span class="kbd">Ctrl ↵</span>
            <span class="grow"></span>
            <span class="local-note">
              <ShieldCheck size={12} strokeWidth={1.9} aria-hidden="true" />
              local-only
            </span>
          </div>

          {#if running}
            <div class="progress" aria-live="polite">
              <div class="progress-track">
                <span
                  class="progress-fill"
                  class:indeterminate={progress?.pct === undefined}
                  style:width={progress?.pct !== undefined ? `${Math.max(0, Math.min(100, progress.pct))}%` : undefined}
                ></span>
              </div>
              <span class="progress-label">{progress?.message ?? 'Starting…'}</span>
            </div>
          {/if}
        </section>

        <aside class="side">
          <section class="panel meta-panel">
            <div class="panel-head"><span class="panel-title">Contract</span></div>
            <dl class="meta-list">
              <dt>Runtime</dt>
              <dd class="mono">{manifest.runtime}</dd>
              <dt>Network</dt>
              <dd class="mono">{manifest.network === 'none' ? 'none (offline)' : manifest.network}</dd>
              <dt>Data</dt>
              <dd class="mono">{manifest.dataHandling}</dd>
              <dt>Inputs</dt>
              <dd class="mono">
                {#each manifest.input as port, index (index)}
                  {port.type}{#if port.accept} <span class="faint">({port.accept.join(', ')})</span>{/if}{#if index < manifest.input.length - 1}<br />{/if}
                {/each}
                {#if manifest.input.length === 0}<span class="faint">—</span>{/if}
              </dd>
              <dt>Outputs</dt>
              <dd class="mono">
                {#each manifest.output as port, index (index)}
                  {port.type}{#if port.format} <span class="faint">({port.format})</span>{/if}{#if index < manifest.output.length - 1}<br />{/if}
                {/each}
                {#if manifest.output.length === 0}<span class="faint">—</span>{/if}
              </dd>
              <dt>Capabilities</dt>
              <dd class="mono">
                {manifest.capabilities.length ? manifest.capabilities.join(', ') : 'none'}
              </dd>
              {#if manifest.limits}
                <dt>Input limit</dt>
                <dd class="mono">{formatBytes(manifest.limits.maxInputBytes)}</dd>
                <dt>Time budget</dt>
                <dd class="mono">{(manifest.limits.timeoutMs / 1000).toLocaleString()} s</dd>
              {/if}
            </dl>
          </section>

          {#if related.length > 0}
            <section class="panel">
              <div class="panel-head"><span class="panel-title">Related</span></div>
              <div class="panel-body flush">
                {#each related as relatedEntry (relatedEntry.manifest.id)}
                  <button type="button" class="related" onclick={() => router.tool(relatedEntry.manifest.id)}>
                    <CategoryIcon category={relatedEntry.manifest.category} size={13} />
                    <span class="related-name">{relatedEntry.manifest.name}</span>
                    <StatusBadge status={relatedEntry.manifest.status} />
                    <ChevronRight size={12} class="faint" aria-hidden="true" />
                  </button>
                {/each}
              </div>
            </section>
          {/if}
        </aside>
      </div>

      {#if outcome}
        <section class="panel output-panel">
          <div class="panel-head">
            <span class="panel-title">Result</span>
            <div class="result-meta">
              {#if outcome.ok}
                <span class="badge badge-success badge-dot">Completed</span>
                <span class="mono faint">{outcome.durationMs} ms</span>
              {:else}
                <span class="badge badge-danger badge-dot">Failed</span>
                <span class="mono faint">{outcome.durationMs} ms</span>
              {/if}
              {#if warnings.length > 0}
                <span class="badge badge-warning">{warnings.length} warning{warnings.length === 1 ? '' : 's'}</span>
              {/if}
            </div>
          </div>

          {#if failure}
            <div class="failure">
              <div class="failure-title">
                <CircleAlert size={15} strokeWidth={1.9} aria-hidden="true" />
                <span class="mono">{failure.code}</span>
                <span>{failure.message}</span>
              </div>
              {#if failure.details}
                <pre class="failure-details mono">{JSON.stringify(failure.details, null, 2)}</pre>
              {/if}
            </div>
          {:else}
            {#if warnings.length > 0}
              <div class="warning-strip">
                {#each warnings as warning}
                  <div class="warning-row">
                    <TriangleAlert size={13} strokeWidth={1.9} aria-hidden="true" />
                    <span class="mono xsmall">{warning.code}</span>
                    <span>{warning.message}</span>
                  </div>
                {/each}
              </div>
            {/if}

            {#if manifest.id === 'encoding.hash' && successOutput}
              <HashOutput value={successOutput as HashToolOutput} />
            {:else if manifest.id === 'email.eml-inspector' && successOutput}
              <EmlOutput value={successOutput as EmlAnalysis} />
            {:else if manifest.id === 'email.attachment-extractor' && successOutput}
              <EmailAttachmentsOutput value={successOutput as AttachmentReport} />
            {:else if manifest.id === 'email.url-extractor' && successOutput}
              <EmailUrlsOutput value={successOutput as EmailUrlReport} />
            {:else if manifest.id === 'windows.evtx-probe' && successOutput}
              <EvtxOutput value={successOutput as EvtxProbeResult} />
            {:else if manifest.id === 'encoding.yaml' && successOutput}
              {@const yaml = successOutput as YamlReport}
              <DocumentOutput
                valid={yaml.valid}
                text={yaml.formatted}
                errors={yaml.errors}
                filename="yaml-report.yaml"
                language="YAML"
              />
            {:else if manifest.id === 'encoding.xml' && successOutput}
              {@const xml = successOutput as XmlReport}
              <DocumentOutput
                valid={xml.wellFormed}
                text={xml.formatted}
                error={xml.error}
                filename="xml-report.xml"
                language="XML"
              />
            {:else if manifest.id === 'malware.strings' && successOutput}
              {@const strings = successOutput as StringsOutput}
              <TextOutput
                value={strings.text}
                filename="strings.txt"
                note={`${strings.extracted.toLocaleString()} strings · ASCII ${strings.asciiCount.toLocaleString()} · UTF-16LE ${strings.utf16Count.toLocaleString()}${strings.truncated ? ' · output truncated' : ''}`}
              />
            {:else if typeof successOutput === 'string'}
              <TextOutput
                value={successOutput}
                filename={outputFilename}
                mime={manifest.id === 'encoding.base64-encode' ? 'text/plain;charset=utf-8' : 'text/plain;charset=utf-8'}
              />
            {:else}
              <JsonOutput value={successOutput} filename={outputFilename} />
            {/if}
          {/if}

          <div class="log-section">
            <button type="button" class="log-toggle" aria-expanded={showLogs} onclick={() => (showLogs = !showLogs)}>
              <ChevronRight size={12} class={showLogs ? 'rotated' : ''} aria-hidden="true" />
              Run log
              <span class="mono faint">{logs.length}</span>
            </button>
            {#if showLogs}
              <div class="log-list mono">
                {#if logs.length === 0}
                  <div class="log-empty">No log entries.</div>
                {:else}
                  {#each logs as log}
                    <div class="log-row">
                      <span class="log-time">{log.at.slice(11, 23)}</span>
                      <span class="log-level {log.level}">{log.level}</span>
                      <span class="log-msg">{log.message}</span>
                    </div>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
        </section>
      {/if}

      {#if !outcome && !running}
        <div class="idle-note">
          <CircleCheck size={13} strokeWidth={1.9} aria-hidden="true" />
          Results appear here. Inputs stay in memory unless you explicitly save or export them.
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .tool-view {
    max-width: 1120px;
  }

  .crumbs {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
    color: var(--muted-2);
    font-size: 10px;
  }

  .crumb {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--muted-2);
    font-size: inherit;
  }

  .crumb:hover {
    color: var(--accent);
  }

  .crumb.current {
    color: var(--muted);
  }

  .title-row {
    display: flex;
    align-items: flex-start;
    gap: 11px;
  }

  .tool-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex: 0 0 auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--accent-strong);
  }

  .title-main {
    flex: 1 1 auto;
    min-width: 0;
  }

  .title-line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  h1 {
    font-size: 20px;
    line-height: 1.25;
  }

  .descr {
    margin-top: 4px;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.55;
    max-width: 760px;
  }

  .title-actions {
    display: flex;
    gap: 5px;
    flex: 0 0 auto;
    padding-top: 3px;
  }

  .title-actions .btn.active {
    border-color: var(--warning);
    color: var(--warning);
    background: var(--warning-soft);
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 11px 0 16px;
  }

  .meta-row .tag {
    height: 19px;
  }

  .meta-row .tag.dim {
    color: var(--muted-2);
  }

  .runner-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 284px;
    gap: 14px;
    align-items: start;
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .panel-tools {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .input-body {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .or {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted-2);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .or::before,
  .or::after {
    content: '';
    height: 1px;
    flex: 1 1 auto;
    background: var(--border-soft);
  }

  .input-text {
    min-height: 96px;
  }

  .input-hint {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--muted-2);
    font-size: 10px;
  }

  .warn-text {
    color: var(--warning);
  }

  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 9px;
  }

  .fields.with-input {
    margin-top: 2px;
    padding-top: 9px;
    border-top: 1px dashed var(--border-soft);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .field.wide {
    grid-column: 1 / -1;
  }

  .field-label {
    color: var(--muted);
    font-size: 9.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .field-input {
    font-family: var(--font-mono);
    font-size: 11.5px;
  }

  .field-help {
    color: var(--muted-2);
    font-size: 9.5px;
    line-height: 1.4;
  }

  .check {
    width: 15px;
    height: 15px;
    margin: 7px 0 0;
    accent-color: var(--accent);
  }

  .run-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 11px;
    border-top: 1px solid var(--border-soft);
    background: rgba(255, 255, 255, 0.014);
  }

  .grow {
    flex: 1 1 auto;
  }

  .local-note {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--muted-2);
    font-size: 10px;
  }

  .progress {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 11px;
    border-top: 1px solid var(--border-soft);
    background: var(--bg-elevated);
  }

  .progress-track {
    position: relative;
    width: 132px;
    height: 3px;
    flex: 0 0 auto;
    border-radius: 2px;
    background: var(--surface-3);
    overflow: hidden;
  }

  .progress-fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 120ms linear;
  }

  .progress-fill.indeterminate {
    width: 38% !important;
    animation: progress-slide 1.1s ease-in-out infinite;
  }

  .progress-label {
    color: var(--muted);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @keyframes progress-slide {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(360%);
    }
  }

  .spin-dot {
    width: 10px;
    height: 10px;
    border: 1.5px solid rgba(0, 0, 0, 0.25);
    border-top-color: var(--accent-ink);
    border-radius: 50%;
    animation: bk-spin 700ms linear infinite;
  }

  .meta-list {
    display: grid;
    grid-template-columns: 78px minmax(0, 1fr);
    margin: 0;
    padding: 9px 11px;
    row-gap: 6px;
    column-gap: 8px;
    font-size: 10.5px;
  }

  .meta-list dt {
    color: var(--muted-2);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding-top: 1px;
  }

  .meta-list dd {
    margin: 0;
    min-width: 0;
    color: var(--muted);
    font-size: 10px;
    overflow-wrap: anywhere;
  }

  .related {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    min-height: 30px;
    padding: 5px 10px;
    border: 0;
    border-bottom: 1px solid var(--border-soft);
    background: transparent;
    color: var(--muted);
    text-align: left;
  }

  .related:last-child {
    border-bottom: 0;
  }

  .related:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .related-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11.5px;
  }

  .output-panel {
    margin-top: 14px;
  }

  .result-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .failure {
    padding: 11px 12px;
    border-bottom: 1px solid var(--border-soft);
    background: var(--danger-soft);
  }

  .failure-title {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: #f0a3a3;
    font-size: 12px;
    line-height: 1.5;
  }

  .failure-title :global(svg) {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  .failure-title .mono {
    flex: 0 0 auto;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding-top: 1px;
  }

  .failure-details {
    margin-top: 8px;
    padding: 8px;
    border: 1px solid rgba(224, 108, 108, 0.24);
    border-radius: var(--radius);
    background: rgba(0, 0, 0, 0.18);
    color: var(--muted);
    font-size: 10px;
    overflow: auto;
    max-height: 160px;
  }

  .warning-strip {
    border-bottom: 1px solid var(--border-soft);
    background: rgba(216, 166, 87, 0.05);
  }

  .warning-row {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    padding: 6px 11px;
    color: #e5c28a;
    font-size: 11px;
    line-height: 1.5;
  }

  .warning-row :global(svg) {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  .warning-row .mono {
    flex: 0 0 auto;
    font-size: 9px;
    text-transform: uppercase;
    padding-top: 1px;
  }

  .log-section {
    border-top: 1px solid var(--border-soft);
  }

  .log-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 31px;
    padding: 0 11px;
    border: 0;
    background: var(--surface-1);
    color: var(--muted);
    font-size: 10.5px;
    text-align: left;
  }

  .log-toggle:hover {
    background: var(--surface-2);
  }

  .log-toggle :global(svg) {
    transition: transform 120ms ease;
  }

  .log-toggle :global(svg.rotated) {
    transform: rotate(90deg);
  }

  .log-list {
    max-height: 220px;
    overflow: auto;
    padding: 5px 0;
    border-top: 1px solid var(--border-soft);
    background: var(--bg-elevated);
    font-size: 10px;
  }

  .log-row {
    display: flex;
    gap: 8px;
    padding: 2px 11px;
    line-height: 1.5;
  }

  .log-time {
    flex: 0 0 auto;
    color: var(--muted-2);
  }

  .log-level {
    flex: 0 0 auto;
    width: 38px;
    text-transform: uppercase;
    font-size: 8.5px;
    padding-top: 1px;
    color: var(--muted-2);
  }

  .log-level.warn {
    color: var(--warning);
  }

  .log-level.error {
    color: var(--danger);
  }

  .log-level.info {
    color: var(--accent);
  }

  .log-msg {
    color: var(--muted);
    overflow-wrap: anywhere;
  }

  .log-empty {
    padding: 6px 11px;
    color: var(--muted-2);
  }

  .idle-note {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 14px;
    padding: 8px 10px;
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    color: var(--muted-2);
    font-size: 10.5px;
  }

  .idle-note :global(svg) {
    color: var(--success);
    flex: 0 0 auto;
  }

  .not-found {
    min-height: 320px;
  }

  .not-found h1 {
    font-size: 18px;
  }

  .not-found .mono {
    color: var(--text);
  }

  .planned {
    margin-top: 4px;
  }

  .planned-head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 11px 13px;
    border-bottom: 1px solid rgba(216, 166, 87, 0.24);
    background: var(--warning-soft);
  }

  .planned-badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 7px;
    border: 1px solid rgba(216, 166, 87, 0.35);
    border-radius: 3px;
    color: #e5c28a;
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .planned-body {
    padding: 14px;
  }

  .planned-body p {
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.6;
    max-width: 760px;
  }

  .planned-body strong {
    color: var(--text-strong);
  }

  .planned-grid {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 7px 12px;
    margin: 14px 0 0;
    padding: 11px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--bg-elevated);
  }

  .planned-grid dt {
    color: var(--muted-2);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .planned-grid dd {
    margin: 0;
    color: var(--muted);
    font-size: 10.5px;
    overflow-wrap: anywhere;
  }

  .planned-actions {
    margin-top: 14px;
  }

  @media (max-width: 980px) {
    .runner-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .side {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 680px) {
    .side {
      grid-template-columns: minmax(0, 1fr);
    }

    .title-actions {
      padding-top: 0;
    }

    .meta-row .tag:nth-child(n + 5) {
      display: none;
    }

    .run-bar {
      flex-wrap: wrap;
    }

    .input-hint {
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }
  }
</style>
