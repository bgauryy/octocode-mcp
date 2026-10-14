import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { questions, mergeRanges, classifyDecision, sourceCoverage, selectedRanges, heldAnswers } from './jev_question_poc.mjs';
import { judgmentCases, noveltyCases } from '../jev-proposal-poc/question-cases.mjs';

test('question policies keep conditions and never send grading labels', () => {
  for (const item of judgmentCases()) {
    assert.equal(questions(item, 'compound', 'supports').length, 1);
    for (const style of ['atomic', 'atomic-evidence']) {
      const qs = questions(item, style, 'supports');
      assert.equal(qs.length, 2);
      assert.ok(qs.every(q => !Object.hasOwn(q, 'expected')));
      assert.ok(qs.every((q, i) => typeof q.ask === 'string' && q.ask.startsWith(item.atoms[i].claim)));
    }
  }
});

test('held state answers use the compact resource answer shape', () => {
  assert.deepEqual(heldAnswers([{json:{queries:[{resources:[{answers:{q:0.9}}]}]}}]), {q:0.9});
  assert.throws(() => heldAnswers([]));
  assert.throws(() => heldAnswers([{json:{queries:[{resources:[{}]}]}}]));
});

test('the six paired support families match observable code behavior', () => {
  const checks = {
    'queued-cancellation': `(() => { const r = { phase:'queued', cancelled:false }; const queue=[r]; cancel(r,queue,()=>{}); return [!queue.includes(r),r.cancelled===true]; })()`,
    'ttl-boundaries': `[expiry(0,100)===100,expiry(null,100)===Infinity]`,
    'transaction-failure': `(() => { let rolled=false,caught; const original=new Error('commit'); try { save({write(){},commit(){throw original},rollback(){rolled=true}},1); } catch(e){caught=e} return [rolled,caught===original]; })()`,
    'authorization-names': `[mayRead({roles:['reader']},{public:false})===true,mayRead({roles:[]},{public:true})===true]`,
    'cache-expiration': `(() => { const c=new Map([['k',{expiresAt:100,value:1}]]); const value=readCache(c,'k',100); return [value===undefined,!c.has('k')]; })()`,
    'retry-indirection': `[nextAction({kind:'transient'},2,3)==='retry',nextAction({kind:'transient'},3,3)==='stop']`,
  };
  for (const item of judgmentCases()) assert.deepEqual(Array.from(vm.runInNewContext(item.source + '\n' + checks[item.family])), item.expected, item.id);
  for (const item of noveltyCases()) assert.doesNotThrow(() => new vm.Script(item.source));
});

test('unknown judgments never become a confident negative', () => {
  for (const values of [[], [undefined], [null], [NaN], [1.1], [0.9, null]]) assert.equal(classifyDecision(values), null);
  assert.equal(classifyDecision([0.99, 0.79]), false);
  assert.equal(classifyDecision([0.8, 1]), true);
});

test('source-window union keeps gaps and selects from model output only', () => {
  assert.deepEqual(mergeRanges([[5, 8], [2, 3], [3, 6], [12, 13], [12, 13]]), [[2, 8], [12, 13]]);
  assert.throws(() => mergeRanges([[0, 3]]));
  const outputs = [{json:{queries:[{best:{a:[{line:5,endLine:8,exists:0.99}],b:[{line:8,endLine:10,exists:0.8}],c:[{line:1,endLine:2,exists:0.7}]}}]}}];
  assert.deepEqual(selectedRanges(outputs, ['a', 'b', 'c']), [[5, 10]]);
});

test('coverage requires both facts and matching source bytes, not echoed questions', () => {
  const item = {source:'alpha\nbeta\ngamma\n', atoms:[{gold:[1]},{gold:[3]}]};
  const response = content => ({json:{results:[{data:{content}}]}});
  assert.equal(sourceCoverage([response('1\talpha\n')], item).complete, false);
  assert.equal(sourceCoverage([response('1\talpha\n3\tgamma\n')], item).complete, true);
  assert.equal(sourceCoverage([response('1\talpha\n3\twrong\n')], item).corrupt, true);
  assert.equal(sourceCoverage([response('1\talpha\n1\talpha\n3\tgamma\n')], item).duplicateLines, 1);
});
