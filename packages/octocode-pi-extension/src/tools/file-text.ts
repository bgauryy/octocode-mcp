/** UTF-8 input validation and byte-preserving text-edit views. */
export function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function assertWellFormedText(text: string, field: string): void {
  if (/[\uD800-\uDFFF]/u.test(text)) throw new Error(`${field} must be well-formed Unicode; unpaired surrogates cannot be written as UTF-8.`);
}

export function restoreEditedText(text: string, changes: ReadonlyArray<{ start: number; end: number; newText: string }>): string {
  const removedCR: number[] = [];
  for (const match of text.matchAll(/\r\n/g)) removedCR.push(match.index - removedCR.length);
  const originalOffset = (offset: number): number => {
    let lo = 0, hi = removedCR.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (removedCR[mid]! < offset) lo = mid + 1;
      else hi = mid;
    }
    return offset + lo;
  };
  let output = text;
  for (const change of [...changes].reverse()) {
    const start = originalOffset(change.start), end = originalOffset(change.end);
    const ending = text.slice(start, end).match(/\r\n|\r|\n/)?.[0]
      ?? text.slice(start).match(/\r\n|\r|\n/)?.[0]
      ?? text.match(/\r\n|\r|\n/)?.[0] ?? '\n';
    output = output.slice(0, start) + change.newText.replace(/\n/g, ending) + output.slice(end);
  }
  return output;
}
