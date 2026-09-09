import { z } from 'zod';

export const signalDataSchema = z.object({
  type: z.string().trim().min(1).max(100),
  payload: z.record(z.string(), z.json()),
}).strict();
export type SignalData = z.infer<typeof signalDataSchema>;

/** One wire format in the existing signal body; native inbox text uses this too. */
export function encodeSignalBody(body: string | null | undefined, data?: unknown): string | null {
  if (data === undefined) return body ?? null;
  let value = data;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw new Error('signal data must be a JSON object with type and payload'); }
  }
  const parsed = signalDataSchema.safeParse(value);
  if (!parsed.success) throw new Error('signal data requires a nonempty type and a JSON object payload');
  const encoded = JSON.stringify({ $awareness: 'signal/v1', body: body ?? null, data: parsed.data });
  if (Buffer.byteLength(encoded, 'utf8') > 4000) throw new Error('signal body and data must fit within 4000 bytes; send evidence pointers for larger content');
  return encoded;
}

/** Plain messages remain plain. Only an explicitly versioned envelope is decoded. */
export function decodeSignalBody(body: string | null): { body: string | null; data?: SignalData } {
  if (!body?.startsWith('{')) return { body };
  try {
    const value = JSON.parse(body);
    if (value?.$awareness !== 'signal/v1' || !(value.body === null || typeof value.body === 'string')) return { body };
    const parsed = signalDataSchema.safeParse(value.data);
    if (parsed.success) return { body: value.body, data: parsed.data };
  } catch { /* Unstructured text, including malformed JSON, is preserved. */ }
  return { body };
}
