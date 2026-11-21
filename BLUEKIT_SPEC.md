# BlueKit — Product & Technical Specification

**Document type:** Product requirements + technical design  
**Status:** Draft for implementation planning  
**Version:** 0.1  
**Date:** 2026-11-20  
**Working product name:** BlueKit  
**Primary product idea:** A browser-native, all-in-one Blue Team and security-analysis workbench inspired by CyberChef.

> **Non-negotiable architecture constraint:** BlueKit is a static web application. After the application assets have been downloaded, tools, parsing, detection, workflows, local persistence, and file analysis run in the user's browser. There is no BlueKit application backend, no server-side database, no server-side file processing, no API proxy, and no mandatory account system. Static hosting is used only to deliver application assets and public versioned datasets. External intelligence providers may be contacted directly by the browser only where their APIs, CORS policy, authentication model, and terms permit it.

---

## 1. Product Overview

BlueKit is a general-purpose security analyst toolbox: one website containing a broad collection of focused Blue Team utilities, analyzers, parsers, rule-authoring tools, reference lookups, and composable workflows.

The product should be useful as a daily starting point for:

- SOC analysts and incident responders.
- Threat hunters and detection engineers.
- Digital forensics and malware-analysis practitioners.
- Windows and Active Directory investigators.
- Network defenders.
- Security researchers and students.

BlueKit is not intended to be a SIEM, an EDR, a malware sandbox, a cloud-hosted analysis service, or a replacement for specialist forensic platforms. It is a local-first collection of utilities that makes frequent analyst tasks available through one consistent interface.

### 1.1 Product principles

1. **Browser-native:** Analysis runs locally by default. The application must not upload user files or investigation content to BlueKit infrastructure because no such processing infrastructure exists.
2. **Static-hostable:** The complete product must be deployable to any ordinary static web host or served from a local static web server.
3. **Useful without accounts:** No registration, login, tenant, server-side user profile, or cloud synchronization is required.
4. **Local-first storage:** User settings, saved rules, recipes, history, and investigations stay in browser storage unless the user explicitly exports them or sends selected data to an external provider.
5. **Composable tools:** Tools must work independently and expose typed inputs and outputs so compatible operations can be chained into recipes.
6. **Honest integrations:** Never claim a provider is supported until direct browser requests have been tested against the provider's real CORS, authentication, quota, and terms requirements.
7. **Analyst-oriented UX:** Compact, keyboard-friendly, information-dense, dark-first, and free from decorative SaaS/AI-dashboard patterns.
8. **Modular growth:** New tools should be addable without redesigning the application shell or changing unrelated tools.
9. **Transparent findings:** Separate source results, observations, heuristics, and analyst conclusions. Do not manufacture a single “malicious score” by averaging unrelated provider outputs.
10. **No automatic detonation:** BlueKit must not execute uploaded samples, open suspicious URLs, or submit files to third parties without an explicit user action.

### 1.2 Product statement

“An analyst's Swiss Army knife for Blue Team work: parse it, inspect it, enrich it, write a rule for it, test it, and connect the steps — all in the browser.”

---

## 2. Scope

### 2.1 In scope

- Static web application with an installable PWA/offline-capable experience.
- Tool catalog and global search/command palette.
- Browser-side operation execution.
- Web Workers for CPU-heavy processing.
- WebAssembly modules for selected native parsers/engines where a suitable browser build exists.
- Local storage for preferences, recipes, rules, history, and investigations.
- Local file handling and file metadata inspection.
- Email (`.eml`) analysis.
- IOC extraction and enrichment.
- Windows, Active Directory, Linux, network, malware-triage, and forensic utilities.
- Detection rule authoring, validation, and local testing.
- Pipeline/recipe builder with typed operations.
- Static reference datasets and user-managed dataset updates.
- Direct browser integrations to third-party APIs only when technically and legally supported.
- Import/export of user data and tool artifacts.

### 2.2 Explicitly out of scope

- BlueKit backend/API server.
- Server-side database or file storage.
- Server-side processing or scheduled jobs.
- Reverse proxy or API gateway operated by BlueKit.
- Mandatory user accounts or authentication.
- Centralized user history, cloud-saved investigations, or automatic cross-device sync.
- Automatic scanning of the user's machine or filesystem.
- Automatic execution of suspicious binaries, scripts, macros, or attachments.
- Browser-based port scanning or arbitrary network scanning.
- Guaranteeing compatibility with every SIEM/query backend or every version of every rule language.
- A general-purpose malware sandbox.

### 2.3 Important distinction: static hosting versus backend

BlueKit will still be hosted somewhere so a browser can download its HTML, CSS, JavaScript, WebAssembly, icons, and public reference datasets. That host is a static asset origin only. It must not receive user analysis content as part of normal tool execution.

The product may make direct network requests to third-party providers when a user chooses an integration. Such a request is initiated by the browser and goes to that provider, not through BlueKit.

---

## 3. Target User Experience

### 3.1 Primary workflow

1. User opens BlueKit in a browser.
2. The application loads its static assets and required local metadata.
3. User searches for a tool or opens a category.
4. User pastes data or selects a local file.
5. BlueKit detects/validates the input type and presents relevant operations.
6. The user runs the operation locally.
7. Results appear in a structured, copyable/exportable output panel.
8. The user may chain the output into another tool, save the result locally, or explicitly enrich selected indicators using an external provider.

### 3.2 Core navigation

The primary navigation should contain:

- **Overview** — lightweight landing area with global search, favorites, recent tools, saved recipes, and local status.
- **All Tools** — searchable categorized tool directory.
- **Recipes** — saved and built-in pipelines.
- **Investigations** — local-only case folders/workspaces.
- **Rule Studio** — YARA, Sigma, and other detection formats.
- **Reference** — Event IDs, Windows constants, ATT&CK, ports, file formats, and other lookup datasets.
- **Settings** — appearance, storage, integrations, dataset management, shortcuts, and privacy controls.

A compact left sidebar should provide category navigation, favorites, and recent tools. The main workspace should support multiple open tool tabs.

### 3.3 Global command palette

`Ctrl+K` / `Cmd+K` opens a command palette that searches:

- Tool names and aliases.
- Tool descriptions and tags.
- Operations.
- Reference datasets (for example, Windows Event ID `4624`, `NTSTATUS`, or ATT&CK technique IDs).
- Saved recipes.
- Recent and favorite tools.

Keyboard navigation must work without a mouse. The command palette must not require a network request.

---

## 4. Visual and Interaction Design

### 4.1 Design direction

**Terminal-inspired security workstation, blue accent, compact information density.** It should feel like a purposeful developer/forensics application, not a generic AI-generated SaaS dashboard.

The direction is a real GUI with terminal/IDE influence, not a terminal emulator as the only interface.

### 4.2 Visual principles

