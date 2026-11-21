import { describe, expect, it } from 'vitest';
import { inspectXml } from '@/tools/encoding/xml';

describe('XML formatter & checker', () => {
  it('formats a simple document', () => {
    const report = inspectXml('<?xml version="1.0"?><root><item id="1">one</item><item>two</item></root>');
    expect(report.wellFormed).toBe(true);
    expect(report.rootElement).toBe('root');
    expect(report.elementCount).toBe(3);
    expect(report.attributeCount).toBe(1);
    expect(report.formatted).toContain('<item id="1">one</item>');
  });

  it('keeps mixed content on one line', () => {
    const report = inspectXml('<p>Hello <b>world</b>!</p>');
    expect(report.wellFormed).toBe(true);
    expect(report.formatted?.trim()).toBe('<p>Hello <b>world</b>!</p>');
  });

  it('formats self-closing and empty elements sensibly', () => {
    const report = inspectXml('<root><a/><b></b></root>');
    expect(report.formatted).toContain('<a />');
    expect(report.formatted).toContain('<b></b>');
  });

  it('reports mismatched closing tags with a position', () => {
    const report = inspectXml('<root>\n  <a>\n  </b>\n</root>');
    expect(report.wellFormed).toBe(false);
    expect(report.error?.message).toMatch(/does not match/u);
    expect(report.error?.line).toBe(3);
  });

  it('rejects unquoted or duplicate attributes', () => {
    expect(inspectXml('<root a=1></root>').error?.message).toMatch(/must be quoted/u);
    expect(inspectXml('<root a="1" a="2"></root>').error?.message).toMatch(/Duplicate attribute/u);
  });

  it('rejects multiple roots and missing roots', () => {
    expect(inspectXml('<a/><b/>').error?.message).toMatch(/more than one root/u);
    expect(inspectXml('   ').error?.message).toMatch(/no root/u);
  });

  it('never resolves external entities and says so', () => {
    const report = inspectXml(
      '<!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><r>&xxe;</r>',
    );
    expect(report.wellFormed).toBe(true);
    expect(report.hasDoctype).toBe(true);
    expect(report.warnings.join(' ')).toMatch(/never fetches|not expanded/u);
    expect(report.formatted).toContain('&xxe;');
  });

  it('preserves comments, CDATA, and processing instructions', () => {
    const report = inspectXml(
      '<root><?pi value?><![CDATA[<not-a-tag>]]><!-- note --></root>',
    );
    expect(report.wellFormed).toBe(true);
    expect(report.formatted).toContain('<?pi value?>');
    expect(report.formatted).toContain('<![CDATA[<not-a-tag>]]>');
    expect(report.formatted).toContain('<!-- note -->');
  });
});
