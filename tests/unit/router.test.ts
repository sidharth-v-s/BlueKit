import { describe, expect, it } from 'vitest';
import { parseHash } from '@/app/router.svelte';

describe('parseHash', () => {
  it('parses the first-class workspace routes', () => {
    expect(parseHash('')).toEqual({ name: 'overview' });
    expect(parseHash('#/overview')).toEqual({ name: 'overview' });
    expect(parseHash('#/mailsleuth')).toEqual({ name: 'mailsleuth' });
    expect(parseHash('#/ioc')).toEqual({ name: 'ioc' });
    expect(parseHash('#/ioc/')).toEqual({ name: 'ioc' });
    expect(parseHash('#/rules')).toEqual({ name: 'rules' });
    expect(parseHash('#/yara')).toEqual({ name: 'yara' });
  });

  it('parses a tool id and decodes it', () => {
    expect(parseHash('#/tool/ioc.extractor')).toEqual({ name: 'tool', id: 'ioc.extractor' });
    expect(parseHash('#/tool/ioc%2Eextractor')).toEqual({ name: 'tool', id: 'ioc.extractor' });
    expect(parseHash('#/tool')).toEqual({ name: 'tools' });
  });

  it('parses category and settings sections', () => {
    expect(parseHash('#/tools/ioc')).toEqual({ name: 'tools', category: 'ioc' });
    expect(parseHash('#/settings/storage')).toEqual({ name: 'settings', section: 'storage' });
  });

  it('falls back to the overview for unknown routes', () => {
    expect(parseHash('#/not-a-route')).toEqual({ name: 'overview' });
  });
});
