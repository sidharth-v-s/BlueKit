<script lang="ts">
  import { tick } from 'svelte';
  import Boxes from 'lucide-svelte/icons/boxes';
  import Download from 'lucide-svelte/icons/download';
  import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard';
  import MailSearch from 'lucide-svelte/icons/mail-search';
  import Search from 'lucide-svelte/icons/search';
  import Settings from 'lucide-svelte/icons/settings';
  import Activity from 'lucide-svelte/icons/activity';
  import Upload from 'lucide-svelte/icons/upload';
  import Command from 'lucide-svelte/icons/command';
  import Crosshair from 'lucide-svelte/icons/crosshair';
  import CategoryIcon from '@/components/CategoryIcon.svelte';
  import StatusBadge from '@/components/StatusBadge.svelte';
  import type { IconComponent } from '@/components/icon';
  import { router } from '@/app/router.svelte';
  import { ui } from '@/app/ui.svelte';
  import { session } from '@/core/app/session.svelte';
  import { registry, type RegistryEntry } from '@/core/registry';
  import { CATEGORIES, type CategoryId } from '@/core/schemas/types';

  interface CommandAction {
    id: string;
    label: string;
    hint: string;
    keywords: string;
    icon: IconComponent;
    run: () => void;
  }

  type PaletteItem =
    | { kind: 'action'; key: string; group: 'Actions'; action: CommandAction }
    | { kind: 'tool'; key: string; group: 'Favorites' | 'Recent' | 'Tools'; entry: RegistryEntry }
    | {
        kind: 'category';
        key: string;
        group: 'Categories';
        id: CategoryId;
        label: string;
        description: string;
      };

  const ACTIONS: CommandAction[] = [
    {
      id: 'overview',
      label: 'Go to Overview',
      hint: 'Workspace',
      keywords: 'home start dashboard',
      icon: LayoutDashboard,
      run: () => router.navigate('/overview'),
    },
    {
      id: 'mailsleuth',
      label: 'Open MailSleuth',
      hint: 'Email analysis',
      keywords: 'email eml mime headers phishing mail',
      icon: MailSearch,
      run: () => router.navigate('/mailsleuth'),
    },
    {
      id: 'ioc',
      label: 'Open IOC Workspace',
      hint: 'Indicators',
      keywords: 'ioc indicator extract normalize defang bulk dedupe',
      icon: Crosshair,
      run: () => router.navigate('/ioc'),
    },
    {
      id: 'tools',
      label: 'Browse all tools',
      hint: 'Catalog',
      keywords: 'catalog directory search',
      icon: Boxes,
      run: () => router.navigate('/tools'),
    },
    {
      id: 'settings',
      label: 'Open settings',
      hint: 'Preferences',
      keywords: 'appearance storage privacy',
      icon: Settings,
      run: () => router.navigate('/settings'),
    },
    {
      id: 'diagnostics',
      label: 'Run diagnostics',
      hint: 'Capabilities',
      keywords: 'worker wasm storage checks',
      icon: Activity,
      run: () => router.navigate('/diagnostics'),
    },
    {
      id: 'export',
      label: 'Export local archive',
      hint: 'Storage',
      keywords: 'backup download json bluekit',
      icon: Download,
      run: () => router.navigate('/settings/storage'),
    },
    {
      id: 'import',
      label: 'Import local archive',
      hint: 'Storage',
      keywords: 'restore upload json bluekit',
      icon: Upload,
      run: () => router.navigate('/settings/storage'),
    },
    {
      id: 'toggle-planned',
      label: session.settings.showPlannedTools ? 'Hide planned catalog entries' : 'Show planned catalog entries',
      hint: 'Catalog',
      keywords: 'roadmap planned future toggle',
      icon: Boxes,
      run: () => {
        void session.saveSettings({ showPlannedTools: !session.settings.showPlannedTools });
        ui.toast(
          session.settings.showPlannedTools
            ? 'Planned catalog entries are visible.'
            : 'Planned catalog entries are hidden.',
          'info',
        );
      },
    },
  ];

  let query = $state('');
  let activeIndex = $state(0);
  let input: HTMLInputElement | undefined = $state();

  function matchesAction(action: CommandAction, needle: string): boolean {
    if (!needle) return true;
    const haystack = `${action.label} ${action.hint} ${action.keywords}`.toLowerCase();
    return needle
      .split(/\s+/u)
      .filter(Boolean)
      .every((token) => haystack.includes(token));
  }

  const items = $derived.by((): PaletteItem[] => {
    const needle = query.trim().toLowerCase();
    const result: PaletteItem[] = [];
    const seenTools = new Set<string>();

    for (const action of ACTIONS) {
      if (matchesAction(action, needle)) {
        result.push({ kind: 'action', key: `action-${action.id}`, group: 'Actions', action });
      }
    }

    if (!needle) {
      for (const id of session.favorites.slice(0, 4)) {
        const entry = registry.get(id);
        if (entry && !seenTools.has(id)) {
          seenTools.add(id);
          result.push({ kind: 'tool', key: `fav-${id}`, group: 'Favorites', entry });
        }
      }
      for (const recent of session.recents.slice(0, 4)) {
        const entry = registry.get(recent.id);
        if (entry && !seenTools.has(recent.id)) {
          seenTools.add(recent.id);
          result.push({ kind: 'tool', key: `recent-${entry.manifest.id}`, group: 'Recent', entry });
        }
      }
      const startTools = [...registry.available(), ...registry.prototypes()].slice(0, 8);
      for (const entry of startTools) {
        if (seenTools.has(entry.manifest.id)) continue;
        seenTools.add(entry.manifest.id);
        result.push({ kind: 'tool', key: `tool-${entry.manifest.id}`, group: 'Tools', entry });
      }
    } else {
      for (const entry of registry.search(needle, 10)) {
        if (seenTools.has(entry.manifest.id)) continue;
        seenTools.add(entry.manifest.id);
        result.push({ kind: 'tool', key: `tool-${entry.manifest.id}`, group: 'Tools', entry });
      }

      for (const category of CATEGORIES) {
        const haystack = `${category.label} ${category.shortLabel} ${category.description}`.toLowerCase();
        if (haystack.includes(needle)) {
          result.push({
            kind: 'category',
            key: `cat-${category.id}`,
            group: 'Categories',
            id: category.id,
            label: category.label,
            description: category.description,
          });
        }
      }
    }

    return result.slice(0, 20);
  });

  const activeItem = $derived(items[activeIndex]);

  $effect(() => {
    if (ui.paletteOpen) {
      query = '';
      activeIndex = 0;
      void tick().then(() => input?.focus());
    }
  });

  $effect(() => {
    const index = activeIndex;
    if (!ui.paletteOpen) return;
    const element = document.getElementById(`palette-item-${index}`);
    element?.scrollIntoView({ block: 'nearest' });
  });

  function close(): void {
    ui.closePalette();
  }

  function activate(item: PaletteItem | undefined): void {
    if (!item) return;
    close();
    if (item.kind === 'action') {
      item.action.run();
    } else if (item.kind === 'tool') {
      session.recordOpen(item.entry.manifest.id);
      router.tool(item.entry.manifest.id);
    } else {
      router.navigate(`/tools/${item.id}`);
    }
  }

  function move(delta: number): void {
    if (items.length === 0) return;
    activeIndex = (activeIndex + delta + items.length) % items.length;
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      activate(activeItem);
    } else if (event.key === 'Tab') {
      // The palette is a single input; keep focus inside it while open.
      event.preventDefault();
    }
  }

  function onInput(event: Event): void {
    query = (event.currentTarget as HTMLInputElement).value;
    activeIndex = 0;
  }

  function groupLabel(index: number): string | null {
    const item = items[index];
    if (!item) return null;
    if (index === 0) return item.group;
    return items[index - 1]?.group === item.group ? null : item.group;
  }
