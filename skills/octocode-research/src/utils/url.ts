export function extractToolName(path: string): string {
  // Handle /tools/call/:toolName format
  const toolCallMatch = path.match(/^\/tools\/call\/(\w+)$/);
  if (toolCallMatch) {
    return toolCallMatch[1];
  }

  // Fallback: extract from path segments
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 2) {
    // e.g., /tools/list -> toolsList (camelCase)
    // or just return the second part if it looks like a tool name
    // But typically we want the tool name if it's in the URL
    if (parts[0] === 'tools' && parts[1] === 'call' && parts[2]) {
        return parts[2];
    }
    return parts[0] + parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  }
  return parts.join('/') || 'unknown';
}
