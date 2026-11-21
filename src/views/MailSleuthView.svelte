<script lang="ts">
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Info from 'lucide-svelte/icons/info';
  import MailSearch from 'lucide-svelte/icons/mail-search';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import { router } from '@/app/router.svelte';
  import { registry } from '@/core/registry';

  interface Step {
    id: string;
    title: string;
    note: string;
  }

  const STEPS: Step[] = [
    {
      id: 'email.eml-inspector',
      title: 'Parse the raw message',
      note: 'Normalised headers, MIME tree, bodies, URLs, and attachment metadata in one pass.',
    },
    {
      id: 'email.header-analyzer',
      title: 'Compare the header identities',
      note: 'From, Reply-To, Sender, Return-Path, duplicate headers, and the Received chain.',
    },
    {
      id: 'email.auth-results',
      title: 'Read the authentication evidence',
      note: 'SPF, DKIM, DMARC, and ARC claims with the authenticating domain and explicit caveats.',
    },
    {
      id: 'email.url-extractor',
      title: 'Triage the links',
      note: 'Text and HTML URLs, entity decoding, normalised and defanged forms, exact-host grouping.',
    },
    {
      id: 'email.attachment-extractor',
      title: 'Inspect the attachments',
      note: 'Decoded bytes, SHA-1/SHA-256, magic-byte type detection, risk flags, explicit download.',
    },
  ];

  const emailEntries = registry
    .forCategory('email')
    .filter((entry) => entry.manifest.status !== 'planned');
  const byId = new Map(emailEntries.map((entry) => [entry.manifest.id, entry]));

  function open(id: string): void {
    router.tool(id);
  }
</script>