- Dark mode is the default.
- Deep charcoal/navy surfaces rather than pure black everywhere.
- Muted blue is the primary accent, used for active navigation, focused controls, links, and primary actions.
- Green, amber, and red are reserved for meaningful operational states and findings.
- Minimal borders and shadows; no glassmorphism, neon glows, decorative gradients, or oversized hero cards.
- Compact but readable typography and tables.
- Monospace typography for code, logs, hashes, timestamps, identifiers, and technical metadata.
- Sans-serif typography for explanatory text and longer descriptions.
- Small, consistent corner radii; avoid pill-shaped UI everywhere.
- Animations must be subtle and functional. Respect `prefers-reduced-motion`.

### 4.3 Initial design tokens

These are starting tokens, not a frozen brand palette:

| Token | Suggested value | Use |
|---|---:|---|
| `--bg` | `#0B0F14` | App background |
| `--surface-1` | `#121923` | Main panels |
| `--surface-2` | `#171F2A` | Raised/selected surfaces |
| `--border` | `#293747` | Dividers and borders |
| `--text` | `#D7DEE8` | Primary text |
| `--muted` | `#8B98A9` | Secondary text |
| `--accent` | `#4C9AFF` | Primary blue accent |
| `--success` | Muted green | Positive/complete status |
| `--warning` | Muted amber | Warnings/uncertainty |
| `--danger` | Muted red | Errors/high-risk findings |

### 4.4 Typography and iconography

- UI font: Inter or a comparable neutral sans-serif.
- Code font: JetBrains Mono or a comparable monospace font.
- Icons: Lucide or another consistent open-source icon set.
- Do not use emoji as interface icons.
- Numeric values should use tabular numerals where possible.

### 4.5 Layout

Desktop-first, responsive down to tablet and mobile widths. The most complex editors and data tables should be optimized for desktop, while lookup tools should remain usable on mobile.

Core layout:

- Top bar: brand, global search/command palette, active workspace controls, settings.
- Left sidebar: navigation and categories; collapsible.
- Main workspace: tabbed, resizable tool panels.
- Optional right-side inspector: selected item details, metadata, or context.
- Bottom status bar: local processing, worker state, offline state, dataset version, and external request indicators.

### 4.6 Tool-specific interface patterns

- **Editors:** syntax highlighting, line numbers, validation panel, test panel, minimap only when useful.
- **Log viewers:** dense table, filter builder, column controls, expandable event details, timeline mode.
- **IOC lookups:** compact lookup input, provider-by-provider results, source timestamps, raw response inspection.
- **Email analysis:** message summary, headers, authentication, URLs, attachments, body preview.
- **File analysis:** metadata, hashes, strings, sections, imports, entropy, and hex view.
- **Graph investigations:** graph canvas plus entity/relationship inspector and timeline.

### 4.7 Accessibility

- Keyboard-accessible controls and predictable tab order.
- Visible focus indicators.
- Adequate contrast for text and status colors.
- Do not convey severity through color alone.
- Screen-reader labels for icon-only buttons.
- Reduced-motion support.
- Resizable text and usable zoom behavior.

---

## 5. Technical Architecture

### 5.1 Required architecture

BlueKit is a static client-side application.

```text
                 STATIC HOSTING OR LOCAL STATIC SERVER
                 HTML / CSS / JS / WASM / JSON / ASSETS
                                  |
                           Initial page load
                                  |
                                  v
+----------------------------------------------------------------+
|                         USER'S BROWSER                          |
|                                                                |
|  Application Shell                                             |
|    |                                                           |
|    +-- Tool Registry and Catalog                               |
|    +-- Tool Runtime / Operation Executor                       |
|    +-- Pipeline / Recipe Engine                                |
|    +-- Dataset Manager                                         |
|    +-- Integration Manager                                     |
|    +-- Local Workspace / Investigation Manager                 |
|    +-- Settings / Export / Import                              |
|                                                                |
|  Execution: Main Thread (UI only)                              |
|       |                                                        |
|       +--> Web Workers (parsing, scanning, transformations)   |
|       +--> WebAssembly modules (selected engines)             |
|                                                                |
|  Local persistence: IndexedDB / OPFS / Cache Storage           |
+----------------------------------------------------------------+
           |                                      |
           | direct browser request               | static update fetch
           v                                      v
  THIRD-PARTY PROVIDERS                    STATIC DATA RELEASES
  VirusTotal / OTX / etc.                  JSON / rule packs / refs
```

### 5.2 Technology direction

The stack should remain compatible with static deployment.

| Layer | Preferred technology | Notes |
|---|---|---|
| UI | SvelteKit static adapter or Vite + Svelte | Must produce static assets; no server routes required at runtime |
| Language | TypeScript | Strict mode enabled |
| Styling | CSS variables + Tailwind or small design system | Avoid unnecessary component framework weight |
| Code editor | Monaco or CodeMirror 6 | Evaluate bundle size and mobile usability; CodeMirror may be lighter |
| Tables | Lightweight virtualized grid/table | Must handle large event lists without rendering all rows |
| Graphs | Cytoscape.js or another maintained browser library | Lazy-load only for graph tools |
| Local database | IndexedDB, wrapped by a small abstraction (for example Dexie) | No remote database |
| Large local files | OPFS where supported; File/Blob APIs as fallback | Graceful feature detection required |
| Background work | Dedicated Web Workers | Keep CPU-heavy operations off the UI thread |
| Native engines | WebAssembly where suitable | Each WASM dependency requires license and supply-chain review |
| Offline | Service Worker + Cache Storage | Cache app shell and selected tool bundles |
| Tests | Vitest + Playwright | Include browser compatibility and offline tests |
| Build | Vite | Static output |

No Go runtime is required in the delivered application. Go can be used by contributors as a development-time utility to generate datasets or validate release artifacts, but it must not become a runtime server dependency.

### 5.3 Runtime rules

- The application must not call a BlueKit-owned API endpoint.
- The application must not send analysis content to static hosting.
- No server-side rendering requirement at runtime.
- No server-side function or edge function dependency.
- Tools should load lazily where practical.
- CPU-heavy work must be cancellable and moved into Workers.
- WASM modules must be loaded only by the relevant tool.
- The UI must remain responsive during processing.
- All tool inputs/outputs must be explicit and serializable where possible.

### 5.4 Static hosting compatibility

The build must deploy successfully to:

- GitHub Pages.
- Cloudflare Pages static hosting.
- Netlify static hosting.
- Any generic static web host.
- A local static web server.

The app must support a configurable base path (for project pages such as `/bluekit/`). It must not assume root-path hosting.

Some browser capabilities, including Service Workers and OPFS, require a secure context. Standard static hosting over HTTPS satisfies the intended deployment model. Local development should use `localhost`.

---

## 6. Core Application Modules

### 6.1 Application shell

Responsibilities:

- Navigation, sidebar, tabs, command palette, settings.
- Tool discovery and favorites.
- Layout persistence.
- Global notifications and progress indicators.
- Import/export entry points.
- Local/offline status indicator.

