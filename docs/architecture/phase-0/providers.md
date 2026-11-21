# Direct Provider CORS and Terms

**Status:** probed 2026-11-20 · **no connectors enabled**

## Question

Which threat-intelligence and reference APIs can a static browser app call directly, without a BlueKit proxy?

## Decision

Treat direct browser access as a **provider-by-provider capability**, not an assumption. Record CORS evidence, terms status, data sent, and a manual fallback for every candidate. Do not enable any connector until terms review and consent UX exist.

`CONNECTORS_ENABLED = false` in `src/core/integrations/providers.ts`.

## Method and limits

Probes were HTTP `OPTIONS`/`GET` requests from an arbitrary test origin, checking for `Access-Control-Allow-Origin` and allowed headers. Results are dated and kept verbatim in the provider manifest.

Important limits:

- CORS success is **not** permission. Terms, quotas, and credential rules still apply.
- A `403` from a test network is **inconclusive**, not proof of a blocked browser path.
- Redirects matter: the **final** response must carry CORS headers.
- Vendor policies change. Re-probe before enabling a connector.

## Matrix

| Provider | Status | CORS | Evidence summary | Manual fallback |
|---|---|---|---|---|
| VirusTotal | blocked | blocked | 401 with no ACAO; preflight 200 without ACAO | VirusTotal GUI search |
| AbuseIPDB | blocked | blocked | 401 without ACAO; docs say browser use unsupported | AbuseIPDB check page |
| AlienVault OTX | candidate | verified | ACAO reflects origin; `x-otx-api-key` allowed | OTX web UI |
| URLhaus | blocked | blocked | 401 without ACAO on POST and preflight | URLhaus browse |
| GreyNoise Community | unverified | inconclusive | 403 from test network, no CORS headers | GreyNoise Viz |
| Google Safe Browsing / Web Risk | policy-restricted | inconclusive | not probed; eligibility/commercial terms first | Safe Browsing transparency report |
| HIBP Pwned Passwords | supported (not enabled) | verified | 200 with `ACAO: *`; k-anonymity range endpoint | HIBP password page |
| MalwareBazaar | blocked | blocked | 401 without ACAO on POST and preflight | MalwareBazaar browse |
| NVD CVE API | candidate | verified | 200 with `ACAO: *`; `apiKey` allowed | NVD search |
| CISA KEV | dataset-only | blocked | 200 with no ACAO | CISA catalog page |
| MITRE ATT&CK | dataset-only | verified | raw STIX index with `ACAO: *` | ATT&CK site |
| RDAP | candidate | inconclusive | bootstrap redirect with ACAO; per-registry finals untested | rdap.org |
| DNS-over-HTTPS | candidate | verified | Cloudflare JSON endpoint with `ACAO: *` | system resolver |

## Product rules

- **No hidden proxy.** If a provider blocks browsers, the product offers a manual lookup; it does not route through a BlueKit server.
- **Keys live in memory only.** No API key is written to IndexedDB, archives, or logs.
- **Explicit request confirmation.** Before the first external request in a session, show exactly what indicator will be sent, to whom, and under what terms.
- **Data minimization.** Send the indicator, not the surrounding case file.
- **Cache with attribution.** If a result is cached, store provider, query time, and source URL; honor provider caching terms.
- **No automatic enrichment.** A pasted IOC must not trigger network traffic by itself.
- **Manual fallback is a first-class action.** Every blocked provider gets a documented external link.

## Preferred model: datasets over live calls

For reference data (CISA KEV, ATT&CK, NVD, port lists), a **versioned local snapshot** is better than a live call:

- works offline;
- reproducible;
- avoids rate limits;
- keeps the CSP at `connect-src 'self'`;
- makes provenance explicit.

Live calls are reserved for genuinely time-sensitive enrichment that the provider permits.

## Residual risk

- CORS headers can differ by endpoint, method, and response status. One successful path does not bless the whole API.
- Provider terms may prohibit browser-side key exposure even when CORS allows it.
- Rate limits are often per-key and per-IP; a shared NAT can exhaust them.
- A future connector must be disable-able and must fail closed.

## Source of record

`src/core/integrations/providers.ts` is the machine-readable matrix. This document explains the policy; the code carries the dated evidence.
