// Development fixtures. Gold line IDs stay in the evaluator, never in JEV questions.
const scenarios = [
  { id: 'queued-cancel', goal: 'What happens to reserved capacity when a queued request is cancelled before execution, including the condition that permits release?',
    evidence: { 42: 'if (request.phase === "queued" && !request.started) {', 43: '  queue.remove(request); capacity.release(request.reservation);' }, gold: [42, 43],
    distractors: { 4: 'if (request.phase === "running") cancelExecution(request); // releases when execution finishes' } },
  { id: 'expiry', goal: 'How do null and zero TTL differ when calculating when an entry expires?',
    evidence: { 65: 'if (ttl === null) return NEVER_EXPIRES;', 66: 'if (ttl === 0) return now; // zero expires immediately' }, gold: [65, 66],
    distractors: { 8: 'const defaultTtl = 300; // used only when the caller omits the field' } },
  { id: 'transaction', goal: 'What happens when commit fails after a write, and is the original error propagated?',
    evidence: { 21: 'try { transaction.write(value); transaction.commit(); }', 22: 'catch (error) { transaction.rollback(); throw error; }' }, gold: [21, 22],
    distractors: { 5: 'function saveDraft(value) { draft.write(value); return { saved: true }; }' } },
  { id: 'authorization', goal: 'When a user has both a matching allow and explicit deny, which rule wins?',
    evidence: { 68: 'if (rules.some(rule => rule.matches(user) && rule.effect === "deny")) return false;',
      69: 'return rules.some(rule => rule.matches(user) && rule.effect === "allow");' }, gold: [68, 69],
    distractors: { 7: 'function allowPreview(user) { return Boolean(user.previewToken); } // separate preview endpoint' } },
  { id: 'unicode', goal: 'Which condition prevents releasing a lease when a worker disconnects?', unicode: true,
    evidence: { 42: 'if (lease.hasOutstandingWrites()) return; // keep the lease until writes finish',
      43: 'lease.release(); // called after the disconnect handler checks outstanding writes' }, gold: [42, 43],
    distractors: { 3: 'function closeDisplay() { panel.disconnect(); } // affects only the status display' } },
  { id: 'absent', goal: 'What encryption algorithm is used for stored payloads?', evidence: {}, gold: [],
    distractors: { 18: 'function store(payload) { return database.put(payload); } // storage implementation is external' } },
];

export function cases() {
  return scenarios.map(item => {
    const lines = Array.from({ length: 84 }, (_, i) => {
      const content = item.evidence[i + 1] ?? item.distractors[i + 1]
        ?? (item.unicode ? `// 状態表示と監視の記録 ${i + 1}。画面の更新だけを扱う。` : `// Display record ${i + 1}: update the status panel; unrelated to resource lifecycle decisions.`);
      if (Array.from(content).length > 95) throw new Error(`Fixture line too long: ${item.id}`);
      return content + ' '.repeat(95 - Array.from(content).length) + '\n';
    });
    return { id: item.id, goal: item.goal, gold: item.gold, source: lines.join('') };
  });
}