### 6.2 Tool catalog and registry

The registry is the heart of the application. It describes each available tool and makes tools discoverable without hardcoding each tool into navigation.

Each tool manifest should include:

- Stable ID.
- Display name and short description.
- Category and tags.
- Version.
- Input types and constraints.
- Output types.
- Runtime requirement (`main`, `worker`, `wasm-worker`).
- Required browser capabilities.
- External network requirements, if any.
- Data-handling classification.
- Documentation/help reference.
- Related tools and suggested next operations.

Example manifest:

```json
{
  "id": "windows.evtx-inspector",
  "name": "EVTX Inspector",
  "version": "0.1.0",
  "category": "windows",
  "description": "Parse and inspect Windows Event Log files locally.",
  "tags": ["evtx", "windows", "event-log", "forensics"],
  "runtime": "wasm-worker",
  "input": [{ "type": "file", "accept": [".evtx"] }],
  "output": [{ "type": "event-records", "format": "bluekit.events.v1" }],
  "capabilities": ["file.read", "worker.execute"],
  "network": "none",
  "dataHandling": "local-only"
}
```

### 6.3 Tool execution contract

Tool modules should implement a common typed contract. Exact TypeScript types can evolve during implementation, but the following concepts are required:

```ts
export interface BlueKitTool<Input, Output> {
  manifest: ToolManifest;
  initialize?(context: ToolContext): Promise<void>;
  execute(
    input: Input,
    context: ToolContext,
    signal: AbortSignal
  ): Promise<Output>;
}
```

`ToolContext` should provide only approved capabilities:

- Progress reporting.
- Structured logging to the local UI.
- Cancellation signal.
- Local dataset access.
- Local persistence access where explicitly declared.
- Approved direct-provider connector access where explicitly declared.

The context must not expose arbitrary unrestricted access to application internals. Tool input/output schemas should be versioned. Tools should return structured errors, warnings, and metadata rather than throwing unhandled errors into the UI.

### 6.4 Tool categories and planned catalog

This is the intended product catalog. It is not a promise that every entry ships in the first release. Each tool needs an implementation assessment, licensing review, browser-feasibility test, and test fixtures.

#### A. Encoding and data transformation

- Base64 / Base32 encode and decode.
- Hex encode and decode.
- URL encode/decode.
- HTML entity encode/decode.
- Unicode inspector/converter.
- ROT13 and common text transforms.
- XOR operations and repeating-key XOR analysis helpers.
- Gzip / Zlib decompression and compression where feasible.
- Hash calculator (MD5, SHA-1, SHA-256, SHA-384, SHA-512 where supported).
- HMAC calculator.
- JSON beautifier/minifier.
- XML formatter.
- YAML validator/formatter.
- Regex tester and extractor.
- String extraction.
- Timestamp and epoch conversion.
- Defang/refang indicators.
- Data comparison/diff.

#### B. IOC and threat intelligence

- IPv4/IPv6 parser and validator.
- Domain and URL parser/normalizer.
- Hash format detection.
- IOC extraction from arbitrary text, JSON, logs, email, and files.
- Defang/refang.
- Bulk IOC deduplication and categorization.
- DNS record lookup where a public DoH endpoint is configured.
- RDAP/WHOIS-style registration lookup where browser access is supported.
- ASN and prefix reference lookup where data is locally available or a compatible direct API exists.
- Provider enrichment connectors (see Section 10).

#### C. Email and phishing analysis — MailSleuth

- `.eml` import and raw email paste.
- MIME parsing and multipart body extraction.
- Header parsing and normalization.
- `Received` chain display and candidate originating IP extraction (with caveats).
- From / Reply-To / Return-Path comparisons.
- Authentication-Results display and independent SPF/DKIM/DMARC verification support where feasible.
- URL extraction from text and HTML bodies.
- Attachment extraction as local Blobs.
- Attachment filename, MIME type, size, and magic-byte identification.
- MD5/SHA-1/SHA-256 hashes.
- Defanged URL display and safe copy.
- IOC enrichment of selected URLs, domains, IPs, and hashes.
- HTML body preview in a sandboxed, script-disabled context with remote resource loading disabled by default.
- Exportable analysis report.

#### D. Windows analysis

- EVTX parser and event viewer.
- Sysmon event viewer and field explorer.
- Windows Event ID reference.
- SID converter/resolver (local well-known SID dataset; no AD lookup implied).
- GUID/CLSID reference lookup.
- NTSTATUS / Win32 error lookup.
- Windows privilege reference.
- Registry export parser.
- Scheduled Task XML parser.
- Service configuration parser.
- Windows security descriptor / SDDL parser (where feasible).
- Process tree reconstruction from supplied event data.
- Timeline generation from normalized event records.

#### E. Active Directory analysis

- LDAP attribute reference explorer.
- `userAccountControl` flag decoder.
- SID / RID helpers.
- SPN parser and analyzer.
- Kerberos ticket metadata parser (do not claim to decrypt tickets without the required keys).
- GPO metadata and XML parser.
- BloodHound JSON/ZIP export viewer for supported schema versions.
- ACL/security descriptor parser for supplied data.
- Domain trust metadata viewer for imported data.
- AD object attribute comparison.

#### F. Network analysis

- PCAP/PCAPNG metadata and packet summary parser.
- Packet conversation table.
- DNS query/response extraction.
- HTTP request/response metadata extraction.
- TLS certificate and handshake metadata extraction.
- Certificate decoder.
- JA3/JA4 fingerprint inspection when sufficient handshake fields exist.
- IP conversation mapping.
- Port and protocol reference.
- User-Agent parser.

No live network scanning or packet capture is performed by BlueKit. Network tools analyze user-supplied capture files or explicit public lookups.

#### G. Malware and file triage

- File type identification using signatures/magic bytes.
- SHA-256 and other supported hash calculation.
- Strings extraction (ASCII and UTF-16LE initially).
- Entropy calculation by file and by configurable chunk.
- PE header and section inspection.
- PE imports/exports viewer.
- PE timestamp and architecture metadata.
- Authenticode signature metadata inspection where feasible; do not claim full trust validation without a reliable trust chain implementation.
- ELF header and section inspection.
- YARA/YARA-X scanning where a suitable browser-compatible engine is included.
- Hex viewer.
- File metadata comparison.

BlueKit must never execute the file being analyzed.

#### H. Digital forensics

- Prefetch parser.
- Amcache parser.
- Shimcache/AppCompatCache parser.
- LNK parser.
- Jump Lists parser.
- ShellBags parser.
- MFT metadata parser.
- USN Journal parser.
- Browser history parsers for user-supplied exports/databases.
- Forensic timeline generator.

The exact supported artifact versions and parser limitations must be documented per tool.

#### I. Detection engineering and rule authoring

See Section 8 for detailed requirements.

#### J. Linux analysis

