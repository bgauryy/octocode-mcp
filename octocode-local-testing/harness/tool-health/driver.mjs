// Generic end-to-end driver for harness/tool-health.mjs: explore a tool from a
// seed query by executing every lead the responses emit, on one surface.
//
//   explore(tool, seed, { surface, call, maxCalls, ... })
//
// 1. run the seed and every queued lead; ajv-validate EVERY response that
//    carries rows against the tool's contract outputSchema
//    (packages/octocode-config/contract/tool-contract.json);
// 2. queue every `next.*` and `hints.*` {tool, query} lead verbatim, keyed by
//    canonical JSON. A lead repeating a query on its own path (a cycle: a page
//    lead back to an earlier page) or another lead of the same response (a
//    redundant lead) fails; two branches converging on one query (two empty
//    searches broadening to the same search) run it once and count `converged`;
// 3. page channels (contract continuationChannels.kinds.pages that advance a
//    walk: next*Page, continue*) run before other leads and form chains: each
//    page's rows appear exactly once on its chain, the chain ends before
//    `maxPages`; the caller compares the chain union with the unpaged rows;
// 4. every other lead must be accepted (no invalidInput), contract-valid, and
//    hold its key family's predicates (harness/lead-predicates.mjs);
// 5. per-call facts only: a hint or warning sentence of 30+ characters that
//    appears verbatim in the tool descriptions, field descriptions or server
//    instructions, or in every call of a tool across differently shaped calls,
//    is a static note repeated in responses (factsFailures);
// 6. the caller compares the CLI and MCP query graphs (graphParity).
//
// Leads that write (astRewrite `apply`, ghCloneRepo's clone cache) and leads to
// tools a surface does not expose are recorded as skipped with their reason.
import { atoms, canon, isLead, judgeLead, outcomeOf, rowOf, short } from '../lead-predicates.mjs';

/** Page channels that advance a walk (new rows each step), as opposed to re-reads (expand*, restart, retry, read*). */
export const ADVANCING = /^(next[A-Za-z]*Page|continue[A-Za-z]*)$/;
/** Why the driver never executes a lead in a shared workspace (it writes), or null. */
export function writes(lead) {
  if (lead.tool === 'astRewrite' && (lead.query.queries ?? []).some(q => q.apply === true)) return 'writes the workspace (exercised on a temp copy by the astRewrite case)';
  if (lead.tool === 'ghCloneRepo') return 'writes the clone cache (exercised by the ghCloneRepo case)';
  return null;
}
const MIN_FACT = 30;

/** Rows of a response: `results` for every tool, `queries` for clasify. */
export const rowsOf = json => json?.results ?? json?.queries ?? [];
export const dataOf = row => row?.data ?? row;
/** Status class from the payload alone: invalid | empty | error | ok | broken. */
export function statusClass(json) {
  if (!json || typeof json !== 'object') return 'broken';
  if (json.errorCode || json.error) return json.errorCode === 'invalidInput' ? 'invalid' : `error:${json.errorCode}`;
  const rows = rowsOf(json);
  if (!rows.length) return 'broken';
  if (rows.some(r => r.status === 'error' || r.error || (r.resources ?? []).some(x => x.error))) return 'error';
  if (rows.every(r => r.status === 'empty')) return 'empty';
  return 'ok';
}
const errorCodes = json => [json?.errorCode, ...rowsOf(json).flatMap(r => [dataOf(r)?.errorCode, r?.error?.errorCode, ...(r?.resources ?? []).map(x => x?.error?.errorCode)])].filter(Boolean);

/**
 * Every lead of a response with its row index: `{tool, query}` under `next.*`
 * or `hints.*` (text tips aside), a self-continuation named after its tool
 * whose value is the tool's whole input (`next.clasify: {queries}`), and the
 * envelope's `responsePagination.next`. Rows are `results`, or clasify's `queries`.
 */
