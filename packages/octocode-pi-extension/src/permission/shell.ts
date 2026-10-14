import os from 'node:os';
import path from 'node:path';

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
/** Programs whose operands are the paths they remove. */
const REMOVERS = new Set(['rm', 'rmdir', 'unlink', 'shred']);
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

/** Where a command runs: the home folder, and the shell's folder when known (`cd` moves it). */
interface Place {
  home: string;
  cwd: string | undefined;
}

/** `path` with the platform separator written as `/`. */
const posix = (file: string): string => file.split(path.sep).join('/');

/**
 * Where a target lands with `~`, `$HOME` and `${HOME}` expanded and `.`/`..` resolved against the shell's folder; a
 * trailing `/*` glob counts as its folder. Undefined when it cannot be placed: relative with no folder known, or built
 * from another variable.
 */
function locate(target: string, { home, cwd }: Place): string | undefined {
  const expanded = unhide(target).replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, home);
  if (/\$/.test(expanded)) return undefined;
  const absolute = expanded.startsWith('/') ? expanded : cwd?.startsWith('/') ? path.posix.resolve(cwd, expanded) : undefined;
  if (absolute === undefined) return undefined;
  const normalized = path.posix.normalize(absolute).replace(/\/\.?\*$/, '') || '/';
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') || '/' : normalized;
}

/** Folders whose files a command should not remove or re-permission: the system's own, and the SSH keys. */
const SYSTEM_DIRS = ['/usr', '/etc', '/bin', '/sbin', '/lib', '/lib64', '/boot', '/System'];

const isUnder = (where: string, dir: string): boolean => where === dir || where.startsWith(`${dir}/`);

/** The system folder (or `~/.ssh`) `where` is in, else undefined. */
const systemDir = (where: string, home: string): string | undefined => [...SYSTEM_DIRS, `${home}/.ssh`].find((dir) => isUnder(where, dir));

/** Whether acting on `where` recursively would reach `/`, the home folder or a folder holding it. */
const holdsHome = (where: string, home: string): boolean => where === '/' || home === where || home.startsWith(`${where}/`);

/** The protected place `target` names (`/`, home or above it, a system folder, `~/.ssh`), else undefined. */
function protectedPlace(target: string, place: Place): string | undefined {
  const where = locate(target, place);
  if (where === undefined) return undefined;
  return holdsHome(where, place.home) ? where : systemDir(where, place.home) !== undefined ? where : undefined;
}

const operandsOf = (tokens: string[]): string[] => tokens.slice(1).filter((token) => !token.startsWith('-'));

/** Why this `rm`-like command is destructive: recursive removal of `/`, home or a folder holding it, or any removal in a system folder. */
function removesProtected(tokens: string[], place: Place): string | undefined {
  const name = base(tokens[0] ?? '');
  if (!REMOVERS.has(name)) return undefined;
  const flags = tokens.slice(1).filter((token) => token.startsWith('-'));
  const targets = operandsOf(tokens);
  if (name === 'rm' && flags.includes('--no-preserve-root')) return `recursive removal of ${targets.map(unhide).join(' ') || '/'}`;
  const recursive = name === 'rm' && flags.some((flag) => flag === '--recursive' || /^-[a-z]*r/i.test(flag));
  for (const target of targets) {
    const where = locate(target, place);
    if (where === undefined) continue;
    if (recursive && holdsHome(where, place.home)) return `recursive removal of ${unhide(target)}${where === unhide(target) ? '' : ` (${where})`}`;
    const system = systemDir(where, place.home);
    if (system) return `removal under ${system}`;
  }
  return undefined;
}

