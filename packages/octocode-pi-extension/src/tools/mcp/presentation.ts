import { isPlainRecord } from './config.js';
import type { McpSchemaValidationError } from './schema-validator.js';

export function summarizeSchema(tool: Record<string, unknown>): string {
  const schema = tool["inputSchema"];
  if (!isPlainRecord(schema)) return "";
  const required = Array.isArray(schema["required"])
    ? schema["required"].map(String).filter(Boolean)
    : [];
  const properties = isPlainRecord(schema["properties"])
    ? Object.keys(schema["properties"])
    : [];
  const fields = required.length > 0 ? required : properties;
  return fields.length > 0
    ? ` schema: ${fields.slice(0, 8).join(", ")}${fields.length > 8 ? ", …" : ""}`
    : " schema: object";
}

export function formatMcpSchemaValidationErrors(errors: McpSchemaValidationError[], _target: { server: string; tool: string }): string {
  const seen = new Set<string>();
  const lines = errors.flatMap((error) => {
    const message = /schema is false|expected never/i.test(error.message)
      ? 'field is not allowed for the selected operation'
      : error.message;
    const line = `- ${error.instancePath || "/"}: ${message}`;
    if (seen.has(line)) return [];
    seen.add(line);
    return [line];
  });
  return lines.join("\n");
}
