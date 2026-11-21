<script lang="ts">
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Boxes from 'lucide-svelte/icons/boxes';
  import Command from 'lucide-svelte/icons/command';
  import Cpu from 'lucide-svelte/icons/cpu';
  import Database from 'lucide-svelte/icons/database';
  import History from 'lucide-svelte/icons/history';
  import Search from 'lucide-svelte/icons/search';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import Star from 'lucide-svelte/icons/star';
  import ToolRow from '@/components/ToolRow.svelte';
  import { router } from '@/app/router.svelte';
  import { ui } from '@/app/ui.svelte';
  import { session } from '@/core/app/session.svelte';
  import { registry, type RegistryEntry } from '@/core/registry';
  import { CONNECTORS_ENABLED } from '@/core/integrations/providers';

  const available = registry.available().length;
  const prototypes = registry.prototypes().length;
  const planned = registry.planned().length;

  const quickIds = ['encoding.base64-encode', 'encoding.hash', 'email.eml-inspector', 'windows.evtx-probe'];
  const quickTools = quickIds
    .map((id) => registry.get(id))
    .filter((entry): entry is RegistryEntry => Boolean(entry));

  const favoriteEntries = $derived(
    session.favorites
      .map((id) => registry.get(id))
      .filter((entry): entry is RegistryEntry => Boolean(entry))
      .slice(0, 5),
  );

  const recentEntries = $derived(
    session.recents
      .map((recent) => registry.get(recent.id))
      .filter((entry): entry is RegistryEntry => Boolean(entry))
      .filter((entry) => !session.isFavorite(entry.manifest.id))
      .slice(0, 5),
  );

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/u.test(navigator.platform);
</script>

