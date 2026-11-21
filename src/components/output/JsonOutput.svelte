<script lang="ts">
  import OutputToolbar from './OutputToolbar.svelte';

  let {
    value,
    filename = 'bluekit-output.json',
    note = 'application/json',
  }: { value: unknown; filename?: string; note?: string } = $props();

  const pretty = $derived.by(() => {
    try {
      return JSON.stringify(value, null, 2) ?? String(value);
    } catch (error) {
      return `// Could not serialize output: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
</script>

<OutputToolbar text={pretty} {filename} mime="application/json;charset=utf-8" {note} />

<pre class="json mono">{pretty}</pre>

<style>
  .json {
    max-height: 520px;
    overflow: auto;
    padding: 11px 12px;
    color: var(--text);
    font-size: 11.5px;
    line-height: 1.55;
    white-space: pre;
    user-select: text;
  }
</style>
