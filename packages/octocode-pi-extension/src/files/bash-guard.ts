import os from 'node:os';
import path from 'node:path';
import type { ToolCallEvent, ToolCallEventResult } from '@earendil-works/pi-coding-agent';

/** Commands that only run the rest of the line (after their own options and leading operands) as another command. */
const WRAPPERS = new Set(['sudo', 'doas', 'command', 'exec', 'nohup', 'time', 'env', 'xargs', 'timeout', 'nice', 'ionice', 'stdbuf', 'caffeinate', 'chrt', 'taskset']);
/** Wrapper options that take the next word as their value (`sudo -u root rm …`: `root` is not the command). */
const OPTION_ARGS: Record<string, ReadonlySet<string>> = {
  sudo: new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-r', '-T', '-t', '-U', '--user', '--group', '--host', '--prompt', '--close-from', '--chdir', '--chroot', '--role', '--type', '--command-timeout', '--other-user']),
  doas: new Set(['-u', '-C']),
  env: new Set(['-u', '--unset', '-C', '--chdir']),
  xargs: new Set(['-I', '-J', '-L', '-n', '-P', '-s', '-d', '-E', '-a', '-R', '-S', '--max-args', '--max-lines', '--max-procs', '--max-chars', '--delimiter', '--eof', '--arg-file', '--replace', '--process-slot-var']),
  timeout: new Set(['-k', '-s', '--kill-after', '--signal']),
  nice: new Set(['-n', '--adjustment']),
  ionice: new Set(['-c', '-n', '-p', '-P', '-u', '--class', '--classdata', '--pid', '--pgid', '--uid']),
  stdbuf: new Set(['-i', '-o', '-e', '--input', '--output', '--error']),
  caffeinate: new Set(['-t', '-w']),
  chrt: new Set(['-T', '-P', '-D', '--sched-runtime', '--sched-period', '--sched-deadline']),
};
/** Operands a wrapper takes before the command it runs (`timeout 5 rm …`, `chrt 10 rm …`, `taskset 0x3 rm …`). */
const LEADING_OPERANDS: Record<string, number> = { timeout: 1, chrt: 1, taskset: 1 };
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const SYSTEM = /^(?:mkfs(?:\.[a-z0-9]+)?|newfs(?:_[a-z0-9]+)?|shutdown|reboot|halt|poweroff)$/i;
/** `diskutil` verbs that erase a disk or volume. */
const DISKUTIL_ERASE = /^(?:erase\w*|zeroDisk|randomDisk|secureErase)$/i;
/** dd writing to a device; the pseudo devices used to discard or print output are fine. */
const DD_DEVICE = /^of=\/dev\/(?!(?:null|zero|stdout|stderr|tty)$|fd\/)/i;
const FORK_BOMB = /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/;
/**
 * Whitespace and shell operators inside quotes are shifted into this private-use block, so a quoted string stays one
 * word and splits nothing; `unhide` shifts them back, so a quoted script (`bash -c "…"`) can be checked as a command.
 */
const HIDDEN_BASE = 0xe000;
const OPERATOR = /[\s;&|()`<>$]/g;
const HIDDEN = /[\ue000-\ue07f]/g;
/** Stands for a heredoc in the masked command: `\u0002<index>` into the collected bodies. */
const BODY = /^\u0002(\d+)$/;
const HEREDOC = /^<<(-?)[ \t]*(['"]?)([\w.-]+)\2/;
/** Separators between simple commands; captured so a pipe into a shell can be recognised. */
const SEPARATOR = /(\|\||&&|[;&|\n()`]|\$\()/;

const hide = (text: string): string => text.replace(OPERATOR, (char) => String.fromCharCode(HIDDEN_BASE + char.charCodeAt(0)));
const unhide = (text: string): string => text.replace(HIDDEN, (char) => String.fromCharCode(char.charCodeAt(0) - HIDDEN_BASE));
const base = (token: string): string => token.slice(token.lastIndexOf('/') + 1);

/**
 * The command with quotes removed (their content kept as one word, with operators neutralised) and each heredoc
 * replaced by a `\u0002<index>` word whose body is pushed onto `bodies`: what is left is what the shell splits into
 * commands.
 */
