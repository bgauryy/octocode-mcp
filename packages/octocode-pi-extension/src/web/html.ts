import { capChars } from '../shared/util.js';
import { closeTags, elementEnds, firstTagWith, forwardSearch, replaceThrough, rewrite, tagScanner, type ElementEnd } from './scan.js';

/** Page metadata (JSON-LD, price and date meta tags) shown ahead of the text, capped. */
const METADATA_MAX_CHARS = 1_500;
/** What to do when the static HTML is not the page: the main session has no `browser`, so the advice names both routes. */
export const RENDER_ADVICE = 'render it with the browser tool, or with a webHeadless subagent when browser is not active';
/** Less visible text than this in the static HTML means the page is built by JavaScript. */
const SHELL_TEXT_CHARS = 500;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const point = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Readable text from HTML: drops scripts/styles/chrome, keeps headings, links, list items and paragraphs. */
export function htmlToText(html: string): string {
  let text = removeElements(html, /<(script|style|noscript|svg|template|iframe)/gi);
  text = removeComments(text);
  text = stripHidden(text);
  // The title is extracted separately; nothing else in <head> is page text.
  text = removeElements(text, /<(head)\b/gi);
  text = removeElements(text, /<(nav|footer|header|aside)\b/gi);
  text = headingsToMarkdown(text);
  text = linksToMarkdown(text);
  text = replaceThrough(text, /\[\s*\]\(/g, /\)/g, '');
  text = replaceThrough(text, /<li\b/gi, />/g, '\n- ');
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');
  // Opening tags break too: HTML may omit `</p>`, and a block must never run into the text before it.
  text = replaceThrough(text, /<\/?(p|div|section|article|tr|table|ul|ol|pre|blockquote)\b/gi, />/g, '\n\n');
  text = stripTags(text);
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    // Empty list items (icon-only nav links) carry nothing.
    .filter((line) => line !== '-')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/*
 * Every pass below reads the page once, front to back. A lazy pattern such as `<a …>([\s\S]*?)</a>` rescans to the end
 * of the page for each opening tag that never closes, so a page of unclosed tags would hold the event loop for minutes.
 * The passes match what those patterns matched, but each search remembers how far it has looked.
 */

/** Removes each `<name…>…</name>` element `opener` starts (group 1 is the name); one that never closes stays. */
function removeElements(text: string, opener: RegExp): string {
  const close = closeTags(text);
  return rewrite(text, opener, (open) => {
    const end = close(open[1]!, open.index + open[0].length);
    return end && { end: end.index + end[0].length, text: '' };
  });
}

function removeComments(text: string): string {
  const close = forwardSearch(text, /-->/g);
  return rewrite(text, /<!--/g, (open) => {
    const end = close(open.index + open[0].length);
    return end && { end: end.index + end[0].length, text: '' };
  });
}

function headingsToMarkdown(text: string): string {
  const tagEnd = forwardSearch(text, />/g);
  const close = closeTags(text);
  return rewrite(text, /<(h[1-6])/gi, (open) => {
    const body = tagEnd(open.index + open[0].length);
    const end = body && close(open[1]!, body.index + 1);
    return end && { end: end.index + end[0].length, text: `\n\n${'#'.repeat(Number(open[1]![1]))} ${text.slice(body!.index + 1, end.index)}\n\n` };
  });
}

/** Whether a link target starts at `at`: `href=` on a word boundary with a double-quoted, single-quoted or bare value not starting with `#`. */
function hrefAt(text: string, at: number): boolean {
  if (at > 0 && /\w/.test(text[at - 1]!)) return false;
  if (text.slice(at, at + 5).toLowerCase() !== 'href=') return false;
  const first = text[at + 5];
  if (first === '"' || first === "'") return text[at + 6] !== undefined && text[at + 6] !== first && text[at + 6] !== '#';
  return first !== undefined && !/[\s"'>#]/.test(first);
}

/** `<a href=…>text</a>` as `[text](href)`; href may be double-quoted, single-quoted or bare (`<a href=https://iana.org/help>` on example.com). */
function linksToMarkdown(text: string): string {
  const scan = tagScanner(text, (at) => hrefAt(text, at));
  const close = closeTags(text);
  return rewrite(text, /<a\b/gi, (open) => {
    const { end, token } = scan(open.index);
    if (end < 0 || token < 0) return null;
    const closing = close('a', end);
    if (!closing) return null;
    const quote = text[token + 5]!;
    const href = quote === '"' || quote === "'" ? text.slice(token + 6, text.indexOf(quote, token + 6)) : /[^\s"'>]*/y.exec(text.slice(token + 5, end))![0];
    return { end: closing.index + closing[0].length, text: `[${text.slice(end, closing.index)}](${href})` };
  });
}

/** Removes every remaining tag. Quoted attribute values may contain `>` (data-mw JSON on Wikipedia), so a tag ends at the first `>` outside quotes. */
function stripTags(text: string): string {
  const scan = tagScanner(text);
  return rewrite(text, /</g, (open) => {
    const { end } = scan(open.index);
    return end < 0 ? null : { end, text: '' };
  });
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** True for an opening tag's attributes that hide it: `hidden`, `aria-hidden="true"`, or an inline `display:none` / `visibility:hidden`. */
function hiddenByAttributes(attributes: string): boolean {
  for (const match of attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g)) {
    const name = match[1]!.toLowerCase();
    const value = (match[2] ?? '').replace(/^["']|["']$/g, '').toLowerCase();
    if (name === 'hidden' || (name === 'aria-hidden' && value === 'true')) return true;
    if (name === 'style' && /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/.test(value)) return true;
  }
  return false;
}

/**
 * Removes elements the page marks hidden (templates, placeholders, off-screen copies), so the text shows what a reader
 * would see; hidden text is also a common place for injected instructions.
 */
export function stripHidden(html: string): string {
  const open = /<([a-z][a-z0-9-]*)\b/gi;
  const scan = tagScanner(html);
  const elements = new Map<string, ElementEnd>();
  let out = '';
  let last = 0;
  for (let match = open.exec(html); match; match = open.exec(html)) {
    const { end: tagEnd } = scan(match.index);
    if (tagEnd < 0) continue;
    open.lastIndex = tagEnd;
    const attributes = html.slice(match.index + match[0].length, tagEnd - 1);
    if (!/hidden|none/i.test(attributes) || !hiddenByAttributes(attributes)) continue;
    const tag = match[1]!.toLowerCase();
    let end = tagEnd;
    if (!VOID_TAGS.has(tag) && !attributes.trimEnd().endsWith('/')) {
      let elementEnd = elements.get(tag);
      if (!elementEnd) elements.set(tag, (elementEnd = elementEnds(html, tag)));
      end = elementEnd(match.index) ?? tagEnd;
    }
    out += html.slice(last, match.index);
    last = end;
    open.lastIndex = end;
  }
  return out + html.slice(last);
}

/**
 * The page's machine-readable facts: JSON-LD blocks and the meta tags for prices, availability, locale and dates.
 * Often the cleanest source for a product's price or an article's date, even when the visible text is filled in by
 * JavaScript. Empty when the page has none.
 */
export function pageMetadata(html: string, max = METADATA_MAX_CHARS): string {
  const lines = new Set<string>();
  const tagEnd = forwardSearch(html, />/g);
  let after = 0;
  for (const open of html.matchAll(/<meta\b/gi)) {
    if (open.index < after) continue;
    const end = tagEnd(open.index);
    if (!end) break;
    after = end.index + 1;
    const tag = html.slice(open.index, after);
    const key = /\b(?:property|name|itemprop)=["']([^"']+)["']/i.exec(tag)?.[1];
    const content = /\bcontent=(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = content?.[1] ?? content?.[2];
    if (!key || !value?.trim()) continue;
    if (/^(og:(description|locale|price:amount|price:currency|updated_time)|product:(price:amount|price:currency|availability)|article:(published_time|modified_time)|price|pricecurrency|availability)$/i.test(key)) {
      lines.add(`${key}: ${decodeEntities(value).replace(/\s+/g, ' ').trim().slice(0, 300)}`);
    }
  }
  for (const block of elementsWith(html, 'script', /type=["']?application\/ld\+json/gi)) {
    try {
      const data = JSON.parse(block.trim()) as unknown;
      lines.add(`JSON-LD: ${JSON.stringify(data, (key, value: unknown) => (key === '@context' ? undefined : value)).slice(0, 800)}`);
    } catch {
      // A malformed block is skipped: the page text still stands.
    }
  }
  if (lines.size === 0) return '';
  return capChars(`## Page metadata (from the HTML; untrusted)\n${[...lines].join('\n')}`, max, 'the rest is in the page source');
}

/**
 * The contents of each `<name …>…</name>` element whose opening tag, before its first `>`, matches `attribute`
 * (global) when given: `<name\b[^>]*attribute[^>]*>([\s\S]*?)</name>`.
 */
function* elementsWith(html: string, name: string, attribute?: RegExp): Generator<string> {
  const tagEnd = forwardSearch(html, />/g);
  const find = attribute ? forwardSearch(html, attribute) : undefined;
  const close = closeTags(html);
  let after = 0;
  for (const open of html.matchAll(new RegExp(`<${name}\\b`, 'gi'))) {
    if (open.index < after) continue;
    const from = open.index + open[0].length;
    const end = tagEnd(from);
    const hit = find?.(from);
    if (!end || hit === null) return;
    if (hit && hit.index > end.index) continue;
    const closing = close(name, end.index + 1);
    if (!closing) continue;
    after = closing.index + closing[0].length;
    yield html.slice(end.index + 1, closing.index);
  }
}

/** Markers of a page rendered or hydrated by a JavaScript framework. */
const APP_MARKERS = /__NEXT_DATA__|__NUXT__|window\.__INITIAL_STATE__|__APOLLO_STATE__|data-reactroot|ng-version=|wix-warmup-data|data-server-rendered|id=["']__next["']|id=["']root["']><\/div>|id=["']app["']><\/div>/;

/** An app's mount point left empty for its script to fill (`<div id="root"></div>` and the like). */
const EMPTY_MOUNT = /<div\b[^>]*\bid=["']?(?:root|app|__next|__nuxt|svelte)["']?[^>]*>\s*<\/div>/i;
/** Text this short says nothing on its own (a "Loading", a menu label). */
const EMPTY_TEXT_CHARS = 50;
/** Text under this share of the HTML is what markup and scripts left over (a common "low text-to-markup" cut-off). */
const SHELL_TEXT_SHARE = 0.05;

/**
 * A warning when the static HTML may not be what a browser shows: a JavaScript shell or a bot check (little text, and
 * a gate, an empty mount point, or scripts with next to no text), or a JavaScript app whose values (prices, currency,
 * stock) are filled in or localized after load. A small static page with an analytics script is neither.
 */
export function staticHtmlNote(html: string, text: string): string | undefined {
  const gate = /enable javascript|javascript is (?:disabled|required)|checking your browser|just a moment|verify you are human|cf-chl/i.test(html);
  if (text.length < SHELL_TEXT_CHARS) {
    const mount = EMPTY_MOUNT.test(html);
    const sparse = /<script\b/i.test(html) && (text.trim().length < EMPTY_TEXT_CHARS || text.length < html.length * SHELL_TEXT_SHARE);
    if (gate || mount || sparse) {
      const why = gate ? ' and asks for JavaScript or a bot check' : mount ? ' and an empty app mount point' : '';
      return `Note: the static HTML has little text${why}; the page is probably built by JavaScript; ${RENDER_ADVICE}.`;
    }
  }
  // `<script\b[\s\S]*?</script>` spans: how many, and how much of the page they are.
  const close = closeTags(html);
  let scripts = 0;
  let scriptChars = 0;
  let after = 0;
  for (const open of html.matchAll(/<script\b/gi)) {
    if (open.index < after) continue;
    const end = close('script', open.index + open[0].length);
    if (!end) break;
    after = end.index + end[0].length;
    scripts += 1;
    scriptChars += after - open.index;
  }
  if (APP_MARKERS.test(html) || scriptChars > html.length * 0.3 || scripts >= 25) {
    return 'Note: static HTML of a JavaScript app (no script ran). Values the browser fills in or localizes after load (prices, currency, stock, dates) may be missing or placeholders here: ' + RENDER_ADVICE + '.';
  }
  return undefined;
}

/**
 * The page's main content when it marks one (`<main>`, `role="main"`, or a single `<article>`) with real text in it,
 * so sidebars, menus and footers outside it cost no tokens; else the whole page.
 */
export function mainContent(html: string): string {
  const candidates: Array<{ at: number; tag: string }> = [];
  const main = /<main\b/i.exec(html);
  if (main) candidates.push({ at: main.index, tag: 'main' });
  const role = firstTagWith(html, /<([a-z][a-z0-9]*)\b/gi, /\brole=["']?main\b/gi);
  if (role) candidates.push({ at: role.open.index, tag: role.open[1]!.toLowerCase() });
  const articles = html.match(/<article\b/gi) ?? [];
  if (articles.length === 1) candidates.push({ at: html.search(/<article\b/i), tag: 'article' });
  for (const { at, tag } of candidates) {
    const end = elementEnds(html, tag)(at);
    const part = end === undefined ? undefined : html.slice(at, end);
    if (part && htmlToText(part).length >= 200) return part;
  }
  return html;
}

/** Shortest run of consecutive link-only lines (a sidebar, a table of contents) that `collapseLinkRuns` folds. */
const LINK_RUN_MIN = 8;

/** Folds each run of LINK_RUN_MIN or more link-only lines into one note, so an over-long page shows content first. */
export function collapseLinkRuns(text: string): string {
  const linkOnly = (line: string) => /^(- )?\[[^\]]*\]\([^)]*\)$/.test(line.trim());
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= LINK_RUN_MIN) out.push(`[${run.length} links omitted]`);
    else out.push(...run);
    run = [];
  };
  for (const line of text.split('\n')) {
    if (linkOnly(line)) run.push(line);
    else if (line.trim() === '' && run.length > 0) continue;
    else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out.join('\n');
}

/**
 * An HTML page as the model reads it: title, source (with the page's language), a note when the static HTML may
 * differ from the rendered page, the page's metadata, then its main text.
 */
export function describeHtml(html: string, url: string): string {
  const title = elementsWith(html, 'title').next().value?.trim();
  const lang = firstTagWith(html, /<html\b/gi, /\blang=["']?([\w-]+)/gi)?.hit[1];
  const text = htmlToText(mainContent(html));
  const note = staticHtmlNote(html, text);
  const metadata = pageMetadata(html);
  const head = `${title ? `# ${decodeEntities(title)}\n` : ''}Source: ${url} · static HTML${lang ? ` · lang ${lang}` : ''}`;
  return [head, note, metadata, text].filter(Boolean).join('\n\n');
}