<div class="page overview">
  <header class="page-head">
    <div class="head-copy">
      <div class="eyebrow">Blue Team workbench · local-first</div>
      <h1>Overview</h1>
      <p class="lede">
        Parse, inspect, hash, and triage security artifacts in this browser. Nothing is uploaded, and no
        BlueKit service sits behind the app.
      </p>
    </div>
    <div class="head-actions">
      <button type="button" class="search-trigger" onclick={() => ui.openPalette()}>
        <Search size={15} strokeWidth={2} aria-hidden="true" />
        <span>Search the workbench…</span>
        <span class="kbd">{isMac ? '⌘' : 'Ctrl'} K</span>
      </button>
      <button type="button" class="btn" onclick={() => router.navigate('/tools')}>
        <Boxes size={14} strokeWidth={1.8} aria-hidden="true" />
        Browse catalog
      </button>
    </div>
  </header>

  <div class="stat-row">
    <div class="stat">
      <span class="stat-value mono">{available}</span>
      <span class="stat-label">Available</span>
      <span class="stat-note">shipped tools</span>
    </div>
    <div class="stat">
      <span class="stat-value mono">{prototypes}</span>
      <span class="stat-label">Prototype</span>
      <span class="stat-note">Phase 0 spikes</span>
    </div>
    <div class="stat">
      <span class="stat-value mono">{planned}</span>
      <span class="stat-label">Planned</span>
      <span class="stat-note">catalog only</span>
    </div>
    <div class="stat">
      <span class="stat-value mono">{session.tabs.length}</span>
      <span class="stat-label">Open tabs</span>
      <span class="stat-note">this workspace</span>
    </div>
  </div>

  <div class="grid">
    <section class="panel">
      <div class="panel-head">
        <span class="panel-title"><ShieldCheck size={13} strokeWidth={1.9} aria-hidden="true" /> Start here</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => router.navigate('/tools')}>
          All tools <ArrowRight size={12} aria-hidden="true" />
        </button>
      </div>
      <div class="panel-body flush">
        {#each quickTools as entry (entry.manifest.id)}
          <ToolRow {entry} />
        {/each}
      </div>
    </section>

    <div class="stack">
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title"><Star size={13} strokeWidth={1.9} aria-hidden="true" /> Favorites</span>
          <span class="faint xsmall">{favoriteEntries.length}</span>
        </div>
        <div class="panel-body flush">
          {#if favoriteEntries.length === 0}
            <div class="empty compact">
              <span>No favorites yet.</span>
              <span class="faint">Star a tool from its header to pin it here.</span>
            </div>
          {:else}
            {#each favoriteEntries as entry (entry.manifest.id)}
              <ToolRow {entry} />
            {/each}
          {/if}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span class="panel-title"><History size={13} strokeWidth={1.9} aria-hidden="true" /> Recent</span>
          <span class="faint xsmall">{recentEntries.length}</span>
        </div>
        <div class="panel-body flush">
          {#if recentEntries.length === 0}
            <div class="empty compact">
              <span>Nothing opened yet.</span>
              <span class="faint">Use Ctrl K or the catalog to begin.</span>
            </div>
          {:else}
            {#each recentEntries as entry (entry.manifest.id)}
              <ToolRow {entry} />
            {/each}
          {/if}
        </div>
      </section>
    </div>
  </div>

  <section class="panel posture">
    <div class="panel-head">
      <span class="panel-title">Local posture</span>
      <span class="badge badge-success badge-dot">No external requests</span>
    </div>
    <div class="posture-grid">
      <div class="posture-item">
        <span class="posture-icon"><Cpu size={15} strokeWidth={1.8} aria-hidden="true" /></span>
        <div>
          <div class="posture-label">Execution</div>
          <div class="posture-value">
            Main thread for UI, dedicated worker for CPU-heavy tools. WASM available.
          </div>
        </div>
      </div>
      <div class="posture-item">
        <span class="posture-icon"><Database size={15} strokeWidth={1.8} aria-hidden="true" /></span>
        <div>
          <div class="posture-label">Persistence</div>
          <div class="posture-value">
            {session.persistenceEnabled
              ? 'IndexedDB is active for settings, favorites, recents, and tabs.'
              : 'Memory fallback is active. Export before closing this tab.'}
          </div>
        </div>
      </div>
      <div class="posture-item">
        <span class="posture-icon"><ShieldCheck size={15} strokeWidth={1.8} aria-hidden="true" /></span>
        <div>
          <div class="posture-label">Integrations</div>
          <div class="posture-value">
            {CONNECTORS_ENABLED
              ? 'External connectors are enabled.'
              : 'No provider connectors enabled. CORS and terms are documented before activation.'}
          </div>
        </div>
      </div>
      <div class="posture-item">
        <span class="posture-icon"><Command size={15} strokeWidth={1.8} aria-hidden="true" /></span>
        <div>
          <div class="posture-label">Keyboard</div>
          <div class="posture-value">
            <span class="mono">{isMac ? '⌘' : 'Ctrl'} K</span> palette · <span class="mono">{isMac ? '⌘' : 'Ctrl'} ↵</span>
            run tool · <span class="mono">Esc</span> dismiss.
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<style>
  .overview {
    max-width: 1180px;
  }

  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 22px;
    margin-bottom: 18px;
  }

  .head-copy {
    max-width: 620px;
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

  .head-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    padding-top: 7px;
  }

  .search-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 260px;
    height: 28px;
    padding: 0 6px 0 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-1);
    color: var(--muted);
    font-size: 11.5px;
    text-align: left;
  }

  .search-trigger:hover {
    border-color: var(--border-strong);
    background: var(--surface-2);
  }

  .search-trigger span:first-of-type {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stat-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
    margin-bottom: 14px;
    overflow: hidden;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 11px 13px;
    border-right: 1px solid var(--border-soft);
  }

  .stat:last-child {
    border-right: 0;
  }

  .stat-value {
    color: var(--text-strong);
    font-size: 21px;
    line-height: 1.1;
    font-weight: 500;
  }

  .stat-label {
    color: var(--text);
    font-size: 11px;
    font-weight: 550;
    margin-top: 2px;
  }

  .stat-note {
    color: var(--muted-2);
    font-size: 9.5px;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.32fr) minmax(0, 1fr);
    gap: 14px;
    align-items: start;
    margin-bottom: 14px;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .compact {
    padding: 18px 14px;
  }

  .posture-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .posture-item {
    display: flex;
    gap: 10px;
    padding: 11px 13px;
    border-bottom: 1px solid var(--border-soft);
  }

  .posture-item:nth-child(odd) {
    border-right: 1px solid var(--border-soft);
  }

  .posture-item:nth-last-child(-n + 2) {
    border-bottom: 0;
  }

  .posture-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 27px;
    height: 27px;
    flex: 0 0 auto;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--muted);
  }

  .posture-label {
    color: var(--text);
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 2px;
  }

  .posture-value {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.5;
  }

  @media (max-width: 980px) {
    .page-head {
      flex-direction: column;
      gap: 12px;
    }

    .head-actions {
      padding-top: 0;
      width: 100%;
    }

    .search-trigger {
      width: auto;
      flex: 1 1 auto;
    }

    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 720px) {
    .stat-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .stat:nth-child(2) {
      border-right: 0;
    }

    .stat:nth-child(-n + 2) {
      border-bottom: 1px solid var(--border-soft);
    }

    .posture-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .posture-item:nth-child(odd) {
      border-right: 0;
    }

    .posture-item:nth-last-child(2) {
      border-bottom: 1px solid var(--border-soft);
    }
  }

  @media (max-width: 520px) {
    .head-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .search-trigger {
      width: 100%;
    }
  }
</style>
