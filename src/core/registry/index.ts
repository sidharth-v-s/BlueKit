import type { BlueKitTool } from '@/core/runtime/types';
import type { CategoryId, ToolManifest, ToolStatus } from '@/core/schemas/types';
import { CATEGORY_MAP } from '@/core/schemas/types';
import { PLANNED_CATALOG } from './planned-catalog';
import { validateManifest } from './validate';
import { base64EncodeTool } from '@/tools/encoding/base64-encode';
import { base64DecodeTool } from '@/tools/encoding/base64-decode';
import { base32Tool } from '@/tools/encoding/base32';
import { compressTool } from '@/tools/encoding/compress';
import { defangTool } from '@/tools/encoding/defang';
import { diffTool } from '@/tools/encoding/diff';
import { hashTool } from '@/tools/encoding/hash';
import { hexTool } from '@/tools/encoding/hex';
import { hmacTool } from '@/tools/encoding/hmac';
import { htmlEntitiesTool } from '@/tools/encoding/html-entities';
import { jsonTool } from '@/tools/encoding/json-tool';
import { regexTool } from '@/tools/encoding/regex';
import { rot13Tool } from '@/tools/encoding/rot13';
import { timestampTool } from '@/tools/encoding/timestamp';
import { unicodeInspectorTool } from '@/tools/encoding/unicode-inspector';
import { urlTool } from '@/tools/encoding/url';
import { xmlTool } from '@/tools/encoding/xml';
import { xorTool } from '@/tools/encoding/xor';
import { yamlTool } from '@/tools/encoding/yaml';
import { sigmaValidatorTool } from '@/tools/detection/sigma-validator';
import { emlInspectorTool } from '@/tools/email/eml-inspector';
import { attachmentExtractorTool } from '@/tools/email/attachment-extractor';
import { authResultsTool } from '@/tools/email/auth-results';
import { headerAnalyzerTool } from '@/tools/email/header-analyzer';
import { urlExtractorTool } from '@/tools/email/url-extractor';
import { evtxProbeTool } from '@/tools/forensics/evtx-probe';
import { bulkNormalizerTool } from '@/tools/ioc/bulk-normalizer';
import { iocExtractorTool } from '@/tools/ioc/extractor';
import { entropyTool } from '@/tools/malware/entropy';
import { fileTypeTool } from '@/tools/malware/file-type';
import { stringsTool } from '@/tools/malware/strings';

export interface RegistryEntry {
  manifest: ToolManifest;
  tool?: BlueKitTool;
  /** Normalized lowercase search text, built once at registration. */
  searchText: string;
}

export interface RegistryBuildResult {
  entries: RegistryEntry[];
  problems: string[];
}

export const IMPLEMENTED_TOOLS: readonly BlueKitTool[] = [
  base64EncodeTool,
  base64DecodeTool,
  base32Tool,
  compressTool,
  defangTool,
  diffTool,
  hashTool,
  hexTool,
  hmacTool,
  htmlEntitiesTool,
  jsonTool,
  regexTool,
  rot13Tool,
  timestampTool,
  unicodeInspectorTool,
  urlTool,
  xmlTool,
  xorTool,
  yamlTool,
  sigmaValidatorTool,
  emlInspectorTool,
  attachmentExtractorTool,
  authResultsTool,
  headerAnalyzerTool,
  urlExtractorTool,
  evtxProbeTool,
  bulkNormalizerTool,
  iocExtractorTool,
  fileTypeTool,
  stringsTool,
  entropyTool,
];

