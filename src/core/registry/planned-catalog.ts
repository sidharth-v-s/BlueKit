import {
  DATA_TYPES,
  DEFAULT_LIMITS,
  type CategoryId,
  type DataType,
  type NetworkRequirement,
  type ToolManifest,
  type ToolPort,
  type ToolRuntime,
} from '@/core/schemas/types';

/**
 * Planned catalog.
 *
 * These entries make the product's intended surface searchable and honest from
 * day one. They carry `status: "planned"`, cannot be executed, and are never
 * presented as shipped capability. When a real implementation lands it wins the
 * registry merge (see registry/index.ts).
 *
 * Phase numbers follow the roadmap in spec §17. Items that the roadmap does not
 * phase explicitly are assigned provisionally; they are planning metadata, not
 * a delivery promise.
 */

type PlannedSeed = {
  id: string;
  name: string;
  category: CategoryId;
  description: string;
  tags?: string[];
  phase: number;
  network?: NetworkRequirement;
  runtime?: ToolRuntime;
  input?: ToolPort[];
  output?: ToolPort[];
  related?: string[];
};

function port(type: DataType, description?: string): ToolPort {
  return description ? { type, description } : { type };
}

function planned(seed: PlannedSeed): ToolManifest {
  const runtime = seed.runtime ?? 'main';
  const network = seed.network ?? 'none';
  const capabilities: ToolManifest['capabilities'] = [];
  if (runtime !== 'main') capabilities.push('worker.execute');
  if (runtime === 'wasm-worker') capabilities.push('wasm.execute');
  if (network !== 'none') capabilities.push('network.direct');

  return {
    id: seed.id,
    name: seed.name,
    version: '0.1.0',
    category: seed.category,
    description: seed.description,
    tags: seed.tags ?? [],
    runtime,
    input: seed.input ?? [],
    output: seed.output ?? [],
    capabilities,
    network,
    dataHandling: network !== 'none' ? 'local-then-user-initiated-external' : 'local-only',
    status: 'planned',
    phase: seed.phase,
    limits: { ...DEFAULT_LIMITS },
    ...(seed.related ? { related: seed.related } : {}),
  };
}

const text = (description = 'Text input') => port(DATA_TYPES.text, description);
const json = (description = 'JSON input') => port(DATA_TYPES.json, description);

