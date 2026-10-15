#!/usr/bin/env node
// Octocode report viewer: render skill Markdown output as one self-contained local HTML page.
// Canonical copy: skills/octocode-skills/scripts/render-report.mjs. Every skill ships a byte-identical
// copy at scripts/render-report.mjs; sync with skills/octocode-skills/scripts/report-viewer-sync.mjs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HELP = `Render skill Markdown output as one self-contained HTML report. The page stays closed.

Usage:
  node scripts/render-report.mjs <file.md | folder> [--out <file.html>] [--title <text>] [--open] [--json]
  node scripts/render-report.mjs <file.md | folder> --manifest
  node scripts/render-report.mjs --self-test
  node scripts/render-report.mjs --help

A file renders one report. A folder renders every Markdown file under it (skipping tmp/, view/,
node_modules/, and dot folders) as a library; <workspace>/.octocode renders all saved skill output.

Default output, next to the source when it is under <workspace>/.octocode/:
  <name>.md -> <name>.html        <folder> -> <folder>/index.html
Other sources go to <workspace>/.octocode/<this skill>/view/<name>/index.html.

The page renders Markdown locally (GFM tables, task lists, alerts, footnotes, code highlighting),
links code references such as \`src/a.ts:12\` that exist in the workspace to your editor, lists every
cited source, and has search, a contents rail, light/dark themes, and print styles. Mermaid diagrams
load mermaid from a pinned CDN; offline, the diagram source is shown instead. Raw HTML is escaped.
Leaves the page closed. Pass --open only when the reader asked to see it. --no-open is
accepted and keeps the page closed. CI, or Linux with no display, also stays closed.

--manifest writes no HTML. It prints one JSON catalog for agents: for every report, its path,
skill, kind, title, date, header fields (status, confidence, question, next, and any others),
lead paragraph, headings, links, and code references, newest first. Nothing is clipped; read a
report's Markdown for its full body.`;

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@12.1.0/dist/mermaid.esm.min.mjs';
const SKIP_DIRS = new Set(['node_modules', 'tmp', 'view']);
const PRIMARY = ['rfc.md', 'readme.md', 'index.md'];
const KINDS = {
  'octocode-research': 'Research', 'octocode-rfc-generator': 'RFC', 'octocode-brainstorming': 'Brainstorm',
  'octocode-architect': 'Architecture', 'octocode-roast': 'Roast', 'octocode-clean-agentic-code': 'Cleanup',
  'octocode-documentation': 'Documentation', 'octocode-eval-benchmark': 'Evaluation', 'octocode-skills': 'Skill review',
  'octocode-agentic-prompts': 'Prompt review', 'octocode-scraping': 'Scrape', 'octocode-chrome-devtools': 'Browser session',
  'octocode-agents-communication': 'Coordination',
};

