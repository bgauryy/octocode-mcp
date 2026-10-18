import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { initTheme, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicFetchInit } from '../src/web/guard.js';
import { clearFetchCache, fetchUrl, language, unreadReason } from '../src/web/fetch.js';
import { search } from '../src/web/search.js';
import { IMAGE_MAX_CHARS } from '../src/shared/spill.js';
import { registerWebTool, webSummary } from '../src/web/web.js';
import type { Permission } from '../src/permission/ask.js';
import { fakeCtx, fakePermission, theme } from './fake-pi.js';
import { asText, noisyPng, pixelSize, tmp } from './helpers.js';

type ToolResult = { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; details?: Record<string, unknown> };
type WebTool = {
  execute: (id: string, params: Record<string, unknown>, signal?: AbortSignal) => Promise<ToolResult>;
  renderCall: Function;
  renderResult: Function;
};

/** Search provider calls go through `publicFetch`; a case sets `guard.stub` to answer them without a network. */
const guard = vi.hoisted(() => ({ stub: undefined as undefined | ((url: string, init: PublicFetchInit) => Promise<Response>) }));
vi.mock('../src/web/guard.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/web/guard.js')>();
  return { ...actual, publicFetch: ((url, init, options) => (guard.stub ? guard.stub(url, init) : actual.publicFetch(url, init, options))) as typeof actual.publicFetch };
});

