import fs from 'node:fs';
import { assertPathAllowed } from './path-guard.js';
import { resolveFilePath } from './file-state.js';

export const MEDIA_OPERATIONS = ['image', 'pdf', 'gif', 'trim', 'audio', 'convert', 'concat'] as const;
export type MediaOperation = (typeof MEDIA_OPERATIONS)[number];

/** Validate declared inputs without creating directories or invoking renderers. */
export function preflightMediaOperation(query: Record<string, unknown>, cwd: string): void {
  const type = query['type'] as MediaOperation;
  if (!MEDIA_OPERATIONS.includes(type)) throw new Error(`media: \`type\` must be one of ${MEDIA_OPERATIONS.join(', ')}`);
  const text = (key: string) => typeof query[key] === 'string' && (query[key] as string).trim().length > 0;
  if (type === 'image') {
    if (!text('svg') && !text('html')) throw new Error('media: type=image needs `svg` or `html`.');
    if (text('svg') && text('html')) throw new Error('media: provide only one of `svg` or `html`.');
  } else if (type === 'pdf') {
    const count = [text('html'), text('markdown'), Array.isArray(query['images']) && query['images'].length > 0].filter(Boolean).length;
    if (!count) throw new Error('media: type=pdf needs `html`, `markdown`, or `images`.');
    if (count > 1) throw new Error('media: provide only one PDF source (`html` OR `markdown` OR `images`).');
  } else if (type === 'concat') {
    if (!Array.isArray(query['sources']) || query['sources'].length < 2) throw new Error('media concat: `sources` must have at least 2 entries.');
  } else if (!text('source')) throw new Error(`media: type=${type} requires source.`);

  for (const key of ['images', 'sources']) {
    if (query[key] === undefined) continue;
    if (!Array.isArray(query[key]) || query[key].some(item => typeof item !== 'string' || !item.trim())) throw new Error(`media: ${key} must contain non-empty paths.`);
    for (const input of query[key] as string[]) assertPathAllowed(resolveFilePath(input, cwd), cwd, 'media');
  }
  if (text('source')) assertPathAllowed(resolveFilePath(query['source'] as string, cwd), cwd, 'media');
  if (type !== 'image' || query['dest'] !== undefined) {
    if (!text('dest')) throw new Error('media: this operation requires `dest`.');
    const dest = resolveFilePath((query['dest'] as string).trim(), cwd);
    assertPathAllowed(dest, cwd, 'media');
    if (fs.existsSync(dest) && query['overwrite'] !== true) throw new Error(`media: \`dest\` exists; set overwrite:true — ${query['dest']}`);
  }
}
