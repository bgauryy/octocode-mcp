// node --test harness/acceptance.test.mjs — one red and one green fixture per acceptance check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SURFACE_BUDGET, checkChainFit, checkRowContract, descriptionLint, packedCoordinates, packedStrings, silentOmissions, surfaceBudget, zeroBasedTexts, zeroCoordinates } from './acceptance.mjs';

const inputs = { localFetch: new Set(['path', 'matchString', 'startLine', 'endLine']), lspSearch: new Set(['path', 'symbolName', 'line', 'operation']) };
const published = t => inputs[t] ?? null;
const opts = { inputNames: published, published, toolNames: Object.keys(inputs) };

test('C1 packed coordinates: lsp/ast packed rows fail, "<line>\\t<value>" passes', () => {
  assert.ok(packedCoordinates('433:20 in function x 430-475'));
  assert.ok(packedCoordinates('227-428 function x +'));
  assert.ok(packedCoordinates('fn handle@430 12-20'));
  assert.equal(packedCoordinates('452\tconst x = 1;'), 0);
  assert.equal(packedCoordinates('src/a.ts'), 0);
  assert.equal(packedCoordinates('v1.2-3'), 0);
  assert.equal(packedCoordinates('2026-10-04'), 0);
  assert.equal(packedCoordinates('2026-05-30T23:55:19Z'), 0);
});

test('C1 packed coordinates: outline rows are declaration objects; a packed string fails under any key', async t => {
  const outline = { results: [{ data: { symbols: [{ symbolName: 'a', kind: 'function', line: 3, endLine: 5, docStartLine: 2 }, { symbolName: 'B', kind: 'impl', line: 7, endLine: 20, members: [{ symbolName: 'c', line: 8, endLine: 10 }] }] } }] };
  assert.deepEqual(packedStrings(outline), []);
  for (const [name, data] of [
    ['locations', { locations: ['c (8-10, doc 7)'] }],
    ['symbols', { symbols: ['227-428 function x +'] }],
    ['symbols outline string', { symbols: ['a (3-5, function, doc 2)'] }],
    ['members', { symbols: [{ symbolName: 'B', line: 7, members: ['c (8-10, doc 7)'] }] }],
  ]) await t.test(name, () => assert.equal(packedStrings({ results: [{ data }] }).length, 1));
});

test('C1 chain fit: unknown target field and packed row fail; clean row passes', () => {
  const bad = { results: [{ status: 'ok', data: { locations: ['433:20 in function x 430-475'], hints: { read: { tool: 'localFetch', query: { queries: [{ path: 'a', position: 3 }] } } } } }] };
  const reasons = checkChainFit(bad, 'lspSearch', opts);
  assert.ok(reasons.some(r => r.includes('`position`')), reasons.join('\n'));
  assert.ok(reasons.some(r => r.startsWith('packed')), reasons.join('\n'));
  const flat = { results: [{ data: { hints: { read: { tool: 'localFetch', query: { path: 'a' } } } } }] };
  assert.ok(checkChainFit(flat, 'lspSearch', opts).some(r => r.includes('envelope')));
  const good = { results: [{ status: 'ok', data: { locations: [{ path: 'a', line: 433, value: 'x' }], hints: { read: { tool: 'localFetch', query: { queries: [{ path: 'a', startLine: 1 }] } } } } }] };
  assert.deepEqual(checkChainFit(good, 'lspSearch', opts), []);
});

test('C1 hint text lint: unpublished knob without a lead fails; with a lead passes', () => {
  const bad = { results: [{ data: { hints: { text: ['try caseMode:"insensitive"'] } } }] };
  assert.ok(checkChainFit(bad, 'localFetch', opts).some(r => r.includes('caseMode')));
  const good = { results: [{ data: { hints: { text: ['try caseMode:"insensitive"'], retry: { tool: 'localFetch', query: { queries: [{ path: 'a', caseMode: 'insensitive' }] } } } } }] };
  const optsWithCase = { ...opts, inputNames: t => (t === 'localFetch' ? new Set([...inputs.localFetch, 'caseMode']) : published(t)) };
  assert.deepEqual(checkChainFit(good, 'localFetch', optsWithCase), []);
  const named = { results: [{ data: { hints: { text: ['Verify with lspSearch operation:"definition"'] } } }] };
  assert.deepEqual(checkChainFit(named, 'localFetch', opts), []);
});