const servers: http.Server[] = [];
afterEach(async () => {
  guard.stub = undefined;
  clearFetchCache();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function serve(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const privateOk = { private: true };

function webTool(active: string[] = [], permission: Permission = fakePermission('full'), model?: unknown): WebTool {
  let tool: (WebTool & { execute: Function }) | undefined;
  registerWebTool({ registerTool: (definition: typeof tool) => (tool = definition), getActiveTools: () => active } as unknown as ExtensionAPI, permission);
  const definition = tool!;
  // The tool asks through the call's context: a local one, with no UI, so only the mode decides.
  return { ...definition, execute: (id, params, signal) => (definition.execute as Function)(id, params, signal, undefined, fakeCtx({ cwd: tmp(), model })) };
}

const text = (result: ToolResult) => result.content.map((part) => part.text ?? '').join('\n');

describe('fetchUrl against a local server', () => {
  it('converts HTML with its title and entities, pretty-prints JSON and passes other text through', async () => {
    const base = await serve((req, res) => {
      if (req.url === '/page') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<html><head><title>Caf&eacute; &amp; &#x41;&#66;</title></head><body><h2>Menu</h2><p>Tea &lt;hot&gt; &#0; &bogus;</p></body></html>');
      } else if (req.url === '/json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"a":[1,2]}');
      } else if (req.url === '/broken-json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{not json');
      } else {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('plain body');
      }
    });
    const page = await fetchUrl(`${base}/page`, undefined, privateOk);
    expect(page).toMatch(/^# Caf&eacute; & AB\nSource: http:\/\/127\.0\.0\.1:\d+\/page/);
    expect(page).toContain('## Menu');
    expect(page).toContain('Tea <hot> &#0; &bogus;');
    expect(await fetchUrl(`${base}/json`, undefined, privateOk)).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(await fetchUrl(`${base}/broken-json`, undefined, privateOk)).toBe('{not json');
    expect(await fetchUrl(`${base}/text`, undefined, privateOk)).toBe('plain body');
  });

  it('describes binary bodies instead of decoding them, and reports HTTP errors', async () => {
    const base = await serve((req, res) => {
      if (req.url === '/logo.bmp') {
        res.writeHead(200, { 'content-type': 'image/bmp' });
        res.end(Buffer.alloc(64, 1));
      } else if (req.url === '/missing.pdf') {
        res.writeHead(404, { 'content-type': 'application/pdf' });
        res.end('nope');
      } else {
        res.writeHead(500, { 'content-type': 'text/html' });
        res.end('<p>oops</p>');
      }
    });
    const logo = asText(await fetchUrl(`${base}/logo.bmp`, undefined, privateOk));
    expect(logo).toMatch(/is image\/bmp, not text; web cannot read it/);
    expect(unreadReason(logo)).toBe('unsupported');
    expect(unreadReason('plain body')).toBeUndefined();
    await expect(fetchUrl(`${base}/missing.pdf`, undefined, privateOk)).rejects.toThrow(/HTTP 404 .* for http/);
    await expect(fetchUrl(`${base}/error`, undefined, privateOk)).rejects.toThrow(/HTTP 500/);
  });

  it('stops reading a body at the 5 MB cap', async () => {
    const chunk = 'x'.repeat(1024 * 1024);
    let written = 0;
    const base = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      // Far more than the cap: the reader must stop early instead of buffering it all.
      const write = () => {
        while (written < 64) {
          written += 1;
          if (!res.write(chunk)) return void res.once('drain', write);
        }
        res.end();
      };
      res.on('error', () => undefined);
      write();
    });
    const body = asText(await fetchUrl(`${base}/big`, undefined, privateOk));
    expect(body.length).toBeGreaterThanOrEqual(5 * 1024 * 1024);
    expect(body.length).toBeLessThan(8 * 1024 * 1024);
  });

  it('retries transient statuses, honours Retry-After, and names the network cause', async () => {
    let hits = 0;
    const base = await serve((req, res) => {
      hits += 1;
      if (req.url === '/flaky' && hits < 3) {
        res.writeHead(503, { 'retry-after': '0' });
        return void res.end('busy');
      }
      if (req.url === '/reset') return void req.socket.destroy();
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`ok after ${hits}`);
    });
    expect(await fetchUrl(`${base}/flaky`, undefined, privateOk)).toBe('ok after 3');
    await expect(fetchUrl(`${base}/reset`, undefined, privateOk)).rejects.toThrow(/^Could not fetch http:\/\/127\.0\.0\.1:\d+\/reset: \S+.* \(tried 3 times\)\. The site may block/);
  });

  it('caches a page for a while and sends the system language as Accept-Language', async () => {
    const languages: string[] = [];
    const base = await serve((req, res) => {
      languages.push(String(req.headers['accept-language']));
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`visit ${languages.length}`);
    });
    expect(await fetchUrl(`${base}/c`, undefined, privateOk)).toBe('visit 1');
    expect(await fetchUrl(`${base}/c`, undefined, privateOk)).toBe('visit 1');
    expect(languages).toEqual([language()]);
  });

  it('asks for the system language first and English as the fallback', () => {
    expect(language('en-US')).toBe('en-US,en;q=0.9');
    expect(language('he-IL')).toBe('he-IL,he;q=0.9,en;q=0.8');
    expect(language('de')).toBe('de,en;q=0.9');
    expect(language('en')).toBe('en');
  });

  it('bounds the cache by total size and evicts the least recently used page', async () => {
    const hits: Record<string, number> = {};
    const body = 'x'.repeat(4_500_000);
    const base = await serve((req, res) => {
      hits[req.url!] = (hits[req.url!] ?? 0) + 1;
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(body);
    });
    for (let page = 0; page < 7; page++) await fetchUrl(`${base}/p${page}`, undefined, privateOk); // ~31.5 MB
    await fetchUrl(`${base}/p0`, undefined, privateOk); // a hit: p0 is now the most recently used
    await fetchUrl(`${base}/p7`, undefined, privateOk); // over 32 MB: p1 goes
    await fetchUrl(`${base}/p0`, undefined, privateOk);
    await fetchUrl(`${base}/p1`, undefined, privateOk);
    expect([hits['/p0'], hits['/p1'], hits['/p7']]).toEqual([1, 2, 1]);
  }, 30_000);

  it('refuses a redirect from an approved private address, and reports one to another host', async () => {
    const base = await serve((req, res) => {
      if (req.url === '/old') {
        res.writeHead(301, { location: '/new' });
        return void res.end();
      }
      if (req.url === '/away') {
        res.writeHead(302, { location: 'https://elsewhere.example/landing' });
        return void res.end();
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('new place');
    });
    // An approved private address is read for the first hop only: its own redirects are checked like any other.
    await expect(fetchUrl(`${base}/old`, undefined, privateOk)).rejects.toThrow('Blocked private or non-public address');
    const away = asText(await fetchUrl(`${base}/away`, undefined, privateOk));
    expect(away).toMatch(/redirects \(HTTP 302\) to another host: https:\/\/elsewhere\.example\/landing/);
    expect(away).toContain('server-supplied and not verified');
    expect(unreadReason(away)).toBe('redirect');
  });

  it('marks static HTML, warns about JavaScript apps and shows page metadata first', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(
        '<html lang="en"><head><title>Plans</title><meta property="og:price:amount" content="17"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Offer","price":"17","priceCurrency":"USD"}</script>' +
          '<script id="wix-warmup-data">{}</script></head><body><main>' + '<p>Business plan with everything you need to grow.</p>'.repeat(20) + '<p hidden>$159 .77 placeholder</p></main></body></html>',
      );
    });
    const page = await fetchUrl(`${base}/plans`, undefined, privateOk);
    expect(page).toMatch(/^# Plans\nSource: http:\/\/127\.0\.0\.1:\d+\/plans · static HTML · lang en\n\nNote: static HTML of a JavaScript app/);
    expect(page).toContain('## Page metadata (from the HTML; untrusted)\nog:price:amount: 17\nJSON-LD: {"@type":"Offer","price":"17","priceCurrency":"USD"}');
    expect(page).not.toContain('$159');
  });

  it('refuses private addresses unless allowed', async () => {
    const base = await serve((_req, res) => res.end('secret'));
    await expect(fetchUrl(`${base}/`, undefined, {})).rejects.toThrow(/Blocked private/);
  });
});