- SSH/authentication log analyzer.
- `auth.log` / `secure` parser.
- `journalctl` export parser (JSON and supported text formats).
- auditd log parser.
- sudo event analyzer.
- systemd unit file inspector.
- cron expression parser and crontab inspector.
- Linux account/group file parser for user-supplied files.
- Linux timeline generator.

#### K. Cloud security

- AWS CloudTrail JSON parser.
- Azure sign-in and audit log parser.
- Microsoft Entra ID event parser.
- IAM policy JSON inspector (syntax and static policy structure; no authoritative cloud permission simulation initially).
- Common cloud audit event normalization.

#### L. General references and utilities

- CIDR/subnet calculator.
- IPv4/IPv6 range parser.
- Common ports/protocols lookup.
- MIME type and file signature lookup.
- CVE reference lookup via public data feeds/APIs.
- CISA KEV dataset lookup.
- EPSS data lookup where permitted.
- MITRE ATT&CK browser.
- Cron expression parser.
- UUID/GUID converter.
- Certificate inspector.
- JWT decoder (local decoding only; clearly state that decoding does not validate signatures).
- JSON/YAML/XML utilities.

---

## 7. MailSleuth — Email Analysis Workspace

MailSleuth is a first-class module, not a small utility buried in the catalog.

### 7.1 Inputs

- Drag-and-drop `.eml` file.
- File picker for `.eml`.
- Paste raw headers or full raw message.
- Optionally import a plain-text email body for partial analysis.

### 7.2 Analysis stages

1. Parse raw RFC-style message and MIME structure.
2. Extract normalized headers.
3. Display sender, recipient, reply-to, return-path, subject, date, message ID, MIME boundaries, and received chain.
4. Extract plain-text and HTML body parts.
5. Extract URLs from both text and HTML content.
6. Extract attachments and calculate local hashes.
7. Display authentication-related headers.
8. Offer optional independent authentication checks when a safe direct browser mechanism exists.
9. Allow selected indicators to be sent to configured providers after explicit confirmation.
10. Generate a local report.

### 7.3 Authentication analysis requirements

- Show `Authentication-Results` as evidence supplied by the receiving mail system, not as proof by itself.
- Do not trust an arbitrary `Authentication-Results` header in an uploaded email without identifying the receiving/authenticating domain and message path.
- Distinguish SPF, DKIM, and DMARC outcomes.
- Explain when independent verification is impossible because required DNS or cryptographic context is unavailable.
- Highlight From/Reply-To/Return-Path mismatches as observations, not automatic phishing verdicts.
- Preserve original raw header values in an evidence view.

### 7.4 URL analysis requirements

- Extract URLs from text and HTML.
- Decode common HTML entities before extraction.
- Preserve the original URL and a normalized comparison form.
- Show hostname, registrable domain when a Public Suffix List dataset is available, scheme, port, path, and query presence.
- Defang URLs for safe display and provide explicit refang/copy actions.
- Never automatically navigate to extracted URLs.
- Do not fetch arbitrary URL destinations from the browser automatically. Any optional URL fetch/redirect inspection must be a separately designed, opt-in feature with SSRF-like and local-network exposure considerations. For the initial version, omit active URL fetching.

### 7.5 Attachment analysis requirements

- Extract attachments locally.
- Show declared MIME type and detected file type separately.
- Calculate local hashes.
- Offer strings, entropy, PE/ELF metadata, and YARA scanning when applicable.
- Download an extracted attachment only after explicit user action.
- Never upload the attachment automatically.
- VirusTotal hash lookup and file upload are separate actions. Initial integration should prefer hash lookup only.

### 7.6 Report

A report should contain:

- Input filename and local processing time.
- Parsed headers.
- Authentication observations.
- Extracted URLs/domains/IPs/hashes.
- Attachment metadata and hashes.
- External provider findings with provider name and query time.
- Warnings and analysis limitations.
- Analyst notes.

Export formats: JSON and self-contained HTML initially; PDF may be added later if browser-side generation is reliable.

---

## 8. Detection Engineering and Rule Studio

This is a major product area. It should include rule creation, validation, testing, library management, and conversion where technically feasible.

### 8.1 Planned formats

| Format | Primary role | Initial priority |
|---|---|---:|
| YARA | File/content matching | P0 |
| Sigma | Generic log detection rules | P0 |
| YARA-X | Modern YARA-family rule engine | P1 after browser engine feasibility test |
| Suricata | Network IDS signatures | P1 |
| Snort | Network IDS signatures | P2 |
| Wazuh rules | Host/log event rules | P2 |
| KQL | Microsoft Sentinel hunting/detection queries | P2 (editor/reference first) |
| SPL | Splunk search/detection queries | P2 (editor/reference first) |
| Elastic EQL / ES|QL | Event queries | P2 (editor/reference first) |
| Zeek scripts | Network analysis scripts | P3 |
| osquery SQL | Endpoint query authoring | P3 |

Priority indicates product sequencing, not a guarantee of full execution capability. For formats that require a native runtime or environment-specific backend, BlueKit may initially provide editing, formatting, documentation, and export only.

### 8.2 Rule Studio common capabilities

- Syntax-highlighted editor.
- Line numbers and diagnostics.
- Basic autocomplete/snippets.
- Format-specific templates.
- Metadata editor.
- Rule validation.
- Local test harness where a compatible engine exists.
- Positive and negative test fixtures.
- Match/no-match result display.
- Test evidence and matched fields/strings where supported.
- Rule tags and ATT&CK mapping.
- Rule version history stored locally.
- Diff between local versions.
- Import/export files.
- Collections and favorites.
- Source/license/attribution tracking for imported rules.

### 8.3 YARA Studio

Required features:

- Create/edit `.yar` and `.yara` text.
- Syntax highlighting and common keyword snippets.
- Parse/compile validation using a browser-compatible engine.
- Test against user-selected local files.
- Display matched rule names, metadata, matched strings, offsets, and scan errors when the engine exposes them.
- Scan multiple files with progress and cancellation.
- Rule metadata display.
- Import/export individual rules and rule collections.
- Explain engine/version compatibility.

Implementation gate: evaluate whether YARA-X or another suitable engine can be built and maintained for browser execution through WASM. Do not assume full compatibility with all YARA versions/modules. Maintain a documented supported-feature matrix and test fixtures. Do not execute samples.

### 8.4 Sigma Studio

Required features:

- YAML editor and formatting.
- Validation against the current official Sigma schema bundled with the release.
- Metadata editing for title, ID, status, description, references, author, date, modified, logsource, detection, false positives, level, and tags.
- Log source and field reference helpers.
- Detection condition helper.
- ATT&CK tag picker backed by a versioned local dataset.
- Visual rule builder for common simple patterns.
- Test rules against user-supplied normalized JSON events.
- Clearly indicate that local test execution supports only the implemented Sigma subset.
- Convert rules to selected target languages only when a compatible browser library/WASM build is included; otherwise provide a clear “author/validate/export only” capability state.

