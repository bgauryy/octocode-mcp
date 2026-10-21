import assert from 'node:assert/strict';
import test from 'node:test';
import { gradeRelations } from '../local/e2e/harness/classification-evidence/grade.mjs';

const oracle = Object.freeze({ 'A->B': true, 'B->C': true, 'A->C': false, 'B->A': false });

test('directed image relations do not become transitive or symmetric', () => {
  const result = gradeRelations(oracle, {
    'A->B': { choice: 'yes' }, 'B->C': { choice: 'yes' },
    'A->C': { choice: 'yes', confidence: 1 }, 'B->A': { choice: 'yes', confidence: 1 },
  });
  assert.equal(result.total, 4);
  assert.equal(result.correct, 2);
  assert.equal(result.incorrect, 2);
});

test('false negatives, unknown and missing answers remain in the denominator', () => {
  const result = gradeRelations(oracle, {
    'A->B': { choice: 'no', confidence: 1 }, 'B->C': { choice: 'unknown' },
    'A->C': { choice: 'no' },
  });
  assert.deepEqual([result.total, result.correct, result.incorrect, result.unknown], [4, 1, 1, 2]);
});

test('valid transport or probabilities alone earn no relationship credit', () => {
  const result = gradeRelations(oracle, {
    'A->B': { status: 200 }, 'B->C': { probabilities: { yes: 1 } },
    'A->C': { choice: 'maybe' },
  });
  assert.equal(result.correct, 0);
  assert.equal(result.unknown, 4);
});
