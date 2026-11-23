<script lang="ts">
  import { onMount } from 'svelte';
  import CommandPalette from '@/app/command-palette/CommandPalette.svelte';
  import Sidebar from '@/app/layout/Sidebar.svelte';
  import StatusBar from '@/app/layout/StatusBar.svelte';
  import TabStrip from '@/app/layout/TabStrip.svelte';
  import TopBar from '@/app/layout/TopBar.svelte';
  import Toasts from '@/components/Toasts.svelte';
  import { router } from '@/app/router.svelte';
  import { ui } from '@/app/ui.svelte';
  import { session } from '@/core/app/session.svelte';
  import { registry } from '@/core/registry';
  import DiagnosticsView from '@/views/DiagnosticsView.svelte';
  import IocWorkspaceView from '@/views/IocWorkspaceView.svelte';
  import MailSleuthView from '@/views/MailSleuthView.svelte';
  import OverviewView from '@/views/OverviewView.svelte';
  import PlannedView from '@/views/PlannedView.svelte';
  import RuleStudioView from '@/views/RuleStudioView.svelte';
  import SettingsView from '@/views/SettingsView.svelte';
  import ToolView from '@/views/ToolView.svelte';
  import ToolsView from '@/views/ToolsView.svelte';
  import YaraStudioView from '@/views/YaraStudioView.svelte';

  const collapsed = $derived(session.settings.sidebarCollapsed);

  const pageTitle = $derived.by(() => {
    switch (router.route.name) {
      case 'overview':
        return 'Overview';
      case 'tools':
        return 'All Tools';
      case 'tool':
        return (router.route.id && registry.get(router.route.id)?.manifest.name) || 'Tool';
      case 'mailsleuth':
        return 'MailSleuth';
      case 'ioc':
        return 'IOC Workspace';
      case 'recipes':
        return 'Recipes';
      case 'investigations':
        return 'Investigations';
      case 'rules':
        return 'Rule Studio';
      case 'yara':
        return 'YARA Studio';
      case 'reference':
        return 'Reference';
      case 'settings':
        return 'Settings';
      case 'diagnostics':
        return 'Diagnostics';
      default:
        return 'Overview';
    }
  });

  $effect(() => {
    const root = document.documentElement;
    root.classList.toggle('density-comfortable', session.settings.density === 'comfortable');
    root.classList.toggle('reduce-motion', session.settings.reduceMotion === 'reduced');
  });

  $effect(() => {
    document.title = `${pageTitle} · BlueKit`;
  });

  $effect(() => {
    // Any route change dismisses the mobile off-canvas navigation.
    void router.route;
    ui.mobileNavOpen = false;
  });

  onMount(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ui.togglePalette();
        return;
      }
      if (event.key === 'Escape') {
        if (ui.paletteOpen) {
          event.preventDefault();
          ui.closePalette();
        } else if (ui.mobileNavOpen) {
          event.preventDefault();
          ui.mobileNavOpen = false;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  function skipToContent(): void {
    const main = document.getElementById('bk-main');
    main?.focus();
    main?.scrollIntoView({ block: 'start' });
  }
</script>

<button type="button" class="skip-link" onclick={skipToContent}>Skip to content</button>

<div class="app">
  <TopBar />

  <div class="body" class:collapsed>
    <Sidebar />
    <div class="main">
      <TabStrip />
      <main id="bk-main" class="content" tabindex="-1">
        {#if router.route.name === 'overview'}
          <OverviewView />
        {:else if router.route.name === 'tools'}
          <ToolsView />
        {:else if router.route.name === 'tool'}
          {#key router.route.id}
            <ToolView />
          {/key}
        {:else if router.route.name === 'mailsleuth'}
          <MailSleuthView />
        {:else if router.route.name === 'ioc'}
          <IocWorkspaceView />
        {:else if router.route.name === 'settings'}
          <SettingsView />
        {:else if router.route.name === 'diagnostics'}
          <DiagnosticsView />
        {:else if router.route.name === 'recipes'}
          <PlannedView kind="recipes" />
        {:else if router.route.name === 'investigations'}
          <PlannedView kind="investigations" />
        {:else if router.route.name === 'rules'}
          <RuleStudioView />
        {:else if router.route.name === 'yara'}
          <YaraStudioView />
        {:else if router.route.name === 'reference'}
          <PlannedView kind="reference" />
        {:else}
          <OverviewView />
        {/if}
      </main>
    </div>
  </div>

  <StatusBar />
</div>

<CommandPalette />
<Toasts />

<style>
  .app {
    display: grid;
    grid-template-rows: var(--topbar-h) minmax(0, 1fr) var(--statusbar-h);
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: var(--bg);
  }

  .body {
    display: grid;
    grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
    min-height: 0;
    min-width: 0;
  }

  .body.collapsed {
    grid-template-columns: var(--sidebar-w-collapsed) minmax(0, 1fr);
  }

  .main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .content {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: var(--pad-page);
    outline: none;
    scroll-behavior: smooth;
  }

  @media (max-width: 880px) {
    .body,
    .body.collapsed {
      grid-template-columns: minmax(0, 1fr);
    }

    .content {
      padding: 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .content {
      scroll-behavior: auto;
    }
  }
</style>