function mask(command: string, bodies: string[]): string {
  let out = '';
  const heredocs: Array<{ tag: string; tabs: boolean; index: number; literal: boolean }> = [];
  let index = 0;
  while (index < command.length) {
    const char = command[index]!;
    if (char === '\n' && heredocs.length > 0) {
      out += '\n';
      index++;
      // Collect body lines up to each pending delimiter, in order.
      const lines: string[] = [];
      const read: typeof heredocs = [];
      while (heredocs.length > 0 && index < command.length) {
        const end = command.indexOf('\n', index);
        const stop = end < 0 ? command.length : end;
        const line = command.slice(index, stop);
        index = stop + 1;
        const { tag, tabs, index: body } = heredocs[0]!;
        if ((tabs ? line.replace(/^\t+/, '') : line) === tag) {
          bodies[body] = lines.splice(0).join('\n');
          read.push(heredocs.shift()!);
        } else lines.push(line);
      }
      if (heredocs.length > 0) {
        bodies[heredocs[0]!.index] = lines.join('\n');
        read.push(heredocs[0]!);
      }
      // The shell expands an unquoted heredoc body: its substitutions run whether or not the body feeds a shell.
      for (const { index: body, literal } of read) {
        if (!literal) out += substitutionsIn(bodies[body] ?? '').map((inner) => `;${mask(inner, bodies)};`).join('');
      }
      continue;
    }
    if (char === '\\') {
      const next = command[index + 1] ?? '';
      out += next === '\n' ? ' ' : hide(next);
      index += 2;
      continue;
    }
    if (char === "'") {
      const end = command.indexOf("'", index + 1);
      const stop = end < 0 ? command.length : end;
      out += hide(command.slice(index + 1, stop)) || hide(' ');
      index = stop + 1;
      continue;
    }
    if (char === '"') {
      let body = '';
      const substitutions: string[] = [];
      let cursor = index + 1;
      while (cursor < command.length && command[cursor] !== '"') {
        if (command[cursor] === '\\' && cursor + 1 < command.length) {
          body += command[cursor + 1];
          cursor += 2;
        } else if (command.startsWith('$(', cursor) || command[cursor] === '`') {
          // `$(…)` and backticks run even inside double quotes: check their body as separate commands.
          const end = substitutionEnd(command, cursor);
          substitutions.push(command.slice(cursor + (command[cursor] === '`' ? 1 : 2), end));
          cursor = end + 1;
        } else body += command[cursor++];
      }
      out += (hide(body) || hide(' ')) + substitutions.map((inner) => `;${mask(inner, bodies)};`).join('');
      index = cursor + 1;
      continue;
    }
    const heredoc = char === '<' && command[index - 1] !== '<' ? HEREDOC.exec(command.slice(index)) : null;
    if (heredoc && command[index + 2] !== '<') {
      heredocs.push({ tag: heredoc[3]!, tabs: heredoc[1] === '-', index: bodies.length, literal: heredoc[2] !== '' });
      bodies.push('');
      out += ` \u0002${bodies.length - 1} `;
      index += heredoc[0].length;
      continue;
    }
    out += char;
    index++;
  }
  return out;
}

/** Index of the character closing the `$(…)` or backtick substitution that starts at `start`. */
function substitutionEnd(command: string, start: number): number {
  if (command[start] === '`') {
    const end = command.indexOf('`', start + 1);
    return end < 0 ? command.length : end;
  }
  let depth = 0;
  for (let at = start + 1; at < command.length; at++) {
    if (command[at] === '\\') at++;
    else if (command[at] === '(') depth++;
    else if (command[at] === ')' && --depth === 0) return at;
  }
  return command.length;
}

/** The bodies of the unescaped `$(…)` and backtick substitutions in `text` (an unquoted heredoc body). */
function substitutionsIn(text: string): string[] {
  const found: string[] = [];
  for (let at = 0; at < text.length; at++) {
    if (text[at] === '\\') at++;
    else if (text.startsWith('$(', at) || text[at] === '`') {
      const end = substitutionEnd(text, at);
      found.push(text.slice(at + (text[at] === '`' ? 1 : 2), end));
      at = end;
    }
  }
  return found;
}

/** A simple command's words, past wrappers (their options, option values and leading operands) and `VAR=value`. */
function words(segment: string): string[] {
  const tokens = segment.trim().split(/\s+/).filter(Boolean);
  let wrapper: string | undefined;
  let operands = 0;
  while (tokens.length > 0) {
    const token = tokens[0]!;
    if (WRAPPERS.has(base(token))) {
      wrapper = base(token);
      operands = LEADING_OPERANDS[wrapper] ?? 0;
      tokens.shift();
    } else if (/^\w+=/.test(token)) {
      tokens.shift();
    } else if (token.startsWith('-') && tokens.length > 1) {
      tokens.shift();
      if (wrapper && OPTION_ARGS[wrapper]?.has(token)) tokens.shift();
    } else if (operands > 0 && tokens.length > 1) {
      operands--;
      tokens.shift();
    } else break;
  }
  return tokens;
}

/**
 * Where a target lands with `~`, `$HOME` and `${HOME}` expanded and `.`/`..` resolved; a trailing `/*` glob counts as
 * its folder. Relative targets stay relative (the shell's folder is not known here).
 */
function normalizedTarget(target: string, home: string): string {
  const expanded = unhide(target).replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, home);
  const normalized = path.posix.normalize(expanded).replace(/\/\.?\*$/, '') || '/';
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') || '/' : normalized;
}

/** Whether removing `target` recursively would remove `/`, the home folder or a folder holding it. */
function wipesProtected(target: string): boolean {
  const home = os.homedir().split(path.sep).join('/');
  const where = normalizedTarget(target, home);
  return where.startsWith('/') && (where === '/' || home === where || home.startsWith(`${where}/`));
}

function wipesRoot(tokens: string[]): boolean {
  if (base(tokens[0] ?? '') !== 'rm') return false;
  const flags = tokens.slice(1).filter((token) => token.startsWith('-'));
  if (flags.includes('--no-preserve-root')) return true;
  const recursive = flags.some((flag) => flag === '--recursive' || /^-[a-z]*r/i.test(flag));
  return recursive && tokens.slice(1).some((token) => !token.startsWith('-') && wipesProtected(token));
}

