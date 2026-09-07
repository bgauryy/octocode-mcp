export const MAX_MCP_PAGES = 100;
export const MAX_MCP_PAGE_ITEMS = 10_000;

export interface McpCursorPage {
  nextCursor?: string;
}

export async function collectMcpPages<T>(
  label: string,
  fetchPage: (cursor: string | undefined) => Promise<McpCursorPage>,
  readItems: (page: McpCursorPage) => T[],
): Promise<T[]> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  for (let pageNumber = 1; pageNumber <= MAX_MCP_PAGES; pageNumber += 1) {
    const page = await fetchPage(cursor);
    const pageItems = readItems(page);
    if (!Array.isArray(pageItems))
      throw new Error(`${label} returned a non-array page`);
    if (items.length + pageItems.length > MAX_MCP_PAGE_ITEMS) {
      throw new Error(
        `${label} exceeded the ${MAX_MCP_PAGE_ITEMS}-item safety limit`,
      );
    }
    items.push(...pageItems);
    const nextCursor =
      typeof page.nextCursor === "string" && page.nextCursor.length > 0
        ? page.nextCursor
        : undefined;
    if (!nextCursor) return items;
    if (seenCursors.has(nextCursor))
      throw new Error(`${label} repeated cursor ${nextCursor}`);
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  throw new Error(`${label} exceeded the ${MAX_MCP_PAGES}-page safety limit`);
}
