/**
 * External provider capability manifests (spec §10.3).
 *
 * Status reflects direct-browser evidence gathered on 2026-11-20, not vendor
 * marketing. "CORS verified" means an OPTIONS/GET probe from an arbitrary origin
 * returned an Access-Control-Allow-Origin header for that origin. It does not
 * mean quotas, terms, or credential handling have been approved.
 *
 * No connector is enabled in Phase 1. The matrix exists so the UI can be honest
 * about what direct integration will and will not be possible.
 */

export type DirectBrowserStatus =
  | 'supported'
  | 'candidate'
  | 'cors-blocked'
  | 'policy-restricted'
  | 'unverified'
  | 'dataset-only';

export type TermsReview = 'pending-manual-review' | 'requires-commercial-terms';

export interface ProviderManifest {
  id: string;
  name: string;
  intendedUse: string;
  status: DirectBrowserStatus;
  supportedIndicators: string[];
  credentials: string;
  cors: 'verified' | 'blocked' | 'inconclusive' | 'not-applicable';
  /** What a query would send to the provider. */
  dataSent: string;
  /** Raw evidence from the probe, kept short and dated. */
  evidence: string;
  termsUrl: string;
  termsReview: TermsReview;
  manualFallback: string;
  cachePolicy: string;
  notes: string[];
}

const TESTED_AT = '2026-11-20';

