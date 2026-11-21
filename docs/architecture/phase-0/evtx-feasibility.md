# EVTX Feasibility

**Status:** container probe shipped as prototype · record decoding not implemented · 2026-11-20

## Question

How much Windows Event Log (`.evtx`) analysis is realistic in a static browser app, and what should the product claim?

## Decision

Ship a **container header probe** (`windows.evtx-probe`) that validates the file signature, file header, and chunk headers, and reports what it did **not** parse. Do **not** claim event-level analysis until a reviewed BinXML decoder exists.

The catalog's `windows.evtx-inspector` remains `planned` for Phase 5.

## What the probe does

`src/tools/forensics/evtx-probe.ts` parses:

### File header (4096 bytes)

| Offset | Field |
|---|---|
| `0x00` | `ElfFile\0` signature |
| `0x08` | first chunk number |
| `0x10` | last chunk number |
| `0x18` | next record ID |
| `0x20` | header size |
| `0x24` | minor version |
| `0x26` | major version |
| `0x28` | header block size (expect 4096) |
| `0x2a` | declared chunk count |
| `0x2c` | flags |
| `0x30` | declared header checksum |

### Chunk headers (first 16 chunks)

| Offset | Field |
|---|---|
| `+0x00` | `ElfChnk\0` signature |
| `+0x08` | first event record number |
| `+0x10` | last event record number |
| `+0x18` | first event record ID |
| `+0x20` | last event record ID |
| `+0x28` | header size |
| `+0x2c` | last event record data offset |
| `+0x30` | free space offset |
| `+0x34` | declared records checksum |

It warns on:

- a header block size other than 4096;
- a declared chunk count that differs from the full chunks on disk;
- non-zero file flags;
- invalid chunk magic;
- wrapped/rotated logs where the first chunk number is non-zero;
- truncation of the chunk-header scan at 16 chunks.

## What it explicitly does not do

- **No BinXML decoding.** Event records, templates, substitutions, and rendered XML are out of scope for the probe.
- **No checksum verification.** Checksums are reported as declared values, not validated.
- **No record iteration.** Even valid record offsets are not walked.
- **No recovery of dirty logs.** Flags are surfaced, not repaired.
- **No crash-dump or hive parsing.** Those are separate artifacts.

## Why not a permissive regex reader

EVTX records are length-prefixed binary structures containing a BinXML stream with its own token model, name/value tables, template instances, and substitution arrays. A regex or "scan for strings" approach produces plausible-looking but wrong output and cannot report confidence. For a Blue Team tool, a wrong event is worse than no event.

## Recommended path

1. **Bind a reviewed libevtx-compatible parser to WASM**, run it in a worker, and expose a typed event model. This is the lowest-risk route to correct results.
2. Alternatively, implement BinXML decoding in TypeScript with a documented feature matrix and a large corpus of real logs.
3. Keep the container probe as a fast pre-flight: it validates the file and tells the user whether a deeper parser can even start.

Whatever path is chosen:

- parse in a worker;
- enforce a file-size and record-count budget;
- make cancellation terminate the worker;
- show parser coverage, not just "parsed";
- keep the original file immutable.

## Evidence

Unit tests build synthetic EVTX buffers and verify:

- file and chunk header fields at the documented offsets;
- rejection of files smaller than a header;
- rejection of a missing `ElfFile\0` signature;
- warnings for chunk-count and flag mismatches.

No real Windows log is bundled. A public fixture corpus needs licence review before inclusion.

## Residual risk

- Chunk-header offsets are stable across common EVTX versions, but wrapped/rotated logs and dirty shutdowns change interpretation.
- A WASM libevtx build must be licence- and supply-chain-reviewed; "it compiles" is not approval.
- Large logs can exceed browser memory. The manifest currently allows 512 MiB for the probe; record parsing will need a much tighter, streaming-aware budget.