describe('web tool', () => {
  it('rejects ambiguous or empty requests before making a network call', async () => {
    const tool = webTool();
    const fetch = vi.fn(() => { throw new Error('unexpected network call'); });
    vi.stubGlobal('fetch', fetch);
    await expect(tool.execute('id', { url: 'https://example.com', query: 'different source' })).rejects.toThrow('Provide exactly one of url or query.');
    await expect(tool.execute('id', { query: '   ' })).rejects.toThrow('Provide url or query.');
    expect(fetch).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    for (const key of ['TAVILY_API_KEY', 'SERPER_API_KEY', 'EXA_API_KEY', 'BRAVE_API_KEY']) vi.stubEnv(key, '');
  });

  it('fetches a URL through execute and needs url or query', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello from the page');
    });
    const tool = webTool();
    expect(text(await tool.execute('id', { url: `${base}/` }))).toBe('hello from the page');
    await expect(tool.execute('id', {})).rejects.toThrow('Provide url or query.');
  });

  it('names the Octocode tools this session has for reading the saved page, clasify first', async () => {
    vi.stubEnv('OCTOCODE_HOME', tmp());
    const base = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('y'.repeat(30_000));
    });
    const call = async (active: string[]) => text(await webTool(active).execute('id', { url: `${base}/`, maxChars: 1_000 }));
    const all = await call(['mcp__octocode__clasify', 'mcp__octocode__localSearch', 'mcp__octocode__localFetch']);
    expect(all).toMatch(/is in \/\S+: screen a bounded unread selection with mcp__octocode__clasify \(source \{tool:"localFetch", query:\{path:<this file>, ranges:<observed line ranges>\}\}, a noul question about one stated fact; typed answers only, read deciding evidence\); search literal text with mcp__octocode__localSearch \(headings: regex "\^#\{1,3\} "\); read line ranges with mcp__octocode__localFetch\]$/);
    const saved = /is in (\/\S+):/.exec(all)![1]!;
    expect(fs.readFileSync(saved, 'utf8')).toBe('y'.repeat(30_000));
    // Without the classification provider the local tools remain; without Octocode tools the generic wording stands.
    expect(await call(['mcp__octocode__localSearch', 'mcp__octocode__localFetch'])).toMatch(/is in \/\S+: search literal text with mcp__octocode__localSearch \(headings: regex "\^#\{1,3\} "\); read line ranges with mcp__octocode__localFetch\]$/);
    expect(await call(['read', 'bash'])).toMatch(/is in \S+: search it or read it by line range\]$/);
  });

  it('returns 20 KB of a page by default, more with maxChars, and says how to get the rest', async () => {
    vi.stubEnv('OCTOCODE_HOME', tmp());
    const page = 'x'.repeat(80_000);
    const base = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(page);
    });
    const tool = webTool();
    const first = text(await tool.execute('id', { url: `${base}/` }));
    // A longer page is saved whole: the rest is read from the file, not refetched.
    expect(first).toMatch(/^x{20000}\n\[… 60000 more characters cut; the whole page \(1 lines, links included\) is in \S+: search it or read it by line range\]$/);
    const saved = /is in (\S+):/.exec(first)![1]!;
    expect(fs.readFileSync(saved, 'utf8')).toBe('x'.repeat(80_000));
    const more = text(await tool.execute('id', { url: `${base}/`, maxChars: 40_000 }));
    expect(more.startsWith('x'.repeat(40_000) + '\n[… 40000 more')).toBe(true);
    const most = text(await tool.execute('id', { url: `${base}/`, maxChars: 1e9 }));
    expect(most).toMatch(/30000 more characters cut; the whole page .* is in /);
    const blocker = `${tmp()}/file`;
    fs.writeFileSync(blocker, '');
    vi.stubEnv('OCTOCODE_HOME', blocker);
    expect(text(await tool.execute('id', { url: `${base}/`, maxChars: 1e9 }))).toMatch(
      /^x{50000}\n\[\u2026 30000 more characters cut; the whole page could not be saved to a file; the last 30000 characters are beyond web's 50000-character limit: download the page with bash \(curl -o\) to read them\]$/,
    );
    expect(text(await tool.execute('id', { url: `${base}/` }))).toMatch(/60000 more characters cut; the whole page could not be saved to a file; maxChars 50000 shows up to 50000; the last 30000 characters are beyond/);
  });

  it('shows hidden characters of a page as visible escapes, in the preview and in the saved page', async () => {
    vi.stubEnv('OCTOCODE_HOME', tmp());
    const page = `\u001b]8;;http://x\u0007link\u202e${'x'.repeat(30_000)}\u200b end\rlone\r\ncrlf`;
    const base = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(page);
    });
    const tool = webTool();
    const first = text(await tool.execute('id', { url: `${base}/`, maxChars: 1_000 }));
    expect(first.startsWith('\\u{1b}]8;;http://x\\u{7}link\\u{202e}xxx')).toBe(true);
    expect(first).not.toMatch(/[\u001b\u0007\u202e\u200b]/u);
    const saved = fs.readFileSync(/is in (\S+):/.exec(first)![1]!, 'utf8');
    expect(saved).toBe(page.replace('\u001b', '\\u{1b}').replace('\u0007', '\\u{7}').replace('\u202e', '\\u{202e}').replace('\u200b', '\\u{200b}').replace('\rlone', '\\rlone'));
    const small = text(await tool.execute('id', { url: `${base}/x`, maxChars: 50_000 }));
    expect(small).toContain('\\u{200b} end\\rlone\r\ncrlf');
  });

  it('shows hidden characters in search results as visible escapes', async () => {
    guard.stub = async () => new Response(JSON.stringify({ results: [{ title: 'T\u202eitle', url: 'https://t.example', content: 'snip\u001b[31mpet\u200b' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    vi.stubEnv('TAVILY_API_KEY', 'tv');
    expect(text(await webTool().execute('id', { query: 'q' }))).toBe('1. T\\u{202e}itle\n   https://t.example\n   snip\\u{1b}[31mpet\\u{200b}');
  });

  it('keeps a multi-byte page preview within the output budget, so only the page itself is saved', async () => {
    const home = tmp();
    vi.stubEnv('OCTOCODE_HOME', home);
    const page = 'é'.repeat(80_000);
    const base = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(page);
    });
    const out = text(await webTool().execute('id', { url: `${base}/`, maxChars: 50_000 }));
    // 50,000 characters are 100 KB: the preview is cut to the budget and says how much of the page it left out.
    expect(Buffer.byteLength(out)).toBeLessThanOrEqual(51_200);
    expect(out).not.toContain('Output trimmed');
    expect(out).not.toContain('Full output:');
    const [saved, ...other] = [...out.matchAll(/is in (\S+):/g)].map((match) => match[1]!);
    expect(other).toEqual([]);
    expect(fs.readFileSync(saved!, 'utf8')).toBe(page);
    const shown = /^(é+)\n\[… (\d+) more characters cut/.exec(out)!;
    expect(shown[1]!.length + Number(shown[2])).toBe(80_000);
    const files = fs.readdirSync(path.dirname(saved!)).filter((name) => name.startsWith('web-'));
    expect(files).toHaveLength(1);
  });

  it('searches through each configured provider with its own request shape', async () => {
    const requests: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
    guard.stub = async (url, init) => {
      requests.push({ url, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined });
      const host = new URL(url).host;
      const data =
        host === 'api.tavily.com'
          ? { results: [{ title: 'T', url: 'https://t.example', content: 'tavily snippet' }, { title: 'Bad', url: 'javascript:alert(1)' }, { title: 'None' }, 'junk'] }
          : host === 'google.serper.dev'
            ? { organic: [{ title: 'S', link: 'https://s.example', snippet: 'serper snippet' }] }
            : host === 'api.search.brave.com'
              ? { web: { results: [{ title: 'B', url: 'https://b.example', description: 'brave <strong>snippet</strong>' }] } }
              : { results: [{ title: 'E', url: 'https://e.example', text: 'exa snippet' }] };
      return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const tool = webTool();

    vi.stubEnv('TAVILY_API_KEY', 'tv');
    expect(text(await tool.execute('id', { query: 'pi agent', maxResults: 2.7 }))).toBe('1. T\n   https://t.example\n   tavily snippet');
    expect(requests.at(-1)).toMatchObject({ url: 'https://api.tavily.com/search', headers: { authorization: 'Bearer tv' }, body: { query: 'pi agent', max_results: 2 } });

    vi.stubEnv('TAVILY_API_KEY', '');
    vi.stubEnv('SERPER_API_KEY', 'sp');
    expect(text(await tool.execute('id', { query: 'q', maxResults: 100 }))).toContain('serper snippet');
    expect(requests.at(-1)).toMatchObject({ url: 'https://google.serper.dev/search', headers: { 'x-api-key': 'sp' }, body: { q: 'q', num: 20 } });

    vi.stubEnv('SERPER_API_KEY', '');
    vi.stubEnv('EXA_API_KEY', 'ex');
    expect(text(await tool.execute('id', { query: 'q', maxResults: 0 }))).toContain('exa snippet');
    expect(requests.at(-1)).toMatchObject({ url: 'https://api.exa.ai/search', headers: { 'x-api-key': 'ex' }, body: { numResults: 1 } });

    vi.stubEnv('EXA_API_KEY', '');
    vi.stubEnv('BRAVE_API_KEY', 'br');
    expect(text(await tool.execute('id', { query: 'q b', maxResults: 3 }))).toBe('1. B\n   https://b.example\n   brave snippet');
    expect(requests.at(-1)).toMatchObject({ url: 'https://api.search.brave.com/res/v1/web/search?q=q%20b&count=3', headers: { 'x-subscription-token': 'br' } });
  });

  it('falls through the keyless pages, reporting empty results, rate limits and provider errors', async () => {
    const ddg = '<div class="result__body"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">Example</a><a class="result__snippet" href="#">An example</a></div>';
    const bing = `<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&amp;&amp;p=x&amp;u=a1${Buffer.from('https://example.com/b').toString('base64url')}&amp;ntb=1">Bing hit</a></h2><p class="b_lineclamp2">From bing</p></li>`;
    const status: Record<string, number> = {};
    const body: Record<string, string> = { 'html.duckduckgo.com': ddg, 'www.bing.com': bing, 'lite.duckduckgo.com': '' };
    guard.stub = async (url: string) => {
      const host = new URL(url).host;
      if (host === 'api.tavily.com') return new Response('bad key', { status: 401 });
      return new Response(body[host] ?? '', { status: status[host] ?? 200 });
    };
    const tool = webTool();
    expect(text(await tool.execute('id', { query: 'example' }))).toBe('1. Example\n   https://example.com/a\n   An example');

    status['html.duckduckgo.com'] = 202;
    expect(text(await tool.execute('id', { query: 'example' }))).toBe('1. Bing hit\n   https://example.com/b\n   From bing\n\n(via bing; skipped duckduckgo: HTTP 202 from html.duckduckgo.com (rate limited))');

    body['www.bing.com'] = '<html>nothing</html>';
    expect(text(await tool.execute('id', { query: 'example' }))).toBe('No results (bing, duckduckgo-lite). (skipped duckduckgo: HTTP 202 from html.duckduckgo.com (rate limited))');

    status['www.bing.com'] = 429;
    status['lite.duckduckgo.com'] = 202;
    await expect(tool.execute('id', { query: 'example' })).rejects.toThrow(/^Search failed: every provider failed \(duckduckgo: HTTP 202 .*; bing: HTTP 429 .*; duckduckgo-lite: HTTP 202 .*\)\. Do not repeat the same search: fetch a URL you already know with `web`, or ask the user to set TAVILY_API_KEY/);

    delete status['html.duckduckgo.com'];
    vi.stubEnv('TAVILY_API_KEY', 'tv');
    const outcome = await search('x', 3, process.env);
    expect(outcome).toMatchObject({ provider: 'duckduckgo', failures: ['tavily: HTTP 401 from api.tavily.com'] });
  });

  it('shows control characters in a failed search or fetch as visible escapes, and keeps the error type', async () => {
    guard.stub = async () => {
      throw new Error('proxy said \u001b[2J\u202eevil');
    };
    const tool = webTool();
    const failure = (params: Record<string, unknown>) => tool.execute('id', params).then(() => new Error('did not fail'), (error: unknown) => error as Error);
    const search = await failure({ query: 'example' });
    expect(search).toBeInstanceOf(Error);
    expect(search.message).toMatch(/^Search failed: .*\\u\{1b\}\[2J\\u\{202e\}evil/);
    expect(search.message).not.toMatch(/[\u001b\u202e]/);
    const fetched = await failure({ url: 'https://example.com/\u001b[2J' });
    expect(fetched.message).not.toMatch(/[\u001b\u202e]/);
  });

  it('renders the call as the URL or the search query', () => {
    initTheme('dark');
    const tool = webTool();
    const line = (args: Record<string, unknown>) => tool.renderCall(args, theme, { lastComponent: undefined }).render(200).join('\n');
    expect(line({ url: 'https://example.com' })).toContain('Web(https://example.com)');
    expect(line({ query: 'pi' })).toContain('Web(search "pi")');
    expect(line({})).toContain('Web');
    const render = (result: Record<string, unknown>, context: Record<string, unknown> = {}) =>
      tool.renderResult({ content: [], ...result }, { expanded: false }, theme, { lastComponent: undefined, isError: false, ...context }).render(200).join('\n');
    expect(render({ content: [{ type: 'text', text: 'one\ntwo' }] }, { expanded: true })).toContain('two');
    const page = render({ content: [{ type: 'text', text: 'a\nb\nc\nd\ne' }], details: { kind: 'fetch', bytes: 12_288, lines: 240, file: '/tmp/page.txt', durationMs: 5 } });
    expect(page).toContain('⎿  Fetched 12.0KB · 240 lines');
    expect(page).toContain('… +2 lines');
    expect(page).not.toContain('saved:');
    expect(render({ content: [{ type: 'text', text: 'a\nb\nc\nd\ne' }], details: { kind: 'fetch', bytes: 12_288, lines: 240, file: '/tmp/page.txt' } }, { expanded: true })).toContain('saved: /tmp/page.txt');
    expect(render({ content: [{ type: 'text', text: 'x' }], details: { kind: 'search', provider: 'duckduckgo', results: 8 } })).toContain('⎿  8 results · duckduckgo');
    expect(render({ content: [{ type: 'text', text: 'No results (bing).' }], details: { kind: 'search', provider: 'bing', results: 0 } })).toContain('No results · bing');
    expect(render({ content: [{ type: 'text', text: 'Search failed: offline\nmore' }] }, { isError: true })).toContain('⎿  Search failed: offline');
  });

  it('records the page size and search provider without duplicating Pi execution timing', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('line one\nline two');
    });
    const tool = webTool();
    const fetched = (await tool.execute('1', { url: `${base}/` })) as unknown as { details: Record<string, unknown> };
    expect(fetched.details).toMatchObject({ kind: 'fetch', bytes: 17, lines: 2 });
    expect(fetched.details).not.toHaveProperty('durationMs');
    expect(webSummary(fetched.details)).toBe('Fetched 17B · 2 lines');
    expect(webSummary(undefined)).toBeUndefined();
    expect(webSummary({ kind: 'other' })).toBeUndefined();
    expect(webSummary({ kind: 'notice', reason: 'redirect' })).toBe('Not read: redirects to another host (not followed)');
    expect(webSummary({ kind: 'notice', reason: 'unsupported' })).toBe('Not read: not a text document');
  });
});

describe('web images', () => {
  const GIF_1X1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  const png = noisyPng(512);
  const limit100 = { inputLimits: { images: { resize: { maxWidth: 100, maxHeight: 100 } } } };
  const imageServer = (hits: string[] = []) =>
    serve((req, res) => {
      hits.push(req.url!);
      const send = (status: number, type: string, body: Buffer | string, headers: Record<string, string | number> = {}) => res.writeHead(status, { 'content-type': type, ...headers }).end(body);
      if (req.url === '/small.png') send(200, 'image/png', noisyPng(8));
      else if (req.url === '/big.png') send(200, 'image/png', png);
      else if (req.url === '/dot.gif') send(200, 'image/gif', GIF_1X1);
      else if (req.url === '/mislabeled.jpg') send(200, 'image/jpeg', noisyPng(8));
      else if (req.url === '/fake.png') send(200, 'image/png', '<html>not an image</html>');
      else if (req.url === '/missing.png') send(404, 'image/png', 'nope');
      else if (req.url === '/huge.png') send(200, 'image/png', Buffer.alloc(6 * 1024 * 1024, 1), { 'content-length': 6 * 1024 * 1024 });
      else if (req.url === '/icon.svg') send(200, 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="4"/></svg>');
      else send(200, 'image/bmp', Buffer.alloc(32, 2));
    });
  const savedFile = (result: ToolResult) => /Original saved to (\S+?\.(?:png|jpg|gif|webp))\./.exec(result.content[0]!.text!)?.[1];

  it('returns an image within the budget as an image part, with the URL, type, size and the saved original', async () => {
    const base = await imageServer();
    const result = (await webTool().execute('1', { url: `${base}/small.png` })) as ToolResult;
    expect(result.content.map((part) => part.type)).toEqual(['text', 'image']);
    expect(result.content[0]!.text).toMatch(new RegExp(`^${base.replace(/[.]/g, '\\.')}/small\\.png: image/png image, \\d+(\\.\\d)?(B|KB|MB)\\. Original saved to \\S+\\.png\\.$`));
    expect(result.content[1]).toEqual({ type: 'image', data: noisyPng(8).toString('base64'), mimeType: 'image/png' });
    expect(fs.readFileSync(savedFile(result)!)).toEqual(noisyPng(8));
    expect(result.details).toMatchObject({ kind: 'image', mimeType: 'image/png', bytes: noisyPng(8).length, file: savedFile(result) });
    expect(webSummary(result.details)).toMatch(/^Fetched image\/png · \d/);
  });

  it('resizes an image over the context budget to the model limit, keeps the original and adds the dimension note', async () => {
    const base = await imageServer();
    const result = (await webTool([], fakePermission('full'), limit100).execute('1', { url: `${base}/big.png` })) as ToolResult;
    expect(result.content.map((part) => part.type)).toEqual(['text', 'image', 'text']);
    const image = result.content[1]!;
    expect(image.data!.length).toBeLessThanOrEqual(IMAGE_MAX_CHARS);
    expect(pixelSize(image.data!)).toEqual({ width: 100, height: 100 });
    expect(result.content[2]!.text).toContain('original 512x512, displayed at 100x100');
    expect(result.content[2]!.text).toContain(`Original saved to ${savedFile(result)}.`);
    expect(fs.readFileSync(savedFile(result)!)).toEqual(png);
    // One saved copy: the fitted note names the file the first line names.
    expect(result.details).toMatchObject({ kind: 'image', file: savedFile(result) });
  }, 120_000); // CPU-bound wasm resize: seconds alone, several times that on a loaded machine

  it('fits an over-budget image to the default limit when the model says nothing about images', async () => {
    const base = await imageServer();
    const result = (await webTool().execute('1', { url: `${base}/big.png` })) as ToolResult;
    const image = result.content.find((part) => part.type === 'image')!;
    expect(image.data!.length).toBeLessThanOrEqual(IMAGE_MAX_CHARS);
    expect(pixelSize(image.data!).width).toBeLessThanOrEqual(1568);
  }, 120_000); // CPU-bound wasm resize: seconds alone, several times that on a loaded machine

  it('passes a GIF through under the budget and names the real format when the header is wrong', async () => {
    const base = await imageServer();
    const gif = (await webTool().execute('1', { url: `${base}/dot.gif` })) as ToolResult;
    expect(gif.content[1]).toEqual({ type: 'image', data: GIF_1X1.toString('base64'), mimeType: 'image/gif' });
    const jpg = (await webTool().execute('1', { url: `${base}/mislabeled.jpg` })) as ToolResult;
    expect(jpg.content[1]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(savedFile(jpg)).toMatch(/\.png$/);
  });

  it('refuses a body that is not the image its header claims, instead of sending it on as an image', async () => {
    const base = await imageServer();
    const notice = asText(await fetchUrl(`${base}/fake.png`, undefined, privateOk));
    expect(notice).toMatch(/is image\/png by its header, but the body is not a PNG, JPEG, GIF or WebP image; web cannot read it/);
    expect(unreadReason(notice)).toBe('unsupported');
    const result = (await webTool().execute('1', { url: `${base}/fake.png` })) as ToolResult;
    expect(result.content.map((part) => part.type)).toEqual(['text']);
    expect(result.details).toEqual({ kind: 'notice', reason: 'unsupported' });
  });

  it('refuses an image over the 5 MB read cap clearly, by Content-Length or by counting, and reports a missing one as an HTTP error', async () => {
    const hits: string[] = [];
    const base = await imageServer(hits);
    const huge = asText(await fetchUrl(`${base}/huge.png`, undefined, privateOk));
    expect(huge).toMatch(/is image\/png, 6\.0MB, over web's 5 MB limit; web cannot read it\. Download it with bash \(curl -o\)/);
    expect(unreadReason(huge)).toBe('unsupported');
    // No Content-Length (chunked): the reader stops at the cap and the notice names only the limit.
    const base2 = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'image/webp' });
      const chunk = Buffer.alloc(1024 * 1024, 1);
      const write = (count: number) => {
        while (count < 8) {
          count += 1;
          if (!res.write(chunk)) return void res.once('drain', () => write(count));
        }
        res.end();
      };
      res.on('error', () => undefined);
      write(0);
    });
    expect(asText(await fetchUrl(`${base2}/chunked.webp`, undefined, privateOk))).toMatch(/is image\/webp, over web's 5 MB limit; web cannot read it/);
    await expect(fetchUrl(`${base}/missing.png`, undefined, privateOk)).rejects.toThrow(/HTTP 404 .* for http/);
  });

  it('reports a connection that drops while an image downloads as a failed fetch', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': 1000 });
      res.write(Buffer.alloc(10));
      setTimeout(() => res.destroy(), 20);
    });
    await expect(fetchUrl(`${base}/cut.png`, undefined, privateOk)).rejects.toThrow();
  });

  it('keeps other binary types a notice, and reads SVG as untrusted XML text, never as an image', async () => {
    const base = await imageServer();
    const bmp = (await webTool().execute('1', { url: `${base}/photo.bmp` })) as ToolResult;
    expect(bmp.content.map((part) => part.type)).toEqual(['text']);
    expect(bmp.details).toEqual({ kind: 'notice', reason: 'unsupported' });
    const svg = (await webTool().execute('1', { url: `${base}/icon.svg` })) as ToolResult;
    expect(svg.content.map((part) => part.type)).toEqual(['text']);
    expect(svg.content[0]!.text).toContain('<circle r="4"/>');
    expect(svg.details).toMatchObject({ kind: 'fetch' });
  });

  it('does not cache images (the saved file may be swept) while text pages stay cached', async () => {
    const hits: string[] = [];
    const base = await imageServer(hits);
    await fetchUrl(`${base}/small.png`, undefined, privateOk);
    await fetchUrl(`${base}/small.png`, undefined, privateOk);
    expect(hits).toEqual(['/small.png', '/small.png']);
    await fetchUrl(`${base}/icon.svg`, undefined, privateOk);
    await fetchUrl(`${base}/icon.svg`, undefined, privateOk);
    expect(hits.filter((hit) => hit === '/icon.svg')).toHaveLength(1);
  });

  it('describes images in the tool description', () => {
    let description = '';
    registerWebTool({ registerTool: (definition: { description: string }) => (description = definition.description), getActiveTools: () => [] } as unknown as ExtensionAPI, fakePermission('full'));
    expect(description).toMatch(/PNG, JPEG, GIF or WebP URL returns the image itself/);
    expect(description).toContain('images are not');
  });
});