</script>

{#if ui.paletteOpen}
  <div class="overlay" role="presentation" onclick={close}>
    <div
      class="palette"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label="Command palette"
      onclick={(event) => event.stopPropagation()}
      onkeydown={onKeydown}
    >
      <div class="search-row">
        <Search size={16} strokeWidth={1.9} aria-hidden="true" />
        <input
          bind:this={input}
          class="search"
          type="text"
          value={query}
          placeholder="Search tools, categories, and actions…"
          aria-label="Search commands"
          aria-controls="palette-results"
          aria-activedescendant={activeItem ? `palette-item-${activeIndex}` : undefined}
          oninput={onInput}
          autocomplete="off"
          spellcheck="false"
        />
        <span class="esc">esc</span>
      </div>

      <div class="results scroll" id="palette-results" role="listbox" aria-label="Results">
        {#if items.length === 0}
          <div class="empty">
            <span>No matches for “{query}”.</span>
            <span class="faint">Try a tool name, category, or “settings”.</span>
          </div>
        {:else}
          {#each items as item, index (item.key)}
            {@const group = groupLabel(index)}
            {#if group}
              <div class="group-label">{group}</div>
            {/if}
            <button
              type="button"
              id={`palette-item-${index}`}
              class="result"
              class:active={index === activeIndex}
              role="option"
              aria-selected={index === activeIndex}
              onmouseenter={() => (activeIndex = index)}
              onclick={() => activate(item)}
            >
              <span class="result-icon">
                {#if item.kind === 'action'}
                  {@const Icon = item.action.icon}
                  <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                {:else if item.kind === 'tool'}
                  <CategoryIcon category={item.entry.manifest.category} size={15} />
                {:else}
                  <CategoryIcon category={item.id} size={15} />
                {/if}
              </span>

              {#if item.kind === 'action'}
                <span class="result-main">
                  <span class="result-title">{item.action.label}</span>
                </span>
                <span class="result-hint">{item.action.hint}</span>
              {:else if item.kind === 'tool'}
                <span class="result-main">
                  <span class="result-title">{item.entry.manifest.name}</span>
                  <span class="result-desc">{item.entry.manifest.description}</span>
                </span>
                <StatusBadge status={item.entry.manifest.status} />
              {:else}
                <span class="result-main">
                  <span class="result-title">{item.label}</span>
                  <span class="result-desc">{item.description}</span>
                </span>
                <span class="result-hint">Category</span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      <div class="footer">
        <span class="footer-left">
          <Command size={11} strokeWidth={1.9} aria-hidden="true" />
          BlueKit command
        </span>
        <span class="keys">
          <span class="key">↑</span><span class="key">↓</span> navigate
          <span class="key">↵</span> open
          <span class="key">esc</span> close
        </span>
        <span class="count">{items.length} result{items.length === 1 ? '' : 's'}</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: min(14vh, 120px) 16px 24px;
    background: rgba(3, 6, 10, 0.68);
    backdrop-filter: blur(3px);
    animation: fade-in 90ms ease-out;
  }

  .palette {
    display: flex;
    flex-direction: column;
    width: min(640px, 100%);
    max-height: min(560px, 76vh);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 9px;
    flex: 0 0 auto;
    height: 44px;
    padding: 0 10px 0 13px;
    border-bottom: 1px solid var(--border);
    color: var(--muted);
  }

  .search {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text-strong);
    font-size: 13.5px;
    outline: none;
  }

  .search::placeholder {
    color: var(--muted-2);
  }

  .esc {
    display: inline-flex;
    align-items: center;
    height: 19px;
    padding: 0 5px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--surface-2);
    color: var(--muted-2);
    font-family: var(--font-mono);
    font-size: 9.5px;
  }

  .results {
    flex: 1 1 auto;
    min-height: 0;
    padding: 5px;
  }

  .group-label {
    padding: 8px 9px 4px;
    color: var(--muted-2);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .result {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: 38px;
    padding: 5px 8px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text);
    text-align: left;
  }

  .result.active {
    border-color: var(--accent-line);
    background: var(--accent-soft);
  }

  .result-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex: 0 0 auto;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    background: var(--surface-1);
    color: var(--muted);
  }

  .result.active .result-icon {
    border-color: var(--accent-line);
    color: var(--accent-strong);
  }

  .result-main {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .result-title {
    color: var(--text-strong);
    font-size: 12px;
    font-weight: 550;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-desc {
    color: var(--muted);
    font-size: 10.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-hint {
    flex: 0 0 auto;
    color: var(--muted-2);
    font-size: 10px;
  }

  .empty {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 26px 12px;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }

  .footer {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 0 auto;
    height: 30px;
    padding: 0 10px;
    border-top: 1px solid var(--border);
    background: var(--surface-1);
    color: var(--muted-2);
    font-size: 9.5px;
  }

  .footer-left {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .keys {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  .key {
    display: inline-flex;
    align-items: center;
    height: 17px;
    padding: 0 4px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--surface-2);
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--muted);
  }

  .count {
    padding-left: 8px;
    border-left: 1px solid var(--border);
    font-family: var(--font-mono);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  @media (max-width: 620px) {
    .overlay {
      padding-top: 54px;
    }

    .keys {
      display: none;
    }
  }
</style>
