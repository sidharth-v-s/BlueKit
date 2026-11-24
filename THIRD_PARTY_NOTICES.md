# Third-Party Notices

BlueKit bundles and/or depends on the following third-party software. Each retains its own licence. This file is informational; the authoritative licence text ships with each package.

_Last updated: 2026-11-24_

## Runtime dependencies

| Package | Version | Licence | Use |
|---|---|---|---|
| [svelte](https://svelte.dev/) | 5.59.0 | MIT | UI framework |
| [lucide-svelte](https://lucide.dev/) | 1.0.1 | ISC | Icons |
| [@fontsource-variable/inter](https://fontsource.org/fonts/inter) | 5.3.0 | OFL-1.1 | Self-hosted UI font |
| [@fontsource-variable/jetbrains-mono](https://fontsource.org/fonts/jetbrains-mono) | 5.3.0 | OFL-1.1 | Self-hosted mono font |
| [yaml](https://eemeli.org/yaml/) | 2.9.1 | ISC | YAML parsing for validation and formatting |
| [ajv](https://ajv.js.org/) | 8.20.0 | MIT | JSON Schema validation for Sigma rules |
| [ajv-formats](https://github.com/ajv-validator/ajv-formats) | 3.0.1 | MIT | UUID and other format checks for Ajv |
| [@virustotal/yara-x](https://github.com/VirusTotal/yara-x) | 1.23.0 | BSD-3-Clause | YARA rule compilation and scanning in a Web Worker |

Lucide includes icons derived from the Feather project under the MIT licence. Inter and JetBrains Mono are licensed under the SIL Open Font License 1.1; the font files are bundled as WOFF2 subsets and are not sold separately.

## Build and development dependencies

| Package | Version | Licence | Use |
|---|---|---|---|
| [vite](https://vite.dev/) | 8.3.8 | MIT | Build tool and dev server |
| [@sveltejs/vite-plugin-svelte](https://github.com/sveltejs/vite-plugin-svelte) | 7.3.1 | MIT | Svelte integration |
| [typescript](https://www.typescriptlang.org/) | 6.0.3 | Apache-2.0 | Type checking |
| [svelte-check](https://github.com/sveltejs/language-tools) | 4.7.8 | MIT | Svelte/TS diagnostics |
| [vitest](https://vitest.dev/) | 4.1.12 | MIT | Unit tests |
| [@playwright/test](https://playwright.dev/) | 1.65.1 | Apache-2.0 | Browser tests (when a browser is available) |
| [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) | 6.2.8 | Apache-2.0 | IndexedDB test double |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped) | 26.6.6 | MIT | Node type definitions for config files |

## Evaluated, not yet shipped

These were used to gather Phase 0 evidence. They are **not** current dependencies. Before adoption, pin an exact version, record the integrity hash, and re-review the licence.

| Package | Version evaluated | Licence | Intended use |
|---|---|---|---|
| — | — | — | No evaluated packages are pending adoption. |

## Data and specifications

| Item | Licence / terms | Use |
|---|---|---|
| [SigmaHQ Sigma specification](https://github.com/SigmaHQ/sigma-specification) | Public domain (specification content) | `json-schema/sigma-detection-rule-schema.json`, commit `ba9251a`, retrieved 2026-11-21, SHA-256 `eb95ddb1…2d95` |
| [SigmaHQ Sigma specification appendices](https://github.com/SigmaHQ/sigma-specification) | Public domain (specification content) | `src/core/rules/sigma-reference.json`, specification 2.1.0 (2025-08-02), retrieved 2026-11-24, taxonomy SHA-256 `e072d8be…7aaa`, modifiers SHA-256 `7ea44004…9c6a` |
| [MITRE ATT&CK Enterprise](https://attack.mitre.org/) | MITRE ATT&CK licence (reproduced below) | `src/core/rules/attack-enterprise.json`, Enterprise v20.1, retrieved 2026-11-24, source SHA-256 `539a843a…10b5` |
| [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) | U.S. Government work; check terms | Future dataset pack (Phase 8) |

The ATT&CK dataset is a derived subset: active tactics and techniques, their
tactic short names, and sub-technique markers. Revoked and deprecated
techniques are omitted. Regenerate it with
`node scripts/build-attack-data.mjs /path/to/enterprise-attack.json`.

The Sigma reference dataset is a derived subset of the public-domain
specification appendices: logsource rows, taxonomy field lists, and modifier
names with their descriptions. It contains no third-party rule content.
Regenerate it with
`node scripts/build-sigma-reference.mjs /path/to/sigma-appendix-taxonomy.md /path/to/sigma-appendix-modifiers.md`.

### MITRE ATT&CK licence

The MITRE Corporation (MITRE) hereby grants you a non-exclusive, royalty-free
license to use ATT&CK® for research, development, and commercial purposes. Any
copy you make for such purposes is authorized provided that you reproduce
MITRE's copyright designation and this license in any such copy.

"© 2026 The MITRE Corporation. This work is reproduced and distributed with the
permission of The MITRE Corporation."

**Disclaimers**

MITRE does not claim ATT&CK enumerates all possibilities for the types of
actions and behaviors documented as part of its adversary model and framework
of techniques. Using the information contained within ATT&CK to address or
cover full categories of techniques will not guarantee full defensive coverage
as there may be undisclosed techniques or variations on existing techniques not
documented by ATT&CK.

ALL DOCUMENTS AND THE INFORMATION CONTAINED THEREIN ARE PROVIDED ON AN "AS IS"
BASIS AND THE CONTRIBUTOR, THE ORGANIZATION HE/SHE REPRESENTS OR IS SPONSORED BY
(IF ANY), THE MITRE CORPORATION, ITS BOARD OF TRUSTEES, OFFICERS, AGENTS, AND
EMPLOYEES, DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO ANY WARRANTY THAT THE USE OF THE INFORMATION THEREIN WILL NOT
INFRINGE ANY RIGHTS OR ANY IMPLIED WARRANTIES OF MERCHANTABILITY OR FITNESS FOR
A PARTICULAR PURPOSE.

Other third-party datasets must carry version, licence, checksum, and release
timestamp before they are added.

## Provider APIs

External provider names and endpoints referenced in the capability matrix are the property of their respective owners. No provider connector is enabled in this build. Terms review is required before any direct integration is enabled.

## Reporting a licensing issue

If you believe a licence or attribution is missing or incorrect, open an issue with the package name, version, and the relevant licence text. Do not assume a package is approved because it appears in this file; the "evaluated, not yet shipped" section is explicitly not an approval.
