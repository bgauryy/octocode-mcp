import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { questions, mergeRanges, classifyDecision, sourceCoverage, heldAnswers } from './jev_question_poc.mjs';
import { judgmentCases, noveltyCases } from '../jev-proposal-poc/question-cases.mjs';

test('question policies keep conditions and never send grading labels', () => {
  for (const item of judgmentCases()) {
    assert.deepEqual(Object.keys(questions(item, 'compound')), ['whole']);
    for (const style of ['atomic', 'atomic-evidence']) {
      const qs = Object.values(questions(item, style));
      assert.equal(qs.length, 2);
      assert.ok(qs.every(q => q.type === 'noul' && Object.keys(q).sort().join() === 'instructions,type'));
      assert.ok(qs.every((q, i) => q.instructions.startsWith(item.atoms[i].claim)));
    }
  }
});

test('held state answers read each provider Noul value by question key', () => {
  assert.deepEqual(heldAnswers([{json:{queries:[{answers:{q:{type:'noul',noul:0.9}}}]}}]), {q:0.9});
  assert.throws(() => heldAnswers([]));
  assert.throws(() => heldAnswers([{json:{queries:[{error:{errorCode:'classificationProviderError'}}]}}]));
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

test('source-window union keeps gaps', () => {
  assert.deepEqual(mergeRanges([[5, 8], [2, 3], [3, 6], [12, 13], [12, 13]]), [[2, 8], [12, 13]]);
  assert.throws(() => mergeRanges([[0, 3]]));
});

test('coverage requires both facts and matching source bytes, not echoed questions', () => {
  const item = {source:'alpha\nbeta\ngamma\n', atoms:[{gold:[1]},{gold:[3]}]};
  const response = content => ({json:{results:[{data:{content}}]}});
  assert.equal(sourceCoverage([response('1\talpha\n')], item).complete, false);
  assert.equal(sourceCoverage([response('1\talpha\n3\tgamma\n')], item).complete, true);
  assert.equal(sourceCoverage([response('1\talpha\n3\twrong\n')], item).corrupt, true);
  assert.equal(sourceCoverage([response('1\talpha\n1\talpha\n3\tgamma\n')], item).duplicateLines, 1);
});
