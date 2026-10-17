// Development packets, not a sealed evaluation set. Expected answers stay in the grader.
// A false support label means the supplied source does not establish the claim;
// it covers both contrary behavior and behavior delegated to an unknown function.

const judgments = [
  {
    family: 'queued-cancellation',
    compound: 'When cancel receives a queued request present in queue, it removes that request from queue and sets request.cancelled to true.',
    atoms: [
      {
        claim: 'When cancel receives a queued request present in queue, it removes that request from queue.',
        evidence: 'Check the queued branch for removal of the same request from the supplied queue.',
      },
      {
        claim: 'When cancel receives a queued request, it sets request.cancelled to true.',
        evidence: 'Check the queued branch for an assignment establishing the cancelled flag on that request.',
      },
    ],
    variants: [
      {
        id: 'cancel-flag-set', expected: [true, true],
        source: `function cancel(request, queue) {
  if (request.phase !== 'queued') return false;
  const position = queue.indexOf(request);
  if (position >= 0) queue.splice(position, 1);
  request.cancelled = true;
  return true;
}`,
      },
      {
        id: 'cancel-notification', expected: [true, false],
        source: `function cancel(request, queue, notify) {
  if (request.phase !== 'queued') return false;
  const position = queue.indexOf(request);
  if (position >= 0) queue.splice(position, 1);
  notify(request);
  return true;
}`,
      },
    ],
  },
  {
    family: 'ttl-boundaries',
    compound: 'For a finite numeric now timestamp, expiry returns now when ttl is zero and returns Infinity when ttl is null.',
    atoms: [
      {
        claim: 'For a finite numeric now timestamp, expiry returns now when ttl is zero.',
        evidence: 'Follow the branch taken by numeric zero and identify the returned expiry value.',
      },
      {
        claim: 'For a finite numeric now timestamp, expiry returns Infinity when ttl is null.',
        evidence: 'Follow the branch taken by null and identify the returned expiry value.',
      },
    ],
    variants: [
      {
        id: 'expiry-null-only', expected: [true, true],
        source: `function expiry(ttl, now) {
  if (ttl === null) return Infinity;
  return now + ttl;
}`,
      },
      {
        id: 'expiry-falsy', expected: [false, true],
        source: `function expiry(ttl, now) {
  if (!ttl) return Infinity;
  return now + ttl;
}`,
      },
    ],
  },
  {
    family: 'transaction-failure',
    compound: 'If write succeeds, commit throws, and rollback returns normally, save invokes rollback and rethrows the same error object that commit threw.',
    atoms: [
      {
        claim: 'If write succeeds and commit throws, save invokes rollback.',
        evidence: 'Trace the exception from commit into the handler and check for the rollback call.',
      },
      {
        claim: 'If write succeeds, commit throws, and rollback returns normally, save rethrows the same error object that commit threw.',
        evidence: 'Check how the handler exits after rollback and whether it preserves the caught error object.',
      },
    ],
    variants: [
      {
        id: 'save-rethrows', expected: [true, true],
        source: `function save(transaction, value) {
  try {
    transaction.write(value);
    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}`,
      },
      {
        id: 'save-returns', expected: [true, false],
        source: `function save(transaction, value) {
  try {
    transaction.write(value);
    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    return false;
  }
}`,
      },
    ],
  },
  {
    family: 'authorization-names',
    compound: 'mayRead returns true for a reader accessing a private record and returns true for a user without the reader role accessing a public record.',
    atoms: [
      {
        claim: 'mayRead returns true when user.roles contains reader and record.public is false.',
        evidence: 'Trace the reader-role boolean through the returned expression for a private record, regardless of variable names.',
      },
      {
        claim: 'mayRead returns true when user.roles does not contain reader and record.public is true.',
        evidence: 'Trace the public-record boolean through the returned expression for a user without the reader role.',
      },
    ],
    variants: [
      {
        id: 'access-role-or-public', expected: [true, true],
        source: `function mayRead(user, record) {
  const denyAccess = user.roles.includes('reader');
  const allowAccess = record.public;
  return denyAccess || allowAccess;
}`,
      },
      {
        id: 'access-role-only', expected: [true, false],
        source: `function mayRead(user, record) {
  const denyAccess = user.roles.includes('reader');
  const allowAccess = record.public;
  return denyAccess;
}`,
      },
    ],
  },
  {
    family: 'cache-expiration',
    compound: 'When an existing entry has expiresAt equal to now, readCache returns undefined and removes the entry from the cache.',
    atoms: [
      {
        claim: 'When an existing entry has expiresAt equal to now, readCache returns undefined.',
        evidence: 'Check which branch equality takes and what that branch returns.',
      },
      {
        claim: 'When an existing entry has expiresAt equal to now, readCache removes the entry from the cache.',
        evidence: 'Check whether the equality branch deletes the requested key before returning.',
      },
    ],
    variants: [
      {
        id: 'cache-delete-expired', expected: [true, true],
        source: `function readCache(cache, key, now) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}`,
      },
      {
        id: 'cache-retain-expired', expected: [true, false],
        source: `function readCache(cache, key, now) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) return undefined;
  return entry.value;
}`,
      },
    ],
  },
  {
    family: 'retry-indirection',
    compound: 'nextAction returns retry for a transient error when attempt is below limit and returns stop for a transient error when attempt equals limit.',
    atoms: [
      {
        claim: 'nextAction returns retry for a transient error when attempt is below limit.',
        evidence: 'Follow nextAction through the limit and transient-error helpers for an attempt below the limit.',
      },
      {
        claim: 'nextAction returns stop for a transient error when attempt equals limit.',
        evidence: 'Follow the equality case through the limit helper and then the selected nextAction branch.',
      },
    ],
    variants: [
      {
        id: 'retry-inclusive-limit', expected: [true, true],
        source: `function reachedLimit(attempt, limit) {
  return attempt >= limit;
}
function retryable(error) {
  return error.kind === 'transient';
}
function nextAction(error, attempt, limit) {
  if (reachedLimit(attempt, limit)) return 'stop';
  return retryable(error) ? 'retry' : 'stop';
}`,
      },
      {
        id: 'retry-exclusive-limit', expected: [true, false],
        source: `function reachedLimit(attempt, limit) {
  return attempt > limit;
}
function retryable(error) {
  return error.kind === 'transient';
}
function nextAction(error, attempt, limit) {
  if (reachedLimit(attempt, limit)) return 'stop';
  return retryable(error) ? 'retry' : 'stop';
}`,
      },
    ],
  },
];

