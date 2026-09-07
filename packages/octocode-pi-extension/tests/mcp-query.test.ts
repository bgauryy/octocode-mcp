import assert from "node:assert/strict";
import { test } from "vitest";
import { collectMcpPages } from "../src/tools/mcp/pagination.js";

test("MCP pagination follows every cursor without dropping page-one or later items", async () => {
  const requested: Array<string | undefined> = [];
  const items = await collectMcpPages<{ name: string }>(
    "tools/list",
    async (cursor) => {
      requested.push(cursor);
      if (!cursor) return { tools: [{ name: "first" }], nextCursor: "page-2" };
      if (cursor === "page-2")
        return { tools: [{ name: "second" }], nextCursor: "page-3" };
      return { tools: [{ name: "third" }] };
    },
    (page) => (page as { tools: Array<{ name: string }> }).tools,
  );
  assert.deepEqual(requested, [undefined, "page-2", "page-3"]);
  assert.deepEqual(
    items.map((item) => item.name),
    ["first", "second", "third"],
  );
});

test("MCP pagination rejects a repeated cursor instead of looping forever", async () => {
  await assert.rejects(
    () =>
      collectMcpPages(
        "resources/list",
        async () => ({ resources: [], nextCursor: "same" }),
        (page) => (page as { resources: unknown[] }).resources,
      ),
    /repeated cursor same/,
  );
});
