/**
 * Maps ripgrep file types to glob patterns for grep --include
 * Used by GrepCommandBuilder and potentially other tools
 */
export const TYPE_TO_EXTENSIONS: Record<string, string[]> = {
  ts: ['ts', 'tsx'],
  js: ['js', 'jsx', 'mjs', 'cjs'],
  py: ['py', 'pyi'],
  rust: ['rs'],
  go: ['go'],
  java: ['java'],
  cpp: ['cpp', 'cc', 'cxx', 'hpp', 'h'],
  c: ['c', 'h'],
  css: ['css', 'scss', 'sass', 'less'],
  html: ['html', 'htm'],
  json: ['json'],
  yaml: ['yaml', 'yml'],
  md: ['md', 'markdown'],
  xml: ['xml'],
  sh: ['sh', 'bash', 'zsh'],
  rb: ['rb'],
  php: ['php'],
  swift: ['swift'],
  kt: ['kt', 'kts'],
  scala: ['scala'],
  sql: ['sql'],
  vim: ['vim'],
  lua: ['lua'],
  r: ['r', 'R'],
  dockerfile: ['Dockerfile'],
  make: ['Makefile', 'makefile', 'mk'],
};
