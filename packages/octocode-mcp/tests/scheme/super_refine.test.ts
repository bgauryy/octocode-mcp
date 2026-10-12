import { describe, expect, it } from 'vitest';
import {
  FileContentQuerySchema,
  LocalFetchContentQuerySchema,
  LocalSearchQuerySchema,
} from '@octocodeai/config/schema';

const brief = { mainGoal: 'test goal', reasoning: 'exercise the schema' };
const messagesOf = (result: {
  error?: { issues: { message: string }[] };
}): string => (result.error?.issues ?? []).map(i => i.message).join('\n');

// localFetch and ghGetFileContent share the three read modes (fullContent,
// matchString, ranges): every case runs against both schemas.
describe.each([
  {
    tool: 'localFetch',
    schema: LocalFetchContentQuerySchema,
    target: { path: 'src/foo.ts' },
  },
  {
    tool: 'ghGetFileContent',
    schema: FileContentQuerySchema,
    target: { owner: 'o', repo: 'r', path: 'src/foo.ts' },
  },
])('$tool read-mode mutual exclusion', ({ schema, target }) => {
  const parse = (fields: Record<string, unknown>) =>
    schema.safeParse({ ...brief, ...target, ...fields });

  it.each([
    { mode: 'matchString', fields: { matchString: 'foo' } },
    { mode: 'ranges', fields: { ranges: ['10-20'] } },
  ])(
    'rejects fullContent=true with $mode in one short message naming fullContent',
    ({ fields }) => {
      const result = parse({ fullContent: true, ...fields });
      expect(result.success).toBe(false);
      const messages = messagesOf(result);
      expect(messages).toContain('fullContent');
      expect(messages.length).toBeLessThanOrEqual(90);
    }
  );

  it.each([
    {
      mode: 'matchString inside ranges (a region grep)',
      fields: { matchString: 'foo', ranges: ['10-20'] },
    },
    { mode: 'fullContent=true alone', fields: { fullContent: true } },
    { mode: 'matchString alone', fields: { matchString: 'foo' } },
    { mode: 'ranges alone', fields: { ranges: ['10-20'] } },
    {
      mode: 'fullContent=false with matchString',
      fields: { fullContent: false, matchString: 'foo' },
    },
    {
      mode: 'an inverted range as the same span',
      fields: { ranges: ['20-10'] },
    },
  ])('accepts $mode', ({ fields }) => {
    expect(parse(fields).success).toBe(true);
  });
});

describe('LocalSearchQuerySchema enum contract', () => {
  const parse = (fields: Record<string, unknown>) =>
    LocalSearchQuerySchema.safeParse({
      ...brief,
      matchString: 'foo',
      path: '/repo',
      ...fields,
    });

  it.each([
    'paginated',
    'files',
    'filesWithout',
    'countLines',
    'countMatches',
    'matchOnly',
  ])('accepts resultView %s', resultView => {
    expect(parse({ resultView }).success).toBe(true);
  });

  it('rejects the removed "content" view: "paginated" is the one name', () => {
    expect(parse({ resultView: 'content' }).success).toBe(false);
  });

  it.each(['rust', 'literal', 'pcre2'])('accepts regex %s', regex => {
    expect(parse({ regex }).success).toBe(true);
  });

  it('rejects unique without resultView:"matchOnly" and names the requirement', () => {
    const result = parse({ unique: 'list' });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toMatch(/requires? resultView:"matchOnly"/);
  });

  it('accepts unique:"count" with resultView:"matchOnly"', () => {
    expect(parse({ resultView: 'matchOnly', unique: 'count' }).success).toBe(
      true
    );
  });
});