export function judgmentCases() {
  return judgments.flatMap(({ family, compound, atoms, variants }) => variants.map(variant => ({
    id: variant.id,
    family,
    source: variant.source,
    compound,
    atoms: atoms.map(atom => ({ ...atom })),
    expected: [...variant.expected],
  })));
}

const retryTarget = 'Which error kinds and attempt limits permit a retry?';
const retryKnown = 'A retry is permitted exactly when the error kind is transient and attempt is below 3.';

const novelties = [
  {
    id: 'exact-repeat',
    source: `// A retry is permitted exactly when the error kind is transient and attempt is below 3.
function shouldRetry(error, attempt) {
  return error.kind === 'transient' && attempt < 3;
}`,
    target: retryTarget,
    known: retryKnown,
    expected: false,
  },
  {
    id: 'paraphrase',
    source: `function shouldRetry(error, attempt) {
  if (error.kind !== 'transient') return false;
  return 3 > attempt;
}`,
    target: retryTarget,
    known: retryKnown,
    expected: false,
  },
  {
    id: 'new-condition',
    source: `function shouldRetry(error, attempt, signal) {
  return !signal.aborted && error.kind === 'transient' && attempt < 3;
}`,
    target: 'Which conditions permit a retry?',
    known: retryKnown,
    expected: true,
  },
  {
    id: 'exception',
    source: `function expiration(createdAt, pinned) {
  if (pinned) return Infinity;
  return createdAt + 60000;
}`,
    target: 'When do cache entries expire?',
    known: 'Cache entries expire sixty seconds after insertion.',
    expected: true,
  },
  {
    id: 'contradiction',
    source: `function mayRead(matchingRules) {
  if (matchingRules.includes('allow')) return true;
  return !matchingRules.includes('deny');
}`,
    target: 'Which rule wins when matching rules include both allow and deny?',
    known: 'A matching deny rule overrides a matching allow rule.',
    expected: true,
  },
  {
    id: 'unrelated',
    source: `function formatTimestamp(milliseconds) {
  return new Date(milliseconds).toISOString();
}`,
    target: retryTarget,
    known: retryKnown,
    expected: false,
  },
  {
    id: 'new-fact',
    source: `function retryDelay(attempt) {
  return Math.min(1000 * 2 ** attempt, 30000);
}`,
    target: 'What conditions and timing govern retries?',
    known: retryKnown,
    expected: true,
  },
  {
    id: 'uncertain-snippet',
    source: `function shouldRetry(error, attempt, policy) {
  return policy.decide(error, attempt);
}`,
    target: retryTarget,
    known: retryKnown,
    expected: false,
  },
];

export function noveltyCases() {
  return novelties.map(item => ({ ...item }));
}