/** `find <protected folder> … -delete` (or `-exec rm`): removes everything under `/` or home. */
function findDeletesRoot(tokens: string[]): boolean {
  if (base(tokens[0] ?? '') !== 'find') return false;
  const rest = tokens.slice(1);
  while (/^-[HLP]$/.test(rest[0] ?? '')) rest.shift();
  const end = rest.findIndex((token) => /^[-(!]/.test(token));
  const roots = end < 0 ? rest : rest.slice(0, end);
  const deletes = rest.some((token, at) => token === '-delete' || (/^-exec(?:dir)?$/.test(token) && base(rest[at + 1] ?? '') === 'rm'));
  return deletes && roots.some(wipesProtected);
}

/** For a shell command: the script it runs from `-c`, or whether it reads its script from standard input. */
function shellScript(tokens: string[]): { script?: string; stdin: boolean } {
  for (let at = 1; at < tokens.length; at++) {
    const token = tokens[at]!;
    if (token === '--') return { stdin: at + 1 >= tokens.length };
    if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(token)) return { script: tokens[at + 1] ?? '', stdin: false };
    if (/^-[a-zA-Z]*s/.test(token)) return { stdin: true };
    // Option values and redirection targets (`-o pipefail`, `> log`, `<<< text`) are not a script file.
    if (/^[-+][oO]$/.test(token) || /^\d*(?:<<<|<|>>?|&>)$/.test(token)) at++;
    else if (!/^[-+]/.test(token) && !BODY.test(token) && !/^\d*[<>&]/.test(token)) return { stdin: false };
  }
  return { stdin: true };
}

/** Text a command feeds to the next one's standard input: `echo`/`printf` arguments, or its own heredoc or herestring. */
function stdinOf(tokens: string[], bodies: string[]): string[] {
  const fed: string[] = [];
  tokens.forEach((token, at) => {
    const body = BODY.exec(token);
    if (body) fed.push(bodies[Number(body[1])] ?? '');
    else if (token === '<<<') fed.push(tokens[at + 1] ?? '');
    else if (token.startsWith('<<<')) fed.push(token.slice(3));
  });
  return fed;
}

function emitted(tokens: string[], bodies: string[]): string[] {
  const name = base(tokens[0] ?? '');
  if (name === 'echo' || name === 'printf') return [tokens.slice(1).filter((token) => !/^-[a-z]+$/i.test(token)).join(' ')];
  return name === 'cat' ? stdinOf(tokens, bodies) : [];
}

/** Why a shell command would be catastrophic (wipe `/` or home, format a disk, power off, fork-bomb), else undefined. */
export function catastrophicCommand(command: string): string | undefined {
  const bodies: string[] = [];
  const masked = mask(command, bodies);
  if (FORK_BOMB.test(masked)) return 'a fork bomb';
  const parts = masked.split(SEPARATOR);
  let piped: string[] = [];
  for (let at = 0; at < parts.length; at += 2) {
    const tokens = words(parts[at]!);
    const fromPipe = parts[at - 1] === '|' ? piped : [];
    piped = emitted(tokens, bodies).map(unhide);
    const name = base(tokens[0] ?? '');
    if (wipesRoot(tokens)) return `recursive removal of ${tokens.slice(1).filter((token) => !token.startsWith('-')).map(unhide).join(' ') || '/'}`;
    if (findDeletesRoot(tokens)) return `\`find\` deleting everything under ${unhide(tokens[1] ?? '/')}`;
    if (SYSTEM.test(name)) return `\`${name}\``;
    if (name === 'diskutil' && DISKUTIL_ERASE.test(tokens[1] ?? '')) return `\`diskutil ${tokens[1]}\``;
    if (name === 'dd' && tokens.slice(1).some((token) => DD_DEVICE.test(unhide(token)))) return 'dd writing to a device';
    const scripts: string[] = [];
    if (name === 'eval') scripts.push(tokens.slice(1).map(unhide).join(' '));
    if (SHELLS.has(name)) {
      const shell = shellScript(tokens);
      if (shell.script !== undefined) scripts.push(unhide(shell.script));
      if (shell.stdin) scripts.push(...stdinOf(tokens, bodies).map(unhide), ...fromPipe);
    }
    for (const script of scripts) {
      const danger = catastrophicCommand(script);
      if (danger) return danger;
    }
  }
  return undefined;
}

/** Tool-call gate: refuses catastrophic bash commands (wiping `/` or home, formatting a disk, powering off, a fork bomb). */
export async function bashSafetyGate(event: ToolCallEvent): Promise<ToolCallEventResult | undefined> {
  if (event.toolName !== 'bash') return undefined;
  const command = typeof event.input['command'] === 'string' ? event.input['command'] : '';
  const danger = catastrophicCommand(command);
  return danger ? { block: true, reason: `Refused: ${danger} could destroy the system or its data. If it is truly needed, ask the user to run it themselves.` } : undefined;
}
