import { expect, test } from 'vitest';
import { readSkillPage } from '../src/tools/skill-pages.js';
import { renderAvailableSkillsAddendum } from '../src/tools/skill-catalog.js';

test('skill paging rejects stale revisions and emits a restart call', () => {
  const skills = [{ name: 'one', path: '/skills/one/SKILL.md', dir: '/skills/one', source: 'user', sourceId: 'one', description: 'First.' }];
  const first = readSkillPage(skills);
  const changed = readSkillPage([{ ...skills[0]!, description: 'Revised.' }], { catalogRevision: first.revision });
  expect(changed.diagnostic?.code).toBe('catalog-revision-changed');
  const restarted = readSkillPage([{ ...skills[0]!, description: 'Revised.' }], changed.next!.params.queries[0]);
  expect(restarted.partial).toBe(false);
  expect(restarted.skills[0]?.description).toBe('Revised.');
});

test('oversized prompt skill inventories point to the executable complete catalog', () => {
  const skills = Array.from({ length: 500 }, (_, index) => ({ name: 'skill-' + index, description: 'Description. '.repeat(40) }));
  const prompt = renderAvailableSkillsAddendum(skills);
  expect(prompt.length).toBeLessThan(20_000);
  const continuation = JSON.parse(prompt.split('\n').find(line => line.startsWith('catalog_continuation:'))!.slice('catalog_continuation: '.length));
  expect(continuation).toMatchObject({ partial: true, next: { tool: 'skill', params: { queries: [{ type: 'load', action: 'list' }] } } });
});
