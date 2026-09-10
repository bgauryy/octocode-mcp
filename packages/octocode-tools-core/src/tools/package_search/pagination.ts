import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  ArtifactQuery,
  ArtifactProviderState,
  ArtifactProviderResult,
} from '../../utils/artifact/types.js';

export type ArtifactPageQuery = ArtifactQuery & {
  cursor?: string;
  registry?: string;
};
type PageLoader = (
  query: ArtifactPageQuery,
  state: ArtifactProviderState
) => Promise<ArtifactProviderResult & { registry?: string }>;

const cursorSchema = z.strictObject({
  v: z.literal(1),
  query: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.strictObject({
    offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    page: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
    token: z.string().max(8192).optional(),
  }),
  skip: z.number().int().min(0).max(1000),
  pageHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
type Cursor = z.infer<typeof cursorSchema>;
const digest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const queryDigest = (query: ArtifactPageQuery): string =>
  digest([
    query.type,
    query.packageName ?? null,
    query.keywords ?? null,
    query.pageSize ?? 10,
    query.registry ?? null,
  ]);

export class ArtifactCursorError extends Error {
  readonly code = 'invalid_cursor';
  constructor(
    message = 'Invalid artifact cursor. Restart the query without cursor.'
  ) {
    super(message);
  }
}

function decodeCursor(query: ArtifactPageQuery): Cursor {
  if (!query.cursor)
    return { v: 1, query: queryDigest(query), state: {}, skip: 0 };
  try {
    if (query.cursor.length > 16384 || !/^[A-Za-z0-9_-]+$/.test(query.cursor))
      throw new Error();
    const cursor = cursorSchema.parse(
      JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'))
    );
    if (
      cursor.query !== queryDigest(query) ||
      (cursor.skip > 0 && !cursor.pageHash)
    )
      throw new Error();
    const positionField = ['npm', 'maven', 'nuget'].includes(query.type)
      ? 'offset'
      : query.type === 'go'
        ? 'token'
        : 'page';
    if (
      Object.keys(cursor.state).some(key => key !== positionField) ||
      (Object.keys(cursor.state).length === 0 && cursor.skip === 0) ||
      cursor.state.token === ''
    )
      throw new Error();
    return cursor;
  } catch {
    throw new ArtifactCursorError();
  }
}

/** Cursors contain provider position only, never credentials or arbitrary request URLs.
 * Replayed partial native pages must match their original content before slicing.
 * Tokens are deterministic so response-character pagination can replay the same result.
 */
export async function paginateArtifacts(
  query: ArtifactPageQuery,
  load: PageLoader
) {
  const cursor = decodeCursor(query);
  const page = await load(query, cursor.state);
  if (cursor.pageHash && cursor.pageHash !== digest(page.artifacts)) {
    throw new ArtifactCursorError(
      'The registry page changed or expired. Restart the query without cursor.'
    );
  }
  if (cursor.skip > page.artifacts.length) throw new ArtifactCursorError();
  const size = query.keywords ? (query.pageSize ?? 10) : 1;
  const artifacts = page.artifacts.slice(cursor.skip, cursor.skip + size);
  const consumed = cursor.skip + artifacts.length;
  const overflow = consumed < page.artifacts.length;
  const stalled =
    !overflow &&
    page.nextState !== undefined &&
    digest(page.nextState) === digest(cursor.state);
  const nextState = overflow
    ? cursor.state
    : stalled
      ? undefined
      : page.nextState;
  const terminalLimit = stalled
    ? { reason: 'The registry returned a continuation that does not advance.' }
    : !overflow
      ? page.terminalLimit
      : undefined;
  const hasMore = overflow || Boolean(nextState) || Boolean(terminalLimit);
  const { cursor: _cursor, ...original } = query;
  const cleanQuery: ArtifactPageQuery = {
    type: original.type,
    ...(original.packageName ? { packageName: original.packageName } : {}),
    ...(original.keywords
      ? { keywords: original.keywords, pageSize: size }
      : {}),
    ...((page.registry ?? original.registry)
      ? { registry: page.registry ?? original.registry }
      : {}),
  };
  const continuation = nextState
    ? {
        tool: 'artifactSearch' as const,
        query: {
          ...cleanQuery,
          cursor: Buffer.from(
            JSON.stringify({
              v: 1,
              query: queryDigest(cleanQuery),
              state: nextState,
              skip: overflow ? consumed : 0,
              ...(overflow ? { pageHash: digest(page.artifacts) } : {}),
            } satisfies Cursor)
          ).toString('base64url'),
        },
        confidence: 'exact' as const,
      }
    : undefined;
  return {
    artifacts,
    pagination: {
      perPage: size,
      returned: artifacts.length,
      hasMore,
      ...(page.total !== undefined ? { totalFound: page.total } : {}),
      ...(terminalLimit ? { continuationUnavailable: terminalLimit } : {}),
    },
    ...(terminalLimit ? { terminalLimit: true } : {}),
    ...(continuation ? { next: { nextPage: continuation } } : {}),
  };
}
