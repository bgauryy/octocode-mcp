/**
 * Terminal hyperlink support using OSC 8 escape sequences
 *
 * Supported terminals: iTerm2, Hyper, WezTerm, Windows Terminal, Kitty, VS Code
 * @see https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda
 */

/**
 * Detect if the current terminal supports OSC 8 hyperlinks
 */
export function supportsHyperlinks(): boolean {
  // Skip in non-TTY environments (e.g., piped output, CI)
  if (!process.stdout.isTTY) {
    return false;
  }

  const term = process.env.TERM_PROGRAM;
  const termEnv = process.env.TERM;

  // Known supporting terminals
  const supportingTerminals = [
    'iTerm.app',
    'Hyper',
    'WezTerm',
    'vscode',
    'Kitty',
    'Alacritty',
    'Tabby',
  ];

  if (term && supportingTerminals.includes(term)) {
    return true;
  }

  // Windows Terminal
  if (process.env.WT_SESSION) {
    return true;
  }

  // GNOME Terminal and other VTE-based terminals (version 0.50+)
  if (process.env.VTE_VERSION) {
    const version = parseInt(process.env.VTE_VERSION, 10);
    if (version >= 5000) {
      return true;
    }
  }

  // Some terminals set TERM to xterm-256color but support hyperlinks
  // Check for common patterns
  if (termEnv?.includes('kitty') || termEnv?.includes('alacritty')) {
    return true;
  }

  return false;
}

/**
 * Create a clickable hyperlink for terminals that support OSC 8
 *
 * @param url - The URL to link to
 * @param text - The display text (defaults to URL if not provided)
 * @returns The hyperlink string, or just the display text if unsupported
 */
export function makeHyperlink(url: string, text?: string): string {
  const displayText = text ?? url;

  if (!supportsHyperlinks()) {
    return displayText;
  }

  // OSC 8 format: \x1B]8;;URL\x07TEXT\x1B]8;;\x07
  // \x1B]8;; starts the hyperlink with params (empty here)
  // URL is the target
  // \x07 is the bell character (terminator)
  // TEXT is what's displayed
  // \x1B]8;;\x07 ends the hyperlink
  return `\x1B]8;;${url}\x07${displayText}\x1B]8;;\x07`;
}

/**
 * Create a clickable file:// link
 *
 * @param path - The file path (absolute or relative)
 * @param text - The display text (defaults to path if not provided)
 * @returns The hyperlink string
 */
export function fileLink(path: string, text?: string): string {
  // Ensure absolute path for file:// URLs
  const absolutePath = path.startsWith('/') ? path : `${process.cwd()}/${path}`;

  const fileUrl = `file://${absolutePath}`;
  return makeHyperlink(fileUrl, text ?? path);
}

/**
 * Create a clickable GitHub repository/file link
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param path - Optional file path within the repo
 * @param branch - Optional branch (defaults to 'main')
 * @returns The hyperlink string
 */
export function githubLink(
  owner: string,
  repo: string,
  path?: string,
  branch: string = 'main'
): string {
  let url = `https://github.com/${owner}/${repo}`;
  let displayText = `${owner}/${repo}`;

  if (path) {
    url += `/blob/${branch}/${path}`;
    displayText = path;
  }

  return makeHyperlink(url, displayText);
}

/**
 * Create a clickable GitHub issue/PR link
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param number - Issue or PR number
 * @param type - 'issue' or 'pull'
 * @returns The hyperlink string
 */
export function githubIssueLink(
  owner: string,
  repo: string,
  number: number,
  type: 'issue' | 'pull' = 'issue'
): string {
  const url = `https://github.com/${owner}/${repo}/${type === 'pull' ? 'pull' : 'issues'}/${number}`;
  const displayText = `#${number}`;

  return makeHyperlink(url, displayText);
}

/**
 * Create a clickable URL with automatic display text
 *
 * @param url - The URL to link to
 * @returns The hyperlink string with shortened display text
 */
export function urlLink(url: string): string {
  try {
    const parsed = new URL(url);
    // Show hostname + truncated path for readability
    let displayText = parsed.hostname;
    if (parsed.pathname && parsed.pathname !== '/') {
      const path = parsed.pathname;
      displayText += path.length > 30 ? path.slice(0, 30) + '...' : path;
    }
    return makeHyperlink(url, displayText);
  } catch {
    // Invalid URL, return as-is
    return url;
  }
}
