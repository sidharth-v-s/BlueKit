import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runHmacTool } from '@/tools/encoding/hmac';

const signal = new AbortController().signal;

async function hmac(text: string, key: string, algorithm: string) {
  return runHmacTool(
    { text, params: { key, algorithm } },
    () => {},
    signal,
  );
}

describe('HMAC calculator', () => {
  it('matches Node crypto for SHA-256', async () => {
    const result = await hmac('message', 'secret-key', 'SHA-256');
    const expected = createHmac('sha256', 'secret-key').update('message').digest('hex');
    expect(result.output.hex).toBe(expected);
    expect(result.output.algorithm).toBe('SHA-256');
    expect(result.output.keyBytes).toBe(10);
  });

  it('matches Node crypto for SHA-1, SHA-384, and SHA-512', async () => {
    const nodeNames = { 'SHA-1': 'sha1', 'SHA-384': 'sha384', 'SHA-512': 'sha512' } as const;
    for (const [algorithm, nodeName] of Object.entries(nodeNames)) {
      const result = await hmac('payload', 'k', algorithm);
      const expected = createHmac(nodeName, 'k').update('payload').digest('hex');
      expect(result.output.hex, algorithm).toBe(expected);
    }
  });

  it('encodes the same digest as Base64', async () => {
    const result = await hmac('message', 'secret-key', 'SHA-256');
    const expected = createHmac('sha256', 'secret-key').update('message').digest('base64');
    expect(result.output.base64).toBe(expected);
  });

  it('requires both a message and a key', async () => {
    await expect(hmac('', 'k', 'SHA-256')).rejects.toThrowError(/message/u);
    await expect(hmac('m', '', 'SHA-256')).rejects.toThrowError(/HMAC key/u);
  });

  it('rejects unknown algorithms', async () => {
    await expect(hmac('m', 'k', 'MD5')).rejects.toThrowError(/Unsupported HMAC/u);
  });
});