test('C2 row contract: error row without errorCode fails; full error/empty rows pass', () => {
  const bad = { results: [{ status: 'error', data: { error: 'boom' } }] };
  const reasons = checkRowContract(bad, 'error');
  assert.ok(reasons.some(r => r.includes('errorCode')));
  assert.ok(reasons.some(r => r.includes('recovery')));
  assert.ok(checkRowContract({ results: [{ status: 'error', data: { error: 'x', errorCode: 'transport', retryable: false, hints: { text: ['retry'] } } }] }, 'error').some(r => r.includes('retryable:false')));
  assert.deepEqual(checkRowContract({ results: [{ status: 'error', data: { error: 'x', errorCode: 'pathNotFound', hints: { text: ['check the path'] } } }] }, 'error'), []);
  assert.ok(checkRowContract({ results: [{ status: 'empty', data: {} }] }, 'empty').length);
  assert.deepEqual(checkRowContract({ results: [{ status: 'empty', data: { hints: { text: ['shorter term'] } } }] }, 'empty'), []);
  assert.ok(checkRowContract(undefined, 'error', { isError: true, text: 'Input validation error' }).length);
});

test('C3 one base: 0-based text and column 0 fail; 1-based passes', () => {
  assert.equal(zeroBasedTexts({ lspSearch: { inputSchema: { properties: { position: { description: '0-based UTF-16 position' } } } } }).length, 1);
  assert.deepEqual(zeroBasedTexts({ lspSearch: { description: '1-based line' } }), []);
  // Allow-listed by decision: offsets and ast-grep slice semantics.
  assert.deepEqual(zeroBasedTexts({ ghCloneRepo: { inputSchema: { properties: { responseOffset: { description: 'a zero-based page index' } } } } }), []);
  assert.deepEqual(zeroBasedTexts({ astRewrite: { inputSchema: { $defs: { AR_transform: { anyOf: [{}, {}, { properties: { substring: { properties: { startChar: { description: 'Inclusive zero-based start' } } } } }] } } } } }), []);
  assert.equal(zeroBasedTexts({ astRewrite: { inputSchema: { properties: { page: { description: 'zero-based page' } } } } }).length, 1);
  assert.deepEqual(zeroCoordinates({ results: [{ data: { matches: [{ line: 3, column: 0 }] } }] }), ['.results[0].data.matches[0].column=0']);
  assert.deepEqual(zeroCoordinates({ results: [{ data: { matches: [{ line: 3, column: 1 }] } }] }), []);
});

test('C4 no silent omission: unlistedNested without next fails; with next or terminalLimit passes', () => {
  assert.deepEqual(silentOmissions({ results: [{ data: { stats: { unlistedNested: 53 } } }] }), ['results[0].data.stats.unlistedNested=53']);
  assert.deepEqual(silentOmissions({ results: [{ data: { stats: { unlistedNested: 53 }, next: { nested: { tool: 'lspSearch', query: { queries: [{}] } } } } }] }), []);
  assert.deepEqual(silentOmissions({ results: [{ data: { stats: { skippedFiles: 2, terminalLimit: true } } }] }), []);
  assert.deepEqual(silentOmissions({ results: [{ data: { stats: { skippedFiles: 0 } } }] }), []);
});

test('C5 description lint: a <workflow> note naming a neighbor names one of its fields', async t => {
  const fields = tool => (tool === 'localFetch' ? new Set(['matchString']) : new Set());
  for (const [name, description, reasons] of [
    ['neighbor with its field passes', 'Find text. <workflow>hit → localFetch matchString</workflow>', []],
    ['terminal note naming no tool passes', 'Read lines. <workflow>cite lines by number</workflow>', []],
    ['missing note fails', 'Find text with localFetch matchString.', ['no <workflow> note']],
    ['neighbor without a field fails', 'Find text. <workflow>then localFetch</workflow>', ['names localFetch but none of its fields']],
    // Core's workflow grammar names what the source returns to carry over.
    ['neighbor with a carried output field passes', 'Find text. <workflow>hit commitSha → localFetch</workflow>', []],
    ['an output field outside the note does not count', 'Find text with commitSha. <workflow>then localFetch</workflow>', ['names localFetch but none of its fields']],
  ]) await t.test(name, () => assert.deepEqual(descriptionLint('localSearch', description, ['localSearch', 'localFetch'], fields, new Set(['commitSha'])), reasons));
});

test('C5 surface budget: total above SURFACE_BUDGET or a tool above its quota fails', async t => {
  for (const [name, perTool, instructions, options, failures] of [
    ['total at the budget passes', { a: SURFACE_BUDGET - 1 }, 1, {}, 0],
    ['total one byte over fails', { a: SURFACE_BUDGET }, 1, {}, 1],
    ['tool within its quota passes', { a: 400 }, 0, { quotas: { a: 400 } }, 0],
    ['tool over its quota fails', { a: 500 }, 0, { quotas: { a: 400 } }, 1],
  ]) await t.test(name, () => assert.equal(surfaceBudget(perTool, instructions, options).reasons.length, failures));
});