describe('search provider chain', () => {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const ddgHit = '<div class="result__body"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fd.example%2F">D</a><a class="result__snippet">ddg</a></div>';
  /** Answers each host from `routes`; a host not listed is a network error. */
  const route = (routes: Record<string, () => Response>) => {
    const hosts: string[] = [];
    guard.stub = async (url: string) => {
      const host = new URL(url).host;
      hosts.push(host);
      const answer = routes[host];
      if (!answer) throw new Error(`connect ECONNREFUSED ${host}`);
      return answer();
    };
    return hosts;
  };

  it('passes a failing keyed provider to the next keyed one', async () => {
    const hosts = route({
      'api.tavily.com': () => new Response('down', { status: 500 }),
      'google.serper.dev': () => json({ organic: [{ title: 'S', link: 'https://s.example', snippet: 'serper' }] }),
    });
    const outcome = await search('q', 3, { TAVILY_API_KEY: 't', SERPER_API_KEY: 's' });
    expect(outcome).toEqual({ provider: 'serper', hits: [{ title: 'S', url: 'https://s.example', snippet: 'serper' }], failures: ['tavily: HTTP 500 from api.tavily.com'] });
    expect(hosts).toEqual(['api.tavily.com', 'google.serper.dev']);
  });

  it('falls through a keyed provider with no hits, as a keyless one does, and reports it', async () => {
    route({
      'api.tavily.com': () => json({ results: [] }),
      // A malformed answer (results not a list) counts as no hits too.
      'api.exa.ai': () => json({ results: 'nope' }),
      'html.duckduckgo.com': () => new Response(ddgHit),
    });
    const outcome = await search('q', 3, { TAVILY_API_KEY: 't', EXA_API_KEY: 'e' });
    expect(outcome).toEqual({ provider: 'duckduckgo', hits: [{ title: 'D', url: 'https://d.example/', snippet: 'ddg' }], failures: ['tavily: no results', 'exa: no results'] });
  });

  it('names every provider that came back empty when none had hits', async () => {
    route({ 'api.tavily.com': () => json({ results: [] }), 'html.duckduckgo.com': () => new Response(''), 'www.bing.com': () => new Response(''), 'lite.duckduckgo.com': () => new Response('') });
    expect(await search('q', 3, { TAVILY_API_KEY: 't' })).toEqual({ provider: 'tavily, duckduckgo, bing, duckduckgo-lite', hits: [], failures: [] });
  });

  it('reports keyed and keyless failures (bad JSON, network errors) when every provider failed', async () => {
    route({ 'api.search.brave.com': () => new Response('<html>not json</html>') });
    await expect(search('q', 3, { BRAVE_API_KEY: 'b' })).rejects.toThrow(
      /^every provider failed \(brave: .*JSON.*; duckduckgo: connect ECONNREFUSED html\.duckduckgo\.com; bing: connect ECONNREFUSED www\.bing\.com; duckduckgo-lite: connect ECONNREFUSED lite\.duckduckgo\.com\)\. Do not repeat the same search: fetch a URL you already know with `web`, or ask the user to set TAVILY_API_KEY/,
    );
  });

  it('stops at once when the call is aborted, without trying the next provider', async () => {
    const controller = new AbortController();
    const hosts: string[] = [];
    guard.stub = async (url: string) => {
      hosts.push(new URL(url).host);
      controller.abort(new Error('stopped'));
      throw new Error('aborted fetch');
    };
    await expect(search('q', 3, { TAVILY_API_KEY: 't' }, controller.signal)).rejects.toThrow('aborted fetch');
    expect(hosts).toEqual(['api.tavily.com']);
    hosts.length = 0;
    await expect(search('q', 3, {}, controller.signal)).rejects.toThrow('aborted fetch');
    expect(hosts).toEqual(['html.duckduckgo.com']);
  });
});

