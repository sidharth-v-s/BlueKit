import { describe, expect, it } from 'vitest';
import { identifyFile } from '@/tools/malware/file-type';

function file(bytes: number[], name: string, type = ''): File {
  return new File([Uint8Array.from(bytes)], name, { type });
}

describe('file type identifier', () => {
  it('detects PNG from magic bytes, not the extension', async () => {
    const result = await identifyFile(
      file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0], 'actually-a.png', 'text/plain'),
    );
    expect(result.detected).toMatchObject({ label: 'PNG image', mime: 'image/png', confidence: 'high' });
    expect(result.declaredMime).toBe('text/plain');
  });

  it('distinguishes a PE from a bare MZ file', async () => {
    const bytes = new Uint8Array(0x100);
    bytes.set([0x4d, 0x5a]);
    new DataView(bytes.buffer).setUint32(0x3c, 0x40, true);
    bytes.set([0x50, 0x45, 0x00, 0x00], 0x40);

    const pe = await identifyFile(new File([bytes], 'sample.exe'));
    expect(pe.detected?.label).toBe('Windows PE executable');
    expect(pe.detected?.confidence).toBe('high');

    const mz = await identifyFile(file([0x4d, 0x5a, 0x00, 0x00], 'dos.com'));
    expect(mz.detected?.label).toBe('DOS MZ executable');
    expect(mz.detected?.confidence).toBe('medium');
  });

  it('detects ELF and WebAssembly', async () => {
    const elf = await identifyFile(
      file([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00], 'sample.bin'),
    );
    expect(elf.detected?.label).toContain('ELF executable (64-bit)');

    const wasm = await identifyFile(file([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00], 'module.wasm'));
    expect(wasm.detected?.label).toBe('WebAssembly module');
  });

  it('recognizes plain text and labels it with medium confidence', async () => {
    const result = await identifyFile(
      new File([new TextEncoder().encode('hello world\nthis is text\n')], 'notes.txt', { type: 'text/plain' }),
    );
    expect(result.textLike).toBe(true);
    expect(result.detected?.mime).toBe('text/plain');
    expect(result.detected?.confidence).toBe('medium');
  });

  it('reports unknown binary without inventing a type', async () => {
    const result = await identifyFile(file([0x00, 0x01, 0x02, 0x03, 0x04, 0x05], 'blob.bin'));
    expect(result.detected?.mime).toBe('application/octet-stream');
    expect(result.detected?.confidence).toBe('low');
  });

  it('rejects empty files', async () => {
    await expect(identifyFile(file([], 'empty.bin'))).rejects.toThrowError(/empty/u);
  });
});