function buildSearchText(manifest: ToolManifest): string {
  const category = CATEGORY_MAP[manifest.category];
  return [
    manifest.id,
    manifest.name,
    manifest.description,
    manifest.tags.join(' '),
    category?.label ?? '',
    category?.shortLabel ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

export function buildRegistry(
  implemented: readonly BlueKitTool[] = IMPLEMENTED_TOOLS,
  planned: readonly ToolManifest[] = PLANNED_CATALOG,
): RegistryBuildResult {
  const problems: string[] = [];
  const entries = new Map<string, RegistryEntry>();

  for (const tool of implemented) {
    for (const problem of validateManifest(tool.manifest)) problems.push(problem);
    if (entries.has(tool.manifest.id)) {
      problems.push(`Duplicate tool id "${tool.manifest.id}" in implemented tools.`);
      continue;
    }
    entries.set(tool.manifest.id, {
      manifest: tool.manifest,
      tool,
      searchText: buildSearchText(tool.manifest),
    });
  }

  for (const manifest of planned) {
    for (const problem of validateManifest(manifest)) problems.push(problem);
    if (entries.has(manifest.id)) {
      // Implemented tools win; planned metadata is the catalog's promise, not its state.
      continue;
    }
    entries.set(manifest.id, {
      manifest,
      searchText: buildSearchText(manifest),
    });
  }

  for (const entry of entries.values()) {
    for (const related of entry.manifest.related ?? []) {
      if (!entries.has(related)) {
        problems.push(`Tool "${entry.manifest.id}" references unknown related tool "${related}".`);
      }
    }
  }

  return { entries: [...entries.values()], problems };
}

const STATUS_WEIGHT: Record<ToolStatus, number> = {
  available: 300,
  prototype: 180,
  planned: 0,
};

/** Simple, deterministic, offline fuzzy scoring. Higher is better. */
export function scoreEntry(entry: RegistryEntry, rawQuery: string): number {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return 0;

  const manifest = entry.manifest;
  const name = manifest.name.toLowerCase();
  const id = manifest.id.toLowerCase();
  const tokens = query.split(/\s+/u).filter(Boolean);

  let score = STATUS_WEIGHT[manifest.status];
  let matchedAll = true;

  for (const token of tokens) {
    let tokenScore = 0;
    if (name === token) tokenScore = 1000;
    else if (name.startsWith(token)) tokenScore = 800;
    else if (name.includes(token)) tokenScore = 600;
    else if (id.startsWith(token)) tokenScore = 560;
    else if (id.includes(token)) tokenScore = 480;
    else if (manifest.tags.some((tag) => tag.toLowerCase() === token)) tokenScore = 420;
    else if (manifest.tags.some((tag) => tag.toLowerCase().includes(token))) tokenScore = 340;
    else if (entry.searchText.includes(token)) tokenScore = 120;
    else tokenScore = subsequenceScore(entry.searchText, token);

    if (tokenScore === 0) {
      matchedAll = false;
      break;
    }
    score += tokenScore;
  }

  return matchedAll ? score : 0;
}

function subsequenceScore(haystack: string, needle: string): number {
  if (needle.length < 2) return 0;
  let index = 0;
  let gaps = 0;
  for (const char of haystack) {
    if (char === needle[index]) {
      index += 1;
      if (index === needle.length) return Math.max(40, 120 - gaps * 4);
    } else if (index > 0) {
      gaps += 1;
      if (gaps > 40) return 0;
    }
  }
  return 0;
}

export class ToolRegistry {
  readonly entries: RegistryEntry[];
  readonly problems: string[];
  private readonly byId = new Map<string, RegistryEntry>();
  private readonly byCategory = new Map<CategoryId, RegistryEntry[]>();

  constructor(result: RegistryBuildResult = buildRegistry()) {
    this.entries = result.entries;
    this.problems = result.problems;
    for (const entry of this.entries) {
      this.byId.set(entry.manifest.id, entry);
      const list = this.byCategory.get(entry.manifest.category) ?? [];
      list.push(entry);
      this.byCategory.set(entry.manifest.category, list);
    }
    for (const list of this.byCategory.values()) {
      list.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
    }
  }

  get(id: string): RegistryEntry | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  search(query: string, limit = 50): RegistryEntry[] {
    const trimmed = query.trim();
    if (!trimmed) return this.entries.slice(0, limit);
    return this.entries
      .map((entry) => ({ entry, score: scoreEntry(entry, trimmed) }))
      .filter((scored) => scored.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.manifest.name.localeCompare(b.entry.manifest.name))
      .slice(0, limit)
      .map((scored) => scored.entry);
  }

  forCategory(category: CategoryId): RegistryEntry[] {
    return this.byCategory.get(category) ?? [];
  }

  categoryCounts(): Record<CategoryId, number> {
    const counts = Object.fromEntries(
      [...this.byCategory.entries()].map(([category, list]) => [category, list.length]),
    ) as Record<CategoryId, number>;
    for (const category of Object.keys(CATEGORY_MAP) as CategoryId[]) {
      counts[category] ??= 0;
    }
    return counts;
  }

  available(): RegistryEntry[] {
    return this.entries.filter((entry) => entry.manifest.status === 'available');
  }

  prototypes(): RegistryEntry[] {
    return this.entries.filter((entry) => entry.manifest.status === 'prototype');
  }

  planned(): RegistryEntry[] {
    return this.entries.filter((entry) => entry.manifest.status === 'planned');
  }

  related(entry: RegistryEntry): RegistryEntry[] {
    return (entry.manifest.related ?? [])
      .map((id) => this.byId.get(id))
      .filter((related): related is RegistryEntry => Boolean(related));
  }
}

export const registry = new ToolRegistry();
