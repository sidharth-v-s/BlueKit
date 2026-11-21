<script lang="ts">
  import { onMount } from 'svelte';
  import Menu from 'lucide-svelte/icons/menu';
  import Search from 'lucide-svelte/icons/search';
  import Settings from 'lucide-svelte/icons/settings';
  import Wifi from 'lucide-svelte/icons/wifi';
  import WifiOff from 'lucide-svelte/icons/wifi-off';
  import { ui } from '@/app/ui.svelte';
  import { router } from '@/app/router.svelte';
  import { session } from '@/core/app/session.svelte';

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/u.test(navigator.platform);
  let online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);

  onMount(() => {
    const update = () => (online = navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  });
</script>

<header class="topbar" class:sidebar-collapsed={session.settings.sidebarCollapsed}>
  <button
    type="button"
    class="brand"
    aria-label="BlueKit overview"
    onclick={() => router.navigate('/overview')}
  >
    <span class="mark" aria-hidden="true">BK</span>
    <span class="wordmark">BlueKit</span>
    <span class="version mono">v0.1</span>
  </button>

  <button
    type="button"
    class="mobile-nav btn btn-ghost btn-icon"
    aria-label="Toggle navigation"
    aria-expanded={ui.mobileNavOpen}
    onclick={() => ui.toggleMobileNav()}
  >
    <Menu size={18} strokeWidth={1.75} />
  </button>

  <button
    type="button"
    class="search-trigger"
    aria-label="Open command palette"
    onclick={() => ui.openPalette()}
  >
    <Search size={14} strokeWidth={2} aria-hidden="true" />
    <span class="search-text">Search tools, references, actions…</span>
    <span class="kbd">{isMac ? '⌘' : 'Ctrl'} K</span>
  </button>

  <div class="spacer"></div>

  <span class="net" class:offline={!online} title={online ? 'Browser is online' : 'Browser is offline'}>
    {#if online}
      <Wifi size={13} strokeWidth={1.9} aria-hidden="true" />
      <span class="net-label">Online</span>
    {:else}
      <WifiOff size={13} strokeWidth={1.9} aria-hidden="true" />
      <span class="net-label">Offline</span>
    {/if}
  </span>

  <button
    type="button"
    class="btn btn-ghost btn-icon"
    aria-label="Settings"
    title="Settings"
    onclick={() => router.navigate('/settings')}
  >
    <Settings size={16} strokeWidth={1.75} />
  </button>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: var(--topbar-h);
    padding: 0 10px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elevated);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    width: calc(var(--sidebar-w) - 10px);
    height: 100%;
    padding: 0 6px;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }

  .mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 25px;
    height: 25px;
    border: 1px solid var(--accent-line);
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .wordmark {
    color: var(--text-strong);
    font-size: 13.5px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .version {
    color: var(--muted-2);
    font-size: 9.5px;
    margin-top: 1px;
  }

  .topbar.sidebar-collapsed .brand {
    width: calc(var(--sidebar-w-collapsed) - 10px);
    justify-content: center;
    padding: 0;
  }

  .topbar.sidebar-collapsed .wordmark,
  .topbar.sidebar-collapsed .version {
    display: none;
  }

  .mobile-nav {
    display: none;
  }

  .search-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: min(560px, 100%);
    height: 29px;
    padding: 0 6px 0 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-1);
    color: var(--muted);
    text-align: left;
    transition: border-color 120ms ease, background 120ms ease;
  }

  .search-trigger:hover {
    border-color: var(--border-strong);
    background: var(--surface-2);
  }

  .search-text {
    flex: 1 1 auto;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .spacer {
    flex: 1 1 auto;
  }

  .net {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 7px;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--muted);
    font-size: 10.5px;
  }

  .net.offline {
    border-color: rgba(216, 166, 87, 0.3);
    background: var(--warning-soft);
    color: var(--warning);
  }

  @media (max-width: 880px) {
    .brand,
    .topbar.sidebar-collapsed .brand {
      width: auto;
      justify-content: flex-start;
      padding: 0 6px;
    }

    .topbar.sidebar-collapsed .wordmark {
      display: inline;
    }

    .topbar.sidebar-collapsed .version {
      display: none;
    }

    .mobile-nav {
      display: inline-flex;
    }

    .version,
    .search-text {
      display: none;
    }

    .search-trigger {
      width: auto;
      margin-left: auto;
    }
  }

  @media (max-width: 620px) {
    .net-label {
      display: none;
    }

    .wordmark {
      display: none;
    }
  }
</style>