Initial test harness should support a documented subset of Sigma detection semantics, including common exact values, lists, basic wildcards, and common modifiers. Unsupported constructs must produce a diagnostic, not a false negative presented as authoritative.

### 8.5 Other rule formats

Suricata/Snort/Wazuh/Zeek/KQL/SPL/Elastic/osquery should use the same workspace conventions but be added progressively. For each format, specify whether BlueKit supports:

- Editing only.
- Syntax validation.
- Formatting.
- Local execution/testing.
- Conversion/export.

Never present an editor as a complete detection engine.

### 8.6 Rule source library

Support local import/export and optional update/import of public rule sources. Each imported rule should preserve:

- Original source URL/repository.
- License identifier and attribution.
- Upstream rule ID.
- Upstream version/commit/tag when known.
- Import time.
- Local modifications.

Do not bundle or redistribute third-party rule packs without reviewing their licenses and attribution requirements. Prefer user-initiated import of compatible public rule repositories or clearly licensed release artifacts.

---

## 9. Tool Pipelines and Recipes

The pipeline engine is a defining feature. It allows outputs from one operation to become inputs to another, similar to CyberChef recipes.

### 9.1 Pipeline requirements

- Run each tool independently.
- Chain compatible tools.
- Save and reopen recipes locally.
- Import/export recipes as JSON.
- Inspect each step's input and output.
- Run from a selected step where previous output is available.
- Reorder, disable, duplicate, and remove steps.
- Cancel execution.
- Show per-step progress and errors.
- Validate input/output compatibility before execution.
- Avoid automatically executing external lookups without explicit consent.

### 9.2 Typed data model

Tools should use stable data types such as:

- `text/plain`
- `application/json`
- `application/yaml`
- `application/octet-stream`
- `bluekit.ioc-list.v1`
- `bluekit.email-message.v1`
- `bluekit.event-records.v1`
- `bluekit.sigma-rule.v1`
- `bluekit.yara-rule.v1`
- `bluekit.file-metadata.v1`
- `bluekit.enrichment-results.v1`

A typed output should contain data plus provenance metadata where appropriate.

### 9.3 Example recipe: email investigation

```text
EML File
  -> MailSleuth Parser
  -> URL / IP / Domain / Hash Extractor
  -> IOC Normalizer
  -> Deduplicator
  -> [Optional: selected provider lookups]
  -> Unified Findings
  -> HTML / JSON Report
```

### 9.4 Example recipe: Windows event triage

```text
EVTX File
  -> EVTX Parser
  -> Event Filter
  -> Field Normalizer
  -> Process / User / Host Correlator
  -> [Optional: Sigma subset test]
  -> Timeline Builder
  -> Export
```

### 9.5 Visual workflow builder

A node-based visual editor is desirable but not required for the first usable release. The first implementation may use a linear recipe list with drag-and-drop reordering. A graph editor can follow once the typed pipeline model is stable.

---

## 10. External Integrations — Direct Browser Only

### 10.1 Integration principle

External providers are optional enrichment sources, not dependencies of the core application.

- No BlueKit proxy.
- No BlueKit API gateway.
- No server-side API key storage.
- No automatic transmission of user files.
- Each provider connector runs in the browser.
- Each connector must document CORS, credential handling, quotas, terms, and data exposure.
- If a provider blocks CORS or forbids client-side credentials, that provider is marked unsupported for direct integration. Do not work around this with a hidden proxy.

### 10.2 Proposed provider catalog

| Provider / source | Intended use | Integration status |
|---|---|---|
| VirusTotal | IP/domain/URL/hash reputation and reports | Candidate; verify endpoint CORS, API terms, quotas, and browser key exposure before enabling |
| AbuseIPDB | IP reputation and abuse reports | Direct browser mode is not supported by its documented CORS policy; show provider reference/manual workflow only unless provider changes policy |
| AlienVault OTX | IOC pulses and threat intelligence | Candidate; validate CORS and key handling |
| URLhaus | Malware-hosting URL intelligence | Candidate; validate browser API behavior, key requirements, and usage terms |
| GreyNoise Community | IP scanning/noise context | Candidate; validate CORS, quota, endpoint access |
| Google Safe Browsing / Web Risk | Unsafe URL checks | Check product eligibility and commercial terms; Safe Browsing is non-commercial, Web Risk is the commercial product |
| Have I Been Pwned | Email breach exposure / Pwned Passwords | Pwned Passwords range lookup can be used without a key; authenticated account APIs must not expose keys in the browser |
| MalwareBazaar | Malware hash/metadata intelligence | Candidate; validate current API/browser constraints and terms |
| NVD | CVE reference data | Prefer public downloadable/versioned datasets where possible; direct API only if CORS/quota behavior is suitable |
| CISA KEV | Known exploited vulnerability catalog | Prefer locally cached static JSON feed with explicit update timestamp |
| MITRE ATT&CK | Tactics, techniques, software, groups | Bundle a versioned, attributable dataset; allow optional user-triggered update |
| RDAP | Domain/IP registration data | Direct lookup where the target RDAP service permits browser access |
| Public DNS-over-HTTPS | DNS record lookups | Direct browser requests to a user-configured supported resolver; disclose resolver privacy |

The integration catalog is intentionally a candidate list. Provider availability, API versions, policies, CORS headers, rate limits, and licensing can change. Revalidate official documentation before implementing each connector.

### 10.3 Provider capability manifest

Each integration should declare:

- Provider ID and display name.
- Supported indicator types.
- Required credentials and where they are held.
- Whether direct browser CORS is supported and tested.
- Endpoint/method/header requirements.
- Quota information and rate-limit handling.
- Terms/acceptable use URL.
- Data sent to provider.
- Whether requests can be performed without sending full user content.
- Cache policy and maximum cache age.
- Error states and manual fallback URL.

### 10.4 API key handling

Because there is no backend, any API key used by a direct browser connector is available to the browser runtime and to a sufficiently privileged user inspecting their own browser. The application must say this clearly.

Default behavior:

- API keys are held in memory for the current session.
- Do not persist keys by default.
- Provide a clear “forget key” action.
- Do not include keys in URLs, logs, error messages, analytics, telemetry, recipe exports, or reports.
- Use provider-recommended auth headers where supported.
- Warn users that browser storage is not equivalent to a server-side secret vault.
- If optional persistence is ever implemented, make it opt-in and require a user passphrase for encrypted-at-rest storage; explain that a weak passphrase weakens protection.

### 10.5 External request confirmation

Before sending an IOC to a provider, show:

- Which provider will receive it.
- The exact indicator(s) being sent.
- Whether a credential is attached.
- Whether the provider may store or share queried/submitted data under its terms.
- The option to cancel.

Never upload an attachment automatically. A hash lookup is distinct from file upload and must be labeled separately.

### 10.6 Unified enrichment result

Store/display the provider results separately. A normalized item should include:

