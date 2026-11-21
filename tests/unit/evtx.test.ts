import { describe, expect, it } from 'vitest';
import { probeEvtx } from '@/tools/forensics/evtx-probe';

const HEADER_SIZE = 4096;
const CHUNK_SIZE = 65536;

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    bytes[offset + index] = text.charCodeAt(index);
  }
}

function buildEvtx(): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER_SIZE + CHUNK_SIZE);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  writeAscii(bytes, 0, 'ElfFile\0');
  view.setBigUint64(0x08, 0n, true); // first chunk number
  view.setBigUint64(0x10, 0n, true); // last chunk number
  view.setBigUint64(0x18, 42n, true); // next record id
  view.setUint32(0x20, 128, true); // header size
  view.setUint16(0x24, 1, true); // minor version
  view.setUint16(0x26, 3, true); // major version
  view.setUint16(0x28, HEADER_SIZE, true); // header block size
  view.setUint16(0x2a, 1, true); // declared chunk count
  view.setUint32(0x2c, 0, true); // flags
  view.setUint32(0x30, 0xdeadbeef, true); // header checksum

  const chunk = HEADER_SIZE;
  writeAscii(bytes, chunk, 'ElfChnk\0');
  view.setBigUint64(chunk + 0x08, 1n, true); // first event record number
  view.setBigUint64(chunk + 0x10, 7n, true); // last event record number
  view.setBigUint64(chunk + 0x18, 100n, true); // first event record id
  view.setBigUint64(chunk + 0x20, 106n, true); // last event record id
  view.setUint32(chunk + 0x28, 512, true); // header size
  view.setUint32(chunk + 0x2c, 1024, true); // last event record data offset
  view.setUint32(chunk + 0x30, 2048, true); // free space offset
  view.setUint32(chunk + 0x34, 0xcafebabe, true); // records checksum

  return buffer;
}

describe('probeEvtx', () => {
  it('parses file and chunk headers', () => {
    const result = probeEvtx(buildEvtx(), 'Security.evtx');
    expect(result.fileName).toBe('Security.evtx');
    expect(result.magicValid).toBe(true);
    expect(result.headerSizeBytes).toBe(128);
    expect(result.majorVersion).toBe(3);
    expect(result.minorVersion).toBe(1);
    expect(result.headerBlockSize).toBe(4096);
    expect(result.declaredChunkCount).toBe(1);
    expect(result.chunksPresentOnDisk).toBe(1);
    expect(result.nextRecordId).toBe(42);
    expect(result.declaredHeaderChecksum).toBe(0xdeadbeef);
    expect(result.feasibility.recordParsing).toBe('not-implemented');
    expect(result.chunks[0]).toMatchObject({
      index: 0,
      offset: 4096,
      magicValid: true,
      firstEventRecordNumber: 1,
      lastEventRecordNumber: 7,
      firstEventRecordId: 100,
      lastEventRecordId: 106,
      headerSize: 512,
      lastEventRecordDataOffset: 1024,
      freeSpaceOffset: 2048,
      declaredRecordsChecksum: 0xcafebabe,
    });
    expect(result.warnings).toEqual([]);
  });

  it('rejects files smaller than a header', () => {
    expect(() => probeEvtx(new ArrayBuffer(128))).toThrowError(/smaller than a single EVTX/u);
  });

  it('rejects a missing signature', () => {
    const buffer = new ArrayBuffer(HEADER_SIZE);
    new Uint8Array(buffer).set(new TextEncoder().encode('NotEVTX!'));
    expect(() => probeEvtx(buffer)).toThrowError(/does not start with the EVTX signature/u);
  });

  it('warns on chunk-count and flag mismatches', () => {
    const buffer = buildEvtx();
    const view = new DataView(buffer);
    view.setUint16(0x2a, 5, true);
    view.setUint32(0x2c, 0x2, true);

    const result = probeEvtx(buffer);
    expect(result.warnings.join(' ')).toMatch(/declares 5 chunk/u);
    expect(result.warnings.join(' ')).toMatch(/flags are 0x2/u);
  });
});
