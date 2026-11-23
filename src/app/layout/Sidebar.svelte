<script lang="ts">
  import BookOpen from 'lucide-svelte/icons/book-open';
  import Boxes from 'lucide-svelte/icons/boxes';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import Crosshair from 'lucide-svelte/icons/crosshair';
  import FolderSearch from 'lucide-svelte/icons/folder-search';
  import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard';
  import MailSearch from 'lucide-svelte/icons/mail-search';
  import PanelLeftClose from 'lucide-svelte/icons/panel-left-close';
  import PanelLeftOpen from 'lucide-svelte/icons/panel-left-open';
  import ScanSearch from 'lucide-svelte/icons/scan-search';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import Workflow from 'lucide-svelte/icons/workflow';
  import CategoryIcon from '@/components/CategoryIcon.svelte';
  import type { IconComponent } from '@/components/icon';
  import { router } from '@/app/router.svelte';
  import { ui } from '@/app/ui.svelte';
  import { session } from '@/core/app/session.svelte';
  import { registry, type RegistryEntry } from '@/core/registry';
  import { CATEGORIES, isCategoryId, type CategoryId } from '@/core/schemas/types';

  interface NavItem {
    id: string;
    label: string;
    path: string;
    icon: IconComponent;
  }

  const NAV: NavItem[] = [
    { id: 'overview', label: 'Overview', path: '/overview', icon: LayoutDashboard },
    { id: 'tools', label: 'All Tools', path: '/tools', icon: Boxes },
    { id: 'mailsleuth', label: 'MailSleuth', path: '/mailsleuth', icon: MailSearch },
    { id: 'ioc', label: 'IOC Workspace', path: '/ioc', icon: Crosshair },
    { id: 'recipes', label: 'Recipes', path: '/recipes', icon: Workflow },
    { id: 'investigations', label: 'Investigations', path: '/investigations', icon: FolderSearch },
    { id: 'rules', label: 'Rule Studio', path: '/rules', icon: ShieldCheck },
    { id: 'yara', label: 'YARA Studio', path: '/yara', icon: ScanSearch },
    { id: 'reference', label: 'Reference', path: '/reference', icon: BookOpen },
  ];

  const counts = registry.categoryCounts();

  const collapsed = $derived(session.settings.sidebarCollapsed);

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
      .slice(0, 4),
  );

  const activeCategory = $derived.by((): CategoryId | null => {
    if (router.route.name === 'tool' && router.route.id) {
      return registry.get(router.route.id)?.manifest.category ?? null;
    }
    if (router.route.name === 'tools' && router.route.category && isCategoryId(router.route.category)) {
      return router.route.category;
    }
    return null;
  });

  function go(path: string): void {
    ui.mobileNavOpen = false;
    router.navigate(path);
  }

  function openTool(id: string): void {
    ui.mobileNavOpen = false;
    session.recordOpen(id);
    router.tool(id);
  }

  function toggleCollapsed(): void {
    void session.saveSettings({ sidebarCollapsed: !collapsed });
  }
</script>