```ts
interface EnrichmentResult {
  providerId: string;
  indicator: string;
  indicatorType: "ip" | "domain" | "url" | "hash" | "email";
  queriedAt: string;
  status: "success" | "not-found" | "rate-limited" | "unauthorized" | "cors-blocked" | "error";
  verdict?: string;
  confidence?: number;
  rawSummary?: unknown;
  sourceUrl?: string;
  limitations?: string[];
}
```

Do not average verdicts or fabricate a universal score. If a summary is presented, it must preserve source attribution and uncertainty.

---

## 11. Local Storage and Data Management

### 11.1 Storage technologies

| Technology | Use |
|---|---|
| IndexedDB | Structured records: settings, recipes, history, rule metadata, investigation metadata, cached enrichment |
| OPFS | Larger local files and generated artifacts where supported |
| Cache Storage | App shell, versioned bundles, static data packs |
| In-memory state | Active API keys, temporary inputs, active tool state |

Use capability detection and fallback paths. Storage quotas differ by browser and may be evicted. The UI must display storage usage when available and handle quota errors safely.

### 11.2 Local data entities

Initial logical stores:

- `settings`
- `favorites`
- `recentTools`
- `toolHistory`
- `recipes`
- `recipeRuns`
- `rules`
- `ruleCollections`
- `ruleTestCases`
- `investigations`
- `evidenceItems`
- `iocItems`
- `enrichmentCache`
- `datasetVersions`
- `importJobs`

Store schema versions and implement migrations. No local record should require a server-side account ID.

### 11.3 Investigation workspace

An investigation may contain:

- Name and description.
- Created/modified timestamps.
- Analyst notes.
- Imported evidence references.
- Extracted indicators.
- Enrichment results.
- Timelines.
- Links between entities.
- Tool execution records.
- Exported report references.

All investigation content remains in browser storage unless explicitly exported or sent to an external provider.

### 11.4 Export and backup

Provide a versioned BlueKit archive format, for example `.bluekit` (ZIP containing a manifest and JSON/blob assets), with:

- Workspace metadata.
- Recipes.
- User-created rules.
- Investigations and notes.
- Evidence files when selected.
- Relevant local references only where licensing permits.

Import must validate archive size, entry count, path names, schema versions, and decompressed sizes. Reject path traversal entries and suspicious archive structures.

### 11.5 Clear data controls

Settings must offer:

- Clear recent history.
- Clear enrichment cache.
- Delete selected investigations.
- Delete all local BlueKit data.
- Forget all in-memory API keys.
- View approximate storage usage.

Destructive actions require explicit confirmation.

---

## 12. Dataset and Reference Data Management

BlueKit needs useful reference data without a server database.

### 12.1 Bundled data

Potential bundled datasets:

- Windows Event IDs and descriptions.
- NTSTATUS and Win32 error references.
- Windows privileges and selected well-known SIDs.
- Common port/protocol references.
- MIME types and file signatures.
- MITRE ATT&CK STIX-derived data.
- CISA KEV snapshot.
- Public Suffix List snapshot for domain normalization.
- Sigma schemas and selected reference metadata.

Each dataset must have:

- Dataset ID.
- Version.
- Upstream source.
- License/attribution.
- Release timestamp.
- Schema version.
- File hash/checksum.
- Supported application versions.

### 12.2 Updates

- App can work with bundled datasets offline.
- User may initiate update checks/downloads.
- Updates are fetched as static files from the configured static release origin.
- No user investigation data is sent during dataset updates.
- Validate checksum and schema before replacing local data.
- Keep the previous working version until the update is validated.
- Display dataset version and last update time.

### 12.3 Rule pack updates

Rule packs from public repositories should be opt-in imports or user-selected updates. Preserve upstream license, attribution, commit/tag, and rule metadata. Do not silently pull arbitrary executable plugins.

---

## 13. Offline and PWA Requirements

### 13.1 Offline behavior

After initial installation/cache warm-up, BlueKit should support local tools without an internet connection.

Offline-capable features should include:

- Encoding/transformation tools.
- Local file metadata and hashing.
- Email parsing and local analysis.
- Log parsing for supported formats.
- Rule editing and local validation.
- YARA scanning if the engine and rule assets are locally available.
- Sigma validation and supported-subset event testing.
- Local reference searches.
- Saved recipes and investigations.

Unavailable offline features must be labeled clearly (for example, live reputation lookup or dataset update).

### 13.2 PWA behavior

- Installable manifest.
- Service worker for application shell and selected tool assets.
- Versioned cache strategy.
- Safe update prompt when a new application version is ready.
- Avoid caching sensitive third-party API responses in Cache Storage by default.
- Provide an offline/online status indicator.

### 13.3 Cache controls

Users should be able to clear cached application data and datasets independently from their saved investigations. Do not delete user data as part of an ordinary application update.

---

## 14. Privacy and Security Requirements

BlueKit handles potentially sensitive security evidence. Privacy is a product requirement, not a marketing claim.

### 14.1 Data flow guarantees

- No analytics that collect tool inputs, file contents, IOC values, email addresses, or API keys.
- No external telemetry by default.
- No third-party scripts that can inspect tool input areas unless they are an essential, audited dependency.
- No uploads to BlueKit-owned infrastructure.
- No automatic submission of files, emails, URLs, hashes, or IOCs to intelligence providers.
- External requests are visible and user-initiated.
- Static hosting logs may record ordinary asset requests and IP metadata; the project must not claim the hosting provider receives no network metadata.

### 14.2 Content isolation

- Treat every uploaded file and parsed field as untrusted input.
- Render user-controlled text as text, not HTML.
- Sanitize HTML email bodies and render them in a sandboxed frame with scripts disabled and remote resources blocked by default.
- Do not evaluate user-provided JavaScript, expressions, or templates.
- Disable automatic navigation to extracted URLs.
- Avoid active content previews for HTML, SVG, PDF, Office, and other risky formats unless isolated and explicitly designed.
- Apply size limits and parser timeouts/cancellation.
- Guard against decompression bombs and excessive archive expansion.
- Guard against pathological regex inputs and CPU exhaustion.

### 14.3 Dependency and supply-chain security

- Pin dependency versions.
- Generate an SBOM for releases.
- Review license and provenance of WASM binaries and parser libraries.
- Avoid loading unpinned code from CDNs at runtime.
- Prefer bundling reviewed dependencies with the static build.
- Use reproducible release builds where practical.
- Scan dependencies and run automated vulnerability checks.
- Sign release artifacts or publish checksums.

### 14.4 Content Security Policy

Define a restrictive CSP compatible with the selected static host and worker/WASM design. Explicitly allow only required external API origins. Avoid broad `connect-src *`. WASM execution may require CSP considerations; document the required directives and keep them as narrow as possible.

### 14.5 Browser security limitations

BlueKit cannot provide a secure secret vault against the browser owner or malicious extensions. It also cannot hide an API key from the browser runtime using JavaScript obfuscation. Explain these limitations in integration settings.

---

