/**
 * HTML and text helpers shared by the MailSleuth tools.
 *
 * These are deliberately small and conservative. BlueKit never renders HTML
 * from an untrusted message: it extracts text and URLs so the analyst can look
 * at them without a live document context.
 */

/**
 * A deliberately small named-entity table. HTML5 has ~2,200 named references;
 * bundling the full list is not worth the bytes here. These cover the entities
 * that actually change URL and text interpretation, including the obfuscation
 * tricks seen in phishing mail.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  colon: ':',
  sol: '/',
  period: '.',
  commat: '@',
  quest: '?',
  equals: '=',
  num: '#',
  percnt: '%',
  plus: '+',
  semi: ';',
  Tab: '\t',
  NewLine: '\n',
};

function safeCodePoint(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return '\ufffd';
  if (value >= 0xd800 && value <= 0xdfff) return '\ufffd';
  return String.fromCodePoint(value);
}

/**
 * Decode numeric and the small named set of HTML character references.
 * Unknown named references are preserved verbatim so evidence is not rewritten.
 */
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]{1,6});?/giu, (_, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d{1,7});?/gu, (_, dec: string) => safeCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]+);/giu, (match, name: string) => NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Strip markup for URL/text inspection. Script and style contents are removed
 * entirely rather than turned into visible text; comments are dropped. This is
 * not a sanitiser and its output must never be inserted as HTML.
 */
export function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/gu, ' ')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, ' ')
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(/<\/(?:p|div|tr|li|h[1-6])\s*>/giu, '\n')
      .replace(/<[^>]*>/gu, ' '),
  )
    .replace(/[ \t\f\v]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

/**
 * Extract candidate link targets from HTML attributes before tags are stripped.
 * The values are still untrusted text; callers must parse and display them, not
 * navigate to them.
 */
export function extractHtmlLinkTargets(html: string): string[] {
  const targets: string[] = [];
  const decoded = decodeHtmlEntities(html);
  const attribute = /\b(?:href|src|action|formaction|poster|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu;
  for (const match of decoded.matchAll(attribute)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (value.length > 0) targets.push(value);
  }
  return targets;
}
