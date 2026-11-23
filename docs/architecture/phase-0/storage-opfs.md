# IndexedDB, OPFS, and Local Persistence

**Status:** verified adapter + feature-detected OPFS · 2026-11-20

## Question

What can BlueKit safely keep on the user's machine, how does it fail, and what must the UI disclose?

## Decision

- **IndexedDB** stores structured records (settings, favorites, recents, tabs, future rules, recipes, investigations).
- **OPFS** is optional and probed at runtime; it is reserved for large generated artifacts, not the primary record store.
- **Memory fallback** keeps read-only tools usable when IndexedDB is unavailable or blocked.
- **No network persistence.** Nothing is synced to a BlueKit service.
- **No Dexie.** A small adapter (`src/core/storage/db.ts`) owns the schema and migrations.

## Evidence

### IndexedDB adapter

`IndexedDbAdapter` opens database `bluekit` at version 2 and creates the stores declared in `STORES`:

```
meta, settings, favorites, recentTools, toolHistory, recipes, recipeRuns,
rules, ruleRevisions, ruleCollections, ruleTestCases, investigations,
evidenceItems, iocItems, enrichmentCache, datasetVersions, importJobs
```

Each record is `{ key, value, updatedAt }` under a `keyPath: "key"` store. The `meta` store records `{ schemaVersion: 2, createdAt }`. The v2 upgrade adds `ruleRevisions` and leaves existing v1 records in place.

Unit tests run against `fake-indexeddb` and cover:

- opening every store and reading the schema record;
- typed value round trips with timestamps;
- repository behavior for settings, favorites, workspace tabs, and recents;
- filtering malformed recent records instead of trusting stored data;
- the memory fallback when IndexedDB cannot open.

### Failure mode

`openStorage()` never throws. On failure it returns a `MemoryAdapter` plus a human-readable note. The shell shows "Session only" in the sidebar and the diagnostics view marks persistence as failed. The user is told to export before closing the tab.

### OPFS

The diagnostics probe calls `navigator.storage.getDirectory()`, creates a temporary file, writes `bluekit`, closes it, and deletes it. Results:

| Environment | Result |
|---|---|
| Current Chromium-family desktop | pass |
| Browser without OPFS | warn, with an explicit "large-file tools must use Blob/File and memory limits" message |
| OPFS present but blocked | warn, with the underlying error |

OPFS is **not** used as the settings or record store. It is a future home for large derived artifacts where a file handle is a better fit than a structured record.

### Quotas

`navigator.storage.estimate()` is advisory only. The settings/storage view displays usage and quota when the browser exposes them. Quota errors must be handled as recoverable: keep the in-memory state, tell the user, and offer export.

## Data model decisions

- **Session-only values** (API keys, active inputs) are never written to storage, so they cannot leak into an archive by construction.
- **Export allow-list** excludes transient stores (`enrichmentCache`, `importJobs`) and includes user-created content and settings. See `src/core/export-import/archive.ts`.
- **Import validation** enforces size, record count, store allow-list, key length, and rejects path-like keys (`/`, `\`, `..`, leading `.`, control characters).
- **Archive schema version** is explicit; a version mismatch is a hard error, not a best-effort merge.
- **Migrations** are additive in version 1. Future versions must preserve existing records and document the upgrade path.

## Constraints recorded for later

- **Eviction is real.** Browsers may evict origin data under pressure. Local-first does not mean durable forever; export is the backup mechanism.
- **Private browsing** may expose IndexedDB but discard it at session end. The UI cannot always detect this.
- **Multi-tab writes** are not coordinated beyond IndexedDB transactions. A future version needs a `BroadcastChannel` or version-change story.
- **OPFS synchronous access handles** are not used; they are not universally available and block the main thread.
- **Large evidence files** need a chunking and hashing strategy before investigations embed blobs.

## Residual risk

- A record written by a newer build may be unreadable by an older tab left open. Version-change handling currently closes the old connection.
- `updatedAt` is wall-clock time and can be wrong; it is metadata, not an audit trail.
- Browser storage inspection by another local process is outside the threat model. BlueKit protects against accidental network leakage, not a compromised machine.
