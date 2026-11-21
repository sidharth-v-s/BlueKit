<script lang="ts">
  import type { ToolStatus } from '@/core/schemas/types';

  let { status, phase }: { status: ToolStatus; phase?: number } = $props();

  const label = $derived(
    status === 'available' ? 'Available' : status === 'prototype' ? 'Prototype' : 'Planned',
  );
  const tone = $derived(
    status === 'available' ? 'badge-success' : status === 'prototype' ? 'badge-warning' : 'badge-muted',
  );
</script>

<span class="badge badge-dot {tone}" title={status === 'planned' && phase ? `Planned for Phase ${phase}` : label}>
  {label}{#if status === 'planned' && phase}<span class="faint">· P{phase}</span>{/if}
</span>
