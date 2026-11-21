<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import { ui } from '@/app/ui.svelte';

  const tones: Record<string, string> = {
    info: '',
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
  };
</script>

<div class="toasts" aria-live="polite" aria-atomic="false">
  {#each ui.toasts as toast (toast.id)}
    <div class="toast {tones[toast.tone] ?? ''}" role="status">
      <span class="dot"></span>
      <span class="msg">{toast.message}</span>
      <button
        type="button"
        class="btn btn-ghost btn-icon btn-sm"
        aria-label="Dismiss notification"
        onclick={() => ui.dismissToast(toast.id)}
      >
        <X size={13} />
      </button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: 14px;
    bottom: calc(var(--statusbar-h) + 12px);
    z-index: 80;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: min(420px, calc(100vw - 28px));
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 8px 8px 11px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    box-shadow: var(--shadow-panel);
    color: var(--text);
    font-size: 12px;
    pointer-events: auto;
    animation: toast-in 140ms ease-out;
  }

  .toast.badge-success {
    border-color: rgba(86, 185, 141, 0.34);
  }

  .toast.badge-warning {
    border-color: rgba(216, 166, 87, 0.34);
  }

  .toast.badge-danger {
    border-color: rgba(224, 108, 108, 0.36);
  }

  .dot {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--accent);
  }

  .badge-success .dot {
    background: var(--success);
  }

  .badge-warning .dot {
    background: var(--warning);
  }

  .badge-danger .dot {
    background: var(--danger);
  }

  .msg {
    flex: 1 1 auto;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
</style>
