<script lang="ts">
  import BookOpen from 'lucide-svelte/icons/book-open';
  import FolderSearch from 'lucide-svelte/icons/folder-search';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import Workflow from 'lucide-svelte/icons/workflow';
  import ToolRow from '@/components/ToolRow.svelte';
  import type { IconComponent } from '@/components/icon';
  import { registry, type RegistryEntry } from '@/core/registry';

  type PlannedKind = 'recipes' | 'investigations' | 'rules' | 'reference';

  let { kind }: { kind: PlannedKind } = $props();

  interface Meta {
    eyebrow: string;
    title: string;
    phase: number;
    description: string;
    icon: IconComponent;
    bullets: string[];
    filter: (entry: RegistryEntry) => boolean;
  }

  const META: Record<PlannedKind, Meta> = {
    recipes: {
      eyebrow: 'Typed pipelines',
      title: 'Recipes',
      phase: 7,
      description:
        'Chain tools through typed ports, validate each step, and save a reproducible local pipeline. Recipes are planned; no pipeline engine ships in this build.',
      icon: Workflow,
      bullets: [
        'Typed input/output ports with compatibility checks before a run',
        'Step-by-step execution with cancellable workers',
        'Saved recipes and run history in local storage',
        'Export and import with schema versioning',
      ],
      filter: (entry) => entry.manifest.status === 'planned' && entry.manifest.phase === 7,
    },
    investigations: {
      eyebrow: 'Local case workspace',
      title: 'Investigations',
      phase: 7,
      description:
        'Group evidence, indicators, notes, and timelines into local case folders. No case data leaves the browser; export is explicit and user-controlled.',
      icon: FolderSearch,
      bullets: [
        'Local investigation folders with evidence links',
        'Indicator and entity lists with provenance',
        'Timeline assembly from normalized artifacts',
        'Self-contained report export',
      ],
      filter: (entry) =>
        entry.manifest.status === 'planned' &&
        (entry.manifest.phase === 7 || entry.manifest.category === 'forensics'),
    },
    rules: {
      eyebrow: 'Detection engineering',
      title: 'Rule Studio',
      phase: 4,
      description:
        'Author and validate YARA and Sigma rules, then test the documented local subset. Phase 0 proved browser-side compilation and schema validation; the editing surface is planned.',
      icon: ShieldCheck,
      bullets: [
        'YARA-X WASM compilation and local scanning',
        'Sigma YAML validation against the official JSON schema',
        'Documented local test subset with explicit unsupported-feature reporting',
        'Rule collections, import/export, and attribution',
      ],
      filter: (entry) => entry.manifest.status === 'planned' && entry.manifest.category === 'detection',
    },
    reference: {
      eyebrow: 'Lookup datasets',
      title: 'Reference',
      phase: 8,
      description:
        'Offline lookups for Event IDs, NTSTATUS values, ATT&CK techniques, ports, and file signatures. Datasets require version, license, checksum, and release timestamp before bundling.',
      icon: BookOpen,
      bullets: [
        'Windows Event ID and NTSTATUS references',
        'MITRE ATT&CK technique metadata',
        'IANA ports and curated protocol notes',
        'File signature reference with provenance',
      ],
      filter: (entry) =>
        entry.manifest.status === 'planned' &&
        (entry.manifest.category === 'utilities' || entry.manifest.id === 'windows.event-id-reference'),
    },
  };

  const meta = $derived(META[kind]);
  const entries = $derived(registry.entries.filter(meta.filter).slice(0, 10));
  const Icon = $derived(meta.icon);

  const phaseLabel = $derived(
    meta.phase === 4
      ? 'Phase 4 · Rule Studio'
      : meta.phase === 7
        ? 'Phase 7 · Recipes & investigations'
        : 'Phase 8 · Dataset ecosystem',
  );
</script>

<div class="page planned-view">
  <header class="page-head">
    <span class="head-icon"><Icon size={21} strokeWidth={1.7} aria-hidden="true" /></span>
    <div class="head-copy">
      <div class="eyebrow">{meta.eyebrow}</div>
      <h1>{meta.title}</h1>
      <p class="lede">{meta.description}</p>
      <div class="phase-line">
        <span class="badge badge-warning badge-dot">Planned · {phaseLabel}</span>
        <span class="faint xsmall">No implementation in this build</span>
      </div>
    </div>
  </header>

  <div class="grid">
    <section class="panel">
      <div class="panel-head"><span class="panel-title">Intended scope</span></div>
      <div class="panel-body">
        <ul class="scope-list">
          {#each meta.bullets as bullet}
            <li>{bullet}</li>
          {/each}
        </ul>
        <p class="scope-note">
          This page is a roadmap placeholder, not a simulated feature. Nothing on it can be executed until the
          corresponding phase lands with tests, limits, and documentation.
        </p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">Related catalog entries</span>
        <span class="faint xsmall">{entries.length}</span>
      </div>
      <div class="panel-body flush">
        {#if entries.length === 0}
          <div class="empty">
            <span>No catalog entries are assigned to this area yet.</span>
          </div>
        {:else}
          {#each entries as entry (entry.manifest.id)}
            <ToolRow {entry} />
          {/each}
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  .planned-view {
    max-width: 1000px;
  }

  .page-head {
    display: flex;
    gap: 13px;
    margin-bottom: 18px;
  }

  .head-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    flex: 0 0 auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--warning);
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
    max-width: 700px;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.6;
  }

  .phase-line {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-top: 10px;
    flex-wrap: wrap;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: 14px;
    align-items: start;
  }

  .scope-list {
    margin: 0;
    padding-left: 17px;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.65;
  }

  .scope-list li::marker {
    color: var(--accent);
  }

  .scope-note {
    margin-top: 13px;
    padding: 9px 10px;
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    color: var(--muted-2);
    font-size: 10.5px;
    line-height: 1.5;
  }

  @media (max-width: 820px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