export function leadsIn(sc, tools) {
  const out = [];
  const visit = (node, at, rowIndex) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((c, i) => visit(c, `${at}[${i}]`, rowIndex)); return; }
    for (const [key, child] of Object.entries(node)) {
      if ((key === 'next' || key === 'hints') && child && typeof child === 'object' && !Array.isArray(child)) {
        for (const [name, lead] of Object.entries(child)) {
          if (name === 'text') continue;
          if (isLead(lead)) out.push({ path: `${at}.${key}.${name}`, container: key, key: name, tool: lead.tool, query: lead.query, rowIndex });
          else if (tools.has(name) && Array.isArray(lead?.queries)) out.push({ path: `${at}.${key}.${name}`, container: key, key: name, tool: name, query: lead, rowIndex });
        }
      }
      visit(child, `${at}.${key}`, rowIndex);
    }
  };
  const field = sc?.results ? 'results' : 'queries';
  rowsOf(sc).forEach((row, i) => visit(row, `.${field}[${i}]`, i));
  const envelope = sc?.responsePagination?.next;
  if (isLead(envelope)) out.push({ path: '.responsePagination.next', container: 'next', key: 'responsePagination.next', tool: envelope.tool, query: envelope.query, rowIndex: null });
  return out;
}

/** Hint texts and warnings of a response, split into sentences (the unit a static note repeats in). */
export function factSentences(json) {
  const out = [];
  const add = v => { for (const s of [v].flat()) if (typeof s === 'string') for (const part of s.split(/(?<=[.;:!?])\s+|\n+/)) if (part.trim().length >= MIN_FACT) out.push(part.trim()); };
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'warnings') add(v);
      else if (k === 'hints' && v && typeof v === 'object') add(v.text);
      else walk(v);
    }
  };
  rowsOf(json).forEach(walk);
  return [...new Set(out)];
}

/**
 * A driver bound to the contract and the surfaces' static text.
 * `validate(tool, json)` → null | error text; `staticText` every description,
 * field description and instruction string either surface publishes;
 * `tools` the contract's tool names, `cliOnly` its CLI-only tools; `propsOf(tool)` its query fields.
 */
