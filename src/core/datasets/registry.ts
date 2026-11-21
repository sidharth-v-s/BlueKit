/**
 * Dataset manifest contract and Phase 1 dataset state (spec §12.1).
 *
 * Phase 1 bundles no datasets. The contract exists now so bundled and updated
 * data are versioned, attributable, checksummed, and validated before use.
 */

export type DatasetStatus = 'planned' | 'bundled' | 'stale';

export interface DatasetManifest {
  id: string;
  name: string;
  /** Version of the dataset release; null when not bundled. */
  version: string | null;
  schemaVersion: string | null;
  upstream: string;
  license: string;
  status: DatasetStatus;
  usedBy: string[];
  releaseTimestamp?: string;
  checksumSha256?: string;
  supportedAppVersions?: string;
  sizeBytes?: number;
}

export const DATASETS: readonly DatasetManifest[] = [
  {
    id: 'windows-event-ids',
    name: 'Windows Event IDs',
    version: null,
    schemaVersion: null,
    upstream: 'Microsoft documentation',
    license: 'Derived factual data; Microsoft documentation attribution required',
    status: 'planned',
    usedBy: ['windows.event-id-reference'],
  },
  {
    id: 'ntstatus',
    name: 'NTSTATUS & Win32 errors',
    version: null,
    schemaVersion: null,
    upstream: 'Windows SDK headers / Microsoft documentation',
    license: 'Derived factual data; attribution required',
    status: 'planned',
    usedBy: ['windows.ntstatus'],
  },
  {
    id: 'public-suffix-list',
    name: 'Public Suffix List',
    version: null,
    schemaVersion: null,
    upstream: 'https://publicsuffix.org/list/',
    license: 'MPL 2.0',
    status: 'planned',
    usedBy: ['ioc.domain-parser', 'email.url-extractor'],
  },
  {
    id: 'mitre-attack',
    name: 'MITRE ATT&CK',
    version: null,
    schemaVersion: null,
    upstream: 'https://github.com/mitre-attack/attack-stix-data',
    license: 'Apache 2.0 / ATT&CK terms',
    status: 'planned',
    usedBy: ['utilities.attack', 'detection.sigma-studio'],
  },
  {
    id: 'cisa-kev',
    name: 'CISA KEV snapshot',
    version: null,
    schemaVersion: null,
    upstream: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    license: 'US Government work; verify terms',
    status: 'planned',
    usedBy: ['utilities.kev'],
  },
  {
    id: 'ports',
    name: 'Ports & protocols',
    version: null,
    schemaVersion: null,
    upstream: 'IANA service name registry + curated notes',
    license: 'IANA / curated; attribution required',
    status: 'planned',
    usedBy: ['utilities.ports', 'network.port-reference'],
  },
  {
    id: 'file-signatures',
    name: 'File signatures',
    version: null,
    schemaVersion: null,
    upstream: 'Curated from public magic-byte documentation',
    license: 'Curated; attribution required',
    status: 'planned',
    usedBy: ['malware.file-type', 'utilities.file-signatures'],
  },
];

export function datasetStatusLabel(datasets: readonly DatasetManifest[] = DATASETS): string {
  const bundled = datasets.filter((dataset) => dataset.status === 'bundled').length;
  return bundled === 0 ? 'No datasets bundled' : `${bundled} dataset(s) bundled`;
}
