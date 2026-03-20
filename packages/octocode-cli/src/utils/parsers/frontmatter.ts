interface SkillFrontmatter {
  name?: string;
  description?: string;
  category?: string;
}

export function parseSkillFrontmatter(
  content: string
): SkillFrontmatter | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fm = match[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);
  const catMatch = fm.match(/^category:\s*(.+)$/m);

  return {
    name: nameMatch?.[1].trim(),
    description: descMatch?.[1].trim(),
    category: catMatch?.[1].trim(),
  };
}
