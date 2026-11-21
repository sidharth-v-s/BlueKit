<script lang="ts">
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import X from 'lucide-svelte/icons/x';

  let {
    open = false,
    title,
    message,
    confirmLabel = 'Confirm',
    danger = false,
    onconfirm,
    oncancel,
  }: {
    open?: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  let confirmButton: HTMLButtonElement | undefined = $state();

  $effect(() => {
    if (open) confirmButton?.focus();
  });
</script>

{#if open}
  <div class="overlay" role="presentation" onclick={oncancel}>
    <div
      class="dialog panel"
      role="alertdialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => {
        if (event.key === 'Escape') oncancel();
      }}
    >
      <div class="head">
        <span class="icon" class:danger><AlertTriangle size={16} strokeWidth={1.9} /></span>
        <h2 id="confirm-title">{title}</h2>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Close" onclick={oncancel}>
          <X size={14} />
        </button>
      </div>
      <p id="confirm-message" class="message">{message}</p>
      <div class="actions">
        <button type="button" class="btn" onclick={oncancel}>Cancel</button>
        <button
          type="button"
          bind:this={confirmButton}
          class="btn {danger ? 'btn-danger' : 'btn-primary'}"
          onclick={onconfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(4, 7, 11, 0.66);
    backdrop-filter: blur(2px);
  }

  .dialog {
    width: min(430px, 100%);
    box-shadow: var(--shadow-pop);
    cursor: default;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 12px 12px 0;
  }

  .head h2 {
    flex: 1 1 auto;
    font-size: 13.5px;
  }

  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 1px solid rgba(216, 166, 87, 0.3);
    border-radius: var(--radius);
    background: var(--warning-soft);
    color: var(--warning);
  }

  .icon.danger {
    border-color: rgba(224, 108, 108, 0.32);
    background: var(--danger-soft);
    color: var(--danger);
  }

  .message {
    padding: 10px 12px 14px;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.55;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--border-soft);
    background: rgba(0, 0, 0, 0.12);
  }
</style>