describe('search through the guarded request', () => {
  const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

  it('posts to keyed APIs without following redirects, and sends the environment to the guard', async () => {
    const calls: Array<{ url: string; method?: string; redirect?: string }> = [];
    guard.stub = async (url, init) => {
      calls.push({ url, method: init.method, redirect: init.redirect });
      return json({ results: [{ title: 'T', url: 'https://t.example', content: 'c' }], web: { results: [] } });
    };
    await search('q', 3, { TAVILY_API_KEY: 't' });
    expect(calls).toEqual([{ url: 'https://api.tavily.com/search', method: 'POST', redirect: 'error' }]);
    calls.length = 0;
    guard.stub = async (url, init) => {
      calls.push({ url, method: init.method, redirect: init.redirect });
      return json({ web: { results: [{ title: 'B', url: 'https://b.example', description: 'd' }] } });
    };
    await search('q', 3, { BRAVE_API_KEY: 'b' });
    expect(calls).toEqual([{ url: 'https://api.search.brave.com/res/v1/web/search?q=q&count=3', method: undefined, redirect: 'error' }]);
  });

  it('reports a keyed API redirect or an oversized answer as that provider failing, then falls through', async () => {
    guard.stub = async (url) => {
      if (url.includes('tavily')) throw new Error('api.tavily.com answered with a redirect (HTTP 302); it is not followed');
      if (url.includes('serper')) return new Response('{"organic":"' + 'x'.repeat(6 * 1024 * 1024) + '"}', { status: 200 });
      return new Response('', { status: 200 });
    };
    const outcome = await search('q', 3, { TAVILY_API_KEY: 't', SERPER_API_KEY: 's' });
    expect(outcome.failures.slice(0, 2)).toEqual(['tavily: api.tavily.com answered with a redirect (HTTP 302); it is not followed', 'serper: the answer from google.serper.dev is over the size limit']);
  });
});