export const PROVIDERS: readonly ProviderManifest[] = [
  {
    id: 'virustotal',
    name: 'VirusTotal',
    intendedUse: 'IP, domain, URL, and hash reputation reports.',
    status: 'cors-blocked',
    supportedIndicators: ['ip', 'domain', 'url', 'hash'],
    credentials: 'API key in memory only (never persisted by BlueKit).',
    cors: 'blocked',
    dataSent: 'The indicator value in the request path.',
    evidence: `${TESTED_AT}: GET /api/v3/domains/example.com returned 401 with no Access-Control-Allow-Origin; OPTIONS preflight returned 200 with no ACAO. Browser fetch would be blocked.`,
    termsUrl: 'https://docs.virustotal.com/docs/api-overview',
    termsReview: 'pending-manual-review',
    manualFallback: 'https://www.virustotal.com/gui/search',
    cachePolicy: 'No caching until a connector is approved; cached verdicts would be provider-attributed with timestamps.',
    notes: [
      'A hidden proxy is explicitly out of scope. Direct integration stays unavailable unless VirusTotal changes CORS policy.',
      'Manual lookup remains available through the documented search UI.',
    ],
  },
  {
    id: 'abuseipdb',
    name: 'AbuseIPDB',
    intendedUse: 'IP reputation and abuse reports.',
    status: 'cors-blocked',
    supportedIndicators: ['ip'],
    credentials: 'API key.',
    cors: 'blocked',
    dataSent: 'IP address as a query parameter.',
    evidence: `${TESTED_AT}: GET /api/v2/check returned 401 without ACAO. Vendor documentation states browser use is not supported.`,
    termsUrl: 'https://docs.abuseipdb.com/',
    termsReview: 'pending-manual-review',
    manualFallback: 'https://www.abuseipdb.com/check',
    cachePolicy: 'Not applicable until a direct path exists.',
    notes: ['Reference/manual workflow only. Do not add a proxy to work around the policy.'],
  },
  {
    id: 'alienvault-otx',
    name: 'AlienVault OTX',
    intendedUse: 'IOC context and pulses.',
    status: 'candidate',
    supportedIndicators: ['ip', 'domain', 'url', 'hash'],
    credentials: 'OTX API key in memory only.',
    cors: 'verified',
    dataSent: 'Indicator value and type in the path.',
    evidence: `${TESTED_AT}: GET returned ACAO reflecting the test origin; OPTIONS preflight allowed x-otx-api-key and DELETE/GET/HEAD/PATCH/POST/PUT.`,
    termsUrl: 'https://otx.alienvault.com/api',
    termsReview: 'pending-manual-review',
    manualFallback: 'https://otx.alienvault.com/',
    cachePolicy: 'Provider results may be cached locally with query time and source URL, bounded by provider terms.',
    notes: ['Technical CORS path exists; terms and key-in-browser warnings still need review before enabling.'],
  },
  {
    id: 'urlhaus',
    name: 'URLhaus',
    intendedUse: 'Malware-hosting URL intelligence.',
    status: 'cors-blocked',
    supportedIndicators: ['url', 'domain', 'hash'],
    credentials: 'Auth-Key header (as tested).',
    cors: 'blocked',
    dataSent: 'URL, host, or hash payload.',
    evidence: `${TESTED_AT}: POST /v1/host/ returned 401 without ACAO; OPTIONS preflight returned 401 without CORS headers.`,
    termsUrl: 'https://urlhaus.abuse.ch/api/',
    termsReview: 'pending-manual-review',
    manualFallback: 'https://urlhaus.abuse.ch/browse/',
    cachePolicy: 'Not applicable.',
    notes: ['Do not bypass with a proxy; keep as manual reference unless the provider adds CORS support.'],
  },
  {
    id: 'greynoise',
    name: 'GreyNoise Community',
    intendedUse: 'Internet background-noise context for IPs.',
    status: 'unverified',
    supportedIndicators: ['ip'],
    credentials: 'Community API key.',
    cors: 'inconclusive',
    dataSent: 'IP address in the path.',
    evidence: `${TESTED_AT}: GET and OPTIONS both returned 403 from the test network with no CORS headers. This is inconclusive, not proof of a blocked browser path.`,
    termsUrl: 'https://docs.greynoise.io/',
    termsReview: 'pending-manual-review',
    manualFallback: 'https://viz.greynoise.io/',
    cachePolicy: 'Undecided.',
    notes: ['Retest from a normal browser network before recording a status.'],
  },
  {
    id: 'google-safe-browsing',
    name: 'Google Safe Browsing / Web Risk',
    intendedUse: 'Unsafe URL checks.',
    status: 'policy-restricted',
    supportedIndicators: ['url'],
    credentials: 'API key; Web Risk has commercial terms.',
    cors: 'inconclusive',
    dataSent: 'URL being checked.',
    evidence: `${TESTED_AT}: not probed. Safe Browsing is non-commercial; Web Risk is the commercial product. Eligibility review is required first.`,
    termsUrl: 'https://developers.google.com/safe-browsing',
    termsReview: 'requires-commercial-terms',
    manualFallback: 'https://transparencyreport.google.com/safe-browsing/search',
    cachePolicy: 'Not applicable.',
    notes: ['Do not enable either product before eligibility and terms review.'],
  },
  {
    id: 'hibp-pwned-passwords',
    name: 'Have I Been Pwned — Pwned Passwords',
    intendedUse: 'Password breach exposure using k-anonymity range queries.',
    status: 'supported',
    supportedIndicators: ['password-hash-prefix'],
    credentials: 'None required for the range endpoint.',
    cors: 'verified',
    dataSent: 'First five hex characters of a SHA-1 password hash. The full password never leaves the browser.',
    evidence: `${TESTED_AT}: GET /range/21BD1 returned 200 with Access-Control-Allow-Origin: *; preflight allowed GET and Add-Padding.`,
    termsUrl: 'https://haveibeenpwned.com/API/v3',
    termsReview: 'pending-manual-review',
    manualFallback: 'https://haveibeenpwned.com/Passwords',
    cachePolicy: 'No persistence of password-derived values by default.',
    notes: [
      'Supported in principle, but not enabled until the integration framework has consent, redaction, and rate-limit handling.',
      'Account breach APIs require a key and are not browser-safe per project policy.',
    ],
  },
  {
    id: 'malwarebazaar',
    name: 'MalwareBazaar',
    intendedUse: 'Malware hash and sample metadata.',
    status: 'cors-blocked',
    supportedIndicators: ['hash'],
    credentials: 'Auth-Key header (as tested).',
    cors: 'blocked',
    dataSent: 'Hash query in a form body.',
    evidence: `${TESTED_AT}: POST /api/v1/ returned 401 without ACAO; OPTIONS preflight returned 401 without CORS headers.`,
    termsUrl: 'https://bazaar.abuse.ch/api/',
    termsReview: 'pending-manual-review',
    manualFallback: 'https://bazaar.abuse.ch/browse/',
    cachePolicy: 'Not applicable.',
    notes: ['Hash lookup is distinct from file upload; neither is automatic.'],
  },
  {
    id: 'nvd',
    name: 'NVD CVE API',
    intendedUse: 'CVE reference data.',
    status: 'candidate',
    supportedIndicators: ['cve'],
    credentials: 'No key required; optional API key changes rate limits.',
    cors: 'verified',
    dataSent: 'CVE identifier or query parameters.',
    evidence: `${TESTED_AT}: GET /rest/json/cves/2.0?cveId=... returned 200 with Access-Control-Allow-Origin: * and allowed headers including apiKey.`,
    termsUrl: 'https://nvd.nist.gov/developers/vulnerabilities',
    termsReview: 'pending-manual-review',
    manualFallback: 'https://nvd.nist.gov/vuln/search',
    cachePolicy: 'Prefer versioned local snapshots; direct queries are rate-limited.',
    notes: ['Public CORS works, but bundling versioned data is the better product default.'],
  },
  {
    id: 'cisa-kev',
    name: 'CISA KEV',
    intendedUse: 'Known exploited vulnerabilities catalog.',
    status: 'dataset-only',
    supportedIndicators: ['cve'],
    credentials: 'None.',
    cors: 'blocked',
    dataSent: 'Nothing when using a bundled snapshot.',
    evidence: `${TESTED_AT}: catalog JSON returned 200 with no Access-Control-Allow-Origin; direct browser fetch is blocked.`,
    termsUrl: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    termsReview: 'pending-manual-review',
    manualFallback: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    cachePolicy: 'Bundle a versioned snapshot with release timestamp and checksum; update through the static dataset origin.',
    notes: ['Dataset updates must be static files from the configured release origin, not a BlueKit API.'],
  },
  {
    id: 'mitre-attack',
    name: 'MITRE ATT&CK',
    intendedUse: 'Tactics, techniques, software, and groups.',
    status: 'dataset-only',
    supportedIndicators: ['technique-id'],
    credentials: 'None.',
    cors: 'verified',
    dataSent: 'Nothing when bundled. Optional updates fetch static data.',
    evidence: `${TESTED_AT}: raw STIX index on GitHub returned 200 with Access-Control-Allow-Origin: *; bundling remains the default for offline use.`,
    termsUrl: 'https://attack.mitre.org/',
    termsReview: 'pending-manual-review',
    manualFallback: 'https://attack.mitre.org/',
    cachePolicy: 'Versioned bundled dataset with attribution and checksum.',
    notes: ['CORS works, but a versioned local dataset satisfies offline and reproducibility requirements better.'],
  },
  {
    id: 'rdap',
    name: 'RDAP',
    intendedUse: 'Domain and IP registration data.',
    status: 'candidate',
    supportedIndicators: ['domain', 'ip'],
    credentials: 'None.',
    cors: 'inconclusive',
    dataSent: 'The domain or IP being looked up.',
    evidence: `${TESTED_AT}: rdap.org bootstrap returned 302 with ACAO * and rdap.org/ip followed to a 200 with ACAO *. Direct Verisign/ARIN probes from the test network returned no response, so per-registry CORS must be tested individually.`,
    termsUrl: 'https://www.icann.org/rdap',
    termsReview: 'pending-manual-review',
    manualFallback: 'https://rdap.org/',
    cachePolicy: 'Short-lived local cache with query time.',
    notes: ['Redirection across registries means CORS must hold on the final response, not just the bootstrap.'],
  },
  {
    id: 'doh',
    name: 'DNS-over-HTTPS resolver',
    intendedUse: 'DNS record lookups through a user-configured resolver.',
    status: 'candidate',
    supportedIndicators: ['domain'],
    credentials: 'None; the resolver choice is user-configured.',
    cors: 'verified',
    dataSent: 'Queried domain name and record type to the chosen resolver.',
    evidence: `${TESTED_AT}: Cloudflare DoH JSON endpoint returned 200 with Access-Control-Allow-Origin: *.`,
    termsUrl: 'https://developers.cloudflare.com/1.1.1.1/',
    termsReview: 'pending-manual-review',
    manualFallback: 'System resolver / manual lookup.',
    cachePolicy: 'Not persisted by default; resolver privacy must be disclosed before use.',
    notes: ['Resolver choice is a privacy decision. Do not ship a hardcoded resolver without disclosure.'],
  },
];

export const PROVIDER_MAP: Readonly<Record<string, ProviderManifest>> = Object.fromEntries(
  PROVIDERS.map((provider) => [provider.id, provider]),
);

export const CONNECTORS_ENABLED = false;
