import { afterEach, describe, expect, it } from 'vitest';
import { startCdpStub, type CdpStub } from './fixtures/cdp-stub.js';
import { describeTabs } from '../src/browser/tabs.js';

let cdp: CdpStub | undefined;
afterEach(async () => {
  await cdp?.close();
  cdp = undefined;
});

describe('tabs listing', () => {
  it('lists every title and URL whole, however long', async () => {
    const title = `Report ${'t'.repeat(300)}`;
    const url = `https://example.test/path?q=${'u'.repeat(500)}`;
    cdp = await startCdpStub({ targets: [{ id: 'page-1', type: 'page', url, title }, { id: 'page-2', type: 'page', url: 'https://example.test/' }] });
    const text = await describeTabs({ port: cdp.port, targetId: 'page-1' } as never);
    expect(text.split('\n')).toEqual([
      'Tabs (2; * = driven):',
      '  [1] (untitled) — https://example.test/',
      `* [2] ${title} — ${url}`,
      'tab with index switches to one; tab with url opens a new one.',
    ]);
  });
});