{#if ui.mobileNavOpen}
  <button
    type="button"
    class="scrim"
    aria-label="Close navigation"
    onclick={() => (ui.mobileNavOpen = false)}
  ></button>
{/if}

<aside class="sidebar" class:collapsed class:open={ui.mobileNavOpen} aria-label="Workspace navigation">
  <div class="scroll-area">
    <nav class="nav" aria-label="Primary">
      {#each NAV as item (item.id)}
        {@const Icon = item.icon}
        <button
          type="button"
          class="nav-item"
          class:active={router.route.name === item.id}
          title={collapsed ? item.label : undefined}
          aria-current={router.route.name === item.id ? 'page' : undefined}
          onclick={() => go(item.path)}
        >
          <span class="nav-icon"><Icon size={15} strokeWidth={1.8} aria-hidden="true" /></span>
          {#if !collapsed}<span class="nav-label">{item.label}</span>{/if}
          {#if !collapsed && (item.id === 'recipes' || item.id === 'investigations')}
            <span class="soon">soon</span>
          {/if}
        </button>
      {/each}
    </nav>

    {#if !collapsed}
      <div class="section">
        <div class="section-head">
          <span>Categories</span>
          <span class="section-count">{CATEGORIES.length}</span>
        </div>
        <div class="cats">
          {#each CATEGORIES as category (category.id)}
            <button
              type="button"
              class="cat"
              class:active={activeCategory === category.id}
              title={category.description}
              onclick={() => go(`/tools/${category.id}`)}
            >
              <span class="cat-icon"><CategoryIcon category={category.id} size={14} /></span>
              <span class="cat-label">{category.shortLabel}</span>
              <span class="cat-count mono">{counts[category.id] ?? 0}</span>
            </button>
          {/each}
        </div>
      </div>

      {#if favoriteEntries.length > 0}
        <div class="section">
          <div class="section-head">
            <span>Favorites</span>
            <span class="section-count">{session.favorites.length}</span>
          </div>
          <div class="short-list">
            {#each favoriteEntries as entry (entry.manifest.id)}
              <button type="button" class="short" onclick={() => openTool(entry.manifest.id)}>
                <CategoryIcon category={entry.manifest.category} size={13} />
                <span class="short-name">{entry.manifest.name}</span>
                <ChevronRight size={12} class="short-chev" aria-hidden="true" />
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if recentEntries.length > 0}
        <div class="section">
          <div class="section-head">
            <span>Recent</span>
          </div>
          <div class="short-list">
            {#each recentEntries as entry (entry.manifest.id)}
              <button type="button" class="short" onclick={() => openTool(entry.manifest.id)}>
                <CategoryIcon category={entry.manifest.category} size={13} />
                <span class="short-name">{entry.manifest.name}</span>
                <ChevronRight size={12} class="short-chev" aria-hidden="true" />
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>

  <div class="sidebar-foot">
    <span class="local" title={session.persistenceEnabled ? 'Preferences persist in this browser' : 'In-memory session only'}>
      <span class="local-dot" class:warn={!session.persistenceEnabled}></span>
      {#if !collapsed}{session.persistenceEnabled ? 'Local persistence' : 'Session only'}{/if}
    </span>
    <button
      type="button"
      class="btn btn-ghost btn-icon btn-sm collapse"
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      onclick={toggleCollapsed}
    >
      {#if collapsed}
        <PanelLeftOpen size={15} />
      {:else}
        <PanelLeftClose size={15} />
      {/if}
    </button>
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    width: var(--sidebar-w);
    min-height: 0;
    border-right: 1px solid var(--border);
    background: var(--bg-elevated);
  }

  .sidebar.collapsed {
    width: var(--sidebar-w-collapsed);
  }

  .scroll-area {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 6px;
  }

  .nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    height: var(--row-h);
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    text-align: left;
    transition: background 100ms ease, color 100ms ease, border-color 100ms ease;
  }

  .nav-item:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .nav-item.active {
    border-color: var(--accent-line);
    background: var(--accent-soft);
    color: var(--text-strong);
  }

  .nav-item.active .nav-icon {
    color: var(--accent-strong);
  }

  .nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    flex: 0 0 auto;
    color: var(--muted-2);
  }

  .nav-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .soon {
    color: var(--muted-2);
    font-family: var(--font-mono);
    font-size: 8.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .collapsed .nav-item {
    justify-content: center;
    padding: 0;
  }

  .section {
    margin-top: 16px;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 20px;
    padding: 0 8px;
    color: var(--muted-2);
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .section-count {
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 400;
    letter-spacing: 0;
  }

  .cats {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .cat {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 26px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted);
    font-size: 11.5px;
    text-align: left;
  }

  .cat:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .cat.active {
    border-color: var(--border);
    background: var(--surface-2);
    color: var(--text-strong);
  }

  .cat.active .cat-icon {
    color: var(--accent);
  }

  .cat-icon {
    display: flex;
    align-items: center;
    color: var(--muted-2);
    flex: 0 0 auto;
  }

  .cat-label {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cat-count {
    color: var(--muted-2);
    font-size: 9.5px;
  }

  .short-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .short {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    height: 25px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted);
    font-size: 11.5px;
    text-align: left;
  }

  .short:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .short-name {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .short :global(.short-chev) {
    color: var(--muted-2);
    flex: 0 0 auto;
  }

  .sidebar-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    flex: 0 0 auto;
    height: 34px;
    padding: 0 6px 0 9px;
    border-top: 1px solid var(--border-soft);
  }

  .collapsed .sidebar-foot {
    flex-direction: column;
    height: auto;
    padding: 6px 0;
    gap: 6px;
  }

  .local {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted-2);
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
  }

  .local-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--success);
    flex: 0 0 auto;
  }

  .local-dot.warn {
    background: var(--warning);
  }

  .scrim {
    display: none;
  }

  @media (max-width: 880px) {
    .sidebar {
      position: fixed;
      top: var(--topbar-h);
      bottom: var(--statusbar-h);
      left: 0;
      z-index: 60;
      width: var(--sidebar-w);
      transform: translateX(-101%);
      transition: transform 150ms ease;
      box-shadow: var(--shadow-pop);
    }

    .sidebar.collapsed {
      width: var(--sidebar-w);
    }

    .sidebar.open {
      transform: none;
    }

    .scrim {
      display: block;
      position: fixed;
      inset: var(--topbar-h) 0 var(--statusbar-h);
      z-index: 55;
      border: 0;
      background: rgba(3, 6, 10, 0.55);
    }
  }
</style>
