/** Linear scanning primitives for HTML: each reads the text once, however many tags are left unclosed. */

type Search = (from: number) => RegExpExecArray | null;

/**
 * The first match of `pattern` (global) at or after a position. It remembers its last answer, so a forward pass that
 * asks from rising positions reads the text once; a miss stays a miss for every later position.
 */
export function forwardSearch(text: string, pattern: RegExp): Search {
  let searchedFrom = Number.POSITIVE_INFINITY;
  let found: RegExpExecArray | null = null;
  return (from) => {
    if (from >= searchedFrom && (found === null || found.index >= from)) return found;
    pattern.lastIndex = from;
    found = pattern.exec(text);
    searchedFrom = from;
    return found;
  };
}

/** The first `</name>` (any case) at or after a position, one remembered search per name. */
export function closeTags(text: string): (name: string, from: number) => RegExpExecArray | null {
  const searches = new Map<string, Search>();
  return (name, from) => {
    const key = name.toLowerCase();
    let search = searches.get(key);
    if (!search) searches.set(key, (search = forwardSearch(text, new RegExp(`</${key}>`, 'gi'))));
    return search(from);
  };
}

/**
 * Rewrites, left to right, each span `opener` (global) starts and `rewriteAt` accepts: it gives the span's end and its
 * replacement. A refused opener is skipped, as a failed regex match is.
 */
export function rewrite(text: string, opener: RegExp, rewriteAt: (open: RegExpExecArray) => { end: number; text: string } | null | undefined): string {
  let out = '';
  let last = 0;
  opener.lastIndex = 0;
  for (let open = opener.exec(text); open; open = opener.exec(text)) {
    const span = rewriteAt(open);
    if (!span) {
      opener.lastIndex = open.index + 1;
      continue;
    }
    out += text.slice(last, open.index) + span.text;
    last = opener.lastIndex = span.end;
  }
  return out + text.slice(last);
}

/** Replaces each span from an `opener` match through the next `terminator` match (`<li\b[^>]*>`-style) with `replacement`. */
export function replaceThrough(text: string, opener: RegExp, terminator: RegExp, replacement: string): string {
  const next = forwardSearch(text, terminator);
  return rewrite(text, opener, (open) => {
    const end = next(open.index + open[0].length);
    return end && { end: end.index + end[0].length, text: replacement };
  });
}

/**
 * Reads tags the way `<(?:[^>"']|"[^"]*"|'[^']*')*>` does: for the `<` at `lt`, `end` is the index after the first `>`
 * outside quotes, -1 when the tag never ends (no `>`, or an unclosed quote). `token` is the first position in the tag,
 * outside quotes, where `isToken` holds (-1 for none).
 *
 * Every position read outside quotes is remembered: a scan from it always ends the same way, so overlapping tags
 * (`<a <a <a …`) are read once in total.
 */
export function tagScanner(text: string, isToken: (at: number) => boolean = () => false): (lt: number) => { end: number; token: number } {
  // 0: not read yet; else the end (-1 when none) and the first token + 1 (0 when none) from that position.
  const ends = new Int32Array(text.length + 1);
  const tokens = new Int32Array(text.length + 1);
  return (lt) => {
    const read: number[] = [];
    let end: number;
    let token = -1;
    for (let at = lt + 1; ; ) {
      if (ends[at] !== 0) {
        end = ends[at]!;
        token = tokens[at]! - 1;
        break;
      }
      if (at >= text.length) {
        end = -1;
        break;
      }
      read.push(at);
      const char = text[at];
      if (char === '>') {
        end = at + 1;
        break;
      }
      if (char === '"' || char === "'") {
        const close = text.indexOf(char, at + 1);
        if (close < 0) {
          end = -1;
          break;
        }
        at = close + 1;
      } else at += 1;
    }
    for (let index = read.length - 1; index >= 0; index -= 1) {
      const at = read[index]!;
      if (isToken(at)) token = at;
      ends[at] = end;
      tokens[at] = token + 1;
    }
    return { end, token };
  };
}

/** For an element of `tag` that opens at a position: the index after its matching close tag, or undefined when it never closes. */
export type ElementEnd = (start: number) => number | undefined;

/**
 * Matches `<tag …>` with its close tag, counting nested elements of the same tag (`<(/?)tag\b[^>]*>` tokens). Asked
 * from rising positions it pairs the tags in one pass; asking from an earlier position starts over. A start that is
 * not an opening tag of the pass (it sits inside another tag) counts as never closed.
 */
export function elementEnds(html: string, tag: string): ElementEnd {
  const token = new RegExp(`<(/?)${tag}\\b`, 'gi');
  const tagEnd = forwardSearch(html, />/g);
  let origin = -1;
  let done = false;
  let open: number[] = [];
  let seen = new Set<number>();
  let ends = new Map<number, number>();
  const step = (): boolean => {
    const match = token.exec(html);
    const end = match && tagEnd(match.index + match[0].length);
    if (!match || !end) return false;
    token.lastIndex = end.index + 1;
    if (!match[1]) {
      open.push(match.index);
      seen.add(match.index);
    } else {
      const start = open.pop();
      if (start !== undefined) ends.set(start, end.index + 1);
    }
    return true;
  };
  return (start) => {
    if (origin < 0 || start < origin) {
      origin = token.lastIndex = start;
      done = false;
      open = [];
      seen = new Set();
      ends = new Map();
    }
    while (!done && (token.lastIndex <= start || (seen.has(start) && !ends.has(start)))) done = !step();
    return ends.get(start);
  };
}

/** The first tag `opener` (global) starts whose text before its first `>` matches `attribute` (global): `<x\b[^>]*attribute`. */
export function firstTagWith(html: string, opener: RegExp, attribute: RegExp): { open: RegExpExecArray; hit: RegExpExecArray } | undefined {
  const tagEnd = forwardSearch(html, />/g);
  const find = forwardSearch(html, attribute);
  for (const open of html.matchAll(opener)) {
    const from = open.index + open[0].length;
    const hit = find(from);
    if (!hit) return undefined;
    const end = tagEnd(from);
    if (!end || hit.index < end.index) return { open, hit };
  }
  return undefined;
}