/** `chmod -R`, `chown -R` or `chgrp -R` on `/`, home or a folder holding it, a system folder or `~/.ssh`. */
function changesTree(tokens: string[], place: Place): string | undefined {
  const name = base(tokens[0] ?? '');
  if (name !== 'chmod' && name !== 'chown' && name !== 'chgrp') return undefined;
  if (!tokens.slice(1).some((token) => token === '--recursive' || /^-[a-zA-Z]*R/.test(token))) return undefined;
  const target = operandsOf(tokens).find((operand) => protectedPlace(operand, place) !== undefined);
  return target === undefined ? undefined : `\`${name} -R\` on ${unhide(target)}`;
}

/** `find <protected folder> … -delete` (or `-exec rm`): removes everything under `/`, home or a system folder. */
function findDeletesRoot(tokens: string[], place: Place): boolean {
  if (base(tokens[0] ?? '') !== 'find') return false;
  const rest = tokens.slice(1);
  while (/^-[HLP]$/.test(rest[0] ?? '')) rest.shift();
  const end = rest.findIndex((token) => /^[-(!]/.test(token));
  const roots = end < 0 ? rest : rest.slice(0, end);
  const deletes = rest.some((token, at) => token === '-delete' || (/^-exec(?:dir)?$/.test(token) && base(rest[at + 1] ?? '') === 'rm'));
  return deletes && roots.some((root) => protectedPlace(root, place) !== undefined);
}

/** Block devices a stray write destroys (`/dev/sda`, `/dev/nvme0n1`, `/dev/disk2`, `/dev/rdisk2`, …). */
const BLOCK_DEVICE = /^\/dev\/(?:sd[a-z]|hd[a-z]|vd[a-z]|xvd[a-z]|nvme\d|mmcblk\d|r?disk\d)/i;

/** The block device a simple command writes to (a redirect, `tee`, `shred`, `truncate`, `wipefs`, `blkdiscard`, or the last operand of `cp`/`mv`), else undefined. */
function writesDevice(tokens: string[]): string | undefined {
  const name = base(tokens[0] ?? '');
  const words = tokens.map(unhide);
  for (const [at, word] of words.entries()) {
    const redirect = /^(?:\d*|&)>>?\|?(.*)$/.exec(word);
    if (!redirect) continue;
    const target = redirect[1] || words[at + 1] || '';
    if (BLOCK_DEVICE.test(target)) return target;
  }
  const targets = operandsOf(words);
  const written = new Set(['tee', 'shred', 'truncate', 'wipefs', 'blkdiscard']).has(name) ? targets : ['cp', 'mv'].includes(name) ? targets.slice(-1) : [];
  return written.find((target) => BLOCK_DEVICE.test(target));
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

/**
 * The shell's folder after `cd <target>` (or `pushd`), `home` for a bare `cd`; undefined when it cannot be told (`cd -`,
 * `cd $DIR`).
 */
function afterCd(tokens: string[], place: Place): string | undefined {
  const target = tokens.slice(1).find((token) => !/^-[LPe@]+$/.test(token));
  return target === undefined ? place.home : target === '-' ? undefined : locate(target, place);
}

/**
 * Why a shell command would be destructive (wipe `/` or home, `rm` in a system folder or `~/.ssh`, `chmod -R` on a
 * protected root, write to a disk device, format a disk, power off, fork-bomb), else undefined. Relative targets resolve
 * against `cwd`, which `cd` moves along the command line. It flags common destructive commands by reading the command's
 * words; it is not a security boundary (quoting and variable tricks get past it).
 */
export function catastrophicCommand(command: string, cwd?: string): string | undefined {
  return destructiveIn(command, { home: posix(os.homedir()), cwd: cwd === undefined ? undefined : posix(cwd) });
}

function destructiveIn(command: string, start: Place): string | undefined {
  const bodies: string[] = [];
  const masked = mask(command, bodies);
  if (FORK_BOMB.test(masked)) return 'a fork bomb';
  const parts = masked.split(SEPARATOR);
  let place = start;
  let piped: string[] = [];
  for (let at = 0; at < parts.length; at += 2) {
    const tokens = words(parts[at]!);
    const fromPipe = parts[at - 1] === '|' ? piped : [];
    piped = emitted(tokens, bodies).map(unhide);
    const name = base(tokens[0] ?? '');
    const removed = removesProtected(tokens, place);
    if (removed) return removed;
    if (findDeletesRoot(tokens, place)) return `\`find\` deleting everything under ${unhide(tokens[1] ?? '/')}`;
    const changed = changesTree(tokens, place);
    if (changed) return changed;
    if (SYSTEM.test(name)) return `\`${name}\``;
    if (name === 'diskutil' && DISKUTIL_ERASE.test(tokens[1] ?? '')) return `\`diskutil ${tokens[1]}\``;
    if (name === 'dd' && tokens.slice(1).some((token) => DD_DEVICE.test(unhide(token)))) return 'dd writing to a device';
    const device = writesDevice(tokens);
    if (device) return `a write to ${device}`;
    if (name === 'cd' || name === 'pushd') place = { ...place, cwd: afterCd(tokens, place) };
    const scripts: string[] = [];
    if (name === 'eval') scripts.push(tokens.slice(1).map(unhide).join(' '));
    if (SHELLS.has(name)) {
      const shell = shellScript(tokens);
      if (shell.script !== undefined) scripts.push(unhide(shell.script));
      if (shell.stdin) scripts.push(...stdinOf(tokens, bodies).map(unhide), ...fromPipe);
    }
    for (const script of scripts) {
      const danger = destructiveIn(script, place);
      if (danger) return danger;
    }
  }
  return undefined;
}

/**
 * The base program name of every simple command `command` runs (past wrappers and `VAR=value`), including the scripts
 * of `sh -c`, `eval` and `$(…)`, each once in order of appearance.
 */
export function commandNames(command: string): string[] {
  const bodies: string[] = [];
  const parts = mask(command, bodies).split(SEPARATOR);
  const names: string[] = [];
  for (let at = 0; at < parts.length; at += 2) {
    const tokens = words(parts[at]!);
    const name = base(unhide(tokens[0] ?? ''));
    if (!name || BODY.test(name)) continue;
    names.push(name);
    if (name === 'eval') names.push(...commandNames(tokens.slice(1).map(unhide).join(' ')));
    const script = SHELLS.has(name) ? shellScript(tokens).script : undefined;
    if (script !== undefined) names.push(...commandNames(unhide(script)));
  }
  return [...new Set(names)];
}

/** The paths `rm`, `rmdir`, `unlink` and `shred` name in `command` (past wrappers and `sh -c` scripts), as written, each once. */
export function removalTargets(command: string): string[] {
  const bodies: string[] = [];
  const found: string[] = [];
  for (const [at, part] of mask(command, bodies).split(SEPARATOR).entries()) {
    if (at % 2 === 1) continue;
    const tokens = words(part).map(unhide);
    const name = base(tokens[0] ?? '');
    if (REMOVERS.has(name)) {
      const rest = tokens.slice(1);
      const end = rest.indexOf('--');
      found.push(...rest.filter((token, index) => (end >= 0 ? index > end : !token.startsWith('-'))));
    }
    const script = SHELLS.has(name) ? shellScript(tokens.map(hide)).script : undefined;
    if (script !== undefined) found.push(...removalTargets(unhide(script)));
  }
  return [...new Set(found)];
}

/** `command` trimmed when it is one simple command (no `;`, `&&`, pipes, substitutions or heredocs), else undefined. */
export function simpleCommand(command: string): string | undefined {
  const trimmed = command.trim();
  const bodies: string[] = [];
  const parts = mask(trimmed, bodies).split(SEPARATOR);
  return trimmed !== '' && parts.length === 1 && bodies.length === 0 ? trimmed : undefined;
}

/** The tools that run a shell command: Pi's `bash` and `powershell`. */
export const SHELL_TOOLS: ReadonlySet<string> = new Set(['bash', 'powershell']);