describe('search result parsing', () => {
  it('skips DuckDuckGo blocks without a result link, stops at max, and keeps only http(s) targets', async () => {
    const { parseDuckDuckGo } = await import('../src/web/search.js');
    const block = (href: string, title: string) => `<div class="result__body"><a class="result__a" href="${href}">${title}</a></div>`;
    const html = [
      '<div class="result__body"><span>ad, no link</span></div>',
      block('//duckduckgo.com/l/?uddg=javascript%3Aalert(1)', 'Script'),
      block('data:text/html,hi', 'Data'),
      block('http://[broken', 'Broken'),
      block('/l/?kh=1', 'Relative'),
      block('//duckduckgo.com/l/?uddg=http%3A%2F%2Fone.example%2F', 'One'),
      block('https://two.example/', 'Two'),
    ].join('');
    expect(parseDuckDuckGo(html, 5)).toEqual([
      { title: 'Relative', url: 'https://duckduckgo.com/l/?kh=1', snippet: '' },
      { title: 'One', url: 'http://one.example/', snippet: '' },
      { title: 'Two', url: 'https://two.example/', snippet: '' },
    ]);
    expect(parseDuckDuckGo(html, 2).map((hit) => hit.title)).toEqual(['Relative', 'One']);
  });

  it('keeps only http(s) targets from Bing and DuckDuckGo lite', async () => {
    const { parseBing, parseDuckDuckGoLite } = await import('../src/web/search.js');
    const tracker = `https://www.bing.com/ck/a?u=a1${Buffer.from('javascript:alert(1)').toString('base64url')}`;
    const bing = [`<li class="b_algo"><h2><a href="${tracker}">Tracker</a></h2></li>`, '<li class="b_algo"><h2><a href="javascript:void(0)">Script</a></h2></li>', '<li class="b_algo"><h2><a href="not a url">Bad</a></h2></li>'].join('');
    // A tracker hiding a non-web target keeps the (https) tracker link; a non-web or unparsable link is dropped.
    expect(parseBing(bing, 5)).toEqual([{ title: 'Tracker', url: tracker, snippet: '' }]);
    const lite = `<a class="result-link" href="//duckduckgo.com/l/?uddg=javascript%3Aalert(1)">Script</a><a class='result-link'>No href</a><a class="result-link" href="https://ok.example/">Ok</a>`;
    expect(parseDuckDuckGoLite(lite, 5)).toEqual([{ title: 'Ok', url: 'https://ok.example/', snippet: '' }]);
  });
});