<div class="page mailsleuth">
  <header class="page-head">
    <div class="head-copy">
      <div class="eyebrow">MailSleuth · Phase 3</div>
      <h1>Email analysis workspace</h1>
      <p class="lede">
        Parse an RFC 822 message, compare its identities, read the authentication claims, triage links,
        and hash attachments — in this tab. The message is never uploaded and URLs are never fetched.
      </p>
    </div>
    <div class="head-actions">
      <button
        type="button"
        class="btn btn-primary"
        onclick={() => open('email.eml-inspector')}
      >
        <MailSearch size={14} strokeWidth={1.9} aria-hidden="true" />
        Analyze a message
      </button>
    </div>
  </header>

  <div class="stat-row">
    <div class="stat">
      <span class="stat-value mono">{emailEntries.length}</span>
      <span class="stat-label">Email tools</span>
      <span class="stat-note">available now</span>
    </div>
    <div class="stat">
      <span class="stat-value mono">worker</span>
      <span class="stat-label">Execution</span>
      <span class="stat-note">parser and hashing off-thread</span>
    </div>
    <div class="stat">
      <span class="stat-value mono">none</span>
      <span class="stat-label">Network posture</span>
      <span class="stat-note">no fetch, resolve, or preload</span>
    </div>
    <div class="stat">
      <span class="stat-value mono">10 MiB</span>
      <span class="stat-label">Message cap</span>
      <span class="stat-note">per input, enforced twice</span>
    </div>
  </div>

  <div class="grid">
    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">Analysis workflow</span>
        <span class="faint xsmall">Each step runs independently</span>
      </div>
      <div class="panel-body flush">
        {#each STEPS as step, index (step.id)}
          {@const entry = byId.get(step.id)}
          {#if entry}
            <div class="step">
              <span class="step-number mono">{String(index + 1).padStart(2, '0')}</span>
              <div class="step-main">
                <div class="step-title-row">
                  <span class="step-title">{step.title}</span>
                  <span class="step-tool mono">{entry.manifest.name}</span>
                </div>
                <p class="step-note">{step.note}</p>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-sm step-open"
                onclick={() => open(step.id)}
              >
                Open <ArrowRight size={12} aria-hidden="true" />
              </button>
            </div>
          {/if}
        {/each}
      </div>
    </section>

    <div class="stack">
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">
            <ShieldCheck size={13} strokeWidth={1.9} aria-hidden="true" /> Evidence rules
          </span>
        </div>
        <div class="panel-body rules">
          <div class="rule">
            <span class="rule-dot"></span>
            <p>
              <strong>Authentication headers are relay claims.</strong> BlueKit records the
              authserv-id and compares it with the Received chain. It does not verify SPF, DKIM,
              DMARC, or ARC itself.
            </p>
          </div>
          <div class="rule">
            <span class="rule-dot"></span>
            <p>
              <strong>URLs are evidence, not links.</strong> Extraction never fetches, resolves, or
              renders a URL. The defanged form is a display convention, not a safety control.
            </p>
          </div>
          <div class="rule">
            <span class="rule-dot"></span>
            <p>
              <strong>Hashes cover decoded bytes.</strong> Attachment type comes from magic bytes in
              the first 4 KiB, not from the filename or declared MIME type.
            </p>
          </div>
          <div class="rule">
            <span class="rule-dot"></span>
            <p>
              <strong>Findings are observations.</strong> A mismatched Reply-To or broken Received
              hop is a question to answer, not a phishing verdict.
            </p>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">
            <Info size={13} strokeWidth={1.9} aria-hidden="true" /> Not implemented
          </span>
        </div>
        <div class="panel-body not-yet">
          <ul>
            <li>Independent DNS, SPF, DKIM, or DMARC verification.</li>
            <li>Local report generation (<span class="mono">email.report</span> is still planned).</li>
            <li>Provider enrichment connectors; the framework exists but every connector is disabled.</li>
            <li>Recursive <span class="mono">message/rfc822</span> analysis; nested messages are summarised.</li>
          </ul>
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .mailsleuth {
    max-width: 1180px;
  }

  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 22px;
    margin-bottom: 18px;
  }

  .head-copy {
    max-width: 660px;
  }

  .eyebrow {
    color: var(--muted-2);
    font-family: var(--font-mono);
    font-size: 9.5px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    margin-bottom: 5px;
  }

  h1 {
    font-size: 22px;
    line-height: 1.2;
    margin-bottom: 8px;
  }

  .lede {
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.6;
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    padding-top: 7px;
  }

  .stat-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
    margin-bottom: 14px;
    overflow: hidden;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 11px 13px;
    border-right: 1px solid var(--border-soft);
  }

  .stat:last-child {
    border-right: 0;
  }

  .stat-value {
    color: var(--text-strong);
    font-size: 20px;
    line-height: 1.1;
    font-weight: 500;
  }

  .stat-label {
    color: var(--text);
    font-size: 11px;
    font-weight: 550;
    margin-top: 2px;
  }

  .stat-note {
    color: var(--muted-2);
    font-size: 9.5px;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.32fr) minmax(0, 1fr);
    gap: 14px;
    align-items: start;
    margin-bottom: 14px;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .step {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-soft);
  }

  .step:last-child {
    border-bottom: 0;
  }

  .step-number {
    flex: 0 0 auto;
    padding-top: 1px;
    color: var(--muted-2);
    font-size: 10.5px;
  }

  .step-main {
    flex: 1 1 auto;
    min-width: 0;
  }

  .step-title-row {
    display: flex;
    align-items: baseline;
    gap: 7px;
    flex-wrap: wrap;
  }

  .step-title {
    color: var(--text-strong);
    font-size: 13px;
    font-weight: 600;
  }

  .step-tool {
    color: var(--muted-2);
    font-size: 9.5px;
  }

  .step-note {
    margin-top: 2px;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.5;
  }

  .step-open {
    flex: 0 0 auto;
    align-self: center;
  }

  .rules {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .rule {
    display: flex;
    gap: 9px;
    align-items: flex-start;
  }

  .rule-dot {
    flex: 0 0 auto;
    width: 5px;
    height: 5px;
    margin-top: 6px;
    border-radius: 50%;
    background: var(--accent);
    opacity: 0.7;
  }

  .rule p {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.55;
  }

  .rule strong {
    color: var(--text);
    font-weight: 600;
  }

  .not-yet ul {
    margin: 0;
    padding-left: 16px;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.6;
  }

  .not-yet li + li {
    margin-top: 4px;
  }

  @media (max-width: 960px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 720px) {
    .page-head {
      flex-direction: column;
      gap: 8px;
    }

    .head-actions {
      padding-top: 0;
    }

    .stat-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .stat:nth-child(2) {
      border-right: 0;
    }

    .stat:nth-child(-n + 2) {
      border-bottom: 1px solid var(--border-soft);
    }

    .step-open {
      display: none;
    }
  }
</style>
