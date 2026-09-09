/** Selected reasoning shares the existing observation column; no second store. */
export interface MemoryContent { text: string; area?: string; why?: string; constraint?: string }
const marker = 'awareness-file-context/v1';

export function encodeMemoryContent(content: MemoryContent): string {
  return content.area || content.why || content.constraint
    ? JSON.stringify({ $awareness: marker, ...content }) : content.text;
}

export function decodeMemoryContent(value: string): MemoryContent {
  if (value.startsWith('{"$awareness":"' + marker + '"')) {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (typeof parsed.text === 'string' && ['area', 'why', 'constraint'].every(key => parsed[key] === undefined || typeof parsed[key] === 'string')) {
        return { text: parsed.text, ...(parsed.area ? { area: String(parsed.area) } : {}),
          ...(parsed.why ? { why: String(parsed.why) } : {}), ...(parsed.constraint ? { constraint: String(parsed.constraint) } : {}) };
      }
    } catch { /* An ordinary observation may contain incomplete JSON. */ }
  }
  return { text: value };
}

export function renderMemoryContent(value: string): string {
  const content = decodeMemoryContent(value);
  return [content.text, content.area && `Area: ${content.area}`, content.why && `Why: ${content.why}`,
    content.constraint && `Constraint: ${content.constraint}`].filter(Boolean).join('\n');
}