export function createDriver({ validate, staticText, tools, cliOnly, propsOf = () => new Set() }) {
  /**
   * Explore `tool` from `seed` (one query row) on one surface.
   * `call(tool, input)` → { raw, json, sc, text, isError, ms } (`json`/`sc` with shared defaults expanded); `rows(tool, key)`
   * → (data, json) => ids for a page channel, or undefined (then the `fresh`
   * predicate alone guards it); `chainKeys` extra lead keys that advance a
   * walk (e.g. `clasify`); `allow` lead keys to execute even when they write;
   * `root` the workspace relative paths resolve in.
   */
  async function explore(tool, seed, { surface, call, maxCalls = 8, maxPages = 12, rows = () => undefined, chainKeys = [], allow = [], root }) {
    const seen = new Map();
    const report = { tool, surface, seed, calls: [], failures: [], skipped: [], graph: new Set(), chains: [], budgetCut: 0, converged: 0, facts: [] };
    const fail = (check, detail, at) => report.failures.push({ check, detail: short(detail, 400), at });
    const id = (t, q) => `${t} ${canon(q)}`;
    const leadsOf = sc => leadsIn(sc, tools);
    const input = { queries: [seed] };
    const root0 = { tool, input, label: 'seed', depth: 0, path: new Set([id(tool, input)]) };
    seen.set(id(tool, input), 'seed');
    const pages = [], others = [root0];
    let nonPage = 0;
    const advances = key => ADVANCING.test(key) || chainKeys.includes(key);

    while (pages.length || others.length) {
      const item = pages.length ? pages.shift() : others.shift();
      if (!item.chain && item !== root0 && nonPage >= maxCalls) { report.budgetCut += 1; continue; }
      if (!item.chain) nonPage += 1;
      const entry = await call(item.tool, item.input);
      if (item === root0) report.root = entry;
      const json = entry.json;
      const cls = statusClass(json);
      report.calls.push({ tool: item.tool, label: item.label, cls, ms: entry.ms, query: item.input });
      // The contract describes the payload as emitted (shared defaults hoisted), not the expanded view.
      if (rowsOf(json).length) { const err = validate(item.tool, entry.raw ?? json); if (err) fail('contract', `${item.tool} ${err}`, item.label); }
      else if (cls === 'broken') fail('response', `${item.tool} returned no JSON rows: ${short(entry.text, 200)}`, item.label);
      if (item.lead) {
        const invalid = cls === 'invalid' || errorCodes(json).some(c => /^invalid/.test(c));
        if (invalid) fail('lead.accepted', `${item.lead.container}.${item.lead.key} -> ${item.tool} rejected: ${errorCodes(json).join(',')} ${short(json?.error ?? '', 160)}`, item.label);
        const shown = item.shown ?? new Set();
        for (const r of judgeLead(item.lead, item.source, entry, shown, { walked: !!item.walked, root, propsOf })) {
          if (!r.ok && r.assertion !== 'valid') fail(`lead.${r.assertion}`, `${item.lead.container}.${item.lead.key} -> ${item.tool}: ${r.detail}`, item.label);
        }
      }
      report.facts.push({ tool: item.tool, shape: shapeOf(item.input), sentences: factSentences(json) });

      // Page chain bookkeeping: rows exactly once, chain ends before the cap.
      if (item.chain) {
        const chain = item.chain;
        chain.pages += 1;
        const ids = chain.rowsFn ? chain.rowsFn(dataOf(rowsOf(json)[item.lead.rowIndex ?? 0]), json) : [];
        const repeated = ids.filter(x => chain.seenRows.has(x));
        if (repeated.length) fail('page.exactlyOnce', `${chain.key} page ${chain.pages} repeats ${repeated.slice(0, 3).join(', ')}`, item.label);
        ids.forEach(x => chain.seenRows.add(x));
        atoms(entry.sc).forEach(a => chain.atoms.add(a));
        chain.rows.push(...ids);
        if (cls !== 'ok' && cls !== 'empty') { chain.problem = `page ${chain.pages} class ${cls} ${errorCodes(json).join(',')}`; fail('page.class', `${chain.key} ${chain.problem}`, item.label); }
      }

      const entrySource = { tool: item.tool, args: item.input, entry };
      const here = new Map();
      for (const lead of leadsOf(entry.sc)) {
        const leadId = id(lead.tool, lead.query);
        const edge = `${id(item.tool, item.input)} --${lead.container}.${lead.key}--> ${leadId}`;
        if (!cliOnly.has(lead.tool)) report.graph.add(edge);
        if (item.path.has(leadId)) { fail('lead.repeat', `${lead.container}.${lead.key} -> ${lead.tool} leads back to a query on its own path (${seen.get(leadId)}): a cycle`, item.label); continue; }
        if (here.has(leadId)) { fail('lead.repeat', `${lead.container}.${lead.key} -> ${lead.tool} repeats ${here.get(leadId)} of the same response`, item.label); continue; }
        here.set(leadId, `${lead.container}.${lead.key}`);
        if (seen.has(leadId)) { report.converged += 1; continue; }
        seen.set(leadId, `${item.label} > ${lead.container}.${lead.key}`);
        const label = `${item.label} > ${lead.container}.${lead.key}`;
        const skipWhy = surface === 'mcp' && cliOnly.has(lead.tool) ? `${lead.tool} is CLI-only (not on MCP)` : allow.includes(lead.key) ? null : writes(lead);
        if (skipWhy) { report.skipped.push({ key: `${lead.container}.${lead.key}`, tool: lead.tool, reason: skipWhy }); continue; }
        const child = { tool: lead.tool, input: lead.query, label, lead, source: entrySource, depth: item.depth + 1, path: new Set([...item.path, leadId]) };
        if (lead.container === 'next' && advances(lead.key) && lead.tool === item.tool) {
          let chain = item.chain?.key === lead.key ? item.chain : null;
          if (!chain) {
            const rowsFn = rows(lead.tool, lead.key);
            const first = rowsFn ? rowsFn(dataOf(rowsOf(json)[lead.rowIndex ?? 0]), json) : [];
            chain = { key: lead.key, tool: lead.tool, from: item.label, pages: 1, rows: [...first], seenRows: new Set(first), rowsFn, ended: false, atoms: atoms(entry.sc) };
            if (new Set(first).size !== first.length) fail('page.exactlyOnce', `${lead.key} page 1 lists a row twice`, item.label);
            report.chains.push(chain);
          }
          if (chain.pages >= maxPages) { chain.capped = true; fail('page.cap', `${lead.key} still paging after ${maxPages} pages`, label); continue; }
          child.chain = chain;
          child.walked = item.chain === chain;
          child.shown = new Set(chain.atoms); // `fresh`: evidence not shown on any earlier page of the chain
          pages.push(child);
        } else {
          child.shown = atoms(entry.sc);
          others.push(child);
        }
      }
      if (item.chain && !leadsOf(entry.sc).some(l => l.key === item.chain.key && l.container === 'next')) item.chain.ended = true;
    }
    for (const chain of report.chains) if (!chain.ended && !chain.capped && !chain.problem) fail('page.ended', `${chain.key} chain from ${chain.from} stopped without an end (${chain.pages} pages)`, chain.from);
    return report;
  }

  /** Static notes repeated in responses (per tool, one surface's explore reports). */
  function factsFailures(reports) {
    const out = [];
    const byTool = new Map();
    for (const r of reports) for (const f of r.facts) { if (!byTool.has(f.tool)) byTool.set(f.tool, []); byTool.get(f.tool).push(f); }
    for (const [tool, calls] of byTool) {
      const flagged = new Set();
      for (const s of new Set(calls.flatMap(c => c.sentences))) {
        if (staticText.includes(s)) { out.push({ check: 'facts.static', detail: `${tool} response repeats description/instructions text: "${short(s, 160)}"` }); flagged.add(s); }
      }
      const shapes = new Set(calls.map(c => c.shape));
      if (calls.length >= 3 && shapes.size >= 2) {
        for (const s of calls[0].sentences) if (!flagged.has(s) && calls.every(c => c.sentences.includes(s))) out.push({ check: 'facts.repeated', detail: `${tool} repeats "${short(s, 160)}" in all ${calls.length} calls (${shapes.size} query shapes)` });
      }
    }
    return out;
  }

  /** CLI vs MCP: edges whose source call ran on both surfaces must match. */
  function graphParity(cli, mcp) {
    const sources = report => new Set(report.calls.map(c => `${c.tool} ${canon(c.query)}`));
    const both = new Set([...sources(cli)].filter(s => sources(mcp).has(s)));
    const pick = report => new Set([...report.graph].filter(e => both.has(e.split(' --')[0])));
    const a = pick(cli), b = pick(mcp);
    const onlyCli = [...a].filter(e => !b.has(e)), onlyMcp = [...b].filter(e => !a.has(e));
    return onlyCli.length || onlyMcp.length ? `query graph differs: CLI-only ${onlyCli.length} (${short(onlyCli[0] ?? '-', 220)}), MCP-only ${onlyMcp.length} (${short(onlyMcp[0] ?? '-', 220)})` : null;
  }

  return { explore, factsFailures, graphParity };
}

/** A query's shape: its row's field names (continuation fields aside) and operation. */
function shapeOf(input) {
  const row = rowOf(input);
  const skip = new Set(['page', 'snapshot', 'offset', 'extras', 'scanOffset', 'matchPage', 'materializeOffset', 'importerPage', 'diagnosticPage', 'carry']);
  return `${Object.keys(row).filter(k => !skip.has(k)).sort().join(',')}|${row.operation ?? ''}`;
}

export { outcomeOf };