## 15. Performance and Reliability

### 15.1 Performance targets

Targets should be measured on representative mid-range desktop hardware and documented with test fixtures.

- Initial shell should appear quickly with lazy-loaded tools.
- Basic utilities should run without perceptible delay on ordinary inputs.
- UI must remain responsive while large inputs are processed in Workers.
- Long operations must show progress, allow cancellation, and handle errors.
- Large event lists should use virtualization/pagination rather than rendering every row.
- Heavy WASM engines should be lazy-loaded and cached.

### 15.2 Resource limits

Every parser/tool should define:

- Maximum input size.
- Expected memory overhead.
- Whether streaming/chunking is supported.
- Worker count policy.
- Timeout/cancellation behavior.
- Supported formats/versions.
- Known limitations.

No tool should silently consume unbounded memory or block the UI thread.

### 15.3 Error model

Errors should be structured and actionable:

- Invalid input.
- Unsupported format/version.
- Malformed content.
- File too large.
- Resource limit reached.
- Operation cancelled.
- Browser capability unavailable.
- Provider CORS blocked.
- Provider rate limited.
- Provider authentication failed.
- Network unavailable.
- Unsupported rule syntax/feature.

Do not present a CORS failure as an invalid IOC or a provider “not found” result.

---

## 16. Testing and Quality Requirements

### 16.1 Unit testing

- Parsers tested with valid, malformed, truncated, and edge-case fixtures.
- Tool input/output schema tests.
- Registry and manifest validation.
- Pipeline type compatibility tests.
- Storage migration tests.
- Dataset checksum/schema validation tests.
- Provider response normalization tests using mocked fixtures.

### 16.2 Browser integration testing

Test at minimum on current stable versions of:

- Chromium-based browser.
- Firefox.
- WebKit-based browser where practical.

Verify:

- File input and drag/drop.
- Worker creation and cancellation.
- WASM loading.
- IndexedDB persistence.
- OPFS feature detection/fallback.
- Service Worker updates.
- Offline operation.
- Static hosting under a subpath.
- CSP behavior.
- Import/export.

### 16.3 Security testing

- Malformed file fixtures.
- Oversized input and decompression-bomb-like fixtures.
- HTML email with scripts and remote resources.
- Archive path traversal attempts.
- Malformed YAML/JSON/XML.
- Regex denial-of-service-style patterns.
- API key redaction tests.
- Ensure no input data is sent to BlueKit static origin beyond ordinary asset requests.
- Ensure provider requests occur only after user action.

### 16.4 Acceptance criteria

The architecture is not considered complete until all are true:

1. The built application can be hosted as static files with no server-side application runtime.
2. No BlueKit API endpoint is required for core operation.
3. Browser network inspection shows no tool inputs/files sent to the static host.
4. All included local tools work without an account.
5. User data persists locally and can be exported/imported.
6. The app supports usable offline workflows after cache installation.
7. Heavy processing does not freeze the main UI thread.
8. Each tool declares its input/output types and data-handling class.
9. External integrations display the data being sent and respect provider constraints.
10. Unsupported CORS/authentication cases are clearly marked, not hidden behind a proxy.
11. YARA and Sigma capabilities have explicit supported-feature matrices and test coverage.
12. The UI follows the dark, blue-accented, terminal-inspired compact design direction.

---

## 17. Development Roadmap

The tool catalog should grow incrementally. The priority is to get the shared architecture right before adding dozens of unrelated parsers.

### Phase 0 — Technical feasibility spikes

- Confirm static build and subpath deployment.
- Validate Web Worker and WASM bundling.
- Test IndexedDB and OPFS fallback behavior.
- Prototype `.eml` parsing in-browser.
- Prototype EVTX parser feasibility.
- Evaluate YARA-X/YARA browser build options and supported features.
- Evaluate Sigma YAML/schema validation and a documented local test subset.
- Test direct provider API CORS and terms for each candidate integration.

**Exit criteria:** No backend required; key technical risks understood; implementation choices documented.

### Phase 1 — Application foundation

- Static application shell.
- Navigation/sidebar.
- Command palette.
- Tool catalog and manifests.
- Tool execution contract.
- Worker manager.
- Local settings and IndexedDB layer.
- Basic import/export.
- Dark terminal-inspired design system.

### Phase 2 — Core analyst utilities

- Encoding and transformation tools.
- Hash calculator.
- JSON/YAML formatter and validator.
- Regex tester.
- Timestamp converter.
- IOC extractor and normalizer.
- File type identifier.
- Basic strings and entropy tools.

### Phase 3 — MailSleuth and IOC workspace

- EML parser.
- Header analysis.
- MIME/body extraction.
- URL and attachment extraction.
- Local attachment hashing.
- Defang/refang.
- IOC bulk view.
- Provider integration framework.
- First direct-browser-compatible provider connectors only.

### Phase 4 — Rule Studio

- YARA editor and validation.
- YARA local scan engine if browser build passes feasibility.
- Sigma editor and official schema validation.
- Sigma local test harness for documented subset.
- Rule collections and local rule storage.
- Rule import/export and attribution.

### Phase 5 — Windows and Linux event analysis

- EVTX parser and viewer.
- Sysmon event view.
- Windows Event ID reference.
- Process timeline builder.
- Linux auth/audit log parsers.
- Normalization model.

### Phase 6 — Network and malware analysis

- PCAP metadata/conversation parsers.
- DNS/HTTP/TLS extraction.
- PE/ELF inspection.
- YARA scan integration.
- Additional forensic artifacts.

### Phase 7 — Recipes and investigations

- Typed pipeline engine.
- Recipe editor and persistence.
- Investigation workspace.
- Evidence linking and timeline.
- Report export.
- Optional visual node editor.

### Phase 8 — Dataset ecosystem and community expansion

- Versioned dataset manager.
- ATT&CK and reference data packs.
- Public rule pack import workflow.
- Contribution guidelines and tool manifest validation.
- Release checksums/SBOM.
- Community tool contribution process.

---

## 18. Repository Structure (Proposed)

A monorepo is recommended initially. Keep tool implementations isolated by category and avoid a single giant module.

```text
bluekit/
├── public/
│   ├── manifest.webmanifest
│   ├── icons/
│   └── static-datasets/
├── src/
│   ├── app/
│   │   ├── layout/
│   │   ├── navigation/
│   │   ├── command-palette/
│   │   ├── tabs/
│   │   └── settings/
│   ├── core/
│   │   ├── registry/
│   │   ├── runtime/
│   │   ├── workers/
│   │   ├── pipeline/
│   │   ├── schemas/
│   │   ├── storage/
│   │   ├── datasets/
│   │   ├── integrations/
│   │   └── export-import/
│   ├── tools/
│   │   ├── encoding/
│   │   ├── ioc/
│   │   ├── email/
│   │   ├── windows/
│   │   ├── active-directory/
│   │   ├── network/
│   │   ├── malware/
│   │   ├── forensics/
│   │   ├── detection/
│   │   ├── linux/
│   │   ├── cloud/
│   │   └── utilities/
│   ├── workers/
│   ├── components/
│   ├── styles/
│   └── routes/
├── wasm/
│   ├── yara/
│   ├── parsers/
│   └── README.md
├── datasets/
│   ├── manifests/
│   ├── schemas/
│   └── sources.md
├── tests/
│   ├── fixtures/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── architecture/
│   ├── tools/
│   ├── integrations/
│   └── security/
├── scripts/
│   ├── build-datasets/
│   ├── validate-manifests/
│   └── release/
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── CONTRIBUTING.md
└── README.md
```

