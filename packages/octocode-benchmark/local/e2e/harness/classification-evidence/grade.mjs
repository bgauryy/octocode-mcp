// An unanswered relation stays in the denominator; confidence is not correctness.
export function gradeRelations(expected, answers) {
  const claims = Object.entries(expected).map(([id, present]) => {
    const answer = answers?.[id];
    const choice = answer?.choice;
    const observed = choice === 'yes' ? true : choice === 'no' ? false : null;
    return {
      id, expected: present, observed,
      status: observed === null ? 'unknown' : observed === present ? 'correct' : 'incorrect',
      answer: answer ?? null,
    };
  });
  return {
    total: claims.length,
    correct: claims.filter(c => c.status === 'correct').length,
    incorrect: claims.filter(c => c.status === 'incorrect').length,
    unknown: claims.filter(c => c.status === 'unknown').length,
    claims,
  };
}
