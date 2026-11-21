<script lang="ts">
  import type { IconComponent } from '@/components/icon';
  import type { CategoryId } from '@/core/schemas/types';
  import AppWindow from 'lucide-svelte/icons/app-window';
  import Binary from 'lucide-svelte/icons/binary';
  import Cloud from 'lucide-svelte/icons/cloud';
  import Fingerprint from 'lucide-svelte/icons/fingerprint';
  import Mail from 'lucide-svelte/icons/mail';
  import Network from 'lucide-svelte/icons/network';
  import Radar from 'lucide-svelte/icons/radar';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import Skull from 'lucide-svelte/icons/skull';
  import Terminal from 'lucide-svelte/icons/terminal';
  import Waypoints from 'lucide-svelte/icons/waypoints';
  import Wrench from 'lucide-svelte/icons/wrench';

  let {
    category,
    size = 15,
    strokeWidth = 1.75,
  }: { category: CategoryId; size?: number; strokeWidth?: number } = $props();

  const icons: Record<CategoryId, IconComponent> = {
    encoding: Binary,
    ioc: Radar,
    email: Mail,
    windows: AppWindow,
    'active-directory': Network,
    network: Waypoints,
    malware: Skull,
    forensics: Fingerprint,
    detection: ShieldCheck,
    linux: Terminal,
    cloud: Cloud,
    utilities: Wrench,
  };

  const Icon = $derived(icons[category] ?? Wrench);
</script>

<Icon {size} {strokeWidth} aria-hidden="true" focusable="false" />
