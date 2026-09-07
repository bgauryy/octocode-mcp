import { describe, expect, it } from 'vitest';
import { renderDeveloperReviewDoc } from '../src/repo-docs.js';

describe('developer review document projection', () => {
  it('renders an actionable empty-state document', () => {
    const document = renderDeveloperReviewDoc([], 100);
    expect(document).toContain('Open: 0 · Resolved: 0');
    expect(document).toContain('No instruction feedback yet.');
    expect(document).toContain('reflect record --outcome partial');
  });

  it('separates open and resolved feedback and applies the projection cap', () => {
    const rows = [
      { id: 'open-1', state: 'recorded', source: 'reflection', agent_id: 'agent-a', feedback: 'Clarify the test command.', files: ['AGENTS.md'] },
      { id: 'done-1', state: 'done', source: 'reflection', agent_id: 'agent-b', feedback: 'Document the database scope.', files: [] },
    ];
    const document = renderDeveloperReviewDoc(rows, 100);
    expect(document).toContain('## Open (1)');
    expect(document).toContain('## Resolved (1)');
    expect(document).toContain('files: AGENTS.md');
    expect(renderDeveloperReviewDoc(rows, 12)).toContain('more omitted by projection cap');
  });
});
