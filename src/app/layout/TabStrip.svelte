<script lang="ts">
  import Command from 'lucide-svelte/icons/command';
  import Terminal from 'lucide-svelte/icons/terminal';
  import X from 'lucide-svelte/icons/x';
  import { router } from '@/app/router.svelte';
  import { ui } from '@/app/ui.svelte';
  import { session } from '@/core/app/session.svelte';
  import { registry } from '@/core/registry';

  const activeId = $derived(router.route.name === 'tool' ? router.route.id : undefined);

  function activate(id: string): void {
    router.tool(id);
  }

  function close(event: MouseEvent, id: string): void {
    event.stopPropagation();
    const next = session.closeTab(id);
    if (activeId === id) {
      if (next) router.tool(next);
      else router.navigate('/tools');
    }
  }
</script>

<div class="tabstrip" aria-label="Open tool tabs">
  {#if session.tabs.length === 0}
    <span class="workspace-label">
      <Terminal size={13} strokeWidth={1.8} aria-hidden="true" />
      Workspace
    </span>
    <span class="hint">Open a tool to start · <span class="mono">Ctrl K</span> to search</span>
  {:else}
    <div class="tabs" role="tablist" aria-label="Open tools">
      {#each session.tabs as tab (tab.id)}
        {@const entry = registry.get(tab.id)}
        <div class="tab" class:active={activeId === tab.id}>
          <button
            type="button"
            class="tab-main"
            role="tab"
            aria-selected={activeId === tab.id}
            title={entry?.manifest.description ?? tab.title}
            tabindex={activeId === tab.id ? 0 : -1}
            onclick={() => activate(tab.id)}
          >
            <span class="tab-dot" class:available={entry?.manifest.status === 'available'}></span>
            <span class="tab-title">{tab.title}</span>
          </button>
          <button
            type="button"
            class="tab-close"
            aria-label={`Close ${tab.title}`}
            title={`Close ${tab.title}`}
            onclick={(event) => close(event, tab.id)}
          >
            <X size={12} strokeWidth={2} />
          </button>
        </div>
      {/each}
    </div>
    <button
      type="button"
      class="palette-hint"
      aria-label="Open command palette"
      onclick={() => ui.openPalette()}
    >
      <Command size={12} strokeWidth={1.9} aria-hidden="true" />
      <span class="mono">K</span>
    </button>
  {/if}
</div>

<style>
  .tabstrip {
    display: flex;
    align-items: stretch;
    gap: 6px;
    height: var(--tabbar-h);
    min-height: var(--tabbar-h);
    flex: 0 0 var(--tabbar-h);
    padding: 0 6px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elevated);
    overflow: hidden;
  }

  .workspace-label {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    padding: 0 7px;
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.05em;
    line-height: 1.4;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .hint {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    color: var(--muted-2);
    font-size: 10.5px;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tabs {
    display: flex;
    align-items: stretch;
    gap: 2px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tabs::-webkit-scrollbar {
    display: none;
  }

  .tab {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    min-width: 112px;
    max-width: 210px;
    border: 1px solid transparent;
    border-bottom: 0;
    border-radius: var(--radius) var(--radius) 0 0;
    background: transparent;
    color: var(--muted);
  }

  .tab:hover {
    background: var(--surface-1);
    color: var(--text);
  }

  .tab.active {
    border-color: var(--border);
    background: var(--surface-1);
    color: var(--text-strong);
  }

  .tab-main {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    padding: 0 4px 0 9px;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 11.5px;
    text-align: left;
  }

  .tab-dot {
    width: 5px;
    height: 5px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--warning);
  }

  .tab-dot.available {
    background: var(--success);
  }

  .tab-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 21px;
    height: 21px;
    margin-right: 3px;
    flex: 0 0 auto;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted-2);
    opacity: 0;
  }

  .tab:hover .tab-close,
  .tab.active .tab-close,
  .tab-close:focus-visible {
    opacity: 1;
  }

  .tab-close:hover {
    background: var(--surface-3);
    color: var(--text);
  }

  .palette-hint {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-left: auto;
    align-self: center;
    height: 23px;
    padding: 0 7px;
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    background: transparent;
    color: var(--muted-2);
    font-family: var(--font-mono);
    font-size: 9.5px;
    flex: 0 0 auto;
  }

  .palette-hint:hover {
    border-color: var(--border);
    color: var(--muted);
  }
</style>