export const PLANNED_CATALOG: readonly ToolManifest[] = [
  // ---------------------------------------------------------------------------
  // Encoding and data transformation
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // IOC and threat intelligence
  // ---------------------------------------------------------------------------
  planned({
    id: 'ioc.ip-parser',
    name: 'IP Address Parser',
    category: 'ioc',
    description: 'Validate IPv4/IPv6 values, normalize forms, and classify scope.',
    tags: ['ip', 'ipv4', 'ipv6', 'cidr', 'validate'],
    phase: 2,
  }),
  planned({
    id: 'ioc.domain-parser',
    name: 'Domain & URL Parser',
    category: 'ioc',
    description: 'Normalize domains and URLs; show host, registrable domain, and structure.',
    tags: ['domain', 'url', 'normalize', 'psl'],
    phase: 2,
  }),
  planned({
    id: 'ioc.hash-format',
    name: 'Hash Format Detector',
    category: 'ioc',
    description: 'Identify MD5, SHA-1, SHA-256, SHA-512, and related hash formats.',
    tags: ['hash', 'md5', 'sha256', 'identify'],
    phase: 2,
  }),
  planned({
    id: 'ioc.dns-lookup',
    name: 'DNS Lookup (DoH)',
    category: 'ioc',
    description: 'Query records through a user-configured DNS-over-HTTPS resolver.',
    tags: ['dns', 'doh', 'lookup', 'network'],
    phase: 8,
    network: 'optional',
  }),
  planned({
    id: 'ioc.rdap',
    name: 'RDAP Registration Lookup',
    category: 'ioc',
    description: 'Fetch domain or IP registration data from a browser-compatible RDAP service.',
    tags: ['rdap', 'whois', 'registration'],
    phase: 8,
    network: 'optional',
  }),
  planned({
    id: 'ioc.asn',
    name: 'ASN & Prefix Lookup',
    category: 'ioc',
    description: 'Resolve autonomous-system and prefix context from local or direct data.',
    tags: ['asn', 'bgp', 'prefix'],
    phase: 8,
    network: 'optional',
  }),

  // ---------------------------------------------------------------------------
  // Email — MailSleuth
  // ---------------------------------------------------------------------------
  planned({
    id: 'email.report',
    name: 'Email Analysis Report',
    category: 'email',
    description: 'Build a self-contained JSON or HTML report of a local email analysis.',
    tags: ['email', 'report', 'export'],
    phase: 7,
  }),

  // ---------------------------------------------------------------------------
  // Windows
  // ---------------------------------------------------------------------------
  planned({
    id: 'windows.evtx-inspector',
    name: 'EVTX Inspector',
    category: 'windows',
    description: 'Parse and inspect Windows Event Log files locally in a worker.',
    tags: ['evtx', 'event-log', 'windows', 'forensics'],
    phase: 5,
    runtime: 'wasm-worker',
    input: [port(DATA_TYPES.file, 'Windows EVTX file')],
    output: [port(DATA_TYPES.eventRecords)],
  }),
  planned({
    id: 'windows.sysmon-viewer',
    name: 'Sysmon Event Viewer',
    category: 'windows',
    description: 'Filter and explore Sysmon events with field-level detail.',
    tags: ['sysmon', 'events', 'filter', 'viewer'],
    phase: 5,
    runtime: 'worker',
  }),
  planned({
    id: 'windows.event-id-reference',
    name: 'Windows Event ID Reference',
    category: 'windows',
    description: 'Search bundled Windows event IDs, meanings, and relevant fields.',
    tags: ['event-id', 'reference', 'windows', 'security'],
    phase: 5,
    output: [json('Reference records')],
  }),
  planned({
    id: 'windows.sid',
    name: 'SID Converter',
    category: 'windows',
    description: 'Convert SIDs between string and binary forms; resolve well-known SIDs locally.',
    tags: ['sid', 'rid', 'well-known', 'windows'],
    phase: 5,
  }),
  planned({
    id: 'windows.guid',
    name: 'GUID / CLSID Reference',
    category: 'windows',
    description: 'Look up GUIDs and CLSIDs in a versioned local reference dataset.',
    tags: ['guid', 'clsid', 'ole', 'reference'],
    phase: 5,
  }),
  planned({
    id: 'windows.ntstatus',
    name: 'NTSTATUS / Win32 Error Lookup',
    category: 'windows',
    description: 'Decode NTSTATUS and Win32 error codes with bundled references.',
    tags: ['ntstatus', 'win32', 'error', 'reference'],
    phase: 5,
  }),
  planned({
    id: 'windows.privileges',
    name: 'Windows Privilege Reference',
    category: 'windows',
    description: 'Explain privilege names, meanings, and typical token holders.',
    tags: ['privilege', 'token', 'reference'],
    phase: 5,
  }),
  planned({
    id: 'windows.registry',
    name: 'Registry Export Parser',
    category: 'windows',
    description: 'Parse .reg exports into structured keys, values, and types.',
    tags: ['registry', 'reg', 'forensics'],
    phase: 6,
  }),
  planned({
    id: 'windows.scheduled-task',
    name: 'Scheduled Task Parser',
    category: 'windows',
    description: 'Parse Task Scheduler XML for actions, triggers, and principals.',
    tags: ['scheduled-task', 'xml', 'persistence'],
    phase: 6,
  }),
  planned({
    id: 'windows.service-config',
    name: 'Service Configuration Parser',
    category: 'windows',
    description: 'Parse service export data for paths, accounts, and triggers.',
    tags: ['service', 'persistence', 'sc'],
    phase: 6,
  }),
  planned({
    id: 'windows.sddl',
    name: 'SDDL / Security Descriptor Parser',
    category: 'windows',
    description: 'Decode SDDL into owner, group, DACL, and SACL components.',
    tags: ['sddl', 'acl', 'security-descriptor'],
    phase: 5,
  }),
  planned({
    id: 'windows.process-tree',
    name: 'Process Tree Builder',
    category: 'windows',
    description: 'Reconstruct parent/child process relationships from supplied events.',
    tags: ['process', 'parent', 'tree', 'correlation'],
    phase: 5,
  }),
  planned({
    id: 'windows.timeline',
    name: 'Windows Timeline Builder',
    category: 'windows',
    description: 'Normalize selected Windows events into a sorted analysis timeline.',
    tags: ['timeline', 'events', 'normalize'],
    phase: 5,
  }),

  // ---------------------------------------------------------------------------
  // Active Directory
  // ---------------------------------------------------------------------------
  planned({
    id: 'ad.ldap-attributes',
    name: 'LDAP Attribute Explorer',
    category: 'active-directory',
    description: 'Browse LDAP attribute names, syntaxes, and common operational meaning.',
    tags: ['ldap', 'attributes', 'reference'],
    phase: 5,
  }),
  planned({
    id: 'ad.uac-decoder',
    name: 'userAccountControl Decoder',
    category: 'active-directory',
    description: 'Decode account-control flags and explain the resulting security posture.',
    tags: ['uac', 'flags', 'accounts', 'ad'],
    phase: 5,
  }),
  planned({
    id: 'ad.spn-analyzer',
    name: 'SPN Analyzer',
    category: 'active-directory',
    description: 'Parse service principal names and highlight Kerberoasting exposure context.',
    tags: ['spn', 'kerberos', 'kerberoast'],
    phase: 5,
  }),
  planned({
    id: 'ad.kerberos-ticket',
    name: 'Kerberos Ticket Metadata',
    category: 'active-directory',
    description: 'Inspect ticket metadata without claiming decryption without keys.',
    tags: ['kerberos', 'ticket', 'kirbi', 'ccache'],
    phase: 6,
  }),
  planned({
    id: 'ad.gpo',
    name: 'GPO Metadata & XML Parser',
    category: 'active-directory',
    description: 'Parse supplied Group Policy metadata and XML reports.',
    tags: ['gpo', 'group-policy', 'xml'],
    phase: 6,
  }),
  planned({
    id: 'ad.bloodhound',
    name: 'BloodHound Export Viewer',
    category: 'active-directory',
    description: 'Inspect supported BloodHound JSON or ZIP exports locally.',
    tags: ['bloodhound', 'graph', 'ad', 'export'],
    phase: 7,
  }),
  planned({
    id: 'ad.acl',
    name: 'AD ACL Parser',
    category: 'active-directory',
    description: 'Decode supplied directory ACLs and security descriptors.',
    tags: ['acl', 'permissions', 'ad'],
    phase: 6,
  }),
  planned({
    id: 'ad.trusts',
    name: 'Domain Trust Viewer',
    category: 'active-directory',
    description: 'Summarize supplied trust records, directions, and transitivity.',
    tags: ['trust', 'domain', 'ad'],
    phase: 6,
  }),
  planned({
    id: 'ad.attribute-diff',
    name: 'AD Object Comparison',
    category: 'active-directory',
    description: 'Compare attribute sets across directory objects or snapshots.',
    tags: ['ad', 'diff', 'attributes'],
    phase: 6,
  }),

  // ---------------------------------------------------------------------------
  // Network
  // ---------------------------------------------------------------------------
  planned({
    id: 'network.pcap-metadata',
    name: 'PCAP / PCAPNG Metadata',
    category: 'network',
    description: 'Inspect capture format, interfaces, and packet summaries offline.',
    tags: ['pcap', 'pcapng', 'capture', 'metadata'],
    phase: 6,
    runtime: 'worker',
    input: [port(DATA_TYPES.file, 'Capture file')],
    output: [port(DATA_TYPES.fileMetadata)],
  }),
  planned({
    id: 'network.conversations',
    name: 'Packet Conversations',
    category: 'network',
    description: 'Build IP and port conversation tables with byte and packet counts.',
    tags: ['pcap', 'conversation', 'ips'],
    phase: 6,
    runtime: 'worker',
  }),
  planned({
    id: 'network.dns-extract',
    name: 'DNS Query Extractor',
    category: 'network',
    description: 'Extract DNS queries and responses from supplied captures.',
    tags: ['dns', 'pcap', 'queries'],
    phase: 6,
    runtime: 'worker',
  }),
  planned({
    id: 'network.http-metadata',
    name: 'HTTP Metadata Extractor',
    category: 'network',
    description: 'Extract request methods, hosts, paths, and response metadata from captures.',
    tags: ['http', 'pcap', 'metadata'],
    phase: 6,
    runtime: 'worker',
  }),
  planned({
    id: 'network.tls-metadata',
    name: 'TLS Handshake Metadata',
    category: 'network',
    description: 'Extract SNI, versions, and offered cipher suites without decryption.',
    tags: ['tls', 'sni', 'handshake', 'ja3'],
    phase: 6,
    runtime: 'worker',
  }),
  planned({
    id: 'network.certificate',
    name: 'Certificate Decoder',
    category: 'network',
    description: 'Decode X.509 certificate fields and fingerprints locally.',
    tags: ['x509', 'certificate', 'pem', 'der'],
    phase: 6,
  }),
  planned({
    id: 'network.ja3',
    name: 'JA3 / JA4 Inspector',
    category: 'network',
    description: 'Inspect client fingerprints when the capture contains sufficient handshake fields.',
    tags: ['ja3', 'ja4', 'tls', 'fingerprint'],
    phase: 6,
  }),
  planned({
    id: 'network.port-reference',
    name: 'Port & Protocol Reference',
    category: 'network',
    description: 'Look up common TCP/UDP ports, services, and protocol context.',
    tags: ['port', 'protocol', 'reference'],
    phase: 5,
  }),
  planned({
    id: 'network.user-agent',
    name: 'User-Agent Parser',
    category: 'network',
    description: 'Parse browser, platform, and tooling details without network calls.',
    tags: ['user-agent', 'http', 'browser'],
    phase: 6,
  }),

  // ---------------------------------------------------------------------------
  // Malware and file triage
  // ---------------------------------------------------------------------------
  planned({
    id: 'malware.pe-sections',
    name: 'PE Header & Sections',
    category: 'malware',
    description: 'Inspect PE headers, section table, timestamps, and architecture.',
    tags: ['pe', 'sections', 'timestamp', 'windows'],
    phase: 6,
  }),
  planned({
    id: 'malware.pe-imports',
    name: 'PE Imports / Exports',
    category: 'malware',
    description: 'List imported and exported functions from user-supplied PE files.',
    tags: ['pe', 'imports', 'exports'],
    phase: 6,
  }),
  planned({
    id: 'malware.authenticode',
    name: 'Authenticode Metadata',
    category: 'malware',
    description: 'Inspect embedded signature metadata without claiming trusted validation.',
    tags: ['authenticode', 'signature', 'pe'],
    phase: 6,
  }),
  planned({
    id: 'malware.elf',
    name: 'ELF Header & Sections',
    category: 'malware',
    description: 'Inspect ELF headers, program headers, and sections.',
    tags: ['elf', 'linux', 'binary'],
    phase: 6,
  }),
  planned({
    id: 'malware.hex-viewer',
    name: 'Hex Viewer',
    category: 'malware',
    description: 'Inspect bytes with offsets, ASCII, and range navigation.',
    tags: ['hex', 'binary', 'viewer'],
    phase: 6,
  }),
  planned({
    id: 'malware.file-compare',
    name: 'File Metadata Comparison',
    category: 'malware',
    description: 'Compare hashes, sizes, types, and PE fields across supplied files.',
    tags: ['compare', 'hashes', 'metadata'],
    phase: 6,
  }),

  // ---------------------------------------------------------------------------
  // Digital forensics
  // ---------------------------------------------------------------------------
  planned({
    id: 'forensics.prefetch',
    name: 'Prefetch Parser',
    category: 'forensics',
    description: 'Parse supported Windows Prefetch versions for execution evidence.',
    tags: ['prefetch', 'execution', 'windows'],
    phase: 6,
    input: [port(DATA_TYPES.file)],
  }),
  planned({
    id: 'forensics.amcache',
    name: 'Amcache Parser',
    category: 'forensics',
    description: 'Parse supported Amcache hive exports for execution artifacts.',
    tags: ['amcache', 'registry', 'execution'],
    phase: 6,
  }),
  planned({
    id: 'forensics.shimcache',
    name: 'Shimcache Parser',
    category: 'forensics',
    description: 'Parse AppCompatCache data from supported hive exports.',
    tags: ['shimcache', 'appcompat', 'execution'],
    phase: 6,
  }),
  planned({
    id: 'forensics.lnk',
    name: 'LNK Parser',
    category: 'forensics',
    description: 'Parse shortcut files for targets, timestamps, and shell item paths.',
    tags: ['lnk', 'shortcut', 'shell-items'],
    phase: 6,
  }),
  planned({
    id: 'forensics.jumplists',
    name: 'Jump List Parser',
    category: 'forensics',
    description: 'Parse automatic and custom destination lists from supplied files.',
    tags: ['jumplist', 'recent', 'windows'],
    phase: 6,
  }),
  planned({
    id: 'forensics.shellbags',
    name: 'ShellBag Parser',
    category: 'forensics',
    description: 'Parse shell item data for folder navigation history.',
    tags: ['shellbag', 'shell-items', 'folders'],
    phase: 6,
  }),
  planned({
    id: 'forensics.mft',
    name: 'MFT Parser',
    category: 'forensics',
    description: 'Inspect Master File Table metadata from supplied NTFS artifacts.',
    tags: ['mft', 'ntfs', 'filesystem'],
    phase: 6,
  }),
  planned({
    id: 'forensics.usn',
    name: 'USN Journal Parser',
    category: 'forensics',
    description: 'Parse USN journal records for file-system change activity.',
    tags: ['usn', 'ntfs', 'change-journal'],
    phase: 6,
  }),
  planned({
    id: 'forensics.browser-history',
    name: 'Browser History Parser',
    category: 'forensics',
    description: 'Parse user-supplied browser history databases locally.',
    tags: ['browser', 'history', 'sqlite'],
    phase: 6,
  }),
  planned({
    id: 'forensics.timeline',
    name: 'Forensic Timeline Builder',
    category: 'forensics',
    description: 'Merge normalized artifacts into an exportable forensic timeline.',
    tags: ['timeline', 'normalize', 'artifacts'],
    phase: 7,
  }),

  // ---------------------------------------------------------------------------
  // Detection engineering
  // ---------------------------------------------------------------------------
  planned({
    id: 'detection.yara-studio',
    name: 'YARA Studio',
    category: 'detection',
    description: 'Author, validate, and scan with YARA rules locally in the browser.',
    tags: ['yara', 'rules', 'scan', 'malware'],
    phase: 4,
    runtime: 'wasm-worker',
  }),
  planned({
    id: 'detection.sigma-studio',
    name: 'Sigma Studio',
    category: 'detection',
    description: 'Author and validate Sigma rules against the bundled official schema.',
    tags: ['sigma', 'yaml', 'detection', 'rules'],
    phase: 4,
  }),
  planned({
    id: 'detection.suricata',
    name: 'Suricata Signature Workspace',
    category: 'detection',
    description: 'Edit, inspect, and manage Suricata signatures.',
    tags: ['suricata', 'ids', 'signatures'],
    phase: 6,
  }),
  planned({
    id: 'detection.snort',
    name: 'Snort Signature Workspace',
    category: 'detection',
    description: 'Edit and manage Snort signatures with format-aware help.',
    tags: ['snort', 'ids', 'signatures'],
    phase: 6,
  }),
  planned({
    id: 'detection.wazuh',
    name: 'Wazuh Rule Workspace',
    category: 'detection',
    description: 'Edit and manage Wazuh host and log rules.',
    tags: ['wazuh', 'rules', 'xml'],
    phase: 6,
  }),
  planned({
    id: 'detection.kql',
    name: 'KQL Query Workspace',
    category: 'detection',
    description: 'Author Microsoft Sentinel KQL hunts with reference and formatting.',
    tags: ['kql', 'sentinel', 'query'],
    phase: 6,
  }),
  planned({
    id: 'detection.spl',
    name: 'SPL Query Workspace',
    category: 'detection',
    description: 'Author Splunk SPL searches with reference and formatting.',
    tags: ['spl', 'splunk', 'query'],
    phase: 6,
  }),
  planned({
    id: 'detection.eql',
    name: 'Elastic EQL / ES|QL Workspace',
    category: 'detection',
    description: 'Author Elastic event queries with format-aware assistance.',
    tags: ['eql', 'esql', 'elastic', 'query'],
    phase: 6,
  }),
  planned({
    id: 'detection.zeek',
    name: 'Zeek Script Workspace',
    category: 'detection',
    description: 'Edit and organize Zeek scripts and signatures.',
    tags: ['zeek', 'bro', 'network'],
    phase: 6,
  }),
  planned({
    id: 'detection.osquery',
    name: 'osquery SQL Workspace',
    category: 'detection',
    description: 'Author osquery SQL for endpoint collection.',
    tags: ['osquery', 'sql', 'endpoint'],
    phase: 6,
  }),

  // ---------------------------------------------------------------------------
  // Linux
  // ---------------------------------------------------------------------------
  planned({
    id: 'linux.auth-log',
    name: 'SSH & Authentication Log Analyzer',
    category: 'linux',
    description: 'Summarize auth.log/secure events, sources, and failure patterns.',
    tags: ['linux', 'ssh', 'auth', 'log'],
    phase: 5,
    input: [text('Raw log text')],
  }),
  planned({
    id: 'linux.journal',
    name: 'Journal Export Parser',
    category: 'linux',
    description: 'Parse journalctl JSON or supported text exports.',
    tags: ['journalctl', 'systemd', 'log'],
    phase: 5,
  }),
  planned({
    id: 'linux.auditd',
    name: 'auditd Log Parser',
    category: 'linux',
    description: 'Parse audit records into normalized events and summaries.',
    tags: ['auditd', 'audit', 'linux'],
    phase: 5,
  }),
  planned({
    id: 'linux.sudo',
    name: 'Sudo Event Analyzer',
    category: 'linux',
    description: 'Summarize sudo invocations, failures, and target commands.',
    tags: ['sudo', 'privilege', 'linux'],
    phase: 5,
  }),
  planned({
    id: 'linux.systemd-unit',
    name: 'systemd Unit Inspector',
    category: 'linux',
    description: 'Inspect unit files for persistence-relevant directives.',
    tags: ['systemd', 'unit', 'persistence'],
    phase: 6,
  }),
  planned({
    id: 'linux.cron',
    name: 'Cron Inspector',
    category: 'linux',
    description: 'Parse cron expressions and inspect crontab schedules.',
    tags: ['cron', 'schedule', 'persistence'],
    phase: 5,
  }),
  planned({
    id: 'linux.accounts',
    name: 'Account & Group File Parser',
    category: 'linux',
    description: 'Parse supplied passwd, shadow, and group files with field explanations.',
    tags: ['passwd', 'group', 'accounts', 'linux'],
    phase: 6,
  }),
  planned({
    id: 'linux.timeline',
    name: 'Linux Timeline Builder',
    category: 'linux',
    description: 'Normalize Linux log events into a sortable timeline.',
    tags: ['timeline', 'linux', 'normalize'],
    phase: 7,
  }),

  // ---------------------------------------------------------------------------
  // Cloud
  // ---------------------------------------------------------------------------
  planned({
    id: 'cloud.cloudtrail',
    name: 'AWS CloudTrail Parser',
    category: 'cloud',
    description: 'Parse CloudTrail JSON for identities, actions, and source context.',
    tags: ['aws', 'cloudtrail', 'audit'],
    phase: 6,
  }),
  planned({
    id: 'cloud.azure-signin',
    name: 'Azure Sign-in Log Parser',
    category: 'cloud',
    description: 'Parse Azure and Entra sign-in/audit exports into structured events.',
    tags: ['azure', 'entra', 'signin'],
    phase: 6,
  }),
  planned({
    id: 'cloud.entra-events',
    name: 'Entra ID Event Parser',
    category: 'cloud',
    description: 'Normalize Entra ID audit events for investigation.',
    tags: ['entra', 'microsoft', 'audit'],
    phase: 6,
  }),
  planned({
    id: 'cloud.iam-policy',
    name: 'IAM Policy Inspector',
    category: 'cloud',
    description: 'Inspect policy syntax and static structure without permission simulation.',
    tags: ['iam', 'policy', 'aws', 'static'],
    phase: 6,
  }),
  planned({
    id: 'cloud.normalizer',
    name: 'Cloud Audit Event Normalizer',
    category: 'cloud',
    description: 'Map supported cloud audit events into the BlueKit event model.',
    tags: ['cloud', 'normalize', 'events'],
    phase: 7,
  }),

  // ---------------------------------------------------------------------------
  // References and utilities
  // ---------------------------------------------------------------------------
  planned({
    id: 'utilities.cidr',
    name: 'CIDR / Subnet Calculator',
    category: 'utilities',
    description: 'Calculate network, broadcast, host ranges, and IPv6 prefixes.',
    tags: ['cidr', 'subnet', 'ipv6', 'calculator'],
    phase: 5,
  }),
  planned({
    id: 'utilities.ports',
    name: 'Ports & Protocols',
    category: 'utilities',
    description: 'Search common ports, services, and protocol notes offline.',
    tags: ['ports', 'protocols', 'reference'],
    phase: 5,
  }),
  planned({
    id: 'utilities.file-signatures',
    name: 'File Signature Reference',
    category: 'utilities',
    description: 'Look up magic bytes and MIME types for common file formats.',
    tags: ['magic', 'mime', 'signatures', 'reference'],
    phase: 5,
  }),
  planned({
    id: 'utilities.cve',
    name: 'CVE Reference Lookup',
    category: 'utilities',
    description: 'Look up CVE details from locally cached public data where possible.',
    tags: ['cve', 'vulnerability', 'nvd'],
    phase: 8,
    network: 'optional',
  }),
  planned({
    id: 'utilities.kev',
    name: 'CISA KEV Lookup',
    category: 'utilities',
    description: 'Search the known exploited vulnerabilities catalog with update timestamps.',
    tags: ['kev', 'cisa', 'exploited'],
    phase: 8,
  }),
  planned({
    id: 'utilities.epss',
    name: 'EPSS Lookup',
    category: 'utilities',
    description: 'Inspect exploitation probability scores where data use is permitted.',
    tags: ['epss', 'exploit', 'probability'],
    phase: 8,
    network: 'optional',
  }),
  planned({
    id: 'utilities.attack',
    name: 'MITRE ATT&CK Browser',
    category: 'utilities',
    description: 'Browse tactics, techniques, groups, and software from a versioned dataset.',
    tags: ['attack', 'mitre', 'tactics', 'techniques'],
    phase: 8,
  }),
  planned({
    id: 'utilities.cron',
    name: 'Cron Expression Parser',
    category: 'utilities',
    description: 'Explain cron expressions and preview upcoming run times.',
    tags: ['cron', 'schedule', 'parser'],
    phase: 5,
  }),
  planned({
    id: 'utilities.uuid',
    name: 'UUID / GUID Converter',
    category: 'utilities',
    description: 'Convert and normalize UUIDs, GUIDs, and binary representations.',
    tags: ['uuid', 'guid', 'convert'],
    phase: 5,
  }),
  planned({
    id: 'utilities.certificate',
    name: 'Certificate Inspector',
    category: 'utilities',
    description: 'Inspect X.509 certificate metadata and fingerprints.',
    tags: ['x509', 'certificate', 'pem', 'tls'],
    phase: 6,
  }),
  planned({
    id: 'utilities.jwt',
    name: 'JWT Decoder',
    category: 'utilities',
    description: 'Decode JWT header and claims locally; decoding does not validate signatures.',
    tags: ['jwt', 'token', 'decode'],
    phase: 5,
  }),
];
