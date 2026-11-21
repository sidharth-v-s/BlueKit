<script lang="ts">
  import OutputToolbar from './OutputToolbar.svelte';

  let {
    value,
    filename = 'bluekit-output.txt',
    mime = 'text/plain;charset=utf-8',
    note,
  }: {
    value: string;
    filename?: string;
    mime?: string;
    note?: string;
  } = $props();
</script>

<OutputToolbar text={value} {filename} {mime} {note} />

<pre class="text-output mono">{value}</pre>

<style>
  .text-output {
    max-height: 520px;
    overflow: auto;
    padding: 11px 12px;
    color: var(--text);
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
  }
</style>
