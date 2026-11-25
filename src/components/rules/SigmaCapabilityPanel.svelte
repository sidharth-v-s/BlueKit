<script lang="ts">
  import ArrowRightLeft from 'lucide-svelte/icons/arrow-right-left';
  import X from 'lucide-svelte/icons/x';

  let { onclose }: { onclose: () => void } = $props();

  const TARGETS = [
    'Splunk SPL',
    'Microsoft Sentinel KQL',
    'Elastic EQL / ES|QL',
    'Wazuh rules',
  ];
</script>

<section class="panel capability-panel">
  <div class="panel-head">
    <span class="panel-title">
      <ArrowRightLeft size={13} strokeWidth={1.9} aria-hidden="true" /> Capabilities and conversion
    </span>
    <span class="faint head-note">
      What this build does with Sigma rules, and why conversion is not offered.
    </span>
    <button type="button" class="btn btn-ghost btn-sm close" title="Close capabilities" onclick={onclose}>
      <X size={12} strokeWidth={1.9} aria-hidden="true" /> Close
    </button>
  </div>

  <div class="capability-body">
    <div class="verdict">
      <span class="badge badge-warning">author / validate / test / export only</span>
      <p>
        No Sigma conversion library or WebAssembly converter is bundled in this build. BlueKit does
        not call a conversion service, proxy, or model, and rule text is never sent anywhere for
        conversion.
      </p>
    </div>

    <table class="matrix">
      <thead>
        <tr>
          <th scope="col">Capability</th>
          <th scope="col">State</th>
          <th scope="col">Scope</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Edit and format Sigma YAML</td>
          <td><span class="badge badge-success">available</span></td>
          <td>Document-based formatting keeps detection, comments, and unknown keys.</td>
        </tr>
        <tr>
          <td>Validate</td>
          <td><span class="badge badge-success">available</span></td>
          <td>YAML syntax and the vendored official detection-rule schema, reported separately.</td>
        </tr>
        <tr>
          <td>Test sample events</td>
          <td><span class="badge badge-accent">documented subset</span></td>
          <td>Unsupported constructs fail visibly; a match is authoring feedback, not verification.</td>
        </tr>
        <tr>
          <td>Export</td>
          <td><span class="badge badge-success">available</span></td>
          <td>Sigma YAML files and local <span class="mono">bluekit.rules</span> bundles.</td>
        </tr>
        <tr>
          <td>Convert to a query language</td>
          <td><span class="badge badge-danger">unavailable</span></td>
          <td>No browser-compatible converter is included, so the action is not offered.</td>
        </tr>
        <tr>
          <td>Convert through a server</td>
          <td><span class="badge badge-muted">never</span></td>
          <td>There is no BlueKit backend or proxy, and conversion would violate the local-only model.</td>
        </tr>
      </tbody>
    </table>

    <div class="targets">
      <span class="row-label">Conversion targets</span>
      <div class="chips">
        {#each TARGETS as target (target)}
          <span class="target">
            <span>{target}</span>
            <span class="faint">not included</span>
          </span>
        {/each}
      </div>
    </div>

    <p class="explain">
      These targets appear in the planned rule-format list. Listing them is not a support claim:
      none has a converter in this build, and BlueKit does not approximate conversion with text
      substitution. A lossy rewrite presented as a working query would be worse than an explicit
      unavailable state.
    </p>

    <div class="future">
      <span class="row-label">A future converter would need</span>
      <ul>
        <li>a maintained browser library or WASM build, pinned and licence-reviewed;</li>
        <li>target-version-specific fixtures covering modifiers, lists, and conditions;</li>
        <li>a visible report for constructs it cannot translate, instead of dropping them;</li>
        <li>a clear statement that converted output still needs review in the target platform.</li>
      </ul>
    </div>

    <p class="scope-note">
      This state covers Sigma conversion only. YARA Studio is a separate workspace with its own
      engine and limits; it does not convert Sigma rules to YARA.
    </p>
  </div>
</section>

<style>
  .capability-panel {
    margin-bottom: 14px;
  }

  .head-note {
    flex: 1;
    min-width: 0;
    font-size: 10px;
  }

  .close {
    flex: 0 0 auto;
  }

  .capability-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }

  .verdict {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    flex-wrap: wrap;
    padding: 9px 10px;
    border: 1px solid rgba(216, 166, 87, 0.32);
    border-radius: var(--radius-sm);
    background: var(--warning-soft);
  }

  .verdict p {
    flex: 1;
    min-width: 240px;
    margin: 0;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.55;
  }

  .matrix {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }

  .matrix th {
    padding: 0 8px 5px;
    color: var(--muted-2);
    font-size: 9.5px;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-align: left;
    text-transform: uppercase;
  }

  .matrix th:first-child,
  .matrix td:first-child {
    padding-left: 0;
  }

  .matrix th:last-child,
  .matrix td:last-child {
    padding-right: 0;
  }

  .matrix td {
    padding: 6px 8px;
    border-top: 1px solid var(--border-soft);
    color: var(--muted);
    line-height: 1.45;
    vertical-align: top;
  }

  .matrix td:first-child {
    color: var(--text);
    white-space: nowrap;
  }

  .matrix td:nth-child(2) {
    white-space: nowrap;
  }

  .targets {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }

  .row-label {
    flex: 0 0 auto;
    color: var(--muted-2);
    font-size: 9.5px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .chips {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .target {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    padding: 2px 8px;
    border: 1px solid var(--border-soft);
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--muted);
    font-size: 10.5px;
  }

  .target .faint {
    font-size: 9.5px;
  }

  .explain,
  .scope-note {
    margin: 0;
    color: var(--muted-2);
    font-size: 10.5px;
    line-height: 1.55;
  }

  .future {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .future ul {
    margin: 0;
    padding-left: 18px;
    color: var(--muted);
    font-size: 10.5px;
    line-height: 1.55;
  }

  @media (max-width: 760px) {
    .matrix td:first-child {
      white-space: normal;
    }

    .targets {
      flex-direction: column;
      gap: 5px;
    }
  }
</style>
