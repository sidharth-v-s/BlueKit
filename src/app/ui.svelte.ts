export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

let toastId = 0;

class UiStore {
  paletteOpen = $state(false);
  mobileNavOpen = $state(false);
  toasts = $state<Toast[]>([]);

  openPalette(): void {
    this.paletteOpen = true;
    this.mobileNavOpen = false;
  }

  closePalette(): void {
    this.paletteOpen = false;
  }

  togglePalette(): void {
    if (this.paletteOpen) this.closePalette();
    else this.openPalette();
  }

  toggleMobileNav(): void {
    this.mobileNavOpen = !this.mobileNavOpen;
  }

  toast(message: string, tone: ToastTone = 'info', durationMs = 4200): void {
    const id = (toastId += 1);
    this.toasts = [...this.toasts, { id, message, tone }];
    window.setTimeout(() => {
      this.toasts = this.toasts.filter((toast) => toast.id !== id);
    }, durationMs);
  }

  dismissToast(id: number): void {
    this.toasts = this.toasts.filter((toast) => toast.id !== id);
  }
}

export const ui = new UiStore();