The exact structure may change with the chosen frontend framework, but the separation between core runtime, tools, datasets, integrations, and tests should remain.

---

## 19. Contribution and Extensibility

The project should eventually accept community tool contributions, but a tool must not be able to execute arbitrary code merely because a manifest exists.

### 19.1 Contribution requirements

Every contributed tool must include:

- Manifest.
- Implementation.
- Input/output schema.
- Unit tests and representative fixtures.
- Documentation and limitations.
- Data-handling classification.
- Network requirements, if any.
- License and dependency attribution.
- Performance/resource limits.

### 19.2 Trust model

Initial releases should bundle reviewed tools at build time. Do not implement a remote arbitrary-plugin marketplace in the first version.

A later community catalog may distribute signed, versioned tool bundles, but it requires a separate threat model, signature verification, origin restrictions, and explicit user consent.

---

## 20. Known Constraints and Risks

| Risk / constraint | Impact | Planned response |
|---|---|---|
| Provider blocks browser CORS | Direct integration impossible | Mark unsupported; do not add proxy |
| Provider forbids exposing API key in client | Authenticated integration may be unsuitable | Disable direct keyed mode; explain limitation |
| API terms restrict commercial use | Hosted public use may be prohibited | Verify terms before enabling; choose alternative or omit |
| Large forensic files exceed browser memory | Parsing may fail or be slow | Streaming/chunking, Workers, limits, OPFS where suitable |
| Browser storage can be evicted | Local history/evidence loss | Export/backup reminders and storage status |
| WASM engine feature gaps | Partial rule compatibility | Versioned support matrix and explicit diagnostics |
| Static app updates | Old cached code/datasets may persist | Versioned service-worker cache and update flow |
| Third-party rule licenses | Redistribution constraints | Import-by-user or bundle only compatible licensed material |
| Browser differences | Uneven feature availability | Feature detection and fallback behavior |
| API credentials in browser | User can inspect own key/runtime | Session-only default and clear warnings |

---

## 21. Open Design Decisions

The following should be resolved during implementation planning, not by introducing a backend:

1. Final frontend choice: SvelteKit static output versus Vite + Svelte.
2. Code editor: CodeMirror 6 versus Monaco, balancing feature set and bundle size.
3. YARA engine: preferred WASM implementation and supported feature level.
4. Sigma test engine: custom documented subset versus a maintained browser-compatible conversion/evaluation engine.
5. EVTX and PCAP parser library selection, licensing, and browser memory behavior.
6. Which public intelligence APIs are truly browser-compatible and permitted for the intended project use.
7. Exact default file-size limits per tool.
8. Whether optional light theme ships in the first release or later.
9. Whether visual node-based recipes are part of the initial release or a later milestone.

---

## 22. Definition of Done for the First Public Release

The first public release should not attempt to implement every category in the long-term catalog. It should demonstrate the complete product philosophy with a small but polished toolset.

Recommended first release:

### Application foundation

- Static deployment to at least one public static host.
- No runtime BlueKit backend.
- No login/account requirement.
- Dark terminal-inspired UI with blue accent and compact density.
- Sidebar, tool search, command palette, tabs, favorites, recent tools.
- IndexedDB-backed local preferences and recipes.
- PWA/offline app shell.

### Initial tools

- Base64 / Hex / URL encode/decode.
- Hash calculator.
- JSON/YAML formatter and validator.
- Regex tester.
- Timestamp converter.
- IOC extractor and defang/refang.
- File type identifier, strings, entropy.
- EML parser with header, URL, and attachment extraction.
- YARA editor/validation and local test if the engine passes feasibility.
- Sigma editor/schema validation and a documented local test subset.
- Windows Event ID reference.

### Initial integrations

- Integration manager UI.
- Direct integrations only for providers whose browser CORS, authentication, quotas, and terms have been verified.
- No hidden proxy.
- No automatic file submission.
- Provider compatibility matrix and manual lookup fallbacks.

### Quality bar

The release is done when the application is useful offline for its local tools, clearly distinguishes local analysis from external lookups, handles untrusted files safely, exports/imports local work, and can be deployed as static files without an application server.

---

## 23. Official References and Technical Reading

These references should be rechecked during implementation because APIs, browser support, versions, and terms can change.

### Browser capabilities

- CyberChef (client-side model and standalone deployment): https://gchq.github.io/CyberChef/
- MDN IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- MDN Origin Private File System: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- MDN Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
- MDN Service Workers: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- MDN Cache API: https://developer.mozilla.org/en-US/docs/Web/API/Cache

### Detection formats

- Sigma specification: https://github.com/SigmaHQ/sigma-specification
- Sigma rule specification: https://sigmahq.io/sigma-specification/specification/sigma-rules-specification.html
- SigmaHQ rules: https://github.com/SigmaHQ/sigma
- YARA: https://yara.readthedocs.io/
- YARA-X: https://github.com/VirusTotal/yara-x
- Suricata rule documentation: https://docs.suricata.io/
- Snort documentation: https://docs.snort.org/

### Threat intelligence / public APIs

- VirusTotal API overview: https://docs.virustotal.com/docs/api-overview
- AbuseIPDB API v2: https://docs.abuseipdb.com/
- AbuseIPDB CORS/security notes: https://docs.abuseipdb.com/
- AlienVault OTX: https://otx.alienvault.com/api
- URLhaus: https://urlhaus.abuse.ch/api/
- GreyNoise: https://docs.greynoise.io/
- Google Safe Browsing: https://developers.google.com/safe-browsing
- Google Web Risk: https://cloud.google.com/web-risk/docs
- Have I Been Pwned API: https://haveibeenpwned.com/api/v3
- NVD API: https://nvd.nist.gov/developers/vulnerabilities
- CISA KEV: https://www.cisa.gov/known-exploited-vulnerabilities-catalog
- MITRE ATT&CK: https://attack.mitre.org/

---

## Final Product Constraint

**BlueKit is a static, browser-native Blue Team workbench.** The static host distributes the application; the user's browser performs the work. Local files, rules, logs, emails, PCAPs, recipes, and investigations stay local unless the user explicitly chooses an external action. If a feature cannot be implemented within that model, it must be marked as unavailable or redesigned — it must not quietly introduce a backend, proxy, or server-side dependency.
