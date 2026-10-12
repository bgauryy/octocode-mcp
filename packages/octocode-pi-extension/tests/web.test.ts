import http from 'node:http';
import zlib from 'node:zlib';
import type { AddressInfo, LookupFunction } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyHost, isBlockedIp, publicFetch, type HostLookup } from '../src/web/guard.js';
import { clearFetchCache, decodeBody, fetchUrl, isBinaryType } from '../src/web/fetch.js';
import { collapseLinkRuns, describeHtml, htmlToText, mainContent } from '../src/web/html.js';
import { parseDuckDuckGo } from '../src/web/search.js';

const servers: http.Server[] = [];
afterEach(async () => {
  clearFetchCache();
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

/** A local server (listening on every interface, so `localhost` reaches it over IPv4 or IPv6). */
async function serve(handler: http.RequestListener): Promise<number> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return (server.address() as AddressInfo).port;
}

const publicLookup: HostLookup = async () => [{ address: '93.184.216.34' }];

/**
 * Lets requests to a pretend-public host reach the local server: each `http.request` connects to 127.0.0.1 whatever
 * address it was pinned to, and records the addresses its lookup would have answered.
 */
function connectLocally(): string[][] {
  const pinned: string[][] = [];
  const request = http.request;
  vi.spyOn(http, 'request').mockImplementation(((url: URL, options: http.RequestOptions, callback: (response: http.IncomingMessage) => void) => {
    options.lookup?.('', { all: true }, (_error, addresses) => pinned.push((addresses as Array<{ address: string }>).map(({ address }) => address)));
    const local: LookupFunction = (_hostname, lookupOptions, done) => (lookupOptions.all ? done(null, [{ address: '127.0.0.1', family: 4 }]) : done(null, '127.0.0.1', 4));
    return request(url, { ...options, lookup: local }, callback);
  }) as typeof http.request);
  return pinned;
}

describe('web private-address guard', () => {
  it.each([
    ['127.0.0.1', true], ['127.9.9.9', true], ['10.1.2.3', true], ['172.16.0.1', true], ['172.31.255.255', true],
    ['192.168.1.1', true], ['169.254.169.254', true], ['100.64.0.1', true], ['0.0.0.0', true], ['224.0.0.1', true],
    ['255.255.255.255', true], ['198.18.0.1', true], ['::1', true], ['::', true], ['fe80::1', true], ['fc00::1', true],
    ['fd12:3456::1', true], ['ff02::1', true], ['::ffff:127.0.0.1', true], ['::ffff:7f00:1', true], ['::ffff:169.254.169.254', true],
    ['64:ff9b::a9fe:a9fe', true], ['2002:c0a8:0101::', true], ['2001:db8::1', true], ['not-an-ip', true],
    // IPv4-mapped 0.0.0.0/8 (the ::ffff:0:0 and ::ffff:0:1 forms once slipped through), translated, compatible, NAT64, 6to4, Teredo.
    ['::ffff:0.0.0.0', true], ['::ffff:0:0', true], ['::ffff:0:1', true], ['::ffff:0.0.0.1', true], ['::ffff:10.0.0.1', true],
    ['::ffff:0:127.0.0.1', true], ['::ffff:0:7f00:1', true], ['::ffff:0:0.0.0.0', true], ['::127.0.0.1', true], ['::0.0.0.2', true],
    ['64:ff9b::127.0.0.1', true], ['64:ff9b::0.0.0.0', true], ['64:ff9b:1::1', true], ['2002:7f00:1::', true], ['2002:0:0::1', true],
    ['2001:0:7f00:1::', true], ['2001:0:4136:e378:8000:63bf:80ff:fffe', true], ['2001:0:4136:e378:8000:63bf:f7f7:f7f7', false],
    ['0.1.2.3', true], ['0:0:0:0:0:0:0:0', true], ['2130706433', true], ['0177.0.0.1', true], ['0x7f.1', true], ['127.1', true],
    ['8.8.8.8', false], ['93.184.216.34', false], ['172.32.0.1', false], ['100.128.0.1', false], ['2606:4700::1111', false], ['::ffff:8.8.8.8', false],
    ['::ffff:0:8.8.8.8', false], ['64:ff9b::8.8.8.8', false], ['2002:0808:0808::1', false], ['100::1', true], ['100::ffff:ffff:ffff:ffff', true], ['100:0:0:1::1', false],
  ])('%s blocked=%s', (ip, blocked) => {
    expect(isBlockedIp(ip)).toBe(blocked);
  });

  it.each([
    ['http://[::ffff:0.0.0.0]/', '[::ffff:0:0]'], ['http://[::ffff:0:1]/', '[::ffff:0:1]'], ['http://[::ffff:0:127.0.0.1]/', '[::ffff:0:7f00:1]'],
    ['http://[64:ff9b::7f00:1]/', '[64:ff9b::7f00:1]'], ['http://[2001:0:7f00:1::]/', '[2001:0:7f00:1::]'], ['http://[::]/', '[::]'],
    ['http://2130706433/', '127.0.0.1'], ['http://0177.0.0.1/', '127.0.0.1'], ['http://0x7f.1/', '127.0.0.1'], ['http://127.1/', '127.0.0.1'], ['http://0/', '0.0.0.0'],
  ])('WHATWG URL parsing normalizes %s to %s, which is blocked', async (href, hostname) => {
    expect(new URL(href).hostname).toBe(hostname);
    await expect(classifyHost(new URL(href), publicLookup)).resolves.toEqual({ kind: 'private' });
  });

  it('classifies literal hosts, encoded IPv4 forms and every resolved address', async () => {
    const kind = async (href: string, lookup?: HostLookup) => (await classifyHost(new URL(href), lookup)).kind;
    expect(await kind('http://169.254.169.254/latest/meta-data')).toBe('private');
    expect(await kind('http://[::1]:8080/')).toBe('private');
    expect(await kind('http://2130706433/')).toBe('private');
    expect(await kind('http://0x7f.1/')).toBe('private');
    expect(await kind('https://mixed.test/', async () => [{ address: '8.8.8.8' }, { address: '10.0.0.1' }])).toBe('private');
    expect(await classifyHost(new URL('https://example.test/'), publicLookup)).toEqual({ kind: 'public', addresses: ['93.184.216.34'] });
    expect(await classifyHost(new URL('https://[2606:4700::1111]/'))).toEqual({ kind: 'public', addresses: ['2606:4700::1111'] });
    // A name that does not resolve here may still resolve elsewhere (a browser's own DNS): neither public nor private.
    expect(await kind('https://gone.test/', async () => Promise.reject(new Error('ENOTFOUND')))).toBe('unresolved');
    expect(await kind('https://empty.test/', async () => [])).toBe('unresolved');
    await expect(publicFetch('file:///etc/passwd', {})).rejects.toThrow('http(s) URLs only');
    await expect(publicFetch('https://gone.test/', {}, { env: {}, lookup: async () => Promise.reject(new Error('getaddrinfo ENOTFOUND gone.test')) })).rejects.toThrow('ENOTFOUND');
  });

  it('connects to the checked addresses, not to a second DNS answer (rebinding)', async () => {
    const port = await serve((_request, response) => void response.writeHead(200, { 'content-type': 'text/plain' }).end('page'));
    const pinned = connectLocally();
    const lookups: string[] = [];
    const lookup: HostLookup = async (hostname) => (lookups.push(hostname), [{ address: '93.184.216.34' }, { address: '2606:4700::1111' }]);
    const response = await publicFetch(`http://rebind.test:${port}/`, {}, { env: {}, lookup });
    expect(await response.text()).toBe('page');
    expect(response.url).toBe(`http://rebind.test:${port}/`);
    // The check resolved the name once; the connection may use only what it approved.
    expect(lookups).toEqual(['rebind.test']);
    expect(pinned).toEqual([['93.184.216.34', '2606:4700::1111']]);
  });

  it('keeps redirects to http(s), even with private addresses allowed', async () => {
    const port = await serve((_request, response) => void response.writeHead(302, { location: 'file:///etc/passwd' }).end());
    await expect(publicFetch(`http://127.0.0.1:${port}/`, {}, { env: { OCTOCODE_WEB_ALLOW_PRIVATE: '1' } })).rejects.toThrow('web fetches http(s) URLs only, not file:');
  });

  it('decodes compressed bodies and the declared charset, and cuts at a whole character', async () => {
    const port = await serve((request, response) => {
      if (request.url === '/gzip') return void response.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' }).end(zlib.gzipSync('packed text'));
      if (request.url === '/br') return void response.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'br' }).end(zlib.brotliCompressSync('brotli text'));
      if (request.url === '/latin1') return void response.writeHead(200, { 'content-type': 'text/plain; charset=ISO-8859-1' }).end(Buffer.from('caf\xe9', 'latin1'));
      if (request.url === '/meta') return void response.writeHead(200, { 'content-type': 'text/html' }).end(Buffer.from('<html><head><meta charset="windows-1252"><title>Na\xefve</title></head><body><p>\x93quoted\x94</p></body></html>', 'latin1'));
      response.writeHead(200, { 'content-type': 'text/plain; charset=x-unknown' }).end('caf\u00e9');
    });
    const env = { OCTOCODE_WEB_ALLOW_PRIVATE: '1' };
    const base = `http://127.0.0.1:${port}`;
    expect(await fetchUrl(`${base}/gzip`, undefined, env)).toBe('packed text');
    expect(await fetchUrl(`${base}/br`, undefined, env)).toBe('brotli text');
    expect(await fetchUrl(`${base}/latin1`, undefined, env)).toBe('caf\u00e9');
    const meta = await fetchUrl(`${base}/meta`, undefined, env);
    expect(meta).toMatch(/^# Na\u00efve\n/);
    expect(meta).toContain('\u201cquoted\u201d');
    expect(await fetchUrl(`${base}/unknown`, undefined, env)).toBe('caf\u00e9');
    const bytes = Buffer.from('ab\u00e9');
    expect(decodeBody(bytes.subarray(0, 3), 'text/plain', true)).toBe('ab');
    expect(decodeBody(Buffer.from([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]), 'text/plain; charset=utf-8')).toBe('hi');
  });

  it('shares one fetch between callers asking for the same page at once', async () => {
    let hits = 0;
    const port = await serve((_request, response) => {
      hits += 1;
      setTimeout(() => response.writeHead(200, { 'content-type': 'text/plain' }).end(`visit ${hits}`), 100);
    });
    const env = { OCTOCODE_WEB_ALLOW_PRIVATE: '1' };
    const url = `http://127.0.0.1:${port}/same`;
    const leaving = new AbortController();
    const first = fetchUrl(url, leaving.signal, env);
    const second = fetchUrl(url, undefined, env);
    leaving.abort(new Error('caller left'));
    await expect(first).rejects.toThrow('caller left');
    // One caller leaving does not abort the fetch the other still waits for.
    expect(await second).toBe('visit 1');
    expect(hits).toBe(1);
  });

  it('refuses a local URL, and a redirect from a public host to a private one', async () => {
    const port = await serve((request, response) => {
      if (request.url === '/hop') return void response.writeHead(302, { location: `http://127.0.0.1:${port}/secret` }).end();
      response.writeHead(200, { 'content-type': 'text/plain' }).end('secret');
    });
    await expect(fetchUrl(`http://127.0.0.1:${port}/secret`, undefined, {})).rejects.toThrow('OCTOCODE_WEB_ALLOW_PRIVATE=1');
    const pinned = connectLocally();
    await expect(publicFetch(`http://public.test:${port}/hop`, {}, { env: {}, lookup: publicLookup })).rejects.toThrow(`Blocked private or non-public address: 127.0.0.1:${port}`);
    expect(pinned).toEqual([['93.184.216.34']]);
    vi.restoreAllMocks();
    // The opt-out restores plain fetching, redirects included.
    expect(await fetchUrl(`http://127.0.0.1:${port}/secret`, undefined, { OCTOCODE_WEB_ALLOW_PRIVATE: '1' })).toBe('secret');
    const followed = await publicFetch(`http://localhost:${port}/hop`, {}, { env: { OCTOCODE_WEB_ALLOW_PRIVATE: '1' } });
    expect(await followed.text()).toBe('secret');
  });

  it('says when a body over 5 MB was cut, and shows cut JSON raw', async () => {
    const MB = 1024 * 1024;
    const bigJson = JSON.stringify({ items: 'x'.repeat(6 * MB) });
    const port = await serve((request, response) => {
      if (request.url === '/big.txt') return void response.writeHead(200, { 'content-type': 'text/plain' }).end('a'.repeat(6 * MB));
      if (request.url === '/big.json') return void response.writeHead(200, { 'content-type': 'application/json' }).end(bigJson);
      if (request.url === '/exact.txt') return void response.writeHead(200, { 'content-type': 'text/plain' }).end('b'.repeat(5 * MB));
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"a":1}');
    });
    const env = { OCTOCODE_WEB_ALLOW_PRIVATE: '1' };
    const text = await fetchUrl(`http://127.0.0.1:${port}/big.txt`, undefined, env);
    expect(text).toMatch(/^\[Truncated: the response is over 5 MB; only the first 5 MB was read\. Download it with bash/);
    expect(text.length - text.indexOf('\n\n') - 2).toBe(5 * MB);
    const json = await fetchUrl(`http://127.0.0.1:${port}/big.json`, undefined, env);
    expect(json).toMatch(/^\[Truncated: .* and is shown raw, not pretty-printed\./);
    expect(json).toContain('\n\n{"items":"xxx');
    expect(await fetchUrl(`http://127.0.0.1:${port}/exact.txt`, undefined, env)).toBe('b'.repeat(5 * MB));
    expect(await fetchUrl(`http://127.0.0.1:${port}/small.json`, undefined, env)).toBe('{\n  "a": 1\n}');
  });
});

describe('web', () => {
  it('converts HTML to readable text', () => {
    // A `>` inside a quoted attribute must not end the tag, and icon-only list items must not leave empty bullets.
    const noisy = htmlToText(`<ul><li><a href="/x"></a></li><li>keep</li></ul><span data-mw='{"wt":"{{a}} > b"}'>real text</span>`);
    expect(noisy).toBe('- keep\n\nreal text');
    expect(noisy).not.toContain('wt');
    const text = htmlToText('<html><script>x()</script><h1>Title</h1><p>Hello &amp; <a href="/a">link</a></p><ul><li>one</li></ul></html>');
    expect(text).toBe('# Title\n\nHello & [link](/a)\n\n- one');
    // example.com: bare href, and a `<p>` whose close tag is omitted must not run into the next block.
    expect(htmlToText('<html><head><title>T</title><link rel=icon href=data:,></head><body><p>x</p></body></html>')).toBe('x');
    expect(htmlToText(`<body><p>This domain.<a href=https://iana.org/help>Learn more</a><p>Next <a href='/s'>s</a></body>`)).toBe(
      'This domain.[Learn more](https://iana.org/help)\n\nNext [s](/s)',
    );
  });

  it.each([
    ['unclosed links', '<a href="x">t'.repeat(80_000)],
    ['an unclosed nav', `<nav>${'word '.repeat(200_000)}`],
    ['unclosed navs', '<nav>w'.repeat(170_000)],
    ['lone <', '<'.repeat(1_000_000)],
    ['one tag of opening links', `${'<a '.repeat(330_000)}>`],
    ['unclosed hidden elements', '<div hidden>'.repeat(85_000)],
    ['unclosed headings, list items and scripts', '<h1<li<script'.repeat(75_000)],
    ['unclosed quotes', '<a x="'.repeat(170_000)],
    ['unclosed comments and empty links', '<!--[]('.repeat(140_000)],
    ['tags searched for role=main', '<a'.repeat(500_000)],
  ])('reads a 1 MB page of %s in linear time', (_, html) => {
    const started = performance.now();
    describeHtml(html, 'https://example.com/');
    // About 100 ms alone; a pattern that rescans to the end per unclosed tag takes minutes. The bound leaves room for
    // a loaded machine running test files in parallel.
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it('recognises binary content types', () => {
    expect(isBinaryType('application/pdf')).toBe(true);
    expect(isBinaryType('image/png')).toBe(true);
    expect(isBinaryType('application/octet-stream')).toBe(true);
    expect(isBinaryType('text/html; charset=utf-8')).toBe(false);
    expect(isBinaryType('application/json')).toBe(false);
    expect(isBinaryType('application/vnd.api+json')).toBe(false);
    expect(isBinaryType('')).toBe(false);
  });

  it('parses DuckDuckGo HTML results', () => {
    const html = '<div class="result__body"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com">Example</a><a class="result__snippet">Snippet</a></div>';
    expect(parseDuckDuckGo(html, 5)).toEqual([{ title: 'Example', url: 'https://example.com', snippet: 'Snippet' }]);
  });
});

describe('web page helpers', () => {
  it('drops elements marked hidden, and keeps look-alike attributes', async () => {
    const { stripHidden } = await import('../src/web/html.js');
    const html = '<div hidden><p>gone <div>nested</div></p></div><p class="hidden" data-hidden="1">kept</p><span aria-hidden="true">icon</span><span aria-hidden="false">shown</span><b style="color:red; display:none">x</b><i style="visibility: hidden">y</i><input hidden value="v"><em>end</em>';
    expect(stripHidden(html)).toBe('<p class="hidden" data-hidden="1">kept</p><span aria-hidden="false">shown</span><em>end</em>');
    expect(htmlToText('<p>a</p><div hidden>b</div>')).toBe('a');
  });

  it('collects price, locale and date metadata and JSON-LD, skipping broken blocks', async () => {
    const { pageMetadata } = await import('../src/web/html.js');
    const html = '<meta property="og:title" content="T"><meta property="product:price:amount" content="29"><meta property="og:locale" content=\'he_IL\'><meta name="description"><script type="application/ld+json">{"@context":"x","price":29}</script><script type="application/ld+json">{broken</script>';
    expect(pageMetadata(html)).toBe('## Page metadata (from the HTML; untrusted)\nproduct:price:amount: 29\nog:locale: he_IL\nJSON-LD: {"price":29}');
    expect(pageMetadata('<p>none</p>')).toBe('');
    expect(pageMetadata(`<meta itemprop="price" content="${'9'.repeat(400)}">`, 60)).toMatch(/more characters cut; the rest is in the page source/);
  });

  it('notes a JavaScript shell or app, and stays quiet for a plain page', async () => {
    const { staticHtmlNote } = await import('../src/web/html.js');
    const long = 'words '.repeat(200);
    expect(staticHtmlNote('<div id="root"></div><script src="a.js"></script>', '')).toMatch(/the page is probably built by JavaScript/);
    expect(staticHtmlNote('<noscript>Please enable JavaScript</noscript>', 'x')).toMatch(/asks for JavaScript or a bot check/);
    expect(staticHtmlNote('<p>tiny page</p>', 'tiny page')).toBeUndefined();
    // example.com: a small static page whose only script is analytics (text is ~30% of the HTML).
    const small = 'This domain is for use in documentation examples without needing permission. This is not a service; avoid relying on it.';
    expect(staticHtmlNote(`<title>Example Domain</title><body><p>${small}</p><script src=/s.js></script></body>`, small)).toBeUndefined();
    // A shell: a little text, but an empty mount point, or almost no text against heavy markup.
    expect(staticHtmlNote('<div id="app"></div><p>Loading</p><script src="a.js"></script>', 'Loading')).toMatch(/empty app mount point/);
    expect(staticHtmlNote(`<script src="a.js"></script><span>Menu</span>${'<div class="x"></div>'.repeat(200)}`, 'Menu')).toMatch(/little text/);
    expect(staticHtmlNote(`<script id="__NEXT_DATA__">{}</script><p>${long}</p>`, long)).toMatch(/static HTML of a JavaScript app/);
    expect(staticHtmlNote(`<script>${'x'.repeat(5000)}</script><p>${long}</p>`, long)).toMatch(/JavaScript app/);
    expect(staticHtmlNote(`<p>${long}</p>`, long)).toBeUndefined();
  });

  it('parses Bing and DuckDuckGo lite results', async () => {
    const { parseBing, parseDuckDuckGoLite } = await import('../src/web/search.js');
    const target = Buffer.from('https://example.com/x?y=1').toString('base64url');
    const bing = `<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&amp;&amp;u=a1${target}">One &amp; only</a></h2><p class="b_lineclamp2">Snip</p></li><li class="b_algo"><h2><a href="https://direct.example/">Two</a></h2></li><li class="b_algo"><div>no link</div></li>`;
    expect(parseBing(bing, 5)).toEqual([
      { url: 'https://example.com/x?y=1', title: 'One & only', snippet: 'Snip' },
      { url: 'https://direct.example/', title: 'Two', snippet: '' },
    ]);
    expect(parseBing(bing, 1)).toHaveLength(1);
    const lite = `<table><tr><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fa.example%2F" class='result-link'>A</a></td></tr><tr><td class='result-snippet'>About A</td></tr><tr><td><a class="result-link" href="https://b.example/">B</a></td></tr></table>`;
    expect(parseDuckDuckGoLite(lite, 5)).toEqual([
      { url: 'https://a.example/', title: 'A', snippet: 'About A' },
      { url: 'https://b.example/', title: 'B', snippet: '' },
    ]);
    expect(parseDuckDuckGoLite(lite, 1)).toHaveLength(1);
  });

  it('reads Retry-After as seconds or a date', async () => {
    const { retryAfterMs } = await import('../src/web/fetch.js');
    expect(retryAfterMs('3')).toBe(3000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(retryAfterMs('soon')).toBeUndefined();
    expect(retryAfterMs(null)).toBeUndefined();
  });
});

describe('web page reduction', () => {
  const body = `<p>${'Real content sentence. '.repeat(20)}</p>`;
  it('keeps only the marked main content, through nested elements of the same tag', () => {
    const html = `<div class="sidebar"><a href="/a">Nav</a></div><div role="main"><div>${body}</div><div>tail</div></div><footer>f</footer>`;
    expect(mainContent(html)).toBe(`<div role="main"><div>${body}</div><div>tail</div></div>`);
    expect(mainContent(`<nav>x</nav><main>${body}</main>`)).toBe(`<main>${body}</main>`);
    expect(mainContent(`<article>${body}</article><aside>a</aside>`)).toBe(`<article>${body}</article>`);
    // Two articles (a feed), a tiny main, or no marker: the whole page.
    const feed = `<article>${body}</article><article>${body}</article>`;
    expect(mainContent(feed)).toBe(feed);
    expect(mainContent(`<main>short</main>${body}`)).toBe(`<main>short</main>${body}`);
    expect(mainContent(body)).toBe(body);
  });

  it('folds long runs of link-only lines and keeps short ones', () => {
    const links = (n: number) => Array.from({ length: n }, (_, i) => `- [Item ${i}](/item/${i})`).join('\n\n');
    expect(collapseLinkRuns(`Intro\n${links(10)}\nBody text`)).toBe('Intro\n[10 links omitted]\nBody text');
    expect(collapseLinkRuns(`Intro\n${links(3)}\nBody`)).toBe(`Intro\n${Array.from({ length: 3 }, (_, i) => `- [Item ${i}](/item/${i})`).join('\n')}\nBody`);
  });
});