// ---------------------------------------------------------------------------------------------
// Markdown engine. Runs in Node (self-test) and in the page (inlined via Function#toString).
// ---------------------------------------------------------------------------------------------
function mdKit() {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const slugify = (t) => String(t).toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-') || 'section';
  const safeUrl = (u) => (/^(javascript|vbscript|data):/i.test(String(u).replace(/[\s\u0000-\u001f]/g, '')) ? '#' : String(u).trim());
  const ALERTS = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };
  const INLINE_TAG = /^<(\/?)(br|kbd|sub|sup|mark|ins|del|s|u|b|i|small)\s*\/?>$/i;

  function frontmatter(src) {
    const m = String(src).match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?\n?/);
    if (!m) return { meta: {}, body: String(src) };
    const meta = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z][\w -]*):\s*(.*)$/);
      if (kv && kv[2] !== '') meta[kv[1].trim().toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '');
    }
    return { meta, body: String(src).slice(m[0].length) };
  }

  const HASH_LANG = /^(py|python|sh|bash|zsh|shell|console|yaml|yml|toml|rb|ruby|r|perl|ini|conf|dockerfile|make|makefile|nix|ex|elixir|ps1|powershell)$/;
  const DASH_LANG = /^(sql|lua|haskell|hs|elm)$/;
  const KW = new Set(('abstract and as assert async await break case catch class const continue crate def default defer del delete do elif else enum '
    + 'except export extends extern false final finally fn for from func function go if impl implements import in instanceof interface is lambda let loop '
    + 'match mod module move mut namespace new nil none not null of or package pass private protected pub public raise readonly ref return select self '
    + 'static struct super switch then this throw throws trait true try type typeof undefined unsafe use using var void when where while with yield').split(' '));

  function highlight(code, lang) {
    lang = (lang || '').toLowerCase();
    if (lang === 'diff' || lang === 'patch') {
      return code.split('\n').map((l) => {
        const cls = /^(\+\+\+|---|@@)/.test(l) ? 'tk-m' : l[0] === '+' ? 'tk-add' : l[0] === '-' ? 'tk-del' : '';
        return cls ? `<span class="${cls}">${esc(l)}</span>` : esc(l);
      }).join('\n');
    }
    if (!lang || /^(text|txt|plain|plaintext|md|markdown|output|log|csv|tsv)$/.test(lang)) return esc(code);
    const comment = lang === 'json' ? '(?!)' : HASH_LANG.test(lang) ? '#[^\\n]*' : DASH_LANG.test(lang) ? '--[^\\n]*' : '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
    const str = '"(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`';
    const re = new RegExp(`(${comment})|(${str})|\\b(\\d[\\d_]*(?:\\.\\d+)?)\\b|\\b([A-Za-z_]\\w*)\\b`, 'g');
    let out = '', last = 0, m;
    while ((m = re.exec(code))) {
      if (!m[0]) { re.lastIndex++; continue; }
      out += esc(code.slice(last, m.index));
      const cls = m[1] ? 'tk-c' : m[2] ? 'tk-s' : m[3] ? 'tk-n' : KW.has(m[4]) ? 'tk-k' : /^[A-Z][a-z]\w*$/.test(m[4]) ? 'tk-t' : '';
      out += cls ? `<span class="${cls}">${esc(m[0])}</span>` : esc(m[0]);
      last = re.lastIndex;
    }
    return out + esc(code.slice(last));
  }

  function parse(src) {
    const lines = String(src).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    const refs = {}, notes = {}, noteOrder = [], body = [];
    let fence = null;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const f = l.match(/^ {0,3}(`{3,}|~{3,})/);
      if (f) {
        if (!fence) fence = f[1];
        else if (f[1][0] === fence[0] && f[1].length >= fence.length && !l.trim().slice(f[1].length).trim()) fence = null;
        body.push(l); continue;
      }
      if (fence) { body.push(l); continue; }
      let m;
      if ((m = l.match(/^ {0,3}\[\^([^\]]+)\]:\s*(.*)$/))) {
        let t = m[2];
        while (i + 1 < lines.length && /^ {2,}\S/.test(lines[i + 1])) t += `\n${lines[++i].trim()}`;
        notes[m[1]] = t; continue;
      }
      if ((m = l.match(/^ {0,3}\[([^\]^][^\]]*)\]:\s*<?([^\s>]+)>?(?:\s+["'(](.*)["')])?\s*$/))) { refs[m[1].toLowerCase()] = { url: m[2], title: m[3] }; continue; }
      body.push(l);
    }

    const link = (u, html, title) => `<a href="${esc(safeUrl(u))}"${title ? ` title="${esc(title)}"` : ''}>${html}</a>`;
    const footref = (id) => {
      if (notes[id] == null) return esc(`[^${id}]`);
      let n = noteOrder.indexOf(id) + 1;
      if (!n) n = noteOrder.push(id);
      return `<sup class="fnref"><a href="#fn-${esc(slugify(id))}" id="fnref-${esc(slugify(id))}">${n}</a></sup>`;
    };

    function inline(text) {
      const slots = [];
      const keep = (html) => `\u0000${slots.push(html) - 1}\u0000`;
      let s = String(text);
      s = s.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, t, c) => keep(`<code>${esc(/^ .* $/.test(c) ? c.slice(1, -1) : c)}</code>`));
      s = s.replace(/\\([\\`*_{}[\]()#+\-.!|>~<])/g, (_, c) => keep(esc(c)));
      s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (_, u) => keep(link(u, esc(u))));
      s = s.replace(/<\/?[A-Za-z][^<>]*>/g, (tag) => { const t = tag.match(INLINE_TAG); return t ? keep(`<${t[1]}${t[2].toLowerCase()}>`) : tag; });
      s = s.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g, (_, a, u, t) => keep(`<img alt="${esc(a)}" src="${esc(safeUrl(u))}"${t ? ` title="${esc(t)}"` : ''} loading="lazy">`));
      s = s.replace(/\[((?:[^[\]]|\[[^\]]*\])*)\]\(\s*<?([^)\s>]*)>?(?:\s+"([^"]*)")?\s*\)/g, (_, t, u, ti) => keep(link(u, inline(t), ti)));
      s = s.replace(/\[\^([^\]\s]+)\]/g, (_, id) => keep(footref(id)));
      s = s.replace(/\[([^[\]]+)\]\[([^\]]*)\]/g, (m, t, id) => { const d = refs[(id || t).toLowerCase()]; return d ? keep(link(d.url, inline(t), d.title)) : m; });
      s = s.replace(/\[([^[\]]+)\](?![(:[])/g, (m, t) => { const d = refs[t.toLowerCase()]; return d ? keep(link(d.url, inline(t), d.title)) : m; });
      s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>()\u0000]+[^\s<>().,;:!?'"\u0000])/g, (_, p, u) => p + keep(link(u, esc(u))));
      s = esc(s)
        .replace(/\*\*([^*\s](?:[^*]*?[^*\s])?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^\w])__([^_\s](?:[^_]*?[^_\s])?)__(?!\w)/g, '$1<strong>$2</strong>')
        .replace(/(^|[^*\w])\*([^*\s](?:[^*]*?[^*\s])?)\*(?![*\w])/g, '$1<em>$2</em>')
        .replace(/(^|[^_\w])_([^_\s](?:[^_]*?[^_\s])?)_(?!\w)/g, '$1<em>$2</em>')
        .replace(/~~([^~\s](?:[^~]*?[^~\s])?)~~/g, '<del>$1</del>')
        .replace(/(?: {2,}|\\)\n/g, '<br>')
        .replace(/\n/g, ' ');
      for (let k = 0; k < 4 && s.includes('\u0000'); k++) s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => slots[Number(n)]);
      return s;
    }

    const LIST = /^( {0,3})([-*+]|\d{1,9}[.)])( +|$)/;
    const HR = /^ {0,3}([-*_])( *\1){2,} *$/;
    const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`{]*)/;
    const DELIM = /^ {0,3}\|? *:?-+:? *(\| *:?-+:? *)*\|? *$/;
    const blank = (l) => !l.trim();
    const lead = (l) => l.match(/^ */)[0].length;
    const isTable = (ls, i) => ls[i].includes('|') && i + 1 < ls.length && ls[i + 1].includes('-') && DELIM.test(ls[i + 1]);
    const splitRow = (r) => {
      let s = r.trim();
      if (s.startsWith('|')) s = s.slice(1);
      if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
      const cells = [];
      let cur = '', tick = false;
      for (let k = 0; k < s.length; k++) {
        const c = s[k];
        if (c === '\\' && s[k + 1] === '|') { cur += '\\|'; k++; continue; }
        if (c === '`') tick = !tick;
        if (c === '|' && !tick) { cells.push(cur.trim()); cur = ''; continue; }
        cur += c;
      }
      cells.push(cur.trim());
      return cells;
    };
    const interrupts = (l) => FENCE.test(l) || /^ {0,3}(#{1,6}(\s|$)|>)/.test(l) || HR.test(l) || /^ {0,3}([-*+]|1[.)]) +\S/.test(l) || /^\s*<\/?(details|summary)\b/i.test(l);

    function codeBlock(code, lang) {
      if (lang === 'mermaid') return `<pre class="mermaid-src"><code class="language-mermaid">${esc(code)}</code></pre>`;
      return `<pre${lang ? ` data-lang="${esc(lang)}"` : ''}><code${lang ? ` class="language-${esc(lang)}"` : ''}>${highlight(code, lang)}</code></pre>`;
    }

    function blocks(ls, tight) {
      const out = [];
      let i = 0;
      while (i < ls.length) {
        const l = ls[i];
        let m;
        if (blank(l)) { i++; continue; }
        if ((m = l.match(FENCE))) {
          const mark = m[1], lang = (m[2] || '').toLowerCase(), indent = lead(l), buf = [];
          i++;
          while (i < ls.length) {
            const c = ls[i].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
            if (c && c[1][0] === mark[0] && c[1].length >= mark.length) break;
            buf.push(ls[i].slice(Math.min(indent, lead(ls[i]))));
            i++;
          }
          i++;
          out.push(codeBlock(buf.join('\n'), lang));
          continue;
        }
        if ((m = l.match(/^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/))) {
          const n = m[1].length;
          out.push(`<h${n}>${inline(m[2] || '')}</h${n}>`);
          i++; continue;
        }
        if (HR.test(l)) { out.push('<hr>'); i++; continue; }
        if ((m = l.match(/^\s*<details(\s+open)?\s*>\s*$/i))) { out.push(`<details${m[1] ? ' open' : ''}>`); i++; continue; }
        if ((m = l.match(/^\s*<summary>(.*)<\/summary>\s*$/i))) { out.push(`<summary>${inline(m[1])}</summary>`); i++; continue; }
        if (/^\s*<\/details>\s*$/i.test(l)) { out.push('</details>'); i++; continue; }
        if (isTable(ls, i)) {
          const head = splitRow(l);
          const align = splitRow(ls[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
          const cell = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c)}</${tag}>`;
          let html = `<table><thead><tr>${head.map((c, k) => cell('th', c, k)).join('')}</tr></thead><tbody>`;
          i += 2;
          while (i < ls.length && !blank(ls[i]) && ls[i].includes('|') && !interrupts(ls[i])) {
            const row = splitRow(ls[i++]);
            html += `<tr>${head.map((_, k) => cell('td', row[k] ?? '', k)).join('')}</tr>`;
          }
          out.push(`${html}</tbody></table>`);
          continue;
        }
        if (/^ {0,3}>/.test(l)) {
          const buf = [];
          while (i < ls.length && !blank(ls[i]) && (/^ {0,3}>/.test(ls[i]) || (buf.length && !interrupts(ls[i])))) buf.push(ls[i++].replace(/^ {0,3}> ?/, ''));
          const a = buf[0] && buf[0].match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
          if (a) {
            const kind = a[1].toLowerCase(), rest = [a[2], ...buf.slice(1)].filter((x, k) => k || x.trim());
            out.push(`<div class="alert alert-${kind}" role="note"><p class="alert-title">${ALERTS[kind]}</p>${blocks(rest)}</div>`);
          } else out.push(`<blockquote>${blocks(buf)}</blockquote>`);
          continue;
        }
        if ((m = l.match(LIST))) {
          const ordered = /\d/.test(m[2]), start = ordered ? parseInt(m[2], 10) : 1, items = [];
          let loose = false;
          while (i < ls.length) {
            const mm = ls[i].match(LIST);
            if (!mm || /\d/.test(mm[2]) !== ordered) break;
            const width = mm[1].length + mm[2].length + Math.min(Math.max(mm[3].length, 1), 4);
            const content = [ls[i].slice(mm[0].length)];
            i++;
            while (i < ls.length) {
              const nx = ls[i];
              if (blank(nx)) {
                let j = i;
                while (j < ls.length && blank(ls[j])) j++;
                if (j < ls.length && lead(ls[j]) >= width) {
                  if (!LIST.test(ls[j].slice(width))) loose = true;
                  while (i < j) { content.push(''); i++; }
                  continue;
                }
                break;
              }
              if (lead(nx) >= width) { content.push(nx.slice(width)); i++; continue; }
              if (LIST.test(nx) || interrupts(nx) || isTable(ls, i)) break;
              content.push(nx.trim()); i++;
            }
            items.push(content);
            if (i < ls.length && blank(ls[i])) {
              let j = i;
              while (j < ls.length && blank(ls[j])) j++;
              const nm = j < ls.length && ls[j].match(LIST);
              if (nm && /\d/.test(nm[2]) === ordered && nm[1].length < width) { loose = true; i = j; } else break;
            }
          }
          const lis = items.map((c) => {
            const task = c[0].match(/^\[([ xX])\]\s+/);
            if (task) c[0] = c[0].slice(task[0].length);
            const inner = blocks(c, !loose);
            return task ? `<li class="task"><input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> ${inner}</li>` : `<li>${inner}</li>`;
          });
          out.push(ordered ? `<ol${start !== 1 ? ` start="${start}"` : ''}>${lis.join('')}</ol>` : `<ul>${lis.join('')}</ul>`);
          continue;
        }
        const buf = [l.trim()];
        i++;
        let setext = 0;
        while (i < ls.length && !blank(ls[i])) {
          if (/^ {0,3}=+\s*$/.test(ls[i])) { setext = 1; i++; break; }
          if (/^ {0,3}-+\s*$/.test(ls[i])) { setext = 2; i++; break; }
          if (interrupts(ls[i]) || isTable(ls, i)) break;
          buf.push(ls[i].replace(/^ +/, ''));
          i++;
        }
        const text = inline(buf.join('\n'));
        out.push(setext ? `<h${setext}>${text}</h${setext}>` : tight ? text : `<p>${text}</p>`);
      }
      return out.join('\n');
    }

    let html = blocks(body);
    if (noteOrder.length) {
      html += `<section class="footnotes"><ol>${noteOrder.map((id) => `<li id="fn-${esc(slugify(id))}">${inline(notes[id])} <a class="fnback" href="#fnref-${esc(slugify(id))}" aria-label="Back to reference">↩</a></li>`).join('')}</ol></section>`;
    }
    return html;
  }

  const TONES = [
    [/^(p0|sev0|sev1|critical|blocker|blocking|blocked|severe|fail|failed|failing|error|refuted|rejected|invalid|broken|high risk|must|no-go)$/i, 'red'],
    [/^(p1|sev2|high|major|warn|warning|at risk|partial|needs work|unverified|disputed|should|revise|revert|request changes)$/i, 'amber'],
    [/^(p2|sev3|medium|moderate|likely|in review|proposed|draft|open|in progress|ongoing|todo|could|investigate|waiting|comment)$/i, 'blue'],
    [/^(p3|low|minor|info|nit|deferred|optional|n\/a|unknown|skipped|superseded|inconclusive|no|none)$/i, 'gray'],
    [/^(pass|passed|ok|confirmed|verified|accepted|approved|done|resolved|fixed|ready|supported|keep|go|yes|complete|recommended|acceptable|accept|approve|✓|✔|✅)$/i, 'green'],
  ];
  // High/medium/low read as good or bad depending on the column or label they sit under:
  // "Fit: High" is good, "Risk: High" is bad. Without a known context they keep severity colors.
  const GOOD_SCALE = /fit|confidence|quality|score|readiness|coverage|value|benefit|strength|support|certainty|relevan|match|agreement|evidence/i;
  const SCALE = { high: 'green', strong: 'green', medium: 'blue', moderate: 'blue', mixed: 'blue', low: 'amber', weak: 'amber', none: 'red' };
  const toneOf = (text, context = '') => {
    const t = String(text).trim().replace(/[.:]$/, '');
    if (!t || t.length > 14) return '';
    if (context && GOOD_SCALE.test(context) && SCALE[t.toLowerCase()]) return SCALE[t.toLowerCase()];
    for (const [rx, tone] of TONES) if (rx.test(t)) return tone;
    return '';
  };

  return { esc, slugify, safeUrl, frontmatter, highlight, parse, toneOf, GOOD_SCALE };
}

// ---------------------------------------------------------------------------------------------
// Page behavior. Inlined into the HTML; reads #report-data.
// ---------------------------------------------------------------------------------------------
function client(kit, MERMAID_URL) {
  const { esc, slugify } = kit;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const store = {
    get: (k) => { try { return localStorage.getItem(`octocode-report-${k}`); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(`octocode-report-${k}`, v); } catch { /* private mode */ } },
  };

  let data = null;
  try { data = JSON.parse($('#report-data').textContent); } catch { /* opened without data */ }
  if (!data || !Array.isArray(data.files) || !data.files.length) {
    $('#page').innerHTML = '<h1>No report data</h1><p>Build this page with <code>node scripts/render-report.mjs &lt;file-or-folder&gt;</code>.</p>';
    return;
  }

  const plain = (s) => String(s).replace(/(^|\n)\s*>+\s?/g, '$1').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*~#]/g, '').replace(/(^|[^\w])_+|_+(?![\w])/g, '$1').replace(/\s+/g, ' ').trim();
  const files = data.files.map((f) => {
    const h1 = (f.body.match(/^ {0,3}#\s+(.+?)\s*#*\s*$/m) || [])[1];
    const base = f.path.split('/').pop();
    const title = f.meta.title || (h1 ? plain(h1) : base.replace(/\.md$/i, ''));
    const afterTitle = h1 ? f.body.slice(f.body.search(/^ {0,3}#\s+/m)).replace(/^.*\n/, '') : f.body;
    const para = afterTitle.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !/^(#|```|~~~|\||[-*+] |\d+[.)] |<|!\[|---|>\s*\[!)/.test(p));
    const date = f.meta.date || (f.path.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
    return { ...f, base, title, lead: para ? plain(para) : '', date };
  });
  const byPath = new Map(files.map((f) => [f.path, f]));
  const library = files.length > 1;
  const home = library ? data.primary || null : files[0].path;
  const siteTitle = data.title || (library ? data.rootName : files[0].title);
  $('#site-title').textContent = siteTitle;
  document.body.classList.toggle('single', !library);

  const setTheme = (t) => { document.documentElement.dataset.theme = t; store.set('theme', t); };
  setTheme(store.get('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  let editor = store.get('editor') || 'vscode';
  $('#editor').value = editor;
  const editorUrl = (abs, line) => {
    const p = abs.replace(/\\/g, '/');
    const lead = p.startsWith('/') ? '' : '/';
    return editor === 'file' ? `file://${lead}${encodeURI(p)}` : `${editor}://file${lead}${encodeURI(p)}${line ? `:${line}` : ''}`;
  };

  const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 1600); };
  const copy = (text, msg) => { navigator.clipboard?.writeText(text).then(() => toast(msg), () => toast('Copy failed')); };

  // Routes: #/ library, #/<path> document, #/<path>@<slug> section.
  const parseHash = () => {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const at = h.lastIndexOf('@');
    return at > 0 ? { path: h.slice(0, at), slug: h.slice(at + 1) } : { path: h || null, slug: '' };
  };
  const href = (p, slug) => `#/${p ? encodeURI(p) + (slug ? `@${encodeURIComponent(slug)}` : '') : ''}`;
  const dirOf = (p) => p.slice(0, p.lastIndexOf('/') + 1);
  const resolvePath = (from, rel) => {
    const out = [];
    for (const seg of (dirOf(from) + rel).split('/')) { if (seg === '..') out.pop(); else if (seg && seg !== '.') out.push(seg); }
    return out.join('/');
  };

  const { toneOf, GOOD_SCALE } = kit;
  const DIAGRAMS = { flowchart: 'Flowchart', graph: 'Flowchart', sequencediagram: 'Sequence', classdiagram: 'Class diagram', statediagram: 'State diagram', 'statediagram-v2': 'State diagram', erdiagram: 'Entity relationship', gantt: 'Timeline plan', pie: 'Pie chart', mindmap: 'Mind map', timeline: 'Timeline', 'xychart-beta': 'Chart', xychart: 'Chart', quadrantchart: 'Quadrant', journey: 'User journey', gitgraph: 'Git graph', sankey: 'Sankey', 'sankey-beta': 'Sankey', block: 'Block diagram', 'block-beta': 'Block diagram', architecture: 'Architecture', 'architecture-beta': 'Architecture', kanban: 'Kanban', packet: 'Packet', 'packet-beta': 'Packet', requirementdiagram: 'Requirements', c4context: 'C4 context' };
  const diagramLabel = (src) => { const w = (src.replace(/^%%.*$/gm, '').trim().split(/\s/)[0] || '').toLowerCase(); return DIAGRAMS[w] || w.replace(/-beta$/, '').replace(/-/g, ' '); };
  const chip = (text, tone) => `<span class="chip${tone ? ` t-${tone}` : ''}">${esc(text)}</span>`;

  // ----- Library view -----
  let libFilter = '';
  const kindKey = (f) => f.kind || f.group || 'Documents';
  function renderLibrary() {
    const kinds = new Map();
    for (const f of files) kinds.set(kindKey(f), (kinds.get(kindKey(f)) || 0) + 1);
    if (libFilter && !kinds.has(libFilter)) libFilter = '';
    const list = files.filter((f) => !libFilter || kindKey(f) === libFilter)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || kindKey(a).localeCompare(kindKey(b)) || a.title.localeCompare(b.title));
    const filters = [['', `All <small>${files.length}</small>`], ...[...kinds].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => [k, `${esc(k)} <small>${n}</small>`])];
    const filterHtml = (cls) => filters.map(([k, label]) => `<button class="${cls}${k === libFilter ? ' on' : ''}" data-filter="${esc(k)}" aria-pressed="${k === libFilter}">${label}</button>`).join('');
    let html = `<h1>${esc(siteTitle)}</h1><p class="lead">${files.length} document${files.length === 1 ? '' : 's'} from ${kinds.size} skill${kinds.size === 1 ? '' : 's'}, newest first. Press <kbd>/</kbd> to search every document.</p>`
      + `<div class="lib-filters" role="toolbar" aria-label="Filter by kind">${filterHtml('fchip')}</div><ul class="lib-list">`;
    for (const f of list) {
      const status = f.meta.status ? chip(f.meta.status, toneOf(f.meta.status) || 'blue') : '';
      html += `<li><a href="${href(f.path)}"><span class="lib-row"><span class="lib-kind">${esc(kindKey(f))}</span><span class="lib-title">${esc(f.title)}</span>${status}<span class="lib-date">${esc(f.date)}</span></span>`
        + `${f.lead ? `<span class="lib-lead">${esc(f.lead)}</span>` : ''}<span class="lib-path">${esc(f.path)}</span></a></li>`;
    }
    html += '</ul>';
    $('#page').innerHTML = html;
    $('#docmeta').innerHTML = `<span class="kind">Library</span><span class="stats"><span>${list.length === files.length ? `${files.length} documents` : `${list.length} of ${files.length} documents`}</span></span>`;
    $('#toc').innerHTML = `<div class="toc-filters">${filterHtml('l2 tfilter')}</div>`;
    $$('[data-filter]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); libFilter = b.dataset.filter; renderLibrary(); }));
    $('#sources').innerHTML = '<p class="muted">Open a document to list its sources.</p>';
    $('#tab-sources').textContent = 'Sources';
  }

  // ----- Document view -----
  let cites = [];
  function decorate(art, f) {
    const refs = f.refs || {};
    const seen = {}, toc = [];
    $$('h1,h2,h3,h4', art).forEach((h) => {
      let id = slugify(h.textContent);
      seen[id] = seen[id] == null ? 0 : seen[id] + 1;
      if (seen[id]) id += `-${seen[id]}`;
      h.id = id;
      if (/H[23]/.test(h.tagName)) toc.push(`<a href="${href(f.path, id)}" data-id="${esc(id)}" class="l${h.tagName[1]}">${esc(h.textContent)}</a>`);
      const a = Object.assign(document.createElement('a'), { className: 'anchor', href: href(f.path, id), textContent: '#' });
      a.setAttribute('aria-label', `Copy link to “${h.textContent}”`);
      h.append(a);
    });
    $('#toc').innerHTML = toc.join('') || '<p class="muted">No sections</p>';
    const first = $('h1', art)?.nextElementSibling;
    if (first && first.tagName === 'P') first.classList.add('lead');

    $$('table', art).forEach((t) => {
      const w = document.createElement('div');
      w.className = 'tablewrap';
      t.replaceWith(w); w.append(t);
      const heads = $$('thead th', t).map((th) => th.textContent);
      $$('td', t).forEach((td) => {
        if (td.children.length > 1 || (td.children.length === 1 && !/^(STRONG|EM|CODE)$/.test(td.children[0].tagName))) return;
        const tone = toneOf(td.textContent, heads[td.cellIndex] || '');
        if (tone) td.innerHTML = chip(td.textContent.trim(), tone);
      });
    });
    // "**Status:** Draft" or "Verdict: **Confirmed**" lines get a chip for the value.
    $$('p > strong, li > strong', art).forEach((s) => {
      const tone = toneOf(s.textContent, s.previousSibling?.textContent || '');
      if (tone && s.previousSibling && /:\s*$/.test(s.previousSibling.textContent || '')) s.outerHTML = chip(s.textContent, tone);
      else if (/:$/.test(s.textContent) && s.nextSibling?.nodeType === 3) {
        const v = s.nextSibling.textContent.trim(), tone2 = toneOf(v, s.textContent);
        if (tone2) s.nextSibling.replaceWith(Object.assign(document.createElement('span'), { innerHTML: ` ${chip(v, tone2)}` }));
      }
    });

    cites = [];
    const cite = (a, kind, key, label) => { a.id = a.id || `cite-${cites.length}`; cites.push({ id: a.id, kind, key, label: label || a.textContent.trim() || key }); };
    const refKind = (rel) => /\.(md|markdown)$/i.test(rel) ? 'doc' : 'code';
    const codeLink = (a, ref) => {
      const loc = ref.rel + (ref.line ? `:${ref.line}` : '');
      a.href = editorUrl(ref.abs, ref.line);
      a.dataset.abs = ref.abs;
      a.dataset.line = ref.line || '';
      a.classList.add('coderef');
      a.title = `Open ${loc} in your editor`;
      cite(a, refKind(ref.rel), loc, loc);
    };
    $$('a[href]', art).forEach((a) => {
      const raw = a.getAttribute('href');
      if (a.classList.contains('anchor') || raw.startsWith('#/')) return;
      if (raw.startsWith('#')) { const s = decodeURIComponent(raw.slice(1)); a.href = href(f.path, /^fn(ref)?-/.test(s) ? s : slugify(s)); return; }
      if (/^https?:/i.test(raw)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; a.classList.add('ext'); cite(a, 'web', raw); return; }
      if (/^[a-z][\w+.-]*:/i.test(raw)) return;
      const [file, frag] = raw.split('#');
      const target = resolvePath(f.path, decodeURIComponent(file));
      if (byPath.has(target)) { a.href = href(target, frag && slugify(frag)); a.classList.add('doclink'); return; }
      if (refs[raw]) codeLink(a, refs[raw]);
      else { a.classList.add('missing'); a.title = 'Not found in this workspace'; }
    });
    $$('code', art).forEach((c) => {
      if (c.closest('pre,a')) return;
      const ref = refs[c.textContent];
      if (!ref) return;
      const a = document.createElement('a');
      c.replaceWith(a); a.append(c);
      codeLink(a, ref);
    });

    let n = 0;
    $$('pre > code', art).forEach((code) => {
      const pre = code.parentElement;
      if (pre.classList.contains('mermaid-src')) {
        const src = code.textContent;
        const fig = document.createElement('figure');
        fig.className = 'diagram';
        fig.innerHTML = `<figcaption><b>Diagram ${++n}</b><span>${esc(diagramLabel(src))}</span>`
          + '<button data-act="src" aria-pressed="false">Source</button><button data-act="copy">Copy</button><button data-act="zoom">Expand</button></figcaption>'
          + '<div class="canvas">Rendering diagram…</div><pre hidden><code></code></pre>';
        $('pre code', fig).textContent = src;
        fig.dataset.src = src;
        pre.replaceWith(fig);
        return;
      }
      const bar = document.createElement('div');
      bar.className = 'codebar';
      bar.innerHTML = `<span>${esc(pre.dataset.lang || '')}</span><button type="button">Copy</button>`;
      $('button', bar).addEventListener('click', (e) => { copy(code.textContent, 'Code copied'); e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy'; }, 1200); });
      pre.prepend(bar);
    });

    if (f.source) {
      const root = String(data.workspace || '').replace(/\\/g, '/').replace(/\/$/, '');
      const abs = String(f.source).replace(/\\/g, '/');
      const rel = root && abs.startsWith(root + '/') ? abs.slice(root.length + 1) : abs;
      cites.push({ id: 'source-doc', kind: 'doc', key: rel, label: rel });
    }
    renderSources();
    renderMeta(f, art, toc.length, n);
  }

  function renderMeta(f, art, sections, diagrams) {
    const words = art.textContent.trim().split(/\s+/).length;
    const items = Object.entries(f.meta).filter(([k]) => k !== 'title').map(([k, v]) => {
      const tone = (GOOD_SCALE.test(k) && toneOf(v, k)) || (/status|state|severity|priority|confidence|verdict|risk|decision/.test(k) ? toneOf(v) || 'blue' : '');
      return `<span class="meta-item"><span class="meta-k">${esc(k)}</span>${tone ? chip(v, tone) : `<span class="meta-v">${esc(v)}</span>`}</span>`;
    });
    if (f.date && !f.meta.date) items.unshift(`<span class="meta-item"><span class="meta-k">date</span><span class="meta-v">${esc(f.date)}</span></span>`);
    if (f.source) {
      const root = String(data.workspace || '').replace(/\\/g, '/').replace(/\/$/, '');
      const abs = String(f.source).replace(/\\/g, '/');
      const rel = root && abs.startsWith(root + '/') ? abs.slice(root.length + 1) : abs;
      items.push(`<span class="meta-item"><span class="meta-k">source</span><a class="meta-v" id="source-doc" href="${editorUrl(abs)}">${esc(rel)}</a></span>`);
    }
    const sources = new Set(cites.map((c) => c.key)).size;
    const stats = [
      `${Math.max(1, Math.round(words / 230))} min read`,
      sections && `${sections} ${sections === 1 ? 'section' : 'sections'}`,
      sources && `${sources} ${sources === 1 ? 'source' : 'sources'}`,
      diagrams && `${diagrams} ${diagrams === 1 ? 'diagram' : 'diagrams'}`,
    ].filter(Boolean);
    $('#docmeta').innerHTML = `<span class="kind">${esc(f.kind || data.kind || 'Report')}</span>${items.join('')}<span class="stats">${stats.map((s) => `<span>${esc(s)}</span>`).join('')}</span>`;
  }

  let sourceList = [];
  function renderSources() {
    const groups = new Map();
    for (const c of cites) {
      let g = 'Workspace code';
      if (c.kind === 'doc') g = 'Local docs';
      else if (c.kind === 'web') { try { g = new URL(c.key).hostname.replace(/^www\./, ''); } catch { g = 'Links'; } }
      if (!groups.has(g)) groups.set(g, new Map());
      const m = groups.get(g);
      if (!m.has(c.key)) m.set(c.key, { ...c, ids: [] });
      m.get(c.key).ids.push(c.id);
    }
    sourceList = [...groups.values()].flatMap((m) => [...m.values()]);
    $('#tab-sources').textContent = sourceList.length ? `Sources (${sourceList.length})` : 'Sources';
    if (!sourceList.length) { $('#sources').innerHTML = '<p class="muted">This document cites no links or workspace files.</p>'; return; }
    const rank = (name) => name === 'Local docs' ? 0 : name === 'Workspace code' ? 1 : 2;
    const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    $('#sources').innerHTML = '<button type="button" class="linkbtn" data-act="copy-sources">Copy list as Markdown</button>'
      + order.map((g) => `<div class="src-group"><h3>${esc(g)} <small>${groups.get(g).size}</small></h3>${[...groups.get(g).values()].map((s) => `<a href="#" class="src" data-jump="${esc(s.ids[0])}" title="${esc(s.key)}"><span class="src-label">${esc(s.label)}</span>`
        + `${s.kind === 'web' && s.label !== s.key ? `<span class="src-url">${esc(s.key.replace(/^https?:\/\/(www\.)?/, ''))}</span>` : ''}${s.ids.length > 1 ? `<span class="src-count">cited ${s.ids.length} times</span>` : ''}</a>`).join('')}</div>`).join('');
  }

  // ----- Diagrams -----
  let mermaidReady = null;
  const getMermaid = () => (mermaidReady ||= import(MERMAID_URL).then((m) => m.default).catch(() => null));
  async function renderDiagrams(root) {
    const figs = $$('.diagram', root);
    if (!figs.length) return;
    const mermaid = await getMermaid();
    const dark = document.documentElement.dataset.theme === 'dark';
    if (mermaid) {
      const css = getComputedStyle(document.documentElement), v = (n) => css.getPropertyValue(n).trim();
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: 'system-ui, sans-serif', xyChart: { height: 340 }, themeVariables: {
        xyChart: { plotColorPalette: [v('--accent'), v('--muted'), '#c2410c', '#15803d'].join(','), backgroundColor: v('--panel'), titleColor: v('--ink'), xAxisLabelColor: v('--muted'), yAxisLabelColor: v('--muted'), xAxisTitleColor: v('--muted'), yAxisTitleColor: v('--muted'), xAxisLineColor: v('--line'), yAxisLineColor: v('--line'), xAxisTickColor: v('--line'), yAxisTickColor: v('--line') },
        pie1: v('--accent'), pie2: '#c2410c', pie3: '#15803d', pie4: v('--muted'), pieStrokeColor: v('--panel'), pieTitleTextColor: v('--ink'), pieSectionTextColor: '#fff', pieLegendTextColor: v('--ink'),
        darkMode: dark, background: v('--panel'), fontSize: '14px',
        primaryColor: v('--accent-soft'), primaryBorderColor: v('--accent'), primaryTextColor: v('--ink'),
        secondaryColor: v('--soft'), tertiaryColor: v('--panel'), lineColor: v('--muted'), textColor: v('--ink'),
        clusterBkg: v('--soft'), clusterBorder: v('--line'), noteBkgColor: v('--soft'), noteBorderColor: v('--line'),
        actorBkg: v('--accent-soft'), actorBorder: v('--accent'), actorTextColor: v('--ink'), signalColor: v('--ink'), signalTextColor: v('--ink'),
      } });
    }
    for (const [k, fig] of figs.entries()) {
      if (!fig.isConnected) return;
      const canvas = $('.canvas', fig);
      const showSource = (note) => { canvas.hidden = true; $('pre', fig).hidden = false; fig.insertAdjacentHTML('beforeend', `<p class="note">${esc(note)}</p>`); };
      if (!mermaid) { showSource('Mermaid could not load (offline?). Showing the diagram source.'); continue; }
      try { canvas.innerHTML = (await mermaid.render(`mmd-${Date.now()}-${k}`, fig.dataset.src)).svg; } catch (e) { showSource(`Diagram error: ${String(e?.message || e).split('\n')[0]}`); }
    }
  }

  function highlightTerm(root, term) {
    const rx = new RegExp(reEsc(term), 'gi');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (node) => (node.parentElement.closest('.diagram,.anchor,mark,.codebar') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const hits = [];
    while (walker.nextNode()) { rx.lastIndex = 0; if (rx.test(walker.currentNode.nodeValue)) hits.push(walker.currentNode); }
    for (const node of hits) {
      const span = document.createElement('span');
      span.innerHTML = esc(node.nodeValue).replace(new RegExp(reEsc(esc(term)), 'gi'), (m) => `<mark>${m}</mark>`);
      node.replaceWith(span);
    }
    $('mark', root)?.scrollIntoView({ block: 'center' });
  }

  let spyObs;
  function spy() {
    spyObs?.disconnect();
    const links = new Map($$('#toc a[data-id]').map((a) => [a.dataset.id, a]));
    if (!links.size) return;
    spyObs = new IntersectionObserver((entries) => {
      const e = entries.find((x) => x.isIntersecting);
      if (!e) return;
      links.forEach((a) => a.classList.remove('active'));
      links.get(e.target.id)?.classList.add('active');
    }, { rootMargin: '-80px 0px -70% 0px' });
    links.forEach((_, id) => { const el = document.getElementById(id); if (el) spyObs.observe(el); });
  }

  function renderNav(current) {
    if (!library) return;
    const term = $('#navfilter').value.trim().toLowerCase();
    const groups = new Map();
    for (const f of files) {
      if (term && !`${f.title} ${f.path}`.toLowerCase().includes(term)) continue;
      const g = f.kind || f.group || 'Documents';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(f);
    }
    $('#nav').innerHTML = `<a href="#/" class="nav-home${current ? '' : ' active'}">Overview</a>`
      + [...groups].map(([g, list]) => `<div class="nav-group"><h3>${esc(g)}</h3>${list.map((f) => `<a href="${href(f.path)}" class="${f.path === current ? 'active' : ''}"><span>${esc(f.title)}</span>${f.date ? `<small>${esc(f.date)}</small>` : ''}</a>`).join('')}</div>`).join('')
      + (groups.size ? '' : '<p class="muted">No document matches.</p>');
  }

  let pendingTerm = '';
  async function show() {
    const { path: requested, slug } = parseHash();
    const p = requested || home;
    document.body.classList.remove('menu');
    const art = $('#page');
    if (!p) {
      if (art.dataset.path !== '') { art.dataset.path = ''; renderLibrary(); renderNav(null); spy(); scrollTo(0, 0); }
      document.title = siteTitle;
      return;
    }
    const f = byPath.get(p);
    if (!f) { toast(`Not found: ${p}`); location.hash = '#/'; return; }
    if (art.dataset.path !== p) {
      art.dataset.path = p;
      art.innerHTML = kit.parse(f.body);
      if (!$('h1', art)) art.insertAdjacentHTML('afterbegin', `<h1>${esc(f.title)}</h1>`);
      decorate(art, f);
      renderNav(p);
      spy();
      document.title = library ? `${f.title} – ${siteTitle}` : f.title;
      if (!slug) scrollTo(0, 0);
      renderDiagrams(art);
    }
    if (slug) {
      const el = document.getElementById(slug);
      if (el) { el.scrollIntoView(); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    }
    if (pendingTerm) { highlightTerm(art, pendingTerm); pendingTerm = ''; }
  }

  // ----- Search across every document -----
  const q = $('#q'), results = $('#results');
  let hits = [], active = 0;
  function search(term) {
    term = term.trim();
    if (term.length < 2) { results.classList.remove('open'); return; }
    const rx = new RegExp(reEsc(term), 'i');
    hits = [];
    for (const f of files) {
      let heading = '', fence = false;
      for (const line of f.body.split('\n')) {
        if (/^\s*(```|~~~)/.test(line)) fence = !fence;
        const h = !fence && line.match(/^ {0,3}#{1,4}\s+(.+)/);
        if (h) heading = plain(h[1]);
        const at = line.search(rx);
        if (at < 0) continue;
        const from = Math.max(0, at - 48);
        hits.push({ f, heading, snip: (from ? '…' : '') + plain(line.slice(from, at + term.length + 80)), score: h ? 0 : f.title.match(rx) ? 1 : 2 });
      }
    }
    hits.sort((a, b) => a.score - b.score);
    active = 0;
    const mk = (s) => esc(s).replace(new RegExp(reEsc(esc(term)), 'gi'), (m) => `<mark>${m}</mark>`);
    results.innerHTML = hits.length
      ? `<p class="res-count">${hits.length} ${hits.length === 1 ? 'match' : 'matches'}</p>${hits.map((h, i) => `<a class="result${i ? '' : ' active'}" role="option" data-i="${i}"><small>${library ? `${esc(h.f.title)}${h.heading ? ' › ' : ''}` : ''}${esc(h.heading)}</small><span>${mk(h.snip)}</span></a>`).join('')}`
      : `<p class="empty">No match for “${esc(term)}”.</p>`;
    results.classList.add('open');
  }
  function openHit(i) {
    const h = hits[i];
    if (!h) return;
    pendingTerm = q.value.trim();
    results.classList.remove('open');
    q.blur();
    const next = href(h.f.path, h.heading ? slugify(h.heading) : '');
    if (location.hash === next) { $('#page').dataset.path = '-'; show(); } else location.hash = next;
  }
  q.addEventListener('input', () => search(q.value));
  q.addEventListener('focus', () => q.value && search(q.value));
  q.addEventListener('keydown', (e) => {
    const items = $$('.result', results);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1);
      items.forEach((el, k) => el.classList.toggle('active', k === active));
      items[active]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); openHit(active); }
    else if (e.key === 'Escape') { results.classList.remove('open'); q.blur(); }
  });
  results.addEventListener('mousedown', (e) => { const r = e.target.closest('.result'); if (r) { e.preventDefault(); openHit(Number(r.dataset.i)); } });

  // ----- Global interactions -----
  const modal = $('#modal');
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search')) results.classList.remove('open');
    const anchor = e.target.closest('a.anchor');
    if (anchor) { e.preventDefault(); history.replaceState(null, '', anchor.getAttribute('href')); copy(location.href, 'Link copied'); return; }
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      e.preventDefault();
      const el = document.getElementById(jump.dataset.jump);
      if (el) { el.scrollIntoView({ block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      return;
    }
    const scroll = e.target.closest('[data-scroll]');
    if (scroll) { e.preventDefault(); document.getElementById(scroll.dataset.scroll)?.scrollIntoView(); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      $$('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      $$('.rail-panel').forEach((p) => { p.hidden = p.id !== tab.dataset.tab; });
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const fig = act.closest('.diagram');
    if (act.dataset.act === 'copy-sources') copy(sourceList.map((s) => `- [${s.label.replace(/[[\]]/g, '')}](${s.kind === 'web' ? s.key : `${data.workspace}/${s.key}`})`).join('\n'), 'Sources copied');
    if (act.dataset.act === 'copy' && fig) copy(fig.dataset.src, 'Diagram source copied');
    if (act.dataset.act === 'src' && fig) {
      const pre = $('pre', fig), canvas = $('.canvas', fig), showSrc = pre.hidden;
      pre.hidden = !showSrc;
      canvas.hidden = showSrc || !$('svg', canvas);
      act.textContent = showSrc ? 'Diagram' : 'Source';
      act.setAttribute('aria-pressed', String(showSrc));
    }
    if (act.dataset.act === 'zoom' && fig) {
      const svg = $('.canvas svg', fig);
      if (!svg) { toast('Nothing to expand'); return; }
      $('#modalbox').innerHTML = svg.outerHTML;
      modal.classList.add('open');
    }
  });
  modal.addEventListener('click', () => modal.classList.remove('open'));
  $('#editor').addEventListener('change', (e) => {
    editor = e.target.value;
    store.set('editor', editor);
    $$('a.coderef').forEach((a) => { a.href = editorUrl(a.dataset.abs, a.dataset.line); });
    toast(`Code links open in ${e.target.selectedOptions[0].textContent}`);
  });
  $('#navfilter').addEventListener('input', () => renderNav(parseHash().path || home));
  $('#theme').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    const art = $('#page');
    if (art.dataset.path) { art.dataset.path = '-'; show(); }
  });
  $('#print').addEventListener('click', () => print());
  $('#menu').addEventListener('click', () => document.body.classList.toggle('menu'));
  $('#site-title').addEventListener('click', () => { location.hash = '#/'; });
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
    const cur = parseHash().path || home;
    const i = files.findIndex((f) => f.path === cur);
    if (e.key === '/') { e.preventDefault(); q.focus(); q.select(); }
    else if (e.key === 'Escape') { modal.classList.remove('open'); document.body.classList.remove('menu'); }
    else if (e.key === ']' && files[i + 1]) location.hash = href(files[i + 1].path);
    else if (e.key === '[' && library) location.hash = i > 0 ? href(files[i - 1].path) : '#/';
    else if (e.key === 'g' && library) location.hash = '#/';
    else if (e.key === 't') $('#theme').click();
  });
  addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    $('#progress').style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  }, { passive: true });
  addEventListener('hashchange', show);
  window.__octocodeReport = { files, parse: kit.parse, slugify };
  show();
}

// ---------------------------------------------------------------------------------------------
// Template: one file, no external assets except the lazily loaded mermaid module.
// Design: cool paper, deep ocean accent, serif reading text with sans interface, varied radii.
// ---------------------------------------------------------------------------------------------
const CSS = String.raw`
:root{--bg:#f4f6f8;--panel:#fff;--soft:#eceff3;--line:#d9dee5;--ink:#141a21;--muted:#59636f;--accent:#0a6c86;--accent-ink:#06536a;--accent-soft:#dff0f5;--mark:#ffe58a;--code:#f3f5f8;
--red:#b42318;--red-bg:#fde8e6;--amber:#93590a;--amber-bg:#fdf0d9;--blue:#1d5bbf;--blue-bg:#e3ecfb;--green:#1b7442;--green-bg:#e0f3e7;--gray:#4d5763;--gray-bg:#eceff2;
--serif:"Iowan Old Style","Charter","Bitstream Charter","Source Serif Pro","Sitka Text",Cambria,Georgia,serif;--sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;--mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;--nav:264px;--rail:272px}
:root[data-theme=dark]{--bg:#12171d;--panel:#182029;--soft:#1f2832;--line:#2c3743;--ink:#e3e8ee;--muted:#98a3b0;--accent:#4fb3cf;--accent-ink:#7cc9de;--accent-soft:#16323c;--mark:#6a5410;--code:#1b232d;
--red:#ff8a7f;--red-bg:#3d1f1d;--amber:#f0b45a;--amber-bg:#3a2c15;--blue:#8fb4ff;--blue-bg:#1d2a44;--green:#6fd29a;--green-bg:#173325;--gray:#b3bcc6;--gray-bg:#26303a}
*{box-sizing:border-box}html{scroll-padding-top:72px}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-underline-offset:2px}button,select,input{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
kbd{font:12px var(--mono);border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;padding:0 5px;background:var(--panel)}
.muted{color:var(--muted);font-size:13px;margin:6px 4px}
header.top{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:10px;height:56px;padding:0 16px;background:var(--panel);border-bottom:1px solid var(--line)}
#site-title{font-weight:650;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;min-width:0;background:none;border:0;padding:4px 2px;text-align:left}
.mark-logo{width:26px;height:26px;flex:none;color:var(--accent)}
.grow{flex:1}
.search{position:relative;width:min(400px,38vw)}
.search input{width:100%;height:34px;padding:0 34px 0 12px;border:1px solid var(--line);border-radius:6px;background:var(--soft);outline:none}
.search input:focus{background:var(--panel);border-color:var(--accent)}
.search kbd{position:absolute;right:8px;top:7px}
#results{position:absolute;top:40px;left:0;right:0;max-height:64vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:0 12px 32px rgba(10,20,30,.16);display:none;padding:4px}
#results.open{display:block}.res-count{margin:4px 8px;font-size:12px;color:var(--muted)}
.result{display:block;padding:7px 9px;border-radius:5px;color:var(--ink);cursor:pointer;text-decoration:none;font-size:13.5px}
.result small{display:block;color:var(--muted);font-size:12px}.result.active,.result:hover{background:var(--accent-soft)}
.empty{padding:12px;color:var(--muted);font-size:13px}
mark{background:var(--mark);color:inherit;border-radius:2px}
.tool{height:34px;min-width:34px;padding:0 9px;display:inline-grid;place-items:center;border:1px solid var(--line);border-radius:6px;background:var(--panel);cursor:pointer}
.tool:hover{border-color:var(--accent);color:var(--accent)}.tool svg{width:17px;height:17px}
select.tool{padding:0 6px;font-size:13px}
#menu{display:none}
#progress{position:fixed;top:56px;left:0;right:0;height:2px;background:var(--accent);transform:scaleX(0);transform-origin:0 0;z-index:31}
.layout{display:grid;grid-template-columns:var(--nav) minmax(0,1fr) var(--rail);max-width:1560px;margin:0 auto}
body.single .layout{grid-template-columns:minmax(0,1fr) var(--rail);max-width:1240px}
body.single nav.side{display:none}
nav.side,aside.rail{position:sticky;top:56px;height:calc(100vh - 56px);overflow:auto;padding:16px 14px 32px}
nav.side{border-right:1px solid var(--line)}
#navfilter{width:100%;height:30px;padding:0 9px;border:1px solid var(--line);border-radius:5px;background:var(--panel);font-size:13px;margin-bottom:10px}
.nav-home{display:block;padding:6px 8px;border-radius:5px;color:var(--ink);text-decoration:none;font-weight:600;font-size:13.5px}
.nav-group h3{font-size:12px;font-weight:600;color:var(--muted);margin:16px 8px 4px}.nav-group h3::first-letter,.lib-group h2::first-letter{text-transform:uppercase}
#nav a{display:block;padding:6px 8px;border-radius:5px;color:var(--ink);text-decoration:none;font-size:13.5px;line-height:1.35}
#nav a small{display:block;color:var(--muted);font-size:11.5px}
#nav a:hover{background:var(--soft)}#nav a.active{background:var(--accent-soft);color:var(--accent-ink);font-weight:600}
main{min-width:0;padding:28px 44px 96px}
#docmeta{max-width:760px;margin:0 auto 8px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;font-size:13px;color:var(--muted)}
#docmeta:empty{display:none}
.kind{color:var(--accent-ink);font-weight:650}
.meta-item{display:inline-flex;align-items:center;gap:6px}.meta-k{color:var(--muted)}.meta-v{color:var(--ink)}
.stats{display:inline-flex;gap:12px;margin-left:auto}
article{max-width:760px;margin:0 auto;font:17px/1.7 var(--serif)}
article h1,article h2,article h3,article h4{font-family:var(--sans);line-height:1.25;letter-spacing:-.01em;position:relative}
article h1{font-size:34px;font-weight:700;margin:6px 0 14px}
article h2{font-size:23px;font-weight:650;margin:48px 0 12px;padding-top:20px;border-top:1px solid var(--line)}
article h3{font-size:18.5px;font-weight:650;margin:32px 0 8px}
article h4{font-size:16px;font-weight:650;margin:24px 0 6px}
article p.lead{font-size:19.5px;line-height:1.6;color:var(--ink);margin-bottom:28px}
.anchor{margin-left:8px;color:var(--muted);text-decoration:none;font-weight:400;opacity:0}
h1:hover .anchor,h2:hover .anchor,h3:hover .anchor,h4:hover .anchor,.anchor:focus{opacity:1}
.flash{animation:flash 1.4s ease-out}@keyframes flash{0%{background:var(--mark)}100%{background:transparent}}
article ul,article ol{padding-left:1.4em}article li{margin:4px 0}article li>ul,article li>ol{margin:4px 0}
article li.task{list-style:none;margin-left:-1.3em}article li.task input{appearance:none;-webkit-appearance:none;width:15px;height:15px;margin:0 8px 0 0;vertical-align:-2px;border:1.5px solid var(--muted);border-radius:4px;background:var(--panel);display:inline-grid;place-content:center}article li.task input:checked{background:var(--accent);border-color:var(--accent)}article li.task input:checked::after{content:'';width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:translateY(-1px) rotate(45deg)}
article code{font:.84em var(--mono);background:var(--code);border:1px solid var(--line);border-radius:4px;padding:.08em .35em}
article a.coderef{text-decoration:none}article a.coderef code{color:var(--accent-ink);border-color:color-mix(in srgb,var(--accent) 40%,var(--line));background:var(--accent-soft)}
article a.coderef:hover code{border-color:var(--accent)}
article a.missing{text-decoration:underline dotted;color:var(--muted)}
article a.ext::after{content:"↗";font-size:.75em;margin-left:2px;color:var(--muted)}
article pre{position:relative;margin:18px 0;background:var(--code);border:1px solid var(--line);border-radius:8px;overflow:auto;font:13.5px/1.6 var(--mono)}
article pre code{display:block;padding:12px 16px;background:none;border:0;font-size:inherit}
.codebar{position:sticky;left:0;display:flex;justify-content:space-between;align-items:center;padding:4px 8px 4px 16px;border-bottom:1px solid var(--line);font:12px var(--sans);color:var(--muted)}
.codebar button{border:0;background:none;color:var(--muted);cursor:pointer;font-size:12px;padding:2px 6px;border-radius:4px}.codebar button:hover{color:var(--accent);background:var(--panel)}
.tk-k{color:#8a3ffc}.tk-s{color:#107c41}.tk-c{color:var(--muted);font-style:italic}.tk-n{color:#b45309}.tk-t{color:#0e6aa8}.tk-add{color:var(--green);background:var(--green-bg)}.tk-del{color:var(--red);background:var(--red-bg)}.tk-m{color:var(--blue)}
:root[data-theme=dark] .tk-k{color:#c4a1ff}:root[data-theme=dark] .tk-s{color:#7fd3a0}:root[data-theme=dark] .tk-n{color:#f5b971}:root[data-theme=dark] .tk-t{color:#7cc4f2}
.tablewrap{margin:20px 0;overflow:auto;border:1px solid var(--line);border-radius:8px;background:var(--panel)}
table{border-collapse:collapse;width:100%;font:14px/1.5 var(--sans)}
th,td{padding:9px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
th{background:var(--soft);font-weight:600;font-size:13px;position:sticky;top:0}tr:last-child td{border-bottom:0}
tbody tr:hover td{background:color-mix(in srgb,var(--accent-soft) 50%,transparent)}
.chip{display:inline-block;font:600 12px/1.6 var(--sans);padding:0 7px;border-radius:3px;white-space:nowrap;background:var(--gray-bg);color:var(--gray)}
.t-red{background:var(--red-bg);color:var(--red)}.t-amber{background:var(--amber-bg);color:var(--amber)}.t-blue{background:var(--blue-bg);color:var(--blue)}.t-green{background:var(--green-bg);color:var(--green)}
blockquote{margin:20px 0;padding:2px 18px;border-left:3px solid var(--line);color:var(--muted)}
.alert{margin:20px 0;padding:10px 16px;border-left:4px solid var(--blue);background:var(--blue-bg);border-radius:0 6px 6px 0;font-size:16px}
.alert p{margin:6px 0}.alert-title{font:650 13.5px var(--sans);color:var(--blue)}
.alert-tip{border-color:var(--green);background:var(--green-bg)}.alert-tip .alert-title{color:var(--green)}
.alert-important{border-color:var(--accent);background:var(--accent-soft)}.alert-important .alert-title{color:var(--accent-ink)}
.alert-warning{border-color:var(--amber);background:var(--amber-bg)}.alert-warning .alert-title{color:var(--amber)}
.alert-caution{border-color:var(--red);background:var(--red-bg)}.alert-caution .alert-title{color:var(--red)}
hr{border:0;border-top:1px solid var(--line);margin:36px 0}img{max-width:100%;border-radius:6px}
details{margin:16px 0;padding:8px 14px;border:1px solid var(--line);border-radius:6px;background:var(--panel)}summary{cursor:pointer;font:600 15px var(--sans)}
.fnref a{text-decoration:none;font:600 .7em var(--sans)}
.footnotes{margin-top:48px;padding-top:12px;border-top:1px solid var(--line);font-size:14.5px;color:var(--muted)}.fnback{text-decoration:none}
.diagram{margin:24px 0;border:1px solid var(--line);border-radius:10px;background:var(--panel);overflow:hidden}
.diagram figcaption{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--line);background:var(--soft);font:12px var(--sans);color:var(--muted)}
.diagram figcaption b{color:var(--ink);font-weight:600}.diagram figcaption span{margin-right:auto;text-transform:capitalize}
.diagram figcaption button{border:1px solid var(--line);background:var(--panel);border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;color:var(--muted)}
.diagram figcaption button:hover{color:var(--accent);border-color:var(--accent)}
.diagram .canvas{display:flex;justify-content:center;padding:18px;overflow:auto;font:13px var(--sans);color:var(--muted)}
.diagram .canvas svg{max-width:100%;height:auto}.diagram pre{margin:0;border:0;border-radius:0}
.diagram .note{margin:0;padding:6px 12px;font:12.5px var(--sans);color:var(--amber);border-top:1px solid var(--line)}
.lib-filters{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 18px;font-family:var(--sans)}
.fchip{border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:999px;padding:4px 11px;font-size:13px;cursor:pointer}
.fchip small,.tfilter small{color:var(--muted);margin-left:3px}
.fchip:hover{border-color:var(--accent)}.fchip.on{background:var(--accent);border-color:var(--accent);color:#fff}.fchip.on small{color:inherit;opacity:.8}
.toc-filters{display:flex;flex-direction:column}.tfilter{background:none;border:0;text-align:left;cursor:pointer;font:inherit;font-size:13.5px;color:var(--muted);padding:4px 10px}.tfilter:hover{color:var(--ink)}.tfilter.on{color:var(--accent);font-weight:600}
.lib-kind{font-size:11.5px;font-weight:600;color:var(--accent);background:var(--accent-soft);border-radius:3px;padding:2px 7px;white-space:nowrap;flex:none}
.lib-head{margin-bottom:12px}.lib-group h2 small{font:400 13px var(--mono);color:var(--muted);margin-left:8px}
.lib-list{list-style:none;padding:0;margin:0}
.lib-list li{margin:0;border-bottom:1px solid var(--line)}
.lib-list a{display:block;padding:14px 4px;color:var(--ink);text-decoration:none}
.lib-list a:hover .lib-title{color:var(--accent)}
.lib-row{display:flex;align-items:baseline;gap:10px;font-family:var(--sans)}
.lib-title{font-weight:650;font-size:17px}.lib-date{margin-left:auto;font-size:13px;color:var(--muted);white-space:nowrap}
.lib-lead{display:block;margin-top:4px;font-size:15.5px;color:var(--muted);line-height:1.55}
.lib-path{display:block;margin-top:4px;font:12px var(--mono);color:var(--muted)}
.tabs{display:flex;gap:4px;margin-bottom:10px;border-bottom:1px solid var(--line)}
.tabs button{border:0;background:none;padding:6px 8px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs button[aria-selected=true]{color:var(--ink);border-bottom-color:var(--accent)}
#toc a{display:block;padding:4px 8px;border-left:2px solid transparent;color:var(--muted);text-decoration:none;font-size:13px;line-height:1.4}
#toc a.l3{padding-left:20px;font-size:12.5px}#toc a:hover{color:var(--ink)}#toc a.active{color:var(--accent-ink);border-left-color:var(--accent);font-weight:600}
.linkbtn{border:0;background:none;color:var(--accent);cursor:pointer;font-size:12.5px;padding:2px 0;margin-bottom:6px}
.src-group h3{font-size:12px;font-weight:600;color:var(--muted);margin:14px 0 4px;display:flex;justify-content:space-between}
.src{display:block;padding:5px 6px;border-radius:4px;text-decoration:none;color:var(--ink);font-size:12.5px;line-height:1.35;word-break:break-word}
.src:hover{background:var(--soft)}.src-url{display:block;color:var(--muted);font:11px var(--mono)}.src-count{float:right;color:var(--muted);font-size:11px;margin-left:6px}
#toast{position:fixed;bottom:22px;left:50%;transform:translate(-50%,16px);opacity:0;background:var(--ink);color:var(--bg);padding:8px 14px;border-radius:6px;font-size:13px;transition:.18s;pointer-events:none;z-index:60}
#toast.show{opacity:1;transform:translate(-50%,0)}
#modal{position:fixed;inset:0;z-index:50;display:none;place-items:center;background:rgba(8,12,18,.6);padding:4vh 4vw;cursor:zoom-out}
#modal.open{display:grid}#modalbox{background:var(--panel);border-radius:10px;padding:24px;max-width:100%;max-height:100%;overflow:auto}#modalbox svg{max-width:88vw;max-height:84vh;height:auto}
@media (max-width:1180px){.layout{grid-template-columns:var(--nav) minmax(0,1fr)}body.single .layout{grid-template-columns:minmax(0,1fr)}aside.rail{display:none}}
@media (max-width:820px){.layout,body.single .layout{grid-template-columns:minmax(0,1fr)}#menu{display:inline-grid}nav.side{position:fixed;top:56px;left:0;bottom:0;width:min(320px,86vw);background:var(--panel);z-index:40;transform:translateX(-102%);transition:transform .2s;height:auto}
body.menu nav.side{transform:none;box-shadow:0 0 40px rgba(0,0,0,.25)}main{padding:20px 18px 80px}.search{width:auto;flex:1}#site-title,.mark-logo,#editor{display:none}article{font-size:16.5px}article h1{font-size:28px}.stats{margin-left:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media print{header.top,nav.side,aside.rail,#progress,.codebar,.anchor,.diagram figcaption button{display:none!important}.layout,body.single .layout{display:block}main{padding:0}article{max-width:none;font-size:11.5pt}body{background:#fff;color:#000}
article a.ext::after{content:" (" attr(href) ")";font-size:.8em;color:#555}article pre,.diagram,.tablewrap{break-inside:avoid}article pre code{white-space:pre-wrap}}
`;

const ICONS = {
  logo: '<svg class="mark-logo" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3c-6 0-10 4.3-10 10 0 3.2 1.4 5.6 3.4 7.2-.9 2.3-2.9 3.9-5.4 4.4 2.9 1.5 6 .9 8-1.1.5 2.2 2.1 4.1 4 5.5 1.9-1.4 3.5-3.3 4-5.5 2 2 5.1 2.6 8 1.1-2.5-.5-4.5-2.1-5.4-4.4 2-1.6 3.4-4 3.4-7.2C26 7.3 22 3 16 3Zm-4 9.5a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4Zm8 0a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4Z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/></svg>',
};

function pageHtml(payload, title) {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const script = `(${client.toString()})((${mdKit.toString()})(), ${JSON.stringify(MERMAID_URL)});`.replace(/<\/(script)/gi, '<\\/$1');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="octocode render-report">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#page" style="position:absolute;left:-999px">Skip to content</a>
<header class="top">
  <button class="tool" id="menu" type="button" aria-label="Documents">${ICONS.menu}</button>
  ${ICONS.logo}
  <button id="site-title" type="button" title="Back to start">${esc(title)}</button>
  <span class="grow"></span>
  <div class="search" role="search"><input id="q" type="search" placeholder="Search" autocomplete="off" aria-label="Search the report"><kbd>/</kbd><div id="results" role="listbox"></div></div>
  <select class="tool" id="editor" aria-label="Open code references in" title="Open code references in"><option value="vscode">VS Code</option><option value="cursor">Cursor</option><option value="windsurf">Windsurf</option><option value="file">File</option></select>
  <button class="tool" id="theme" type="button" aria-label="Toggle theme" title="Theme (t)">${ICONS.theme}</button>
  <button class="tool" id="print" type="button" aria-label="Print" title="Print or save as PDF">${ICONS.print}</button>
</header>
<div id="progress"></div>
<div class="layout">
  <nav class="side" aria-label="Documents"><input id="navfilter" type="search" placeholder="Filter documents" aria-label="Filter documents"><div id="nav"></div></nav>
  <main><div id="docmeta"></div><article id="page"></article></main>
  <aside class="rail" aria-label="Contents and sources">
    <div class="tabs" role="tablist"><button type="button" role="tab" data-tab="toc" id="tab-toc" aria-selected="true">Contents</button><button type="button" role="tab" data-tab="sources" id="tab-sources" aria-selected="false">Sources</button></div>
    <div class="rail-panel" id="toc"></div>
    <div class="rail-panel" id="sources" hidden></div>
  </aside>
</div>
<div id="modal" role="dialog" aria-label="Diagram"><div id="modalbox"></div></div>
<div id="toast" role="status" aria-live="polite"></div>
<script type="application/json" id="report-data">${json}</script>
<script>${script}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// Node: collect Markdown, resolve code references, write the page.
// ---------------------------------------------------------------------------------------------
const toPosix = (p) => p.split(path.sep).join('/');

function findWorkspace(start) {
  let dir = path.resolve(start);
  if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) dir = path.dirname(dir);
  for (let d = dir; ; d = path.dirname(d)) {
    if (path.basename(d) === '.octocode') return path.dirname(d);
    if (path.dirname(d) === d) break;
  }
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    if (path.dirname(d) === d) break;
  }
  return process.cwd();
}

function walk(dir, root, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      walk(full, root, out);
    } else if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) out.push(full);
  }
  return out;
}

function sortKey(rel) {
  const parts = rel.split('/');
  const base = parts[parts.length - 1].toLowerCase();
  const primary = PRIMARY.indexOf(base);
  const date = (rel.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
  return { depth: parts.length, primary: primary < 0 ? 9 : primary, date, rel };
}

function orderFiles(rels) {
  return rels.sort((a, b) => {
    const ka = sortKey(a), kb = sortKey(b);
    const ga = a.includes('/') ? a.split('/')[0] : '', gb = b.includes('/') ? b.split('/')[0] : '';
    if (ga !== gb) return ga.localeCompare(gb);
    if (ka.date !== kb.date) return kb.date.localeCompare(ka.date);
    if (ka.primary !== kb.primary) return ka.primary - kb.primary;
    if (ka.depth !== kb.depth) return ka.depth - kb.depth;
    return a.localeCompare(b);
  });
}

const CODE_REF = /^((?:\.{1,2}\/|\/|~\/)?[\w@.+-]+(?:\/[\w@.+\-[\]()]+)*\/?)(?:[:#]L?(\d+)(?:[-–:]L?(\d+))?)?$/;

function resolveRefs(body, docDir, workspace) {
  const refs = {};
  const candidates = new Set();
  const noFences = body.replace(/^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\1[ \t]*$/gm, '');
  for (const m of noFences.matchAll(/(`+)([^`\n]+?)\1/g)) candidates.add(m[2].trim());
  for (const m of noFences.matchAll(/\]\(\s*<?([^)\s>]+)>?/g)) candidates.add(m[1]);
  for (const raw of candidates) {
    if (!raw || raw.length > 300 || /^[a-z][\w+.-]*:/i.test(raw) || raw.startsWith('#')) continue;
    const m = raw.match(CODE_REF);
    if (!m || !/[./]/.test(m[1])) continue;
    let p = m[1];
    try { p = decodeURIComponent(p); } catch { /* keep raw */ }
    if (p.startsWith('~/')) p = path.join(os.homedir(), p.slice(2));
    const bases = path.isAbsolute(p) ? [''] : [docDir, workspace];
    for (const base of bases) {
      const abs = path.resolve(base, p);
      if (!fs.existsSync(abs)) continue;
      const rel = toPosix(path.relative(workspace, abs)) || '.';
      refs[raw] = { abs: toPosix(abs), rel: rel.startsWith('..') ? toPosix(abs) : rel, ...(m[2] ? { line: Number(m[2]) } : {}) };
      break;
    }
  }
  return refs;
}

function kindFor(absFile) {
  const segs = toPosix(absFile).split('/');
  for (let i = segs.length - 2; i >= 0; i--) if (KINDS[segs[i]]) return KINDS[segs[i]];
  return '';
}

function skillFor(absFile) {
  const segs = toPosix(absFile).split('/');
  for (let i = segs.length - 2; i >= 0; i--) if (KINDS[segs[i]]) return segs[i];
  return '';
}

function collect(target, options = {}) {
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) throw new Error(`Not found: ${target}`);
  const isDir = fs.statSync(abs).isDirectory();
  const workspace = options.workspace ? path.resolve(options.workspace) : findWorkspace(abs);
  const root = isDir ? abs : path.dirname(abs);
  const list = isDir ? walk(abs, abs, []) : [abs];
  if (!list.length) throw new Error(`No Markdown files under ${target}`);
  const kit = mdKit();
  const rels = orderFiles(list.map((f) => toPosix(path.relative(root, f))));
  const underOctocode = path.basename(abs) === '.octocode';
  const files = rels.map((rel) => {
    const full = path.join(root, rel);
    const { meta, body } = kit.frontmatter(fs.readFileSync(full, 'utf8'));
    const first = rel.includes('/') ? rel.split('/')[0] : '';
    const kind = meta.kind || kindFor(full);
    const group = KINDS[first] || underOctocode ? first : (rel.includes('/') ? path.dirname(rel) : '');
    return { path: rel, group, kind, meta, body, source: toPosix(full), refs: resolveRefs(body, path.dirname(full), workspace) };
  });
  return { abs, isDir, workspace, root, rels, files, underOctocode, kit };
}

// Contract checks for a report saved under .octocode/<skill>/: the rules come from that skill's
// output.md (installed beside this script's skill folder), so the warnings match the instructions.
const SCRIPT_SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contractCache = new Map();
function contractFor(skill) {
  if (contractCache.has(skill)) return contractCache.get(skill);
  const candidates = [path.join(path.dirname(SCRIPT_SKILL_DIR), skill, 'output.md')];
  if (path.basename(SCRIPT_SKILL_DIR) === skill) candidates.unshift(path.join(SCRIPT_SKILL_DIR, 'output.md'));
  const file = candidates.find((c) => fs.existsSync(c));
  let contract = null;
  if (file) {
    const text = fs.readFileSync(file, 'utf8');
    const statusLine = (text.match(/^status:\s*(.+)$/m) || [])[1] || '';
    const required = [];
    // Each "Always include ..." sentence lists required sections; parenthesized notes and code spans may hold
    // periods or colons, so the sentence ends only at one outside them.
    for (const m of text.matchAll(/Always include/g)) {
      let depth = 0, code = false, end = m.index;
      for (; end < text.length; end++) {
        const c = text[end];
        if (c === '`') code = !code;
        else if (!code && c === '(') depth++;
        else if (!code && c === ')') depth--;
        else if (!code && depth <= 0 && (c === ':' || (c === '.' && /\s|$/.test(text[end + 1] || '')) || c === '\n')) break;
      }
      const sentence = text.slice(m.index, end).replace(/\([^)]*\)/g, '');
      for (const h of sentence.matchAll(/`## ([^`]+)`/g)) if (!required.includes(h[1])) required.push(h[1]);
    }
    // "either `## A` (...) or `## B` (...)": one of the two satisfies the contract (a review or a change report).
    const anyOf = [...text.matchAll(/either `## ([^`]+)`[^`\n]*? or `## ([^`]+)`/g)].map((m) => [m[1], m[2]]);
    if (/Put findings under `## Findings`/.test(text) && !anyOf.some((g) => g.includes('Findings'))) required.push('Findings');
    contract = { anyOf, statuses: statusLine.includes('|') || /^[\w ]+$/.test(statusLine) ? statusLine.split('|').map((x) => x.trim()).filter((x) => x && !x.startsWith('<')) : [], required };
  }
  contractCache.set(skill, contract);
  return contract;
}

const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// A file inside a report folder that is not the folder's entry point (README.md, RFC.md, index.md) and carries
// no report header is a supporting file: run logs, cases, transcripts. It is neither checked nor cataloged.
export function supportingFile(full, meta, workspace) {
  const rel = toPosix(path.relative(path.join(workspace, '.octocode'), full)).split('/');
  // Only the folder's top-level README.md, RFC.md, or index.md is its entry point; nested ones are supporting files.
  if (rel.length < 3 || rel[0] === '..' || !KINDS[rel[0]] || (rel.length === 3 && PRIMARY.includes(rel[2].toLowerCase()))) return null;
  const top = path.join(workspace, '.octocode', rel[0], rel[1]);
  const hasPrimary = fs.existsSync(top) && fs.readdirSync(top).some((x) => PRIMARY.includes(x.toLowerCase()));
  if (hasPrimary) return { folder: rel[1], hasPrimary };
  return meta.status || meta.question ? null : { folder: rel[1], hasPrimary };
}

export function checkReport(full, meta, body, workspace) {
  const support = supportingFile(full, meta, workspace);
  if (support) return support.hasPrimary ? [] : [`${support.folder}/: a report folder needs README.md (or RFC.md) as its entry point`];
  const rel = toPosix(path.relative(path.join(workspace, '.octocode'), full)).split('/');
  // A skill report written into scratch space (.octocode/<skill>/tmp/, or a legacy .octocode/tmp/) never reaches
  // the catalog. tmp/showcase holds the rendered sample set and is exempt.
  const scratch = rel[0] === 'tmp' ? rel[1] !== 'showcase' : rel[1] === 'tmp';
  if (scratch && meta.status && meta.question)
    return [`${rel.join('/')}: this has a report header but sits in a tmp/ folder, which the catalog skips; save it as .octocode/<skill>/<YYYY-MM-DD>-<slug>.md`];
  if (rel.length < 2 || rel[0] === '..' || !KINDS[rel[0]]) return [];
  const skill = rel[0];
  const warnings = [];
  const name = rel.length === 2 ? rel[1] : rel[1] + '/' + rel.slice(2).join('/');
  if (rel.length > 2 && !PRIMARY.includes(rel[rel.length - 1].toLowerCase()) && !fs.readdirSync(path.dirname(full)).some((f) => PRIMARY.includes(f.toLowerCase())))
    warnings.push(`a single report is one file, .octocode/${skill}/<YYYY-MM-DD>-<slug>.md; a folder needs README.md (or RFC.md) as its entry point`);
  const dated = (rel[1].match(/^(\d{4}-\d{2}-\d{2})-/) || [])[1];
  const stat = fs.statSync(full);
  // Editing a report does not change its original date or stable links. Some
  // filesystems provide no creation timestamp; there it cannot be checked.
  const written = meta.date || (stat.birthtimeMs > 0 ? localDate(stat.birthtime) : null);
  if (!dated) warnings.push(`name the report <YYYY-MM-DD>-<slug> using today's date (date +%F)`);
  else if (written && dated !== written) {
    const from = path.join(workspace, '.octocode', skill, rel[1]);
    const to = path.join(workspace, '.octocode', skill, written + rel[1].slice(dated.length));
    warnings.push(`the name says ${dated} but the file was first written ${written}; dates come from \`date +%F\`, not memory. Fix: mv "${from}" "${to}" and render again`);
  }
  if (!meta.status) warnings.push('the header has no status');
  if (!meta.question) warnings.push('the header has no question');
  if (meta.next && /^(none|n\/a|-)\.?$/i.test(String(meta.next).trim())) warnings.push('`next` says none; drop the key when nothing is pending');
  for (const key of ['captures', 'session']) {
    if (meta[key] && !fs.existsSync(path.resolve(workspace, String(meta[key])))) warnings.push(`\`${key}: ${meta[key]}\` does not exist; point it at the folder that holds the files`);
  }
  const contract = contractFor(skill);
  if (contract) {
    if (meta.status && contract.statuses.length && !contract.statuses.some((w) => w.toLowerCase() === String(meta.status).toLowerCase()))
      warnings.push(`status "${meta.status}" is not one of ${contract.statuses.join(', ')}`);
    const heads = new Set([...body.matchAll(/^ {0,3}##\s+(.+?)\s*#*\s*$/gm)].map((m) => m[1].toLowerCase()));
    for (const h of contract.required) if (!heads.has(h.toLowerCase())) warnings.push(`missing the required section ## ${h}`);
    for (const g of contract.anyOf) if (!g.some((h) => heads.has(h.toLowerCase()))) warnings.push(`missing a required section: ${g.map((h) => `## ${h}`).join(' or ')}`);
  }
  return warnings.map((w) => `${name}: ${w}`);
}

export function buildReport(target, options = {}) {
  const { abs, isDir, workspace, root, rels, files, underOctocode } = collect(target, options);
  const top = rels.find((r) => !r.includes('/') && PRIMARY.includes(r.toLowerCase()));
  const rootName = underOctocode ? `${path.basename(workspace)} – Octocode output` : path.basename(root);
  const payload = {
    title: options.title || '',
    rootName,
    workspace: toPosix(workspace),
    kind: files.length === 1 ? files[0].kind : '',
    primary: isDir && top ? top : null,
    files,
  };
  const firstH1 = (files[0].body.match(/^ {0,3}#\s+(.+?)\s*#*\s*$/m) || [])[1];
  const title = options.title || (files.length > 1 && !payload.primary ? rootName : (files[0].meta.title || (firstH1 || rels[0]).replace(/[`*_]/g, '')));
  const warnings = [...new Set(files.flatMap((f) => checkReport(path.join(root, f.path), f.meta, f.body, workspace)))];
  return { html: pageHtml(payload, title), files: rels, workspace, isDir, abs, warnings };
}

const HEADER_KEYS = ['status', 'confidence', 'question', 'next'];

function outline(body) {
  const lines = body.replace(/^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\1[ \t]*$/gm, '').split('\n');
  const headings = [];
  let title = '', lead = '', para = [], afterTitle = false;
  const strip = (t) => t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '').replace(/(^|[^\w])_+|_+(?![\w])/g, '$1').trim();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    const setext = !h && line.trim() && /^ {0,3}(=+|-+)\s*$/.test(lines[i + 1] || '') && !/^\s*[-*+|>]/.test(line);
    if (h || setext) {
      const level = h ? h[1].length : (lines[i + 1].trim()[0] === '=' ? 1 : 2);
      const text = strip(h ? h[2] : line);
      if (level === 1 && !title) { title = text; afterTitle = true; } else headings.push({ level, text });
      if (setext) i++;
      if (lead === '' && para.length) lead = strip(para.join(' '));
      para = [];
      continue;
    }
    if (lead !== '' || !afterTitle) continue;
    if (!line.trim()) { if (para.length) lead = strip(para.join(' ')); continue; }
    if (/^\s*([-*+]\s|\d+[.)]\s|>|\||<)/.test(line)) { if (para.length) lead = strip(para.join(' ')); continue; }
    para.push(line.trim());
  }
  if (lead === '' && para.length) lead = strip(para.join(' '));
  return { title, lead, headings };
}

function linksIn(body) {
  const urls = new Set();
  for (const m of body.matchAll(/\]\(\s*<?(https?:\/\/[^)\s>]+)>?/g)) urls.add(m[1]);
  for (const m of body.matchAll(/^\s*\[[^\]]+\]:\s*<?(https?:\/\/\S+?)>?(?:\s|$)/gm)) urls.add(m[1]);
  for (const m of body.matchAll(/(^|[\s(])(https?:\/\/[^\s<>()`]+[^\s<>()`.,;:!?'"])/g)) urls.add(m[2]);
  return [...urls];
}

// Shared reading of each skill's status words: done, attention, failed, open, or inactive.
const STATUS_TONE = { green: 'done', amber: 'attention', red: 'failed', blue: 'open', gray: 'inactive' };
let toneKit;
const kitTone = (status) => (toneKit ||= mdKit()).toneOf(status);

export function buildManifest(target, options = {}) {
  const { workspace, root, files } = collect(target, options);
  const documents = files.filter((f) => !supportingFile(path.join(root, f.path), f.meta, workspace)).map((f) => {
    const full = path.join(root, f.path);
    const { title, lead, headings } = outline(f.body);
    const header = {};
    for (const k of HEADER_KEYS) if (f.meta[k] !== undefined && f.meta[k] !== '') header[k] = f.meta[k];
    const other = Object.fromEntries(Object.entries(f.meta).filter(([k]) => !HEADER_KEYS.includes(k) && k !== 'title' && k !== 'date'));
    const html = pageFor(full, workspace);
    const rel = toPosix(path.relative(workspace, full));
    // A status outside the skill's contract gets no tone, so an invalid word never looks like success.
    const statuses = (skillFor(full) && contractFor(skillFor(full))?.statuses) || [];
    const validStatus = !statuses.length || statuses.some((w) => w.toLowerCase() === String(header.status).toLowerCase());
    return {
      path: rel.startsWith('..') ? toPosix(full) : rel,
      skill: skillFor(full) || null,
      kind: f.kind || null,
      title: f.meta.title || title || path.basename(f.path),
      date: f.meta.date || (f.path.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || null,
      ...header,
      ...(header.status ? { statusTone: validStatus ? STATUS_TONE[kitTone(header.status)] || null : null } : {}),
      ...(Object.keys(other).length ? { meta: other } : {}),
      lead: lead || null,
      headings,
      links: linksIn(f.body),
      codeRefs: Object.entries(f.refs).map(([ref, r]) => ({ ref, path: r.rel, ...(r.line ? { line: r.line } : {}) })),
      html: html ? toPosix(path.relative(workspace, html)) : null,
    };
  });
  documents.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.path.localeCompare(b.path));
  return { workspace: toPosix(workspace), root: toPosix(path.relative(workspace, root)) || '.', count: documents.length, documents };
}

// The page that shows a report: its own <name>.html, else the nearest folder
// render (index.html) above it, up to the workspace's .octocode/ folder.
function pageFor(full, workspace) {
  const own = defaultOut(full, false, workspace);
  if (fs.existsSync(own)) return own;
  const octo = path.join(workspace, '.octocode');
  if (!full.startsWith(octo + path.sep)) return null;
  for (let dir = path.dirname(full); dir.startsWith(octo); dir = path.dirname(dir)) {
    const index = path.join(dir, 'index.html');
    if (fs.existsSync(index)) return index;
    if (dir === octo) break;
  }
  return null;
}

export function defaultOut(abs, isDir, workspace) {
  const octo = path.join(workspace, '.octocode');
  const inside = abs === octo || abs.startsWith(octo + path.sep);
  if (inside) return isDir ? path.join(abs, 'index.html') : abs.replace(/\.(md|markdown)$/i, '') + '.html';
  const name = path.basename(abs).replace(/\.(md|markdown)$/i, '') || 'report';
  // Every skill output stays in that skill's own folder, so a page for an outside source goes there too.
  const own = path.basename(SCRIPT_SKILL_DIR);
  return path.join(octo, KINDS[own] ? own : 'octocode-skills', 'view', name, 'index.html');
}

function canOpen() {
  if (process.env.CI) return false;
  if (process.platform === 'linux') return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  return process.platform === 'darwin' || process.platform === 'win32';
}

function openFile(file) {
  const cmd = process.platform === 'darwin' ? ['open', [file]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : ['xdg-open', [file]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); return true; } catch { return false; }
}

function parseArgs(argv) {
  const args = { positional: [], open: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--title') args.title = argv[++i];
    else if (a === '--workspace') args.workspace = argv[++i];
    else if (a === '--open') args.open = true;
    else if (a === '--no-open') args.open = false;
    else if (a === '--json') args.json = true;
    else if (a === '--manifest') args.manifest = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--self-test') args.selfTest = true;
    else if (a.startsWith('--')) throw new Error(`Unknown option: ${a}`);
    else args.positional.push(a);
  }
  return args;
}

function selfTest() {
  const kit = mdKit();
  const cases = [];
  const check = (name, cond) => cases.push({ name, ok: Boolean(cond) });
  const html = kit.parse([
    '# Title', '', 'Lead with **bold**, *em*, `code`, ~~gone~~ and https://example.com/x.', '',
    '| Area | Severity | Note |', '|:--|:-:|--:|', '| a \\| b | High | `x|y` |', '',
    '- one', '  - nested', '- [x] done', '- [ ] open', '',
    '3. three', '4. four', '',
    '> [!WARNING]', '> Careful.', '', '> plain quote', '',
    'Ref [docs][d] and note[^n].', '', '[d]: https://docs.example.com "Docs"', '[^n]: The note.', '',
    '```mermaid', 'flowchart LR', '  A-->B', '```', '',
    '```ts', 'const s = "<b>"; // c', '```', '',
    '<script>alert(1)</script>', '', '[x](javascript:alert(1)) line<br>break', '',
    'Setext', '------', '', '<details>', '<summary>More</summary>', '', 'Hidden.', '', '</details>',
  ].join('\n'));
  check('heading', html.includes('<h1>Title</h1>'));
  check('inline formatting', /<strong>bold<\/strong>/.test(html) && /<em>em<\/em>/.test(html) && html.includes('<del>gone</del>'));
  check('bare url', html.includes('<a href="https://example.com/x">'));
  check('table alignment and escaped pipe', html.includes('text-align:center') && html.includes('a | b') && html.includes('<code>x|y</code>'));
  check('nested and task lists', /<li>one\s*<ul><li>nested<\/li><\/ul><\/li>/.test(html) && html.includes('class="task"') && html.includes(' checked>'));
  check('ordered start', html.includes('<ol start="3">'));
  check('alert', html.includes('alert-warning') && html.includes('Careful.'));
  check('blockquote', html.includes('<blockquote><p>plain quote</p></blockquote>'));
  check('reference link and footnote', html.includes('href="https://docs.example.com" title="Docs"') && html.includes('id="fn-n"'));
  check('mermaid kept as source', html.includes('class="mermaid-src"') && html.includes('A--&gt;B'));
  check('highlight escapes', html.includes('tk-s">&quot;&lt;b&gt;&quot;') && html.includes('tk-c'));
  check('raw html escaped', html.includes('&lt;script&gt;') && !html.includes('<script>'));
  check('unsafe url blocked', html.includes('<a href="#">x</a>') && html.includes('<br>'));
  check('setext and details', html.includes('<h2>Setext</h2>') && html.includes('<summary>More</summary>'));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-report-'));
  try {
    fs.mkdirSync(path.join(dir, '.git'));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
    const rdir = path.join(dir, '.octocode', 'octocode-research');
    fs.mkdirSync(rdir, { recursive: true });
    const md = path.join(rdir, '2025-01-02-topic.md');
    fs.writeFileSync(md, '---\nstatus: Draft\n---\n# Topic\n\nSee `src/a.ts:3` and [a](../../src/a.ts#L1) but not `src/none.ts`. </script><b>\n');
    fs.writeFileSync(path.join(rdir, '2025-01-01-older.md'), '# Older\n');
    const one = buildReport(md);
    const data = JSON.parse(one.html.match(/id="report-data">([\s\S]*?)<\/script>/)[1]);
    check('workspace from .octocode', one.workspace === dir || fs.realpathSync(one.workspace) === fs.realpathSync(dir));
    check('code refs resolve', data.files[0].refs['src/a.ts:3']?.line === 3 && data.files[0].refs['../../src/a.ts#L1'] && !data.files[0].refs['src/none.ts']);
    check('source path recorded', data.files[0].source.endsWith('2025-01-02-topic.md'));
    check('frontmatter and kind', data.files[0].meta.status === 'Draft' && data.files[0].kind === 'Research');
    check('script-safe embedding', !/<\/script><b>/.test(one.html.split('id="report-data">')[1].split('</script>')[0]));
    check('default out beside source', defaultOut(one.abs, false, one.workspace) === md.replace(/\.md$/, '.html'));
    const lib = buildReport(path.join(dir, '.octocode'));
    check('library collects and orders newest first', lib.files.length === 2 && lib.files[0].endsWith('2025-01-02-topic.md'));
    check('library default out', defaultOut(lib.abs, true, lib.workspace) === path.join(dir, '.octocode', 'index.html'));
    check('outside source goes to the skill view folder', defaultOut(path.join(dir, 'docs', 'x.md'), false, dir) === path.join(dir, '.octocode', KINDS[path.basename(SCRIPT_SKILL_DIR)] ? path.basename(SCRIPT_SKILL_DIR) : 'octocode-skills', 'view', 'x', 'index.html'));
    fs.writeFileSync(path.join(rdir, '2025-01-03-full.md'), '---\nstatus: Confirmed\nconfidence: high\nquestion: Where does it go?\nnext: Ship it\nowner: me\n---\n# Full\n\nThe answer is here,\nacross two lines.\n\n## Evidence\n\nSee `src/a.ts:3` and https://example.com/a.\n\n```md\n# not a heading\n```\n\n### Gaps\n');
    const man = buildManifest(path.join(dir, '.octocode'));
    const full = man.documents[0];
    check('manifest lists every report newest first', man.count === 3 && full.path === '.octocode/octocode-research/2025-01-03-full.md');
    check('manifest status tone', full.statusTone === 'done');
    fs.writeFileSync(path.join(rdir, '2025-01-05-invalid.md'), '---\nstatus: Done\nquestion: Q?\n---\n# Invalid\n\nLead.\n');
    check('invalid status has no tone', buildManifest(path.join(dir, '.octocode')).documents.find((d) => d.path.endsWith('invalid.md')).statusTone === null);
    fs.rmSync(path.join(rdir, '2025-01-05-invalid.md'));
    check('manifest header fields', full.status === 'Confirmed' && full.confidence === 'high' && full.question === 'Where does it go?' && full.next === 'Ship it' && full.meta.owner === 'me');
    check('manifest outline', full.title === 'Full' && full.lead === 'The answer is here, across two lines.' && full.headings.length === 2 && full.headings[1].text === 'Gaps');
    fs.writeFileSync(path.join(rdir, '2025-01-04-table.md'), '# Table first\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nThe lead after the table.\n');
    const tableFirst = buildManifest(path.join(rdir, '2025-01-04-table.md')).documents[0];
    check('manifest lead after a leading table', tableFirst.lead === 'The lead after the table.');
    const today = localDate(new Date());
    const roastDir = path.join(dir, '.octocode', 'octocode-roast');
    fs.mkdirSync(path.join(roastDir, `${today}-folder`), { recursive: true });
    fs.writeFileSync(path.join(roastDir, '2000-01-01-old.md'), '# Old\n\nNo header.\n');
    fs.writeFileSync(path.join(roastDir, `${today}-good.md`), '---\nstatus: Needs work\nquestion: Q?\n---\n# Good\n\nLead.\n\n## Findings\n\n| a |\n|---|\n| 1 |\n');
    fs.writeFileSync(path.join(roastDir, `${today}-folder`, 'notes.md'), '---\nstatus: Confirmed\nquestion: Q?\n---\n# F\n\nLead.\n');
    const warn = (f) => buildReport(path.join(roastDir, f)).warnings.join('\n');
    const own = contractFor('octocode-roast');
    if (own) {
      check('report check passes a contract-shaped report', warn(`${today}-good.md`) === '');
      const maintained = path.join(roastDir, `${today}-good.md`);
      const edited = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      fs.utimesSync(maintained, edited, edited);
      check('editing a report preserves its original date and links', warn(`${today}-good.md`) === '');
      check('report check flags date and missing header', /written/.test(warn('2000-01-01-old.md')) && /no status/.test(warn('2000-01-01-old.md')) && /no question/.test(warn('2000-01-01-old.md')));
      check('report check flags folder, status word, and section', ((w) => /single report is one file/.test(w) && /"Confirmed" is not one of/.test(w) && /## Findings/.test(w))(warn(`${today}-folder/notes.md`)));
    }
    {
      const run = path.join(roastDir, `${today}-run`);
      fs.mkdirSync(path.join(run, 'cases'), { recursive: true });
      fs.writeFileSync(path.join(run, 'README.md'), '---\nstatus: Confirmed\nquestion: Q?\n---\n# Run\n\nLead.\n');
      fs.writeFileSync(path.join(run, 'cases', 'case-01.md'), '# Case 1\n\nTranscript.\n');
      fs.writeFileSync(path.join(run, 'cases', 'README.md'), '# Cases\n');
      check('supporting files in a report folder are not checked', !/case-01|cases\/README/.test(buildReport(run).warnings.join('\n')));
      check('supporting files stay out of the manifest', !buildManifest(path.join(dir, '.octocode')).documents.some((d) => d.path.includes('case-01')));
      const bare = path.join(roastDir, `${today}-bare`);
      fs.mkdirSync(bare);
      for (const n of ['a.md', 'b.md']) fs.writeFileSync(path.join(bare, n), '# Note\n');
      const bareWarnings = buildReport(bare).warnings;
      check('a folder without an entry point warns once', bareWarnings.length === 1 && /needs README.md/.test(bareWarnings[0]));
      fs.rmSync(run, { recursive: true });
      fs.rmSync(bare, { recursive: true });
    }
    fs.mkdirSync(path.join(dir, '.octocode', 'tmp', 'agents', 'x'), { recursive: true });
    check('report check flags a report left in scratch space', /catalog skips/.test(checkReport(path.join(dir, '.octocode', 'tmp', 'agents', 'x', 'r.md'), { status: 'Ready', question: 'Q?' }, '', dir).join('')));
    fs.mkdirSync(path.join(dir, '.octocode', 'octocode-research', 'tmp'), { recursive: true });
    check('report check flags a report left in a skill tmp folder', /catalog skips/.test(checkReport(path.join(dir, '.octocode', 'octocode-research', 'tmp', 'r.md'), { status: 'Ready', question: 'Q?' }, '', dir).join('')));
    const ap = contractFor('octocode-agentic-prompts');
    if (ap) {
      const apDir = path.join(dir, '.octocode', 'octocode-agentic-prompts');
      fs.mkdirSync(apDir, { recursive: true });
      const mk = (name, sec) => { fs.writeFileSync(path.join(apDir, `${today}-${name}.md`), `---\nstatus: Ready\nquestion: Q?\n---\n# T\n\nLead.\n\n${sec}\n`); return buildReport(path.join(apDir, `${today}-${name}.md`)).warnings.join('\n'); };
      check('either-or sections accept a review or a change report', mk('review', '## Findings') === '' && mk('change', '## Changes') === '');
      check('either-or sections flag a report with neither', /## Findings or ## Changes/.test(mk('neither', '## Notes')));
    }
    const link = path.join(dir, 'linked-skill');
    fs.symlinkSync(path.dirname(path.dirname(fileURLToPath(import.meta.url))), link);
    const viaLink = spawnSync(process.execPath, [path.join(link, 'scripts', path.basename(fileURLToPath(import.meta.url))), '--help'], { encoding: 'utf8' });
    {
      const sk = path.join(dir, '.octocode', 'octocode-roast');
      fs.mkdirSync(sk, { recursive: true });
      const f2 = path.join(sk, `${localDate(new Date())}-meta.md`);
      fs.writeFileSync(f2, '---\nstatus: Needs work\nquestion: q\nnext: None.\ncaptures: .octocode/tmp/missing/\n---\n# T\n\nLead.\n\n## Findings\n\nx\n');
      const w = buildReport(f2, { workspace: dir }).warnings.join('\n');
      check('flags next none and a missing captures folder', /next` says none/.test(w) && /captures: .octocode\/tmp\/missing\/` does not exist/.test(w));
    }
    check('runs when called through a symlinked skill folder', viaLink.status === 0 && /render-report/.test(viaLink.stdout));
    check('report check skips files outside a skill folder', checkReport(path.join(dir, 'src', 'a.ts'), {}, '', dir).length === 0);
    fs.writeFileSync(path.join(rdir, 'index.html'), '<!doctype html>');
    check('manifest html falls back to the folder page', buildManifest(path.join(rdir, '2025-01-04-table.md')).documents[0].html === '.octocode/octocode-research/index.html');
    fs.rmSync(path.join(rdir, 'index.html'));
    check('manifest links and refs', full.links[0] === 'https://example.com/a' && full.codeRefs[0].path === 'src/a.ts' && full.codeRefs[0].line === 3 && full.skill === 'octocode-research');
    let syntaxOk = true;
    try { new Function(one.html.split('<script>')[1].split('</script>')[0]); } catch { syntaxOk = false; }
    check('page script parses', syntaxOk);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const failed = cases.filter((c) => !c.ok);
  for (const c of failed) console.error(`FAIL ${c.name}`);
  console.log(failed.length ? `self-test failed (${failed.length}/${cases.length})` : `self-test passed (${cases.length} cases)`);
  return failed.length ? 1 : 0;
}

function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 1; }
  if (args.help) { console.log(HELP); return 0; }
  if (args.selfTest) return selfTest();
  if (args.positional.length !== 1) { console.error(HELP); return 1; }
  if (args.manifest) {
    try { console.log(JSON.stringify(buildManifest(args.positional[0], { workspace: args.workspace }))); return 0; } catch (e) { console.error(e.message); return 1; }
  }
  try {
    const report = buildReport(args.positional[0], { title: args.title, workspace: args.workspace });
    const out = path.resolve(args.out || defaultOut(report.abs, report.isDir, report.workspace));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, report.html);
    const opened = args.open && canOpen() ? openFile(out) : false;
    for (const w of report.warnings) console.error(`warning: ${w}`);
    if (args.json) console.log(JSON.stringify({ out, files: report.files.length, bytes: Buffer.byteLength(report.html), opened, ...(report.warnings.length ? { warnings: report.warnings } : {}) }));
    else console.log(`${out}\n${report.files.length} document${report.files.length === 1 ? '' : 's'}${opened ? ', opened' : ''}`);
    return 0;
  } catch (e) {
    console.error(e.message);
    return 1;
  }
}

// Installed skills are often symlinks (.agents/skills/<name> -> skills/<name>): argv[1] keeps the link path while
// import.meta.url is the real path, so compare real paths or a symlinked call silently does nothing.
const realOrSelf = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
if (process.argv[1] && realOrSelf(process.argv[1]) === realOrSelf(fileURLToPath(import.meta.url))) process.exitCode = main();
