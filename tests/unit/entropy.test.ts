import { describe, expect, it } from 'vitest';
import { calculateEntropy, shannonEntropy } from '@/tools/malware/entropy';

describe('entropy calculator', () => {
  it('returns zero entropy for a single repeated byte', () => {
    expect(shannonEntropy(Uint8Array.from({ length: 1024 }, () => 0x41))).toBe(0);
  });

  it('returns one bit for two equally likely symbols', () => {
    const bytes = Uint8Array.from({ length: 1024 }, (_, index) => (index % 2 === 0 ? 0 : 1));
    expect(shannonEntropy(bytes)).toBe(1);
  });

  it('returns eight bits for a uniform byte distribution', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect(shannonEntropy(bytes)).toBe(8);
  });

  it('summarizes chunks and flags high-entropy regions', () => {
    const bytes = new Uint8Array(3072);
    // First chunk: a uniform byte distribution (high entropy). Remaining chunks: zeros.
    for (let index = 0; index < 1024; index += 1) bytes[index] = index % 256;

    const report = calculateEntropy(bytes);
    expect(report.sizeBytes).toBe(3072);
    expect(report.chunkCount).toBe(3);
    expect(report.highEntropyChunks).toHaveLength(1);
    expect(report.highEntropyChunks[0]?.offset).toBe(0);
    expect(report.maxChunkEntropy).toBe(8);
    expect(report.minChunkEntropy).toBe(0);
    expect(report.histogram).toHaveLength(5);
  });

  it('handles an empty buffer without dividing by zero', () => {
    const report = calculateEntropy(new Uint8Array());
    expect(report.overallEntropy).toBe(0);
    expect(report.chunkCount).toBe(0);
    expect(report.averageChunkEntropy).toBe(0);
  });
});
