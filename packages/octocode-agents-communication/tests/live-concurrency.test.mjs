import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeConcurrentWave, liveConcurrency } from '../src/live-concurrency.mjs';

const state = {
  sender: 'controller',
  requests: [{ id: 1, recipient: 'pi', expected: '15' }, { id: 2, recipient: 'codex', expected: '20' }],
  messages: [
    { id: 1, sender: 'controller', target: 'pi', body: '7+8', replyTo: null },
    { id: 2, sender: 'controller', target: 'codex', body: '11+9', replyTo: null },
    { id: 3, sender: 'pi', target: 'controller', body: '15', replyTo: 1 },
    { id: 4, sender: 'codex', target: 'controller', body: '20', replyTo: 2 },
  ],
  deliveries: [{ message: 1, recipient: 'pi', acknowledgedAt: 10 }, { message: 2, recipient: 'codex', acknowledgedAt: 20 }],
  dispatches: [{ message: 1, recipient: 'pi', state: 'submitted', submittedAt: 5 }, { message: 2, recipient: 'codex', state: 'submitted', submittedAt: 15 }],
};

test('concurrent grading requires exact, correlated, acknowledged native submissions', () => {
  assert.equal(gradeConcurrentWave(state).passed, true);
  for (const invalid of [
    { ...state, messages: state.messages.filter(message => message.id !== 4) },
    { ...state, messages: state.messages.map(message => message.id === 4 ? { ...message, body: '21' } : message) },
    { ...state, messages: state.messages.map(message => message.id === 4 ? { ...message, sender: 'claude' } : message) },
    { ...state, messages: state.messages.map(message => message.id === 4 ? { ...message, target: 'other' } : message) },
    { ...state, messages: [...state.messages, { ...state.messages[3], id: 5 }] },
    { ...state, messages: [...state.messages, { id: 6, sender: 'pi', target: 'codex', replyTo: null, body: 'unexpected' }] },
    { ...state, deliveries: state.deliveries.map(delivery => ({ ...delivery, acknowledgedAt: null })) },
    { ...state, dispatches: state.dispatches.map(dispatch => ({ ...dispatch, state: 'uncertain' })) },
  ]) assert.equal(gradeConcurrentWave(invalid).passed, false);
});

test('importing or calling the live harness cannot launch paid work without opt-in and valid configuration', async () => {
  await assert.rejects(liveConcurrency({}), /require --live/);
  await assert.rejects(liveConcurrency({ live: true, models: { pi: 'model' } }), /explicit/);
  const models = { pi: 'model', claude: 'model', codex: 'model' };
  await assert.rejects(liveConcurrency({ live: true, models, waves: 1 }), /waves/);
  await assert.rejects(liveConcurrency({ live: true, models, idleMs: 1 }), /presence interval/);
  await assert.rejects(liveConcurrency({ live: true, models, durationMs: 1000 }), /cover idle intervals/);
});
