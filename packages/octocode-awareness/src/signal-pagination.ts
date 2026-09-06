/** Stable keyset pagination: read receipts may change between pages, row positions may not. */
export interface SignalCursor { createdAt: string; signalId: string }

export function decodeSignalCursor(value?: string): SignalCursor | undefined {
  if (value === undefined) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]{1,1024}$/.test(value)) throw new Error('invalid encoding');
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2 ||
      typeof parsed[0] !== 'string' || !parsed[0] || parsed[0].length > 64 ||
      typeof parsed[1] !== 'string' || !parsed[1] || parsed[1].length > 128) throw new Error('invalid key');
    return { createdAt: parsed[0], signalId: parsed[1] };
  } catch {
    throw new Error('Invalid signal cursor; use the cursor from the preceding page.');
  }
}

export function encodeSignalCursor(createdAt: string, signalId: string): string {
  return Buffer.from(JSON.stringify([createdAt, signalId])).toString('base64url');
}
